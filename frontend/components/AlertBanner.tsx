"use client";

import { useState } from "react";

type AlertBannerProps = {
  message: string;
};

export default function AlertBanner({ message }: AlertBannerProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        width: "100%",
        background: "#dc2626",
        color: "#fff",
        borderRadius: 8,
        padding: "10px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{message}</span>
      <button
        onClick={() => setVisible(false)}
        style={{
          background: "transparent",
          color: "#fff",
          border: "none",
          fontSize: 18,
          cursor: "pointer",
        }}
        aria-label="Dismiss alert"
      >
        ×
      </button>
    </div>
  );
}
