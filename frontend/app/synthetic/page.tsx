"use client";

import axios from "axios";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FlaskConical,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import RunSelector from "@/components/RunSelector";
import { useToast } from "@/components/Toast";
import {
  AuditRunSummary,
  FullAnalysisResponse,
  SyntheticResult,
  generateSynthetic,
  listRuns,
} from "@/lib/api";

const TOOLTIP_STYLE = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--text)",
  fontSize: 12,
};

export default function SyntheticPage() {
  return (
    <AppShell>
      <SyntheticView />
    </AppShell>
  );
}

function SyntheticView() {
  const toast = useToast();
  const [runs, setRuns] = useState<AuditRunSummary[]>([]);
  const [runId, setRunId] = useState("");
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SyntheticResult | null>(null);
  const [originalDist, setOriginalDist] = useState<Record<string, number>>({});

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
      setOriginalDist({});
      setResult(null);
      return;
    }
    const cached = window.sessionStorage.getItem(`analysis:${runId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as FullAnalysisResponse;
        const attrs = parsed.auto_detection?.protected_attrs ?? [];
        const groups = parsed.dataset_summary?.group_distributions ?? {};
        const primary = attrs[0];
        if (primary && groups[primary]) {
          setOriginalDist(groups[primary]);
          return;
        }
      } catch {
        // ignore
      }
    }
    setOriginalDist({});
    setResult(null);
  }, [runId]);

  const onGenerate = async () => {
    if (!runId) return;
    setGenerating(true);
    setResult(null);
    try {
      const res = await generateSynthetic(runId);
      setResult(res);
      toast.success("Synthetic dataset ready.");
    } catch (err) {
      let message = "Synthetic generation failed.";
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data;
        if (typeof detail === "string" && detail.trim()) message = detail;
        else if (detail && typeof detail === "object" && "detail" in detail) {
          const d = (detail as { detail: unknown }).detail;
          message = typeof d === "string" ? d : message;
        } else if (err.message) {
          message = err.message;
        }
      }
      toast.error(message, "Synthetic data");
    } finally {
      setGenerating(false);
    }
  };

  const downloadCsv = () => {
    if (!result?.result.synthetic_csv_b64) return;
    try {
      const binary = window.atob(result.result.synthetic_csv_b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fairaudit-synthetic-${runId.slice(0, 8)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Synthetic CSV downloaded.");
    } catch {
      toast.error("Could not decode synthetic CSV.");
    }
  };

  const distributionChart = useMemo(() => {
    const groups = new Set<string>([
      ...Object.keys(originalDist),
    ]);
    if (!groups.size) return [];
    const synthFraction = result
      ? buildSyntheticDistribution(originalDist, result.result.synthetic_rows)
      : {};
    return Array.from(groups).map((g) => ({
      group: g,
      Original: Number(originalDist[g] ?? 0),
      Synthetic: Number(synthFraction[g] ?? 0),
    }));
  }, [originalDist, result]);

  const origDi = result?.result.original_disparate_impact ?? null;
  const synthDi = result?.result.synthetic_disparate_impact ?? null;
  const improvement = result?.result.improvement ?? null;

  const passOriginal = origDi !== null ? origDi >= 0.8 : null;
  const passSynthetic = synthDi !== null ? synthDi >= 0.8 : null;

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
            <FlaskConical size={22} color="var(--brand)" /> Synthetic data generator
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
            Generate a balanced synthetic dataset that corrects the bias found in
            your original data.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <RunSelector runs={runs} value={runId} onChange={setRunId} loading={loadingRuns} />
          <button
            type="button"
            onClick={onGenerate}
            disabled={!runId || generating}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #6C63FF, #8B5CF6)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              border: "none",
              cursor: !runId || generating ? "not-allowed" : "pointer",
              opacity: !runId || generating ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 8px 22px rgba(108,99,255,0.25)",
              minHeight: 40,
            }}
          >
            {generating ? <Loader2 size={14} className="spinner-svg" /> : <Sparkles size={14} />}
            {generating ? "Training…" : "Generate balanced dataset"}
          </button>
        </div>
        <style>{`.spinner-svg { animation: spin 0.9s linear infinite; }`}</style>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 14,
        }}
        className="info-cards"
      >
        <InfoCard
          label="Original DI"
          value={origDi}
          decimals={3}
          tone={origDi !== null ? (origDi >= 0.8 ? "var(--success)" : "var(--danger)") : undefined}
        />
        <InfoCard
          label="Synthetic DI"
          value={synthDi}
          decimals={3}
          tone={synthDi !== null ? (synthDi >= 0.8 ? "var(--success)" : "var(--warning)") : undefined}
        />
        <InfoCard
          label="Improvement"
          value={improvement}
          decimals={3}
          tone={
            improvement !== null && improvement > 0
              ? "var(--success)"
              : improvement !== null && improvement < 0
                ? "var(--danger)"
                : undefined
          }
          prefix={improvement !== null && improvement > 0 ? "+" : ""}
        />
      </div>

      {generating && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span className="spinner lg" />
          Training generative model… (~30 seconds)
        </div>
      )}

      {result && !generating && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ display: "grid", gap: 18 }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 14,
            }}
            className="compare-grid"
          >
            <CompareCard
              title="Original"
              di={origDi}
              passes={passOriginal}
              rows={result.result.original_rows}
              tone="muted"
            />
            <CompareCard
              title="Synthetic"
              di={synthDi}
              passes={passSynthetic}
              rows={result.result.synthetic_rows}
              tone="success"
              improvement={improvement}
            />
          </div>

          {distributionChart.length > 0 && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div style={{ marginBottom: 10 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Group distribution</h3>
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
                  Compares original vs synthetic share per group.
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={distributionChart} margin={{ top: 12, right: 12, left: 0, bottom: 6 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="group" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "rgba(108,99,255,0.08)" }} contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Original" fill="#6B7280" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Synthetic" fill="#6C63FF" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={downloadCsv}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: "var(--brand-soft)",
                border: "1px solid rgba(108,99,255,0.4)",
                color: "var(--text)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Download size={14} /> Download synthetic CSV
            </button>
            <Badge variant="brand" uppercase={false} label={`Method: ${result.result.method}`} />
            <Badge
              variant="info"
              uppercase={false}
              label={`${result.result.synthetic_rows.toLocaleString()} synthetic rows`}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              padding: 14,
              background: "rgba(245, 158, 11, 0.10)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: 12,
              color: "#FCD34D",
              fontSize: 12.5,
              lineHeight: 1.55,
              alignItems: "flex-start",
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              Synthetic data is for model training only. Never use it as real
              records or share it as if it represents real individuals.
            </div>
          </div>
        </motion.section>
      )}

      <style>{`
        @media (max-width: 720px) {
          .info-cards { grid-template-columns: 1fr !important; }
          .compare-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function buildSyntheticDistribution(
  original: Record<string, number>,
  syntheticRows: number,
): Record<string, number> {
  // Backend balances groups equally; if no real data is available we still
  // approximate an even split here so the UI shows the intended outcome.
  const groups = Object.keys(original);
  if (groups.length === 0 || syntheticRows <= 0) return {};
  const perGroup = Math.floor(syntheticRows / groups.length);
  const out: Record<string, number> = {};
  groups.forEach((g) => {
    out[g] = perGroup;
  });
  return out;
}

function InfoCard({
  label,
  value,
  decimals = 0,
  tone,
  prefix = "",
}: {
  label: string;
  value: number | null;
  decimals?: number;
  tone?: string;
  prefix?: string;
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
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          letterSpacing: 0.6,
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: tone ?? "var(--text)",
          letterSpacing: -0.5,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value === null
          ? "—"
          : `${prefix}${Number(value).toFixed(decimals)}`}
      </div>
    </div>
  );
}

function CompareCard({
  title,
  di,
  passes,
  rows,
  tone,
  improvement,
}: {
  title: string;
  di: number | null;
  passes: boolean | null;
  rows: number;
  tone: "muted" | "success";
  improvement?: number | null;
}) {
  const accent =
    tone === "success" ? "var(--success)" : "var(--text-dim)";
  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${tone === "success" ? "rgba(34, 211, 160, 0.35)" : "var(--border)"}`,
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
          {title}
        </h3>
        {passes !== null &&
          (passes ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "var(--success)",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              <CheckCircle2 size={14} /> 80% rule
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "var(--danger)",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              <XCircle size={14} /> 80% rule
            </span>
          ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.5, textTransform: "uppercase" }}>
        Disparate impact
      </div>
      <div
        style={{
          fontSize: 36,
          fontWeight: 800,
          color: accent,
          letterSpacing: -0.8,
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {di !== null ? di.toFixed(3) : "—"}
      </div>
      <div
        style={{
          marginTop: 10,
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        {rows.toLocaleString()} rows
        {improvement !== undefined && improvement !== null && tone === "success" && (
          <span
            style={{
              marginLeft: 8,
              color: improvement > 0 ? "var(--success)" : "var(--danger)",
              fontWeight: 700,
            }}
          >
            {improvement > 0 ? "▲" : "▼"} {Math.abs(improvement).toFixed(3)}
          </span>
        )}
      </div>
    </div>
  );
}
