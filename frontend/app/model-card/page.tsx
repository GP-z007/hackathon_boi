"use client";

import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import AppShell from "@/components/AppShell";
import RunSelector from "@/components/RunSelector";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  AuditRunSummary,
  ModelCardResult,
  getModelCard,
  listRuns,
} from "@/lib/api";

export default function ModelCardPage() {
  return (
    <AppShell>
      <ModelCardView />
    </AppShell>
  );
}

function ModelCardView() {
  const toast = useToast();
  const [runs, setRuns] = useState<AuditRunSummary[]>([]);
  const [runId, setRunId] = useState("");
  const [useCase, setUseCase] = useState("General decision model");
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<ModelCardResult | null>(null);
  const [tab, setTab] = useState<"preview" | "raw">("preview");
  const [copied, setCopied] = useState<"raw" | "json" | null>(null);

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
      setCard(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getModelCard(runId, useCase);
        if (!cancelled) setCard(res);
      } catch {
        if (!cancelled) toast.error("Failed to load model card.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, useCase]);

  const downloadMarkdown = () => {
    if (!card) return;
    const blob = new Blob([card.markdown], { type: "text/markdown" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `model-card-${runId.slice(0, 8)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    toast.success("Markdown downloaded.");
  };

  const copyJson = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(card.json, null, 2));
      setCopied("json");
      toast.success("Model card JSON copied.");
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Failed to copy JSON.");
    }
  };

  const copyMarkdown = async () => {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.markdown);
      setCopied("raw");
      toast.success("Markdown copied.");
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Failed to copy markdown.");
    }
  };

  const huggingfaceUrl = useMemo(() => {
    if (!card) return null;
    const encoded = encodeURIComponent(card.markdown.slice(0, 8000));
    return `https://huggingface.co/new?type=model&readme=${encoded}`;
  }, [card]);

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
            <FileText size={22} color="var(--brand)" /> Model card
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
            Auto-generated documentation in the Google / Hugging Face standard.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <UseCaseInput value={useCase} onChange={setUseCase} />
          <RunSelector runs={runs} value={runId} onChange={setRunId} loading={loadingRuns} />
        </div>
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

      {runId && loading && <Skeleton variant="card" height={420} />}

      {runId && !loading && card && (
        <>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
                Preview
              </TabButton>
              <TabButton active={tab === "raw"} onClick={() => setTab("raw")}>
                Raw
              </TabButton>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <ActionButton onClick={downloadMarkdown}>
                <Download size={14} /> Download .md
              </ActionButton>
              <ActionButton onClick={copyJson}>
                {copied === "json" ? <Check size={14} /> : <Copy size={14} />} Copy JSON
              </ActionButton>
              {huggingfaceUrl && (
                <ActionButton href={huggingfaceUrl} external>
                  <ExternalLink size={14} /> Open in Hugging Face
                </ActionButton>
              )}
            </div>
          </div>

          {tab === "preview" ? (
            <div className="model-card-paper">
              <ReactMarkdown>{card.markdown}</ReactMarkdown>
            </div>
          ) : (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 18,
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={copyMarkdown}
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  padding: "6px 10px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text-dim)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {copied === "raw" ? <Check size={12} /> : <Copy size={12} />}
                {copied === "raw" ? "Copied" : "Copy"}
              </button>
              <pre
                style={{
                  margin: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: "var(--text-dim)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  paddingTop: 28,
                }}
              >
                {card.markdown}
              </pre>
            </div>
          )}
        </>
      )}

      <ModelCardStyles />
    </div>
  );
}

function UseCaseInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "0 12px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minHeight: 40,
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
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="General decision model"
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--text)",
          fontSize: 13,
          fontWeight: 600,
          padding: "8px 0",
          minWidth: 200,
        }}
      />
    </label>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "var(--brand-soft)" : "transparent",
        color: active ? "var(--text)" : "var(--text-dim)",
        border: "none",
        padding: "8px 16px",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 700,
        borderRight: "1px solid var(--border)",
      }}
    >
      {children}
    </button>
  );
}

function ActionButton({
  onClick,
  children,
  href,
  external,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  href?: string;
  external?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        style={baseStyle}
      >
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} style={baseStyle}>
      {children}
    </button>
  );
}

function ModelCardStyles() {
  return (
    <style>{`
      .model-card-paper {
        background: #FFFFFF;
        color: #111827;
        padding: 36px 44px;
        border-radius: 14px;
        border: 1px solid var(--border);
        line-height: 1.65;
        font-size: 14.5px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      }
      .model-card-paper h1 {
        font-size: 28px;
        font-weight: 800;
        letterSpacing: -0.5px;
        margin: 0 0 12px;
        color: #0F172A;
      }
      .model-card-paper h2 {
        font-size: 18px;
        font-weight: 800;
        margin: 28px 0 10px;
        padding-left: 10px;
        border-left: 4px solid #6C63FF;
        color: #0F172A;
      }
      .model-card-paper h3 {
        font-size: 15px;
        font-weight: 700;
        margin: 18px 0 8px;
        color: #1F2937;
      }
      .model-card-paper p { margin: 0 0 10px; }
      .model-card-paper ul, .model-card-paper ol { padding-left: 22px; margin: 0 0 10px; }
      .model-card-paper li { margin-bottom: 4px; }
      .model-card-paper a { color: #6C63FF; text-decoration: underline; }
      .model-card-paper strong { color: #0F172A; }
      .model-card-paper code {
        background: #F3F4F6;
        color: #111827;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 13px;
        font-family: var(--font-mono);
      }
      .model-card-paper blockquote {
        border-left: 3px solid #E5E7EB;
        padding: 4px 12px;
        color: #4B5563;
        margin: 10px 0;
        background: #F9FAFB;
        border-radius: 6px;
      }
      .model-card-paper table {
        width: 100%;
        border-collapse: collapse;
        margin: 10px 0 16px;
        font-size: 13px;
      }
      .model-card-paper th, .model-card-paper td {
        border: 1px solid #E5E7EB;
        padding: 8px 12px;
        text-align: left;
      }
      .model-card-paper th {
        background: #F3F4F6;
        font-weight: 700;
        color: #111827;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.5px;
      }
      .model-card-paper tr:nth-child(even) td { background: #FAFAFA; }
      .model-card-paper td:nth-child(4),
      .model-card-paper td:nth-child(5) {
        font-variant-numeric: tabular-nums;
      }
    `}</style>
  );
}
