"use client";

import axios from "axios";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import Badge, { BadgeVariant } from "@/components/Badge";
import RunSelector from "@/components/RunSelector";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  AuditRunSummary,
  FullAnalysisResponse,
  RecourseResult,
  RecourseSuggestion,
  generateRecourse,
  listRuns,
} from "@/lib/api";

type FeatureField = {
  id: string;
  name: string;
  value: string;
  options?: string[];
  preset?: boolean;
};

function effortBadge(n: number): { label: string; variant: BadgeVariant } {
  if (n <= 2) return { label: "Low effort", variant: "low" };
  if (n <= 4) return { label: "Medium", variant: "medium" };
  return { label: "High", variant: "high" };
}

function inferValue(raw: string): string | number {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (!Number.isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

export default function RecoursePage() {
  return (
    <AppShell>
      <RecourseView />
    </AppShell>
  );
}

function RecourseView() {
  const toast = useToast();
  const [runs, setRuns] = useState<AuditRunSummary[]>([]);
  const [runId, setRunId] = useState("");
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [fields, setFields] = useState<FeatureField[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<RecourseResult | null>(null);
  const [protectedAttrs, setProtectedAttrs] = useState<string[]>([]);

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
      setFields([]);
      setProtectedAttrs([]);
      return;
    }
    const cached = window.sessionStorage.getItem(`analysis:${runId}`);
    let attrs: string[] = [];
    let groupDists: Record<string, Record<string, number>> = {};
    let labelCol = "";
    let labelDist: Record<string, number> = {};
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as FullAnalysisResponse;
        attrs = parsed.auto_detection?.protected_attrs ?? [];
        labelCol = parsed.auto_detection?.label_col ?? "";
        groupDists = parsed.dataset_summary?.group_distributions ?? {};
        labelDist = parsed.dataset_summary?.label_distribution ?? {};
      } catch {
        // ignore
      }
    }
    setProtectedAttrs(attrs);

    const built: FeatureField[] = [];
    for (const attr of attrs) {
      const groups = Object.keys(groupDists[attr] ?? {});
      built.push({
        id: `pa-${attr}`,
        name: attr,
        value: groups[0] ?? "",
        options: groups.length > 0 ? groups : undefined,
        preset: true,
      });
    }
    if (labelCol) {
      const labelOptions = Object.keys(labelDist);
      built.push({
        id: `label-${labelCol}`,
        name: labelCol,
        value: labelOptions.find((v) => v === "0") ?? labelOptions[0] ?? "0",
        options: labelOptions.length > 0 ? labelOptions : undefined,
        preset: true,
      });
    }
    setFields(built);
    setResult(null);
  }, [runId]);

  const addField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: "",
        value: "",
      },
    ]);
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const updateField = (id: string, patch: Partial<FeatureField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const buildRow = () => {
    const row: Record<string, unknown> = {};
    for (const f of fields) {
      const name = f.name.trim();
      if (!name) continue;
      const v = inferValue(f.value);
      if (v === "") continue;
      row[name] = v;
    }
    return row;
  };

  const onFindRecourse = async () => {
    if (!runId) return;
    const row = buildRow();
    if (Object.keys(row).length === 0) {
      toast.error("Provide at least one feature value.");
      return;
    }
    setAnalysing(true);
    setResult(null);
    try {
      const res = await generateRecourse(runId, row);
      setResult(res);
      if (res.result.counterfactuals.length === 0) {
        toast.info("No counterfactuals found for this individual.");
      } else {
        toast.success("Recourse generated.");
      }
    } catch (err) {
      let message = "Failed to generate recourse.";
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
      toast.error(message, "Recourse");
    } finally {
      setAnalysing(false);
    }
  };

  const sortedSuggestions = useMemo<RecourseSuggestion[]>(() => {
    if (!result) return [];
    return [...result.result.counterfactuals].sort(
      (a, b) => a.n_features_to_change - b.n_features_to_change,
    );
  }, [result]);

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
            <UserCheck size={22} color="var(--brand)" /> Individual decision explorer
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
            Enter the details of a rejected individual to see what changes would
            have led to a different outcome.
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

      {runId && (
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
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              Rejected individual&apos;s features
            </h3>
            <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
              Detected protected attributes are pre-filled. Add any other feature
              columns you want to lock for the counterfactual search.
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {fields.length === 0 && (
              <Skeleton variant="block" height={48} />
            )}
            {fields.map((f) => (
              <FeatureRow
                key={f.id}
                field={f}
                isProtected={f.preset === true && protectedAttrs.includes(f.name)}
                onChange={(patch) => updateField(f.id, patch)}
                onRemove={() => removeField(f.id)}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={addField}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Plus size={14} /> Add feature
            </button>
            <button
              type="button"
              onClick={onFindRecourse}
              disabled={!runId || analysing}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: "linear-gradient(135deg, #6C63FF, #8B5CF6)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                border: "none",
                cursor: !runId || analysing ? "not-allowed" : "pointer",
                opacity: !runId || analysing ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 8px 22px rgba(108,99,255,0.25)",
              }}
            >
              {analysing ? <Loader2 size={14} className="spinner-svg" /> : <Search size={14} />}
              {analysing ? "Searching…" : "Find recourse"}
            </button>
          </div>
          <style>{`.spinner-svg { animation: spin 0.9s linear infinite; }`}</style>
        </section>
      )}

      {analysing && <Skeleton variant="card" height={140} />}

      {result && !analysing && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{ display: "grid", gap: 14 }}
        >
          <div
            style={{
              fontSize: 13,
              color: "var(--text-dim)",
              padding: "8px 14px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            {result.result.summary}
            {result.result.note && (
              <span style={{ marginLeft: 8, color: "var(--text-muted)", fontStyle: "italic" }}>
                · {result.result.note}
              </span>
            )}
          </div>

          {sortedSuggestions.length === 0 && (
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
              No counterfactuals were found. Try adjusting the input values or
              adding more feature context.
            </div>
          )}

          {sortedSuggestions.map((s, idx) => (
            <SuggestionCard key={idx} idx={idx + 1} suggestion={s} />
          ))}
        </motion.section>
      )}

      <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
        These suggestions are statistical estimates, not guarantees. Actual
        outcomes depend on the full model.
      </p>
    </div>
  );
}

