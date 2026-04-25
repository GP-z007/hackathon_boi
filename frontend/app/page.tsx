"use client";

import Link from "next/link";
import { useState } from "react";

import RequireAuth from "@/components/RequireAuth";
import UploadDropzone from "@/components/UploadDropzone";
import axios from "axios";

import { FullAnalysisResponse, analyzeDataset } from "@/lib/api";

export default function HomePage() {
  return (
    <RequireAuth>
      <HomePageInner />
    </RequireAuth>
  );
}

function HomePageInner() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FullAnalysisResponse | null>(null);

  const qualityColor = (score: number) => {
    if (score >= 0.8) return "#166534";
    if (score >= 0.6) return "#b45309";
    return "#b91c1c";
  };

  const onAnalyze = async (file: File) => {
    try {
      setLoading(true);
      setError("");
      setResult(null);
      const response = await analyzeDataset(file);
      setResult(response);
      window.sessionStorage.setItem(`analysis:${response.run_id}`, JSON.stringify(response));
    } catch (err) {
      let message = "Analysis failed. Please check your CSV and try again.";
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data;
        if (typeof detail === "string" && detail.trim()) {
          message = detail;
        } else if (detail && typeof detail === "object" && "detail" in detail) {
          const d = (detail as { detail: unknown }).detail;
          message = typeof d === "string" ? d : Array.isArray(d) ? JSON.stringify(d) : message;
        } else if (err.message) {
          message = err.message;
        }
      }
      setError(message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 40px" }}>
      <h1 style={{ marginBottom: 8 }}>Bias Detection Upload</h1>
      <p style={{ color: "#6b7280", marginTop: 0 }}>Drop a CSV to run automatic fairness analysis.</p>

      <div style={{ display: "grid", gap: 12 }}>
        <UploadDropzone onFile={onAnalyze} />
        <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>
          Analysis starts automatically after file selection.
        </p>
        {error && <p style={{ color: "#dc2626", margin: 0 }}>{error}</p>}
      </div>

      {loading && (
        <section style={{ marginTop: 20, display: "grid", gap: 10 }}>
          {[1, 2, 3].map((bar) => (
            <div
              key={bar}
              style={{
                height: 14,
                borderRadius: 8,
                background:
                  "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 37%, #e5e7eb 63%)",
                backgroundSize: "400% 100%",
                animation: "pulse-loading 1.5s ease-in-out infinite",
              }}
            />
          ))}
          <style>{`
            @keyframes pulse-loading {
              0% { background-position: 100% 50%; }
              100% { background-position: 0 50%; }
            }
          `}</style>
        </section>
      )}

      {result && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Analysis Results</h2>
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 14,
              background: "#fff",
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Auto-detected</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <span style={{ padding: "6px 10px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontSize: 13 }}>
                info Label: {result.auto_detection.label_col} ({Math.round(result.auto_detection.label_col_confidence * 100)}%)
              </span>
              {result.auto_detection.protected_attrs.map((attr) => {
                const confidence = result.auto_detection.detection_reasoning[attr] ? 100 : 60;
                return (
                  <span key={attr} style={{ padding: "6px 10px", borderRadius: 999, background: "#e0e7ff", color: "#3730a3", fontSize: 13 }}>
                    info {attr} ({confidence}%)
                  </span>
                );
              })}
            </div>
          </div>

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: 14,
              background: "#fff",
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Dataset summary</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div>Rows: {result.dataset_summary.row_count}</div>
              <div>Columns: {result.dataset_summary.column_count}</div>
              <div style={{ color: qualityColor(result.dataset_summary.dataset_quality_score) }}>
                Quality Score: {(result.dataset_summary.dataset_quality_score * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {Object.entries(result.bias_results).map(([attr, metrics]) => (
              <div
                key={attr}
                style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)" }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{attr}</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{metrics.disparate_impact.toFixed(2)}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>Disparate Impact</div>
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    background:
                      metrics.severity === "high"
                        ? "#fee2e2"
                        : metrics.severity === "medium"
                          ? "#fef3c7"
                          : "#dcfce7",
                    color:
                      metrics.severity === "high"
                        ? "#991b1b"
                        : metrics.severity === "medium"
                          ? "#92400e"
                          : "#166534",
                  }}
                >
                  {metrics.severity.toUpperCase()}
                </span>
                <div style={{ marginTop: 10 }}>
                  Passes 80% Rule: {metrics.passes_80_percent_rule ? "✓" : "✗"}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              background: "#fff",
              borderRadius: 10,
              padding: 16,
              border: "1px solid #e5e7eb",
            }}
          >
            <svg width="140" height="140" viewBox="0 0 140 140" aria-label="overall-risk-score">
              <circle cx="70" cy="70" r="56" stroke="#e5e7eb" strokeWidth="12" fill="none" />
              <circle
                cx="70"
                cy="70"
                r="56"
                stroke="#dc2626"
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                transform="rotate(-90 70 70)"
                strokeDasharray={`${2 * Math.PI * 56 * Math.max(0, Math.min(1, result.overall_risk_score))} ${2 * Math.PI * 56}`}
              />
              <text x="70" y="75" textAnchor="middle" style={{ fontWeight: 700, fontSize: 20 }}>
                {(result.overall_risk_score * 100).toFixed(0)}%
              </text>
            </svg>
            <div style={{ color: "#6b7280" }}>Overall Risk Score</div>
          </div>

          <Link href={`/dashboard?runId=${result.run_id}`} style={{ display: "inline-block", marginTop: 14, color: "#2563eb", fontWeight: 700 }}>
            Full analysis →
          </Link>
        </section>
      )}
    </main>
  );
}
