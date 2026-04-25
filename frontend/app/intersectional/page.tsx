"use client";

import { motion } from "framer-motion";
import { AlertTriangle, GitBranch } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import AppShell from "@/components/AppShell";
import Badge, { BadgeVariant } from "@/components/Badge";
import RunSelector from "@/components/RunSelector";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  AuditRunSummary,
  IntersectionalCombo,
  IntersectionalResult,
  getIntersectional,
  listRuns,
} from "@/lib/api";

const TOOLTIP_STYLE = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--text)",
  fontSize: 12,
};

function severityVariant(s: "low" | "medium" | "high"): BadgeVariant {
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

function gapColor(gap: number): string {
  if (gap >= 0.15) return "#EF4444";
  if (gap >= 0.07) return "#F59E0B";
  return "#22D3A0";
}

function gapBg(gap: number): string {
  if (gap >= 0.15) return "rgba(239, 68, 68, 0.18)";
  if (gap >= 0.07) return "rgba(245, 158, 11, 0.18)";
  return "rgba(34, 211, 160, 0.18)";
}

export default function IntersectionalPage() {
  return (
    <AppShell>
      <IntersectionalView />
    </AppShell>
  );
}

function IntersectionalView() {
  const toast = useToast();
  const [runs, setRuns] = useState<AuditRunSummary[]>([]);
  const [runId, setRunId] = useState("");
  const [data, setData] = useState<IntersectionalResult | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("runId") || "";
    if (id) setRunId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await listRuns();
        if (cancelled) return;
        setRuns(list);
        if (!runId && list.length > 0) setRunId(list[0].run_id);
      } catch {
        if (!cancelled) toast.error("Could not load past runs.");
      } finally {
        if (!cancelled) setLoadingRuns(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const run = async () => {
      setLoadingData(true);
      try {
        const result = await getIntersectional(runId);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) toast.error("Failed to load intersectional analysis.");
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const validCombos = useMemo<[string, IntersectionalCombo][]>(() => {
    if (!data) return [];
    return Object.entries(data.combos)
      .filter(
        (entry): entry is [string, IntersectionalCombo] =>
          !("error" in entry[1]) && Array.isArray(entry[1].groups_found),
      )
      .sort((a, b) => b[1].accuracy_gap - a[1].accuracy_gap);
  }, [data]);

  const pairwiseCombos = useMemo(
    () => validCombos.filter(([, c]) => c.attributes_combined.length === 2),
    [validCombos],
  );

  const heatmap = useMemo(() => {
    if (pairwiseCombos.length === 0) return null;
    const attrs = new Set<string>();
    pairwiseCombos.forEach(([, combo]) => {
      combo.attributes_combined.forEach((a) => attrs.add(a));
    });
    const axes = Array.from(attrs);
    const lookup = new Map<string, IntersectionalCombo>();
    pairwiseCombos.forEach(([, combo]) => {
      const [a, b] = combo.attributes_combined;
      lookup.set(`${a}|${b}`, combo);
      lookup.set(`${b}|${a}`, combo);
    });
    return { axes, lookup };
  }, [pairwiseCombos]);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 22 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: -0.4,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <GitBranch size={22} color="var(--brand)" /> Intersectional bias analysis
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              color: "var(--text-muted)",
              fontSize: 13.5,
              maxWidth: 720,
              lineHeight: 1.55,
            }}
          >
            Bias often hides at the intersection of multiple attributes. This analysis
            checks every combination.
          </p>
        </div>
        <RunSelector
          runs={runs}
          value={runId}
          onChange={setRunId}
          loading={loadingRuns}
        />
      </header>

      {!runId && !loadingRuns && <NoRunCallout />}

      {runId && loadingData && <Skeleton variant="card" height={220} />}

      {runId && !loadingData && validCombos.length === 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: 14,
            padding: 28,
            color: "var(--text-muted)",
            textAlign: "center",
            fontSize: 13.5,
          }}
        >
          No intersectional results available. Re-run the analysis from the upload
          page so we can cache the full intersection map.
        </div>
      )}

      {runId && !loadingData && validCombos.length > 0 && (
        <>
          <section style={{ display: "grid", gap: 14 }}>
            {validCombos.map(([key, combo]) => (
              <ComboCard key={key} comboKey={key} combo={combo} />
            ))}
          </section>

          {heatmap && heatmap.axes.length >= 2 && (
            <Heatmap axes={heatmap.axes} lookup={heatmap.lookup} />
          )}
        </>
      )}
    </div>
  );
}

function NoRunCallout() {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px dashed var(--border)",
        borderRadius: 14,
        padding: 28,
        textAlign: "center",
        color: "var(--text-muted)",
      }}
    >
      No audit runs yet.{" "}
      <Link href="/" style={{ color: "var(--brand)", fontWeight: 700 }}>
        Upload a dataset
      </Link>{" "}
      to begin.
    </div>
  );
}