function FeatureRow({
  field,
  isProtected,
  onChange,
  onRemove,
}: {
  field: FeatureField;
  isProtected: boolean;
  onChange: (patch: Partial<FeatureField>) => void;
  onRemove: () => void;
}) {
  const inputBase: React.CSSProperties = {
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text)",
    fontSize: 13,
    padding: "9px 12px",
    outline: "none",
    width: "100%",
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.6fr) auto",
        gap: 8,
        alignItems: "center",
      }}
      className="feature-row"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="feature name (e.g. credit_score)"
          disabled={field.preset}
          style={{
            ...inputBase,
            color: field.preset ? "var(--text-dim)" : "var(--text)",
            background: field.preset ? "var(--surface)" : inputBase.background,
          }}
        />
        {isProtected && (
          <Badge variant="brand" small uppercase={false} label="protected" />
        )}
      </div>
      {field.options && field.options.length > 0 ? (
        <select
          value={field.value}
          onChange={(e) => onChange({ value: e.target.value })}
          style={{
            ...inputBase,
            appearance: "none",
            cursor: "pointer",
          }}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt} style={{ background: "var(--surface)" }}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={field.value}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="value (numeric or text)"
          style={inputBase}
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={field.preset}
        aria-label="Remove feature"
        style={{
          background: "transparent",
          border: "1px solid var(--border)",
          color: field.preset ? "var(--text-muted)" : "var(--text-dim)",
          padding: 8,
          borderRadius: 8,
          cursor: field.preset ? "not-allowed" : "pointer",
          display: "inline-flex",
          opacity: field.preset ? 0.5 : 1,
        }}
      >
        <Trash2 size={14} />
      </button>
      <style>{`
        @media (max-width: 720px) {
          .feature-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function SuggestionCard({
  idx,
  suggestion,
}: {
  idx: number;
  suggestion: RecourseSuggestion;
}) {
  const badge = effortBadge(suggestion.n_features_to_change);
  const entries = Object.entries(suggestion.changes_needed);
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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
          Option {idx}: Change {suggestion.n_features_to_change} feature
          {suggestion.n_features_to_change === 1 ? "" : "s"}
        </h3>
        <Badge variant={badge.variant} label={badge.label} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)" }}>
              <Th>Feature</Th>
              <Th align="right">Current value</Th>
              <Th align="right">Suggested value</Th>
              <Th align="center">Direction</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([feature, change]) => (
              <tr key={feature} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px", color: "var(--text)", fontWeight: 600 }}>
                  {feature}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    color: "var(--text-dim)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {change.from}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    color: "var(--text)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {change.to}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>
                  {change.direction === "increase" ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: "var(--success)",
                        fontWeight: 700,
                      }}
                    >
                      <ArrowUp size={14} /> increase
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: "var(--warning)",
                        fontWeight: 700,
                      }}
                    >
                      <ArrowDown size={14} /> decrease
                    </span>
                  )}
                </td>
              </tr>
            ))}
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
