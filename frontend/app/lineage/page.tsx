"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GitCommit,
  Minus,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import RunSelector from "@/components/RunSelector";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  AuditRunSummary,
  LineageEntry,
  LineageIntroductionPoint,
  LineageResult,
  getLineage,
  listRuns,
} from "@/lib/api";

export default function LineagePage() {
  return (
    <AppShell>
      <LineageView />
    </AppShell>
  );
}

function LineageView() {
  const toast = useToast();
  const [runs, setRuns] = useState<AuditRunSummary[]>([]);
  const [runId, setRunId] = useState("");
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LineageResult | null>(null);
  const [activeAttr, setActiveAttr] = useState("");

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
    if (!runId) {
      setData(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getLineage(runId);
        if (cancelled) return;
        setData(res);
        const attrs = Object.keys(res.lineage_log);
        setActiveAttr(attrs[0] ?? "");
      } catch {
        if (!cancelled) toast.error("Failed to load data lineage.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const attrs = useMemo(() => Object.keys(data?.lineage_log ?? {}), [data]);
  const timeline = data?.lineage_log[activeAttr] ?? [];
  const introPoint: LineageIntroductionPoint | null =
    data?.introduction_points[activeAttr] ?? null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 22 }}>
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
            <GitCommit size={22} color="var(--brand)" /> Data lineage
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
            Track exactly when and where bias entered your data pipeline.
          </p>
        </div>
        <RunSelector runs={runs} value={runId} onChange={setRunId} loading={loadingRuns} />
      </header>

      {!runId && !loadingRuns && (
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
      )}

      {runId && loading && <Skeleton variant="card" height={300} />}

      {runId && !loading && attrs.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {attrs.map((a) => {
            const active = a === activeAttr;
            return (
              <button
                key={a}
                type="button"
                onClick={() => setActiveAttr(a)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                  background: active ? "var(--brand-soft)" : "var(--surface)",
                  color: active ? "var(--text)" : "var(--text-dim)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {a}
              </button>
            );
          })}
        </div>
      )}

      {runId && !loading && attrs.length === 0 && (
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
          No lineage data captured for this run.
        </div>
      )}

      {runId && !loading && timeline.length > 0 && (
        <>
          <IntroductionCallout introPoint={introPoint} />
          <Timeline entries={timeline} bias={introPoint?.bias_introduced_at ?? null} />
          <TimelineTable entries={timeline} bias={introPoint?.bias_introduced_at ?? null} />
        </>
      )}
    </div>
  );
}

