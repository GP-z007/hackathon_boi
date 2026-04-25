"use client";

import { ReactNode, useState } from "react";

type FloatFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  autoComplete?: string;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  onEnter?: () => void;
};

export default function FloatField({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  icon,
  rightSlot,
  onEnter,
}: FloatFieldProps) {
  const [focused, setFocused] = useState(false);
  const isFloating = focused || value.length > 0;

  return (
    <div
      style={{
        position: "relative",
        background: "var(--surface-2)",
        border: `1px solid ${focused ? "var(--brand)" : "var(--border)"}`,
        borderRadius: 12,
        transition: "border-color 150ms ease, box-shadow 150ms ease",
        boxShadow: focused ? "0 0 0 3px rgba(108,99,255,0.15)" : "none",
      }}
    >
      <label
        htmlFor={id}
        style={{
          position: "absolute",
          left: icon ? 38 : 14,
          top: isFloating ? 6 : "50%",
          transform: isFloating ? "translateY(0)" : "translateY(-50%)",
          fontSize: isFloating ? 10 : 13,
          color: focused ? "var(--brand)" : "var(--text-muted)",
          fontWeight: isFloating ? 700 : 500,
          letterSpacing: isFloating ? 0.6 : 0,
          textTransform: isFloating ? "uppercase" : "none",
          transition: "all 160ms ease",
          pointerEvents: "none",
          background: "transparent",
        }}
      >
        {label}
      </label>
      {icon && (
        <span
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: focused ? "var(--brand)" : "var(--text-muted)",
            display: "inline-flex",
          }}
        >
          {icon}
        </span>
      )}
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) onEnter();
        }}
        style={{
          width: "100%",
          paddingTop: isFloating ? 20 : 14,
          paddingBottom: isFloating ? 8 : 14,
          paddingLeft: icon ? 38 : 14,
          paddingRight: rightSlot ? 40 : 14,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--text)",
          fontSize: 14,
          fontWeight: 500,
          borderRadius: 12,
        }}
      />
      {rightSlot && (
        <span
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        >
          {rightSlot}
        </span>
      )}
    </div>
  );
}
