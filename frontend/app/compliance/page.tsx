"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Scale,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import Badge, { BadgeVariant } from "@/components/Badge";
import RunSelector from "@/components/RunSelector";
import { useToast } from "@/components/Toast";
import {
  AuditRunSummary,
  ComplianceRegulation,
  ComplianceReport,
  apiClient,
  getCompliance,
  listRuns,
} from "@/lib/api";

const USE_CASES: { id: string; label: string }[] = [
  { id: "hiring", label: "Hiring / Recruitment" },
  { id: "credit", label: "Credit / Lending" },
  { id: "medical", label: "Medical / Healthcare" },
  { id: "education", label: "Education" },
  { id: "law_enforcement", label: "Law enforcement" },
  { id: "other", label: "Other" },
];

function statusVariant(status: string): BadgeVariant {
  if (status === "PASS") return "success";
  if (status === "FAIL") return "danger";
  return "warning";
}

function statusLabel(status: string): string {
  if (status === "MANUAL_REVIEW") return "MANUAL REVIEW";
  return status;
}

export default function CompliancePage() {
  return (
    <AppShell>
      <ComplianceView />
    </AppShell>
  );
}

function ComplianceView() {
  const toast = useToast();
  const [runs, setRuns] = useState<AuditRunSummary[]>([]);
  const [runId, setRunId] = useState("");
  const [useCase, setUseCase] = useState("hiring");
  const [report, setReport] = useState<ComplianceReport>({});
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

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
      setReport({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingReport(true);
      try {
        const res = await getCompliance(runId, useCase);
        if (!cancelled) {
          setReport(res.report);
          // Open the first failing accordion by default for visibility.
          const first = Object.entries(res.report).find(
            ([, r]) => r.overall_status !== "PASS",
          );
          if (first) setOpen({ [first[0]]: true });
        }
      } catch {
        if (!cancelled) toast.error("Failed to load compliance report.");
      } finally {
        if (!cancelled) setLoadingReport(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, useCase]);

  const totals = useMemo(() => {
    const entries = Object.values(report);
    const pass = entries.filter((e) => e.overall_status === "PASS").length;
    const fail = entries.filter((e) => e.overall_status === "FAIL").length;
    const review = entries.filter((e) => e.overall_status === "MANUAL_REVIEW").length;
    return { pass, fail, review, total: entries.length };
  }, [report]);

  const exportReport = async () => {
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
      link.download = `fairaudit-compliance-${runId.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Compliance report exported.");
    } catch {
      toast.error("Failed to export compliance report.");
    }
  };

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
            <Scale size={22} color="var(--brand)" /> Regulatory compliance
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
            Check your audit results against major AI fairness laws worldwide.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <UseCaseSelect value={useCase} onChange={setUseCase} />
          <RunSelector runs={runs} value={runId} onChange={setRunId} loading={loadingRuns} />
          <button
            type="button"
            onClick={exportReport}
            disabled={!runId}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              background: "var(--brand-soft)",
              color: "var(--text)",
              fontWeight: 700,
              fontSize: 13,
              border: "1px solid rgba(108,99,255,0.4)",
              cursor: runId ? "pointer" : "not-allowed",
              opacity: runId ? 1 : 0.6,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Download size={14} /> Export compliance report
          </button>
        </div>
      </header>

      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginTop: -10,
          lineHeight: 1.5,
        }}
      >
        Use case determines which regulations apply to your system.
      </div>

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

      {runId && totals.total > 0 && (
        <ComplianceSummary {...totals} />
      )}

      {runId && totals.total === 0 && !loadingReport && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: 14,
            padding: 28,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13.5,
          }}
        >
          No compliance report cached for this run. Re-run the analysis from the
          upload page to generate one.
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(report).map(([id, reg]) => (
          <RegulationAccordion
            key={id}
            id={id}
            regulation={reg}
            open={open[id] ?? false}
            onToggle={() =>
              setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
            }
          />
        ))}
      </div>
    </div>
  );
}

function ComplianceSummary({
  pass,
  fail,
  review,
  total,
}: {
  pass: number;
  fail: number;
  review: number;
  total: number;
}) {
  const passPct = total > 0 ? (pass / total) * 100 : 0;
  const failPct = total > 0 ? (fail / total) * 100 : 0;
  const reviewPct = total > 0 ? (review / total) * 100 : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
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
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 600 }}>
          <span style={{ color: "var(--success)" }}>{pass}</span> of {total}{" "}
          regulations PASS
          {fail > 0 && (
            <>
              {" · "}
              <span style={{ color: "var(--danger)" }}>{fail}</span> FAIL
            </>
          )}
          {review > 0 && (
            <>
              {" · "}
              <span style={{ color: "var(--warning)" }}>{review}</span> need manual review
            </>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          height: 12,
          borderRadius: 999,
          overflow: "hidden",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        {passPct > 0 && (
          <span style={{ width: `${passPct}%`, background: "#22D3A0" }} />
        )}
        {reviewPct > 0 && (
          <span style={{ width: `${reviewPct}%`, background: "#F59E0B" }} />
        )}
        {failPct > 0 && (
          <span style={{ width: `${failPct}%`, background: "#EF4444" }} />
        )}
      </div>
    </motion.div>
  );
}

function UseCaseSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
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
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Use case
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
        }}
      >
        {USE_CASES.map((u) => (
          <option key={u.id} value={u.id} style={{ background: "var(--surface)" }}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function RegulationAccordion({
  id,
  regulation,
  open,
  onToggle,
}: {
  id: string;
  regulation: ComplianceRegulation;
  open: boolean;
  onToggle: () => void;
}) {
  const status = regulation.overall_status;
  const Icon = status === "PASS" ? CheckCircle2 : status === "FAIL" ? XCircle : FileText;
  const iconColor =
    status === "PASS" ? "var(--success)" : status === "FAIL" ? "var(--danger)" : "var(--warning)";
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          color: "var(--text)",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
        }}
      >
        {open ? (
          <ChevronDown size={16} color="var(--text-muted)" />
        ) : (
          <ChevronRight size={16} color="var(--text-muted)" />
        )}
        <Icon size={18} color={iconColor} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{regulation.regulation}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {regulation.jurisdiction} · {id}
          </div>
        </div>
        <Badge variant={statusVariant(status)} label={statusLabel(status)} />
      </button>

      {open && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: 16,
            display: "grid",
            gap: 16,
          }}
        >
          {regulation.metric_checks.length > 0 && (
            <div>
              <SectionLabel>Metric checks</SectionLabel>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      <Th>Metric</Th>
                      <Th>Attribute</Th>
                      <Th align="right">Your value</Th>
                      <Th align="right">Threshold</Th>
                      <Th align="right">Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {regulation.metric_checks.map((c, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 12px", color: "var(--text)" }}>{c.metric}</td>
                        <td style={{ padding: "8px 12px", color: "var(--text-dim)" }}>{c.attribute}</td>
                        <td
                          style={{
                            padding: "8px 12px",
                            textAlign: "right",
                            color: "var(--text-dim)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {Number(c.value).toFixed(3)}
                        </td>
                        <td
                          style={{
                            padding: "8px 12px",
                            textAlign: "right",
                            color: "var(--text-muted)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {c.threshold !== undefined ? c.threshold : "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          <Badge
                            small
                            variant={c.status === "PASS" ? "success" : "danger"}
                            label={c.status}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {regulation.procedural_requirements.length > 0 && (
            <div>
              <SectionLabel>Procedural requirements</SectionLabel>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {regulation.procedural_requirements.map((req) => (
                  <ProceduralRow key={req} requirement={req} status={status} />
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: "grid", gap: 8 }}>
            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 14px",
                color: "var(--text-dim)",
                fontSize: 12.5,
              }}
            >
              <strong style={{ color: "var(--text)" }}>Penalty:</strong>{" "}
              {regulation.penalty}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              Effective:{" "}
              <Badge small variant="neutral" uppercase={false} label={regulation.effective_date} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PRECHECKED_REQUIREMENTS = new Set<string>([
  "audit_trail",
  "technical_documentation",
  "annual_independent_audit",
]);

function ProceduralRow({
  requirement,
  status,
}: {
  requirement: string;
  status: string;
}) {
  // Pre-check requirements that the audit run can vouch for; everything else
  // is left for the user to verify.
  const preChecked = status === "PASS" || PRECHECKED_REQUIREMENTS.has(requirement);
  const [checked, setChecked] = useState(preChecked);
  const label = requirement
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: "var(--surface-2)",
        borderRadius: 8,
        border: "1px solid var(--border)",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        style={{ accentColor: "var(--brand)" }}
      />
      <span
        style={{
          fontSize: 13,
          color: checked ? "var(--text)" : "var(--text-dim)",
          textDecoration: checked ? "none" : "none",
        }}
      >
        {label}
      </span>
      {preChecked && (
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--success)" }}>
          auto-verified
        </span>
      )}
    </li>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--text-muted)",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        fontWeight: 700,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
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
        padding: "8px 12px",
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