function IntroductionCallout({
  introPoint,
}: {
  introPoint: LineageIntroductionPoint | null;
}) {
  if (!introPoint) return null;
  if (introPoint.bias_introduced_at) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.35)",
          borderRadius: 14,
          padding: 18,
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <AlertTriangle size={28} color="#FCA5A5" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#FCA5A5" }}>
            Bias introduced at: {introPoint.bias_introduced_at}
          </div>
          <p
            style={{
              margin: "6px 0 0",
              color: "var(--text-dim)",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            The disparate impact dropped below 0.80 at this pipeline step. Review
            your data transformation at this stage.
          </p>
          {introPoint.disparate_impact_at_introduction !== undefined && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
              DI at introduction:{" "}
              <strong style={{ color: "var(--danger)" }}>
                {introPoint.disparate_impact_at_introduction.toFixed(3)}
              </strong>
              {introPoint.previous_clean_stage && (
                <>
                  {" · last clean stage: "}
                  <code style={{ color: "var(--text-dim)" }}>
                    {introPoint.previous_clean_stage}
                  </code>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        background: "rgba(34, 211, 160, 0.08)",
        border: "1px solid rgba(34, 211, 160, 0.35)",
        borderRadius: 14,
        padding: 18,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <ShieldCheck size={26} color="#6EE7B7" />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#6EE7B7" }}>
          No bias introduction detected
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
          DI stayed above 0.80 throughout the pipeline.
        </div>
      </div>
    </motion.div>
  );
}

function Timeline({
  entries,
  bias,
}: {
  entries: LineageEntry[];
  bias: string | null;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 22,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
        Pipeline timeline
      </h3>
      <div style={{ position: "relative", paddingLeft: 18 }}>
        {entries.map((entry, idx) => {
          const passes = entry.passes_80_rule === true;
          const isBias = bias && entry.stage === bias;
          const dotColor = passes ? "var(--success)" : "var(--danger)";
          const segmentColor = idx === 0
            ? "transparent"
            : entries[idx - 1].passes_80_rule
              ? "rgba(34, 211, 160, 0.5)"
              : "rgba(239, 68, 68, 0.5)";
          return (
            <div
              key={`${entry.stage}-${idx}`}
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.2fr) auto minmax(0, 1.2fr)",
                alignItems: "center",
                gap: 14,
                padding: "10px 0",
              }}
              className="timeline-row"
            >
              {idx > 0 && (
                <span
                  style={{
                    position: "absolute",
                    left: 24,
                    top: -10,
                    bottom: "50%",
                    width: 2,
                    background: segmentColor,
                  }}
                />
              )}
              {idx < entries.length - 1 && (
                <span
                  style={{
                    position: "absolute",
                    left: 24,
                    top: "50%",
                    bottom: -10,
                    width: 2,
                    background: passes ? "rgba(34, 211, 160, 0.5)" : "rgba(239, 68, 68, 0.5)",
                  }}
                />
              )}

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: isBias ? "#FCA5A5" : "var(--text)",
                  fontWeight: isBias ? 700 : 600,
                }}
              >
                {entry.stage}
                {isBias && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#FCA5A5",
                    }}
                  >
                    BIAS INTRODUCED
                  </span>
                )}
              </div>

              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: dotColor,
                  border: "3px solid var(--surface)",
                  boxShadow: `0 0 0 2px ${dotColor}`,
                  position: "relative",
                  zIndex: 1,
                }}
              />

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 13,
                  color: "var(--text-dim)",
                  fontVariantNumeric: "tabular-nums",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  DI:{" "}
                  <strong style={{ color: passes ? "var(--success)" : "var(--danger)" }}>
                    {entry.disparate_impact !== null
                      ? entry.disparate_impact.toFixed(3)
                      : "—"}
                  </strong>
                </span>
                <DeltaPill delta={entry.delta_from_previous} />
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        @media (max-width: 720px) {
          .timeline-row { grid-template-columns: 1fr !important; padding-left: 30px !important; }
        }
      `}</style>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number | null }) {
  if (delta === null || delta === undefined) {
    return (
      <span
        style={{
          color: "var(--text-muted)",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 12,
        }}
      >
        <Minus size={12} /> initial
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span
        style={{
          color: "var(--text-muted)",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 12,
        }}
      >
        <Minus size={12} /> unchanged
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span
        style={{
          color: "var(--success)",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <ArrowUp size={12} /> +{delta.toFixed(3)}
      </span>
    );
  }
  return (
    <span
      style={{
        color: "var(--danger)",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <ArrowDown size={12} /> {delta.toFixed(3)}
    </span>
  );
}

function TimelineTable({
  entries,
  bias,
}: {
  entries: LineageEntry[];
  bias: string | null;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <Th>Stage</Th>
              <Th align="right">Rows</Th>
              <Th align="right">Missing %</Th>
              <Th align="right">Disparate impact</Th>
              <Th align="right">Δ</Th>
              <Th align="center">Status</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => {
              const isBias = bias && entry.stage === bias;
              const passes = entry.passes_80_rule === true;
              return (
                <tr
                  key={`${entry.stage}-${idx}`}
                  style={{
                    borderTop: "1px solid var(--border)",
                    background: isBias ? "rgba(239, 68, 68, 0.08)" : "transparent",
                  }}
                >
                  <td
                    style={{
                      padding: "10px 14px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12.5,
                      color: isBias ? "#FCA5A5" : "var(--text)",
                      fontWeight: isBias ? 700 : 500,
                    }}
                  >
                    {entry.stage}
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      textAlign: "right",
                      color: "var(--text-dim)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {entry.row_count.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      textAlign: "right",
                      color: "var(--text-dim)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {entry.missing_pct.toFixed(2)}%
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      textAlign: "right",
                      color: passes ? "var(--success)" : "var(--danger)",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {entry.disparate_impact !== null
                      ? entry.disparate_impact.toFixed(3)
                      : "—"}
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <DeltaPill delta={entry.delta_from_previous} />
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "center" }}>
                    {passes ? (
                      <Badge small variant="success" label="PASS" icon={<CheckCircle2 size={11} />} />
                    ) : (
                      <Badge small variant="danger" label="FAIL" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        padding: "10px 14px",
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
