"use client";

import axios from "axios";
import { motion } from "framer-motion";
import { GitMerge, Info, Loader2, Play, ShieldCheck, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import RunSelector from "@/components/RunSelector";
import { useToast } from "@/components/Toast";
import {
  AuditRunSummary,
  CausalResult,
  FullAnalysisResponse,
  MetricResponse,
  getMetrics,
  listRuns,
  runCausalAnalysis,
} from "@/lib/api";

export default function CausalPage() {
  return (
    <AppShell>
      <CausalView />
    </AppShell>
  );
}

function CausalView() {
  const toast = useToast();
  const [runs, setRuns] = useState<AuditRunSummary[]>([]);
  const [runId, setRunId] = useState("");
  const [protectedAttrs, setProtectedAttrs] = useState<string[]>([]);
  const [protectedAttr, setProtectedAttr] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [labelCol, setLabelCol] = useState<string>("");
  const [confounders, setConfounders] = useState<string[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<CausalResult | null>(null);

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
    const cached = window.sessionStorage.getItem(`analysis:${runId}`);
    let attrs: string[] = [];
    let label = "";
    let cols: string[] = [];
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as FullAnalysisResponse;
        attrs = parsed.auto_detection?.protected_attrs ?? [];
        label = parsed.auto_detection?.label_col ?? "";
        const groupDist = parsed.dataset_summary?.group_distributions ?? {};
        cols = Object.keys(groupDist);
      } catch {
        // fall through to network fetch
      }
    }
    setProtectedAttrs(attrs);
    setLabelCol(label);
    setColumns(cols);
    setProtectedAttr((current) => current && attrs.includes(current) ? current : attrs[0] ?? "");

    if (attrs.length === 0) {
      const fallback = runs.find((r) => r.run_id === runId);
      if (fallback?.protected_attrs?.length) {
        setProtectedAttrs(fallback.protected_attrs);
        setProtectedAttr(fallback.protected_attrs[0] ?? "");
      } else {
        // Last resort, peek at metrics for the attribute list.
        void getMetrics(runId).then((res: MetricResponse) => {
          const all = res.all_results ?? {};
          const found = Object.keys(all);
          setProtectedAttrs(found);
          setProtectedAttr((current) =>
            current && found.includes(current) ? current : found[0] ?? "",
          );
        });
      }
    }
    setResult(null);
    setConfounders([]);
  }, [runId, runs]);

  const numericConfounderChoices = useMemo(() => {
    return columns.filter(
      (c) => c && c !== labelCol && !protectedAttrs.includes(c),
    );
  }, [columns, labelCol, protectedAttrs]);

  const onRun = async () => {
    if (!runId) return;
    setAnalysing(true);
    setResult(null);
    try {
      const res = await runCausalAnalysis(
        runId,
        protectedAttr || undefined,
        confounders.length > 0 ? confounders : undefined,
      );
      setResult(res);
      toast.success("Causal analysis complete.");
    } catch (err) {
      let message = "Causal analysis failed.";
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
      toast.error(message, "Causal analysis");
    } finally {
      setAnalysing(false);
    }
  };

  const ate = result?.result.average_treatment_effect ?? 0;
  const ateColor = Math.abs(ate) > 0.05 ? "var(--danger)" : "var(--success)";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 22 }}>
      <header>
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
          <GitMerge size={22} color="var(--brand)" /> Causal fairness analysis
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
          Does this attribute causally cause the outcome, or is it just correlated?
          This is what matters in court.
        </p>
      </header>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 18,
          display: "grid",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1fr) minmax(220px, 1fr) auto",
            gap: 12,
            alignItems: "end",
          }}
          className="causal-controls"
        >
          <Field label="Run">
            <RunSelector
              runs={runs}
              value={runId}
              onChange={setRunId}
              loading={loadingRuns}
              width={320}
            />
          </Field>
          <Field label="Protected attribute">
            <select
              value={protectedAttr}
              onChange={(e) => setProtectedAttr(e.target.value)}
              style={selectStyle}
              disabled={!runId || protectedAttrs.length === 0}
            >
              {protectedAttrs.length === 0 && (
                <option value="">No attributes detected</option>
              )}
              {protectedAttrs.map((a) => (
                <option key={a} value={a} style={{ background: "var(--surface)" }}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            onClick={onRun}
            disabled={!runId || !protectedAttr || analysing}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #6C63FF, #8B5CF6)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              border: "none",
              cursor: !runId || !protectedAttr || analysing ? "not-allowed" : "pointer",
              opacity: !runId || !protectedAttr || analysing ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 8px 22px rgba(108,99,255,0.25)",
              minHeight: 40,
            }}
          >
            {analysing ? <Loader2 size={14} className="spinner-svg" /> : <Play size={14} />}
            {analysing ? "Running…" : "Run causal analysis"}
          </button>
        </div>

        {numericConfounderChoices.length > 0 && (
          <Field label="Optional confounders (numeric columns to control for)">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {numericConfounderChoices.map((c) => {
                const active = confounders.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setConfounders((prev) =>
                        active ? prev.filter((p) => p !== c) : [...prev, c],
                      );
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: `1px solid ${active ? "var(--brand)" : "var(--border)"}`,
                      background: active ? "var(--brand-soft)" : "transparent",
                      color: active ? "#C7C2FF" : "var(--text-dim)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
      </section>

      {analysing && (
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
          Running causal inference… this may take 30 seconds.
          <style>{`.spinner-svg { animation: spin 0.9s linear infinite; }`}</style>
        </div>
      )}

      {result && !analysing && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ display: "grid", gap: 18 }}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 28,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                letterSpacing: 0.6,
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Average Treatment Effect (ATE)
            </div>
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                color: ateColor,
                letterSpacing: -1.4,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ate >= 0 ? "+" : ""}
              {ate.toFixed(3)}
            </div>
            <div style={{ marginTop: 8, color: "var(--text-dim)", fontSize: 13 }}>
              causal effect of <code>{result.protected_attr}</code>
              {labelCol && (
                <>
                  {" "}
                  on <code>{labelCol}</code>
                </>
              )}
            </div>
            <div
              style={{
                marginTop: 16,
                display: "inline-flex",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <Badge
                variant="brand"
                uppercase={false}
                label={
                  result.result.method === "dowhy_linear_regression"
                    ? "DoWhy linear regression"
                    : "IPW fallback"
                }
              />
              {result.result.confounders_controlled.length > 0 && (
                <Badge
                  variant="info"
                  uppercase={false}
                  label={`Controlled for: ${result.result.confounders_controlled.join(", ")}`}
                />
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
              gap: 18,
            }}
            className="result-grid"
          >
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 18,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                Interpretation
              </h3>
              <p
                style={{
                  margin: 0,
                  color: "var(--text-dim)",
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                {result.result.interpretation}
              </p>
              {result.result.note && (
                <p
                  style={{
                    marginTop: 12,
                    color: "var(--text-muted)",
                    fontSize: 12,
                    lineHeight: 1.5,
                    fontStyle: "italic",
                  }}
                >
                  Note: {result.result.note}
                </p>
              )}
            </div>

            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 18,
                textAlign: "center",
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
                Causal bias detected?
              </div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: -1,
                  color: result.result.is_causal_bias ? "var(--danger)" : "var(--success)",
                }}
              >
                {result.result.is_causal_bias ? "YES" : "NO"}
              </div>
            </div>
          </div>

          {result.result.refutation_passed !== undefined && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 18,
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              {result.result.refutation_passed ? (
                <ShieldCheck size={28} color="var(--success)" />
              ) : (
                <ShieldAlert size={28} color="var(--warning)" />
              )}
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                  Robustness check:{" "}
                  <span
                    style={{
                      color: result.result.refutation_passed
                        ? "var(--success)"
                        : "var(--warning)",
                    }}
                  >
                    {result.result.refutation_passed ? "PASSED" : "FAILED"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  Refutation tests inject random noise as a fake confounder. If the
                  estimated effect barely changes, the original ATE is trustworthy.
                </div>
              </div>
              {result.result.refutation_new_effect !== undefined && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  New effect: <strong>{result.result.refutation_new_effect.toFixed(3)}</strong>
                </div>
              )}
            </div>
          )}

          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 18,
              display: "flex",
              gap: 12,
            }}
          >
            <Info size={18} color="var(--brand)" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--text)" }}>What does this mean?</strong>
              <p style={{ margin: "6px 0 0" }}>
                An ATE of 0.15 means that changing only the protected attribute
                increases the probability of a positive outcome by 15 percentage
                points, even after controlling for income, education, and other
                factors. Values close to zero suggest that other features explain
                the outcome — not the protected attribute itself.
              </p>
            </div>
          </div>
        </motion.section>
      )}

      {!result && !analysing && !runId && !loadingRuns && (
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

      <style>{`
        @media (max-width: 880px) {
          .causal-controls { grid-template-columns: 1fr !important; }
          .result-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  appearance: "none",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--text)",
  fontSize: 13,
  fontWeight: 600,
  padding: "10px 14px",
  outline: "none",
  cursor: "pointer",
  width: "100%",
  minHeight: 40,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
