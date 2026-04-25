"use client";

import { CSSProperties } from "react";

type LogoProps = {
  size?: number;
  showWordmark?: boolean;
  style?: CSSProperties;
};

export default function Logo({ size = 28, showWordmark = true, style }: LogoProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#6C63FF" />
            <stop offset="1" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        <path
          d="M16 2.5L28.5 9.75V22.25L16 29.5L3.5 22.25V9.75L16 2.5Z"
          fill="url(#logo-grad)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />
        <path
          d="M11.5 11L20.5 16L11.5 21V11Z"
          fill="white"
          fillOpacity="0.95"
        />
      </svg>
      {showWordmark && (
        <span
          style={{
            fontSize: Math.max(14, size * 0.62),
            fontWeight: 700,
            letterSpacing: -0.3,
            color: "var(--text)",
          }}
        >
          das<span style={{ color: "var(--brand)" }}>Viewer</span>
        </span>
      )}
    </span>
  );
}
