"use client";

import Skeleton from "@/components/Skeleton";
import { AuditRunSummary } from "@/lib/api";

function riskLabel(score: number): string {
  if (score < 0.34) return "LOW";
  if (score < 0.67) return "MEDIUM";
  return "HIGH";
}

export default function RunSelector({
  runs,
  value,
  onChange,
  loading,
  width = 320,
  emptyLabel = "No runs",
}: {
  runs: AuditRunSummary[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  width?: number;
  emptyLabel?: string;
}) {
  if (loading) {
    return <Skeleton variant="block" width={width} height={40} />;
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
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
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
          maxWidth: width,
        }}
      >
        {runs.length === 0 && <option value="">{emptyLabel}</option>}
        {runs.length > 0 && !value && <option value="">Select a run…</option>}
        {runs.slice(0, 25).map((r) => {
          const date = new Date(r.timestamp);
          const dateStr = date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
          return (
            <option
              key={r.run_id}
              value={r.run_id}
              style={{ background: "var(--surface)" }}
            >
              {dateStr} · {r.filename} · {riskLabel(r.overall_risk_score)}
            </option>
          );
        })}
      </select>
    </div>
  );
}
