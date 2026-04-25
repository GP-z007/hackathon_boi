"use client";

import { UploadCloud } from "lucide-react";
import { DragEvent, useRef, useState } from "react";

type UploadDropzoneProps = {
  onFile: (file: File) => void;
  onError?: (message: string) => void;
  maxSizeMB?: number;
};

export default function UploadDropzone({ onFile, onError, maxSizeMB = 10 }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const validate = (file: File): string | null => {
    const isCsv =
      file.type === "text/csv" ||
      file.type === "application/vnd.ms-excel" ||
      file.name.toLowerCase().endsWith(".csv");
    if (!isCsv) return "Only .csv files are supported.";
    if (file.size > maxSizeMB * 1024 * 1024) {
      return `File exceeds ${maxSizeMB}MB limit.`;
    }
    return null;
  };

  const handleFile = (file?: File | null) => {
    if (!file) return;
    const err = validate(file);
    if (err) {
      onError?.(err);
      return;
    }
    onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      style={{
        position: "relative",
        height: 300,
        border: `2px dashed ${isDragging ? "var(--brand)" : "var(--border-strong)"}`,
        borderRadius: 16,
        background: isDragging ? "var(--surface-2)" : "var(--surface)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        cursor: "pointer",
        transition: "border-color 180ms ease, background 180ms ease, transform 180ms ease",
        transform: isDragging ? "scale(1.01)" : "scale(1)",
        animation: isDragging ? "pulse-ring 1.4s infinite" : undefined,
        outline: "none",
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.borderColor = "var(--brand)";
          e.currentTarget.style.background = "var(--surface-2)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging) {
          e.currentTarget.style.borderColor = "var(--border-strong)";
          e.currentTarget.style.background = "var(--surface)";
        }
      }}
    >
      <span
        style={{
          width: 72,
          height: 72,
          borderRadius: 999,
          background: "var(--brand-soft)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--brand)",
          marginBottom: 4,
        }}
      >
        <UploadCloud size={32} />
      </span>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
        Drop your CSV here
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
        or <span style={{ color: "var(--brand)", fontWeight: 600 }}>click to browse</span>
        <span style={{ margin: "0 8px", opacity: 0.5 }}>•</span>
        <span>up to {maxSizeMB}MB · .csv only</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        style={{ display: "none" }}
      />
    </div>
  );
}
