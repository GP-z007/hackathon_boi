"use client";

import axios from "axios";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  GitBranch,
  Layers,
  Loader2,
  Scale,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { ReactNode, useState } from "react";

import AnimatedNumber from "@/components/AnimatedNumber";
import AppShell from "@/components/AppShell";
import Badge, { BadgeVariant } from "@/components/Badge";
import RiskGauge from "@/components/RiskGauge";
import { useToast } from "@/components/Toast";
import UploadDropzone from "@/components/UploadDropzone";
import { FullAnalysisResponse, analyzeDataset } from "@/lib/api";

type StepStatus = "idle" | "active" | "done";
const STEP_LABELS = [
  "Reading dataset",
  "Detecting columns",
  "Running bias analysis",
] as const;

function severityVariant(s: "low" | "medium" | "high"): BadgeVariant {
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

function diColor(di: number): string {
  if (di < 0.8) return "var(--danger)";
  if (di < 0.9) return "var(--warning)";
  return "var(--success)";
}

export default function HomePage() {
  return (
    <AppShell>
      <UploadView />
    </AppShell>
  );
}

function UploadView() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>(["idle", "idle", "idle"]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FullAnalysisResponse | null>(null);

  const setStep = (idx: number, status: StepStatus) => {
    setSteps((prev) => {
      const next = [...prev];
      next[idx] = status;
      return next;
    });
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setSteps(["idle", "idle", "idle"]);
    setLoading(false);
  };

  const onAnalyze = async (selected: File) => {
    setFile(selected);
    setResult(null);
    setLoading(true);
    setSteps(["active", "idle", "idle"]);

    let stepIdx = 0;
    const advanceTimers: number[] = [];
    advanceTimers.push(
      window.setTimeout(() => {
        setStep(0, "done");
        setStep(1, "active");
        stepIdx = 1;
      }, 600),
    );
    advanceTimers.push(
      window.setTimeout(() => {
        setStep(1, "done");
        setStep(2, "active");
        stepIdx = 2;
      }, 1500),
    );

    try {
      const response = await analyzeDataset(selected);
      advanceTimers.forEach((t) => window.clearTimeout(t));
      setSteps(["done", "done", "done"]);
      setResult(response);
      window.sessionStorage.setItem(`analysis:${response.run_id}`, JSON.stringify(response));
      toast.success("Analysis complete.", "Done");
    } catch (err) {
      advanceTimers.forEach((t) => window.clearTimeout(t));
      setSteps((prev) => {
        const next = [...prev];
        next[stepIdx] = "idle";
        return next;
      });
      let message = "Analysis failed. Please check your CSV and try again.";
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data;
        if (typeof detail === "string" && detail.trim()) {
          message = detail;
        } else if (detail && typeof detail === "object" && "detail" in detail) {
          const d = (detail as { detail: unknown }).detail;
          message = typeof d === "string" ? d : Array.isArray(d) ? JSON.stringify(d) : message;
        } else if (err.message) {
          message = err.message;
        }
      }
      toast.error(message, "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const summary = result?.dataset_summary;
  const overallRisk = result?.overall_risk_score ?? 0;
  const riskBadge: BadgeVariant =
    overallRisk < 0.34 ? "low" : overallRisk < 0.67 ? "medium" : "high";
  const riskBadgeLabel = overallRisk < 0.34 ? "LOW" : overallRisk < 0.67 ? "MEDIUM" : "HIGH";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 28 }}>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(28px, 4vw, 44px)",
            fontWeight: 800,
            letterSpacing: -0.5,
            lineHeight: 1.1,
          }}
        >
          <span className="gradient-text">Detect Hidden Bias</span>
        </h1>
        <p
          style={{
            margin: "10px 0 0",
            color: "var(--text-muted)",
            fontSize: 16,
            maxWidth: 640,
            lineHeight: 1.55,
          }}
        >
          Upload any dataset. We auto-detect protected attributes and measure fairness
          in seconds — no schema mapping required.
        </p>
      </motion.section>

      {!file && <UploadDropzone onFile={onAnalyze} onError={(m) => toast.error(m)} />}

      {file && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--brand-soft)",
                color: "var(--brand)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <FileText size={18} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 420,
                }}
                title={file.name}
              >
                {file.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {(file.size / 1024).toFixed(1)} KB
              </div>
            </div>
            {!loading && (
              <CheckCircle2 size={18} color="var(--success)" />
            )}
          </div>
          <button
            type="button"
            onClick={reset}
            aria-label="Remove file"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              padding: 8,
              borderRadius: 8,
              cursor: "pointer",
              display: "inline-flex",
            }}
          >
            <X size={14} />
          </button>
        </motion.div>
      )}

      {loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 18,
            display: "grid",
            gap: 10,
          }}
        >
          {STEP_LABELS.map((label, idx) => (
            <StepRow key={label} label={label} status={steps[idx] ?? "idle"} />
          ))}
        </motion.div>
      )}

      {result && summary && (
        <>
          <AutoDetectedCard result={result} />

          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08 } },
            }}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <SummaryStat icon={<Database size={18} />} label="Rows analyzed" value={summary.row_count} />
            <SummaryStat icon={<Layers size={18} />} label="Columns" value={summary.column_count} />
            <SummaryStat
              icon={<Gauge size={18} />}
              label="Quality score"
              value={summary.dataset_quality_score * 100}
              decimals={0}
              suffix="%"
              tone={
                summary.dataset_quality_score >= 0.8
                  ? "var(--success)"
                  : summary.dataset_quality_score >= 0.6
                    ? "var(--warning)"
                    : "var(--danger)"
              }
            />
            <SummaryStat
              icon={<AlertTriangle size={18} />}
              label="Overall risk"
              value={overallRisk * 100}
              decimals={0}
              suffix="%"
              tone={
                overallRisk < 0.34
                  ? "var(--success)"
                  : overallRisk < 0.67
                    ? "var(--warning)"
                    : "var(--danger)"
              }
              right={<Badge variant={riskBadge} label={riskBadgeLabel} />}
            />
          </motion.div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
              gap: 18,
              alignItems: "start",
            }}
            className="results-grid"
          >
            <motion.div
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.1 } },
              }}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 14,
              }}
            >
              {Object.entries(result.bias_results).map(([attr, metrics]) => (
                <BiasCard key={attr} attr={attr} metrics={metrics} />
              ))}
            </motion.div>

            <RiskGauge score={overallRisk} />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <Link
              href={`/dashboard?runId=${result.run_id}`}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: "linear-gradient(135deg, #6C63FF, #8B5CF6)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                boxShadow: "0 8px 22px rgba(108,99,255,0.25)",
              }}
            >
              Open full dashboard →
            </Link>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: "var(--surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Run another analysis
            </button>
          </div>

          <NextStepsRow runId={result.run_id} />
        </>
      )}

      <style>{`
        @media (max-width: 880px) {
          .results-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function StepRow({ label, status }: { label: string; status: StepStatus }) {
  const isDone = status === "done";
  const isActive = status === "active";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        background: isActive ? "var(--brand-soft)" : "transparent",
        border: `1px solid ${isActive ? "rgba(108,99,255,0.3)" : "transparent"}`,
        borderRadius: 10,
        transition: "all 200ms ease",
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          background: isDone ? "var(--success)" : isActive ? "var(--brand)" : "var(--surface-3)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {isDone ? (
          <CheckCircle2 size={14} />
        ) : isActive ? (
          <Loader2 size={12} className="spinner-svg" />
        ) : null}
      </span>
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 600,
          color: isDone || isActive ? "var(--text)" : "var(--text-muted)",
        }}
      >
        {label}…
      </span>
      <style>{`.spinner-svg { animation: spin 0.9s linear infinite; }`}</style>
    </div>
  );
}

function AutoDetectedCard({ result }: { result: FullAnalysisResponse }) {
  const labelConf = Math.round(result.auto_detection.label_col_confidence * 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Sparkles size={16} color="var(--brand)" />
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text-muted)" }}>
          What we found
        </h2>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Badge
          variant="brand"
          uppercase={false}
          label={`Label · ${result.auto_detection.label_col} (${labelConf}%)`}
        />
        {result.auto_detection.protected_attrs.map((attr) => (
          <Badge key={attr} variant="info" uppercase={false} label={attr} />
        ))}
      </div>
      {Object.keys(result.auto_detection.detection_reasoning).length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: 6,
            fontSize: 12.5,
            color: "var(--text-muted)",
          }}
        >
          {Object.entries(result.auto_detection.detection_reasoning).map(([attr, reason]) => (
            <li key={attr}>
              <span style={{ color: "var(--text-dim)" }}>{attr}</span>{" "}
              <span style={{ opacity: 0.7 }}>· {reason}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  decimals = 0,
  suffix = "",
  tone,
  right,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  tone?: string;
  right?: ReactNode;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0 },
      }}
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
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "var(--surface-2)",
            color: "var(--brand)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </span>
        {right}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: tone ?? "var(--text)",
          letterSpacing: -0.5,
        }}
      >
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginTop: 4,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </div>
    </motion.div>
  );
}

function BiasCard({
  attr,
  metrics,
}: {
  attr: string;
  metrics: FullAnalysisResponse["bias_results"][string];
}) {
  const di = metrics.disparate_impact;
  const fillPct = Math.max(0, Math.min(1, di)) * 100;
  const bar = diColor(di);
  const pass = metrics.passes_80_percent_rule;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0 },
      }}
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
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{attr}</span>
        <Badge variant={severityVariant(metrics.severity)} label={metrics.severity} />
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: bar,
          letterSpacing: -0.6,
          lineHeight: 1.1,
        }}
      >
        <AnimatedNumber value={di} decimals={2} duration={1100} />
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14, letterSpacing: 0.3 }}>
        Disparate impact
      </div>

      <div
        style={{
          position: "relative",
          height: 8,
          background: "var(--surface-3)",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${fillPct}%`,
            background: bar,
            transition: "width 900ms cubic-bezier(0.16,1,0.3,1)",
            borderRadius: 999,
          }}
        />
        <span
          style={{
            position: "absolute",
            top: -4,
            bottom: -4,
            left: "80%",
            width: 0,
            borderLeft: "2px dashed var(--danger)",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--text-muted)",
          marginBottom: 14,
        }}
      >
        <span>0</span>
        <span style={{ color: "var(--danger)" }}>0.8 · legal threshold</span>
        <span>1.0</span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTop: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--text-dim)",
        }}
      >
        <span>
          <Scale size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
          Stat-parity diff{" "}
          <span style={{ color: "var(--text)", fontWeight: 700, marginLeft: 2 }}>
            {Math.abs(metrics.statistical_parity_difference).toFixed(3)}
          </span>
        </span>
        <span style={{ color: pass ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>
          80% rule {pass ? "✓" : "✗"}
        </span>
      </div>
    </motion.div>
  );
}

function NextStepsRow({ runId }: { runId: string }) {
  const items: {
    href: string;
    label: string;
    icon: typeof GitBranch;
  }[] = [
    { href: `/intersectional?runId=${runId}`, label: "View intersectional", icon: GitBranch },
    { href: `/compliance?runId=${runId}`, label: "Check compliance", icon: Scale },
    { href: `/recourse?runId=${runId}`, label: "Explore recourse", icon: UserCheck },
    { href: `/model-card?runId=${runId}`, label: "Generate model card", icon: FileText },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ display: "grid", gap: 12 }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.4,
          color: "var(--text-muted)",
          textTransform: "uppercase",
        }}
      >
        Next steps
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 16,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              color: "var(--text)",
              transition: "border-color 150ms ease, transform 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--brand)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--brand-soft)",
                color: "var(--brand)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon size={18} />
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{label}</span>
            <ArrowRight size={16} color="var(--text-muted)" />
          </Link>
        ))}
      </div>
    </motion.section>
  );
}
