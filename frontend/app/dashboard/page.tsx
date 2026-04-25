"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import BiasBarChart from "@/components/BiasBarChart";
import GeminiAnalyst from "@/components/GeminiAnalyst";
import MetricCard from "@/components/MetricCard";
import { FullAnalysisResponse, MetricResponse, getMetrics, getReportUrl } from "@/lib/api";

export default function DashboardPage() {
  const [runId, setRunId] = useState("");
  const [metrics, setMetrics] = useState<MetricResponse | null>(null);
  const [fullAnalysis, setFullAnalysis] = useState<FullAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("runId") || "";
    setRunId(id);
    if (id) {
      const cached = window.sessionStorage.getItem(`analysis:${id}`);
      if (cached) {
        try {
          setFullAnalysis(JSON.parse(cached) as FullAnalysisResponse);
        } catch {
          setFullAnalysis(null);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!runId) return;
    const loadMetrics = async () => {
      try {
        setLoading(true);
        setError("");
        const result = await getMetrics(runId);
        setMetrics(result);
      } catch {
        setError("Failed to load metrics for run.");
      } finally {
        setLoading(false);
      }
    };
    void loadMetrics();
  }, [runId]);

  const chartData = useMemo(() => {
    const groupMetrics = metrics?.results.accuracy_by_group || {};
    return Object.entries(groupMetrics).map(([group, value]) => ({
      group,
      value: Number(value),
    }));
  }, [metrics]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 40px" }}>
      <h1 style={{ marginBottom: 8 }}>Fairness Dashboard</h1>
      <p style={{ color: "#6b7280", marginTop: 0 }}>Run ID: {runId || "Missing runId"}</p>

      {!runId && <p style={{ color: "#dc2626" }}>Please open this page with ?runId=...</p>}
      {loading && <p>Loading metrics...</p>}
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      {metrics && (
        <>
          <BiasBarChart data={chartData} threshold={0.8} />

          <div style={{ display: "grid", gap: 12, marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <MetricCard
              label="Demographic Parity Difference"
              value={Number(metrics.results.demographic_parity_diff ?? 0).toFixed(4)}
              status={Number(metrics.results.demographic_parity_diff ?? 0) <= 0.1 ? "ok" : "warn"}
            />
            <MetricCard
              label="Equalized Odds Difference"
              value={Number(metrics.results.equalized_odds_diff ?? 0).toFixed(4)}
              status={Number(metrics.results.equalized_odds_diff ?? 0) <= 0.1 ? "ok" : "warn"}
            />
            <MetricCard
              label="Overall Accuracy"
              value={Number(metrics.results.overall_accuracy ?? 0).toFixed(4)}
              status={Number(metrics.results.overall_accuracy ?? 0) >= 0.8 ? "ok" : "warn"}
            />
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 16, alignItems: "center" }}>
            <button
              onClick={() => window.open(getReportUrl(runId), "_blank", "noopener,noreferrer")}
              style={{
                padding: "10px 14px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Download report
            </button>
            <Link href="/monitor" style={{ color: "#2563eb", fontWeight: 600 }}>
              Go to live monitor →
            </Link>
          </div>

          {fullAnalysis && <GeminiAnalyst result={fullAnalysis} />}
        </>
      )}
    </main>
  );
}
