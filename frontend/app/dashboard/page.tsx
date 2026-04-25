"use client";

import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Layers,
  Minus,
  Scale,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import AnimatedNumber from "@/components/AnimatedNumber";
import AppShell from "@/components/AppShell";
import Badge, { BadgeVariant } from "@/components/Badge";
import GeminiAnalyst from "@/components/GeminiAnalyst";
import RiskGauge from "@/components/RiskGauge";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  AuditRunSummary,
  FullAnalysisResponse,
  apiClient,
  getMetrics,
  listRuns,
} from "@/lib/api";

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}

const TOOLTIP_STYLE = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--text)",
  fontSize: 12,
};

function riskBadgeVariant(score: number): BadgeVariant {
  if (score < 0.34) return "low";
  if (score < 0.67) return "medium";
  return "high";
}
function riskBadgeLabel(score: number): string {
  if (score < 0.34) return "LOW";
  if (score < 0.67) return "MEDIUM";
  return "HIGH";
}
function diBarColor(value: number): string {
  if (value < 0.7) return "#EF4444";
  if (value < 0.85) return "#F59E0B";
  return "#22D3A0";
}
function disparateColor(value: number): string {
  if (value < 0.8) return "#EF4444";
  if (value < 0.9) return "#F59E0B";
  return "#22D3A0";
}

