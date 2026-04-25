"use client";

import { useEffect, useRef, useState } from "react";

import AnimatedNumber from "@/components/AnimatedNumber";

type RiskGaugeProps = {
  score: number;
  size?: number;
};

const ARC_RADIUS = 90;
const ARC_STROKE = 18;
const VIEWBOX_W = 220;
const VIEWBOX_H = 140;

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const polar = (angleDeg: number) => {
    const angleRad = ((angleDeg - 180) * Math.PI) / 180.0;
    return [cx + r * Math.cos(angleRad), cy + r * Math.sin(angleRad)] as const;
  };
  const [sx, sy] = polar(startAngle);
  const [ex, ey] = polar(endAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}

export default function RiskGauge({ score, size = 260 }: RiskGaugeProps) {
  const clamped = Math.max(0, Math.min(1, score));
  const cx = VIEWBOX_W / 2;
  const cy = VIEWBOX_H - 18;

  const fullPath = describeArc(cx, cy, ARC_RADIUS, 0, 180);
  const pathRef = useRef<SVGPathElement | null>(null);
  const [length, setLength] = useState(0);

  useEffect(() => {
    if (pathRef.current) setLength(pathRef.current.getTotalLength());
  }, []);

  const dashOffset = length * (1 - clamped);
  const colorStop =
    clamped < 0.34 ? "#22D3A0" : clamped < 0.67 ? "#F59E0B" : "#EF4444";
  const label =
    clamped < 0.34 ? "Low risk" : clamped < 0.67 ? "Moderate risk" : "High risk";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
      <svg
        width={size}
        height={(size * VIEWBOX_H) / VIEWBOX_W}
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        aria-label="Overall risk gauge"
      >
        <defs>
          <linearGradient id="risk-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22D3A0" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#EF4444" />
          </linearGradient>
        </defs>
        <path
          d={fullPath}
          stroke="var(--surface-3)"
          strokeWidth={ARC_STROKE}
          fill="none"
          strokeLinecap="round"
        />
        <path
          ref={pathRef}
          d={fullPath}
          stroke="url(#risk-grad)"
          strokeWidth={ARC_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length === 0 ? length : dashOffset}
          style={{ transition: "stroke-dashoffset 1200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1, color: colorStop }}>
          <AnimatedNumber value={clamped * 100} decimals={0} suffix="%" duration={1100} />
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: "var(--text-muted)",
            fontWeight: 600,
          }}
        >
          Overall risk · {label}
        </div>
      </div>
    </div>
  );
}
