"use client";

import { CSSProperties } from "react";

type Variant = "card" | "text-line" | "chart" | "avatar" | "block";

type SkeletonProps = {
  variant?: Variant;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
  count?: number;
};

const baseStyle: CSSProperties = {
  display: "block",
  borderRadius: 8,
  background: "linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.4s linear infinite",
};

const presets: Record<Variant, CSSProperties> = {
  "text-line": { height: 14, width: "100%", borderRadius: 6 },
  card: { height: 120, width: "100%", borderRadius: 12 },
  chart: { height: 320, width: "100%", borderRadius: 12 },
  avatar: { height: 36, width: 36, borderRadius: 999 },
  block: { height: 80, width: "100%", borderRadius: 10 },
};

export default function Skeleton({
  variant = "text-line",
  width,
  height,
  style,
  count = 1,
}: SkeletonProps) {
  const merged: CSSProperties = {
    ...baseStyle,
    ...presets[variant],
    ...(width !== undefined ? { width } : null),
    ...(height !== undefined ? { height } : null),
    ...style,
  };

  if (count === 1) return <span style={merged} aria-hidden />;
  return (
    <span style={{ display: "grid", gap: 8 }} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={merged} />
      ))}
    </span>
  );
}