function DashboardView() {
  const toast = useToast();
  const [runs, setRuns] = useState<AuditRunSummary[]>([]);
  const [runId, setRunId] = useState<string>("");
  const [fullAnalysis, setFullAnalysis] = useState<FullAnalysisResponse | null>(null);
  const [allBiasResults, setAllBiasResults] = useState<Record<string, unknown> | null>(null);
  const [primaryAttr, setPrimaryAttr] = useState<string>("");
  const [primaryMetrics, setPrimaryMetrics] = useState<{
    accuracy_by_group?: Record<string, number>;
    demographic_parity_diff?: number;
    equalized_odds_diff?: number;
    overall_accuracy?: number;
    [key: string]: unknown;
  } | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("runId") || "";
    if (id) setRunId(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingRuns(true);
      try {
        const list = await listRuns();
        if (cancelled) return;
        setRuns(list);
        if (!runId && list.length > 0) {
          setRunId(list[0].run_id);
        }
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
    const cached = window.sessionStorage.getItem(`analysis:${runId}`);
    if (cached) {
      try {
        setFullAnalysis(JSON.parse(cached) as FullAnalysisResponse);
      } catch {
        setFullAnalysis(null);
      }
    } else {
      setFullAnalysis(null);
    }
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const run = async () => {
      setLoadingMetrics(true);
      try {
        const result = await getMetrics(runId);
        if (cancelled) return;
        const all = result.all_results ?? null;
        setAllBiasResults(all);
        const firstAttr = all ? Object.keys(all)[0] ?? "" : "";
        setPrimaryAttr(firstAttr);
        setPrimaryMetrics(result.results || {});
      } catch {
        if (!cancelled) toast.error("Failed to load metrics.");
      } finally {
        if (!cancelled) setLoadingMetrics(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const accuracyData = useMemo(() => {
    const groups = primaryMetrics?.accuracy_by_group || {};
    return Object.entries(groups).map(([group, value]) => ({
      group,
      value: Number(value),
      fill: diBarColor(Number(value)),
    }));
  }, [primaryMetrics]);

  const disparateImpactData = useMemo(() => {
    if (!fullAnalysis) return [];
    return Object.entries(fullAnalysis.bias_results).map(([attr, m]) => ({
      attr,
      value: Number(m.disparate_impact),
      fill: disparateColor(Number(m.disparate_impact)),
    }));
  }, [fullAnalysis]);

  const riskTimeline = useMemo(() => {
    return runs
      .slice(0, 10)
      .reverse()
      .map((r) => ({
        date: new Date(r.timestamp).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        risk: Number(r.overall_risk_score.toFixed(3)),
        runId: r.run_id,
      }));
  }, [runs]);

  const previousRun = useMemo(() => {
    const idx = runs.findIndex((r) => r.run_id === runId);
    return idx >= 0 && idx + 1 < runs.length ? runs[idx + 1] : null;
  }, [runs, runId]);

  const overallRisk = fullAnalysis?.overall_risk_score ?? 0;
  const summary = fullAnalysis?.dataset_summary;

  const downloadReport = async () => {
    if (!runId) return;
    try {
      const response = await apiClient.get(`/report/${runId}`, {
        responseType: "blob",
        headers: { Accept: "application/pdf" },
      });
      const blob = new Blob([response.data as BlobPart], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fairaudit-${runId.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded.");
    } catch (err) {
      console.error("Report download failed", err);
      toast.error("Failed to download report.");
    }
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 22 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
            }}
          >
            Fairness Dashboard
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13.5 }}>
            Inspect bias metrics across past audit runs.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <RunSelector
            runs={runs}
            value={runId}
            onChange={setRunId}
            loading={loadingRuns}
          />
          <button
            type="button"
            onClick={downloadReport}
            disabled={!runId}
            style={{
              padding: "9px 14px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #6C63FF, #8B5CF6)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              border: "none",
              cursor: runId ? "pointer" : "not-allowed",
              opacity: runId ? 1 : 0.6,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 8px 22px rgba(108,99,255,0.25)",
            }}
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </header>

      {!runId && !loadingRuns && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: 14,
            padding: 32,
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          No audit runs yet.{" "}
          <Link href="/" style={{ color: "var(--brand)", fontWeight: 700 }}>
            Upload a dataset
          </Link>{" "}
          to get started.
        </div>
      )}

      {runId && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
              gap: 12,
            }}
            className="metrics-row"
          >
            <MetricMini
              label="Demographic parity Δ"
              value={primaryMetrics?.demographic_parity_diff ?? 0}
              decimals={3}
              good={(v) => v <= 0.1}
              prev={undefined}
              icon={<Scale size={14} />}
            />
            <MetricMini
              label="Equalized odds Δ"
              value={primaryMetrics?.equalized_odds_diff ?? 0}
              decimals={3}
              good={(v) => v <= 0.1}
              icon={<Scale size={14} />}
            />
            <MetricMini
              label="Overall accuracy"
              value={primaryMetrics?.overall_accuracy ?? 0}
              decimals={3}
              good={(v) => v >= 0.8}
              icon={<Target size={14} />}
            />
            <MetricMini
              label="Total rows"
              value={summary?.row_count ?? 0}
              decimals={0}
              icon={<Layers size={14} />}
            />
            <MetricMini
              label="Attributes"
              value={fullAnalysis ? Object.keys(fullAnalysis.bias_results).length : 0}
              decimals={0}
              icon={<Layers size={14} />}
            />
            <MetricMini
              label="Quality score"
              value={(summary?.dataset_quality_score ?? 0) * 100}
              decimals={0}
              suffix="%"
              good={(v) => v >= 80}
              prev={
                previousRun
                  ? undefined
                  : undefined
              }
              icon={<Target size={14} />}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
              gap: 18,
              alignItems: "start",
            }}
            className="charts-grid"
          >
            <ChartCard title="Accuracy by group" subtitle={primaryAttr ? `Protected attribute: ${primaryAttr}` : ""}>
              {loadingMetrics ? (
                <Skeleton variant="chart" />
              ) : accuracyData.length === 0 ? (
                <EmptyChart message="No per-group accuracy reported for this run." />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={accuracyData} margin={{ top: 16, right: 12, left: 0, bottom: 6 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="group" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 1]} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "rgba(108,99,255,0.08)" }} contentStyle={TOOLTIP_STYLE} />
                    <ReferenceLine
                      y={0.8}
                      stroke="#EF4444"
                      strokeDasharray="6 4"
                      label={{
                        value: "Legal min",
                        position: "right",
                        fill: "#EF4444",
                        fontSize: 11,
                      }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[8, 8, 0, 0]}
                      isAnimationActive
                      animationDuration={900}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <RiskGauge score={overallRisk} />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 18,
            }}
            className="charts-grid"
          >
            <ChartCard
              title="Disparate impact by attribute"
              subtitle="Higher is fairer · 0.8 is the legal threshold"
            >
              {disparateImpactData.length === 0 ? (
                <EmptyChart message="No bias results in this run." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    layout="vertical"
                    data={disparateImpactData}
                    margin={{ top: 8, right: 24, left: 12, bottom: 6 }}
                  >
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 1.2]}
                      stroke="var(--text-muted)"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="attr"
                      stroke="var(--text-muted)"
                      tickLine={false}
                      axisLine={false}
                      width={120}
                    />
                    <Tooltip cursor={{ fill: "rgba(108,99,255,0.08)" }} contentStyle={TOOLTIP_STYLE} />
                    <ReferenceLine
                      x={0.8}
                      stroke="#EF4444"
                      strokeDasharray="6 4"
                      label={{
                        value: "0.8",
                        position: "top",
                        fill: "#EF4444",
                        fontSize: 11,
                      }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[0, 8, 8, 0]}
                      isAnimationActive
                      animationDuration={900}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Risk timeline" subtitle="Last 10 runs · lower is better">
              {riskTimeline.length === 0 ? (
                <EmptyChart message="Not enough history yet." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={riskTimeline} margin={{ top: 16, right: 16, left: 0, bottom: 6 }}>
                    <defs>
                      <linearGradient id="risk-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6C63FF" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#6C63FF" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 1]} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ stroke: "var(--brand)" }} contentStyle={TOOLTIP_STYLE} />
                    <Area
                      type="monotone"
                      dataKey="risk"
                      stroke="transparent"
                      fill="url(#risk-gradient)"
                      isAnimationActive
                      animationDuration={1100}
                    />
                    <Line
                      type="monotone"
                      dataKey="risk"
                      stroke="#8B5CF6"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#8B5CF6", stroke: "var(--surface)", strokeWidth: 2 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive
                      animationDuration={1100}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {fullAnalysis && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <GeminiAnalyst result={fullAnalysis} />
            </motion.div>
          )}

          <div style={{ display: "flex", gap: 12, color: "var(--text-muted)", fontSize: 12 }}>
            <span>Run ID: <code style={{ color: "var(--text-dim)" }}>{runId}</code></span>
            {previousRun && (
              <span>
                Previous: <code style={{ color: "var(--text-dim)" }}>{previousRun.run_id.slice(0, 8)}…</code>
              </span>
            )}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 1100px) {
          .metrics-row { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .charts-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 600px) {
          .metrics-row { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </div>
  );
}

function RunSelector({
  runs,
  value,
  onChange,
  loading,
}: {
  runs: AuditRunSummary[];
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton variant="block" width={260} height={40} />;
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "0 6px 0 12px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
        Run
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--text)",
          fontSize: 13,
          fontWeight: 600,
          padding: "10px 22px 10px 6px",
          cursor: "pointer",
          maxWidth: 280,
        }}
      >
        {runs.length === 0 && <option value="">No runs</option>}
        {runs.slice(0, 10).map((r) => {
          const date = new Date(r.timestamp);
          const dateStr = date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
          const risk = riskBadgeLabel(r.overall_risk_score);
          return (
            <option key={r.run_id} value={r.run_id} style={{ background: "var(--surface)" }}>
              {dateStr} · {r.filename} · {risk}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{title}</h3>
        {subtitle && (
          <div style={{ marginTop: 2, fontSize: 11, color: "var(--text-muted)" }}>{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div
      style={{
        height: 280,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}

function MetricMini({
  label,
  value,
  decimals = 0,
  suffix = "",
  good,
  prev,
  icon,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  good?: (v: number) => boolean;
  prev?: number;
  icon?: React.ReactNode;
}) {
  const status: BadgeVariant = good
    ? good(value)
      ? "low"
      : "medium"
    : "neutral";
  const trend =
    prev !== undefined && Number.isFinite(prev)
      ? value - prev
      : 0;
  const TrendIcon = trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--text-muted)",
          marginBottom: 8,
          gap: 6,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {icon}
          {label}
        </span>
        {good && <Badge small variant={status} label={good(value) ? "OK" : "WATCH"} />}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: -0.4 }}>
          <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
        </div>
        {prev !== undefined && (
          <span
            style={{
              fontSize: 11,
              color: trend === 0 ? "var(--text-muted)" : trend > 0 ? "var(--warning)" : "var(--success)",
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <TrendIcon size={12} />
            {Math.abs(trend).toFixed(decimals)}
          </span>
        )}
      </div>
    </div>
  );
}
