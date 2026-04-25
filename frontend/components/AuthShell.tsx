"use client";

import { CSSProperties, ReactNode } from "react";

const wrap: CSSProperties = {
  minHeight: "calc(100vh - 0px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 16px",
  background:
    "radial-gradient(1200px 600px at 0% 0%, #e0e7ff 0%, transparent 60%), radial-gradient(900px 500px at 100% 100%, #cffafe 0%, transparent 55%), #f5f7fb",
};

const card: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "#fff",
  borderRadius: 16,
  padding: 28,
  boxShadow: "0 30px 80px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.05)",
  border: "1px solid #eef2f7",
};

const brand: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1.5,
  color: "#2563eb",
  textTransform: "uppercase",
  marginBottom: 8,
};

const title: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  color: "#0f172a",
};

const subtitle: CSSProperties = {
  marginTop: 6,
  marginBottom: 22,
  color: "#64748b",
  fontSize: 14,
  lineHeight: 1.45,
};

export default function AuthShell({
  eyebrow = "Bias Audit",
  title: heading,
  subtitle: sub,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={brand}>{eyebrow}</div>
        <h1 style={title}>{heading}</h1>
        {sub && <p style={subtitle}>{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
  background: "#fff",
  color: "#0f172a",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 6,
};

export const primaryButton: CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "none",
  fontSize: 14,
  fontWeight: 700,
  color: "#fff",
  background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
  cursor: "pointer",
  boxShadow: "0 6px 14px rgba(37, 99, 235, 0.25)",
  transition: "transform 80ms ease, opacity 120ms ease",
};

export const errorBox: CSSProperties = {
  marginTop: 14,
  padding: "10px 12px",
  borderRadius: 10,
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  fontSize: 13,
  lineHeight: 1.4,
};

export const helperText: CSSProperties = {
  marginTop: 18,
  fontSize: 13,
  color: "#64748b",
  textAlign: "center",
};

export const linkStyle: CSSProperties = {
  color: "#2563eb",
  fontWeight: 600,
};
