"use client";

import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import Badge, { BadgeVariant } from "@/components/Badge";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { AuditRunSummary, apiClient, listRuns } from "@/lib/api";

type SortKey = "timestamp" | "filename" | "row_count" | "attrs" | "risk";
type SortDir = "asc" | "desc";
const PAGE_SIZE = 10;

function riskVariant(score: number): BadgeVariant {
  if (score < 0.34) return "low";
  if (score < 0.67) return "medium";
  return "high";
}
function riskLabel(score: number): string {
  if (score < 0.34) return "LOW";
  if (score < 0.67) return "MEDIUM";
  return "HIGH";
}

export default function ReportsPage() {
  return (
    <AppShell>
      <ReportsView />
    </AppShell>
  );
}

function ReportsView() {
  const toast = useToast();
  const [runs, setRuns] = useState<AuditRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const list = await listRuns();
        if (!cancelled) setRuns(list);
      } catch {
        if (!cancelled) toast.error("Could not load reports.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? runs.filter((r) => r.filename.toLowerCase().includes(q)) : runs;
  }, [runs, search]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "timestamp":
          av = new Date(a.timestamp).getTime();
          bv = new Date(b.timestamp).getTime();
          break;
        case "filename":
          av = a.filename.toLowerCase();
          bv = b.filename.toLowerCase();
          break;
        case "row_count":
          av = a.row_count;
          bv = b.row_count;
          break;
        case "attrs":
          av = a.protected_attrs.length;
          bv = b.protected_attrs.length;
          break;
        case "risk":
          av = a.overall_risk_score;
          bv = b.overall_risk_score;
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const onSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const exportReport = async (runId: string, filename: string) => {
    try {
      const response = await apiClient.get(`/report/${runId}`, {
        responseType: "blob",
        headers: { Accept: "application/pdf" },
      });
      const blob = new Blob([response.data as BlobPart], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName = filename.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_");
      link.download = `fairaudit-${safeName}-${runId.slice(0, 8)}.pdf`;
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
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 18 }}>
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
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.4 }}>
            Reports
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13.5 }}>
            Every audit run you&apos;ve completed, sortable and searchable.
          </p>
        </div>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "8px 12px",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            minWidth: 260,
          }}
        >
          <Search size={14} color="var(--text-muted)" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by filename…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <Th label="Date" k="timestamp" current={sortKey} dir={sortDir} onSort={onSort} />
                <Th label="Filename" k="filename" current={sortKey} dir={sortDir} onSort={onSort} />
                <Th label="Rows" k="row_count" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <Th label="Attributes" k="attrs" current={sortKey} dir={sortDir} onSort={onSort} />
                <Th label="Risk" k="risk" current={sortKey} dir={sortDir} onSort={onSort} />
                <th
                  style={{
                    textAlign: "right",
                    padding: "12px 14px",
                    fontSize: 11,
                    color: "var(--text-muted)",
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    fontWeight: 700,
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} style={{ padding: "14px" }}>
                        <Skeleton variant="text-line" width="80%" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && pageItems.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: 32,
                      textAlign: "center",
                      color: "var(--text-muted)",
                    }}
                  >
                    {search ? "No reports match your search." : "No reports yet — upload a CSV to get started."}
                  </td>
                </tr>
              )}
              {!loading &&
                pageItems.map((r) => (
                  <tr
                    key={r.run_id}
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <td style={{ padding: "14px", fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                      {new Date(r.timestamp).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td style={{ padding: "14px", fontSize: 13.5, color: "var(--text)", fontWeight: 600 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <FileText size={14} color="var(--brand)" />
                        <span
                          style={{
                            maxWidth: 320,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "inline-block",
                          }}
                          title={r.filename}
                        >
                          {r.filename}
                        </span>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        textAlign: "right",
                        fontSize: 13,
                        color: "var(--text-dim)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.row_count.toLocaleString()}
                    </td>
                    <td style={{ padding: "14px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {r.protected_attrs.length === 0 ? (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
                        ) : (
                          r.protected_attrs.slice(0, 3).map((a) => (
                            <Badge key={a} small variant="info" uppercase={false} label={a} />
                          ))
                        )}
                        {r.protected_attrs.length > 3 && (
                          <Badge
                            small
                            variant="neutral"
                            uppercase={false}
                            label={`+${r.protected_attrs.length - 3}`}
                          />
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "14px" }}>
                      <Badge
                        variant={riskVariant(r.overall_risk_score)}
                        label={`${riskLabel(r.overall_risk_score)} · ${(r.overall_risk_score * 100).toFixed(0)}%`}
                        uppercase={false}
                      />
                    </td>
                    <td style={{ padding: "14px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <Link
                          href={`/dashboard?runId=${r.run_id}`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                            fontSize: 12,
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <ExternalLink size={12} />
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => void exportReport(r.run_id, r.filename.replace(/\s+/g, "_"))}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid rgba(108,99,255,0.4)",
                            background: "var(--brand-soft)",
                            color: "var(--text)",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Download size={12} />
                          Export
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!loading && sorted.length > PAGE_SIZE && (
          <div
            style={{
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            <span>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length}
            </span>
            <div style={{ display: "inline-flex", gap: 6 }}>
              <button
                type="button"
                disabled={safePage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={pagerBtnStyle(safePage === 1)}
                aria-label="Previous"
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ padding: "6px 10px", color: "var(--text)", fontWeight: 600 }}>
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={pagerBtnStyle(safePage === totalPages)}
                aria-label="Next"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function pagerBtnStyle(disabled: boolean) {
  return {
    padding: 6,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "transparent",
    color: disabled ? "var(--text-muted)" : "var(--text)",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
  } as const;
}

function Th({
  label,
  k,
  current,
  dir,
  onSort,
  align,
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = current === k;
  const Icon = isActive ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      style={{
        textAlign: align ?? "left",
        padding: "12px 14px",
        fontSize: 11,
        color: isActive ? "var(--text)" : "var(--text-muted)",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        fontWeight: 700,
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
      onClick={() => onSort(k)}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <Icon size={11} />
      </span>
    </th>
  );
}
