"use client";

import { CSSProperties, ReactNode } from "react";

export type BadgeVariant =
  | "high"
  | "medium"
  | "low"
  | "success"
  | "info"
  | "neutral"
  | "warning"
  | "danger"
  | "brand";

const variantStyle: Record<BadgeVariant, CSSProperties> = {
  high: {
    background: "rgba(239, 68, 68, 0.15)",
    color: "#FCA5A5",
    border: "1px solid rgba(239, 68, 68, 0.3)",
  },
  danger: {
    background: "rgba(239, 68, 68, 0.15)",
    color: "#FCA5A5",
    border: "1px solid rgba(239, 68, 68, 0.3)",
  },
  medium: {
    background: "rgba(245, 158, 11, 0.15)",
    color: "#FCD34D",
    border: "1px solid rgba(245, 158, 11, 0.3)",
  },
  warning: {
    background: "rgba(245, 158, 11, 0.15)",
    color: "#FCD34D",
    border: "1px solid rgba(245, 158, 11, 0.3)",
  },
  low: {
    background: "rgba(34, 211, 160, 0.15)",
    color: "#6EE7B7",
    border: "1px solid rgba(34, 211, 160, 0.3)",
  },
  success: {
    background: "rgba(34, 211, 160, 0.15)",
    color: "#6EE7B7",
    border: "1px solid rgba(34, 211, 160, 0.3)",
  },
  info: {
    background: "rgba(56, 189, 248, 0.15)",
    color: "#7DD3FC",
    border: "1px solid rgba(56, 189, 248, 0.3)",
  },
  brand: {
    background: "rgba(108, 99, 255, 0.18)",
    color: "#C7C2FF",
    border: "1px solid rgba(108, 99, 255, 0.35)",
  },
  neutral: {
    background: "var(--surface-2)",
    color: "var(--text-dim)",
    border: "1px solid var(--border)",
  },
};

type BadgeProps = {
  variant?: BadgeVariant;
  label: ReactNode;
  uppercase?: boolean;
  small?: boolean;
  style?: CSSProperties;
  icon?: ReactNode;
};

export default function Badge({
  variant = "neutral",
  label,
  uppercase = true,
  small = false,
  style,
  icon,
}: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: small ? "2px 8px" : "4px 10px",
        borderRadius: 999,
        fontSize: small ? 10 : 11,
        fontWeight: 700,
        letterSpacing: uppercase ? 0.6 : 0.2,
        textTransform: uppercase ? "uppercase" : "none",
        whiteSpace: "nowrap",
        ...variantStyle[variant],
        ...style,
      }}
    >
      {icon}
      {label}
    </span>
  );
}