function ComboCard({
  comboKey,
  combo,
}: {
  comboKey: string;
  combo: IntersectionalCombo;
}) {
  const accuracyEntries = Object.entries(combo.accuracy_by_group);
  const positiveEntries = combo.positive_rate_by_group ?? {};
  const chartData = accuracyEntries.map(([group, value]) => ({
    group,
    accuracy: Number(value),
    fill: group === combo.worst_group ? "#EF4444" : "#6C63FF",
  }));
  const highRisk = combo.accuracy_gap > 0.15;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{comboKey}</h3>
        <Badge
          variant={severityVariant(combo.severity)}
          label={combo.severity.toUpperCase()}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 18,
        }}
        className="combo-grid"
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12.5,
            }}
          >
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <Th>Group</Th>
                <Th align="right">Accuracy</Th>
                <Th align="right">Positive rate</Th>
              </tr>
            </thead>
            <tbody>
              {accuracyEntries.map(([group, accuracy]) => {
                const isWorst = group === combo.worst_group;
                return (
                  <tr
                    key={group}
                    style={{
                      borderTop: "1px solid var(--border)",
                      background: isWorst ? "rgba(239, 68, 68, 0.08)" : "transparent",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 12px",
                        color: isWorst ? "#FCA5A5" : "var(--text)",
                        fontWeight: isWorst ? 700 : 500,
                      }}
                    >
                      {group}
                      {isWorst && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            color: "#FCA5A5",
                            fontWeight: 700,
                          }}
                        >
                          ← worst
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--text-dim)",
                      }}
                    >
                      {Number(accuracy).toFixed(3)}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--text-dim)",
                      }}
                    >
                      {(positiveEntries[group] !== undefined
                        ? Number(positiveEntries[group]).toFixed(3)
                        : "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <ResponsiveContainer width="100%" height={Math.max(220, accuracyEntries.length * 36)}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 6, right: 24, left: 12, bottom: 6 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 1]}
                stroke="var(--text-muted)"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="group"
                stroke="var(--text-muted)"
                tickLine={false}
                axisLine={false}
                width={140}
              />
              <Tooltip cursor={{ fill: "rgba(108,99,255,0.08)" }} contentStyle={TOOLTIP_STYLE} />
              <ReferenceLine
                x={0.8}
                stroke="#EF4444"
                strokeDasharray="6 4"
                label={{ value: "min", position: "top", fill: "#EF4444", fontSize: 11 }}
              />
              <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 13.5, color: "var(--text-dim)" }}>
          Accuracy gap:{" "}
          <span
            style={{
              color: gapColor(combo.accuracy_gap),
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            {(combo.accuracy_gap * 100).toFixed(1)}%
          </span>
          <span style={{ marginLeft: 14, color: "var(--text-muted)", fontSize: 12 }}>
            DP diff: {combo.demographic_parity_diff.toFixed(3)}
          </span>
        </div>
        {highRisk && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#FCA5A5",
              fontSize: 12.5,
              fontWeight: 600,
              maxWidth: 520,
            }}
          >
            <AlertTriangle size={14} />
            The gap between best and worst group exceeds 15% — this is a high-risk
            signal.
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 880px) {
          .combo-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </motion.div>
  );
}

function Heatmap({
  axes,
  lookup,
}: {
  axes: string[];
  lookup: Map<string, IntersectionalCombo>;
}) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Intersection explorer</h3>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
          Cells show accuracy gap between best and worst group at each
          intersection.
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `auto repeat(${axes.length}, minmax(110px, 1fr))`,
            gap: 4,
            minWidth: 80 + axes.length * 110,
          }}
        >
          <div />
          {axes.map((col) => (
            <div
              key={`col-${col}`}
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: "var(--text-muted)",
                textAlign: "center",
                padding: "6px 4px",
              }}
            >
              {col}
            </div>
          ))}

          {axes.map((row) => (
            <FragmentRow key={`row-${row}`} row={row} axes={axes} lookup={lookup} />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Legend:</span>
        <LegendDot color="#22D3A0" label="Low gap" />
        <LegendDot color="#F59E0B" label="Medium gap" />
        <LegendDot color="#EF4444" label="High gap (>15%)" />
      </div>
    </section>
  );
}

function FragmentRow({
  row,
  axes,
  lookup,
}: {
  row: string;
  axes: string[];
  lookup: Map<string, IntersectionalCombo>;
}) {
  return (
    <>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--text-muted)",
          padding: "6px 8px",
          display: "flex",
          alignItems: "center",
        }}
      >
        {row}
      </div>
      {axes.map((col) => {
        if (row === col) {
          return (
            <div
              key={`${row}-${col}`}
              style={{
                background: "var(--surface-2)",
                borderRadius: 8,
                height: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 11,
              }}
            >
              —
            </div>
          );
        }
        const combo = lookup.get(`${row}|${col}`);
        if (!combo) {
          return (
            <div
              key={`${row}-${col}`}
              style={{
                background: "var(--surface-2)",
                borderRadius: 8,
                height: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 11,
                opacity: 0.6,
              }}
            >
              n/a
            </div>
          );
        }
        const gap = combo.accuracy_gap;
        const dpRaw = Number(combo.demographic_parity_diff ?? 0);
        const di = Math.max(0, 1 - Math.abs(dpRaw));
        return (
          <div
            key={`${row}-${col}`}
            title={`Gap ${(gap * 100).toFixed(1)}% · DI≈${di.toFixed(2)}`}
            style={{
              background: gapBg(gap),
              border: `1px solid ${gapColor(gap)}`,
              borderRadius: 8,
              height: 64,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 6,
              gap: 2,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: gapColor(gap),
                letterSpacing: -0.4,
              }}
            >
              {di.toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              gap {(gap * 100).toFixed(0)}%
            </div>
          </div>
        );
      })}
    </>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        color: "var(--text-dim)",
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        padding: "10px 12px",
        fontSize: 11,
        color: "var(--text-muted)",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  );
}
