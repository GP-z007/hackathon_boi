"use client";

type MetricCardProps = {
  label: string;
  value: string | number;
  status: "ok" | "warn" | "fail";
};

const borderColor: Record<MetricCardProps["status"], string> = {
  ok: "#1d9a52",
  warn: "#d97706",
  fail: "#dc2626",
};

export default function MetricCard({ label, value, status }: MetricCardProps) {
  return (
    <div
      style={{
        borderLeft: `6px solid ${borderColor[status]}`,
        background: "#ffffff",
        borderRadius: 10,
        padding: "14px 16px",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
