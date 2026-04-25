"use client";

import { useEffect, useState } from "react";

import { FullAnalysisResponse } from "@/lib/api";

type GeminiAnalystProps = {
  result: FullAnalysisResponse;
};

const promptBuilders = {
  explain: (result: FullAnalysisResponse) => `You are a fairness auditing expert. Analyze this AI bias report and explain it
clearly to a non-technical business stakeholder.

Dataset: ${result.dataset_summary.row_count} rows, ${result.dataset_summary.column_count} columns
Label column auto-detected: "${result.auto_detection.label_col}"
Protected attributes found: ${result.auto_detection.protected_attrs.join(", ")}
Overall risk score: ${result.overall_risk_score}/1.0

Bias results per group:
${JSON.stringify(result.bias_results, null, 2)}

Explain: what the numbers mean, which groups are most disadvantaged,
and how serious this is. Use plain English. No jargon.`,
  risks: (result: FullAnalysisResponse) => `You are an AI ethics and legal risk expert. Given this bias audit result,
identify the top 3 risks this organization faces - legal, reputational, and operational.
For each risk: state the risk, the evidence from the data, and its severity.

Bias audit data:
${JSON.stringify(result.bias_results, null, 2)}
Overall risk: ${result.overall_risk_score}`,
  fixes: (result: FullAnalysisResponse) => `You are a machine learning fairness engineer. Given these bias metrics,
recommend a concrete remediation plan in 3 steps.

For each step: name the technique (e.g. re-weighting, adversarial debiasing,
threshold calibration), when to use it, and roughly how much it typically
reduces the disparate impact gap. Be specific and actionable.

Bias results:
${JSON.stringify(result.bias_results, null, 2)}`,
  compliance: (result: FullAnalysisResponse) => `You are an AI compliance lawyer specializing in EU AI Act and US EEOC law.
Review this bias audit against:
1. EU AI Act Article 10 (data governance for high-risk AI)
2. US EEOC 80% / four-fifths rule
3. EU GDPR Article 22 (automated decision-making)

For each regulation: state whether this system likely passes or fails,
citing the specific metric values as evidence.

Audit data:
${JSON.stringify(result.bias_results, null, 2)}
Disparate impact scores: ${Object.entries(result.bias_results)
  .map(([k, v]) => `${k}: ${v.disparate_impact}`)
  .join(", ")}`,
};

async function callGeminiGenerate(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1500 },
      }),
    },
  );

  const raw = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(raw.slice(0, 400) || `HTTP ${res.status}`);
  }

  if (!res.ok) {
    const err = data as { error?: { message?: string } };
    const msg = err?.error?.message || raw.slice(0, 400) || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const parsed = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    parsed?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error("Empty response from Gemini. Check API key and model access.");
  }
  return text;
}

export default function GeminiAnalyst({ result }: GeminiAnalystProps) {
  const [apiKey, setApiKey] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setApiKey(window.localStorage.getItem("gemini_api_key") || "");
  }, []);

  const saveKey = () => {
    window.localStorage.setItem("gemini_api_key", apiKey.trim());
    setError("");
  };

  const runPrompt = async (prompt: string) => {
    const key = apiKey.trim();
    if (!key) {
      setError("Enter your Gemini API key above. Get one free at https://aistudio.google.com/apikey");
      return;
    }
    setLoading(true);
    setError("");
    setResponse("");
    try {
      const text = await callGeminiGenerate(key, prompt);
      setResponse(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginTop: 20, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>AI Analyst (powered by Gemini)</h3>

      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste Gemini API key"
          type="password"
          autoComplete="off"
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
        />
        <button
          type="button"
          onClick={saveKey}
          style={{ borderRadius: 8, border: "1px solid #d1d5db", padding: "8px 12px", cursor: "pointer" }}
        >
          Save
        </button>
      </div>
      <p style={{ marginTop: 0, fontSize: 12, color: "#6b7280" }}>
        Key is stored in localStorage only and sent directly to Google, not to our backend.
      </p>

      {!apiKey.trim() && (
        <p style={{ color: "#b45309", marginTop: 0 }}>
          Enter your Gemini API key above, then click Save. Get a key at{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>
          .
        </p>
      )}

      {error && (
        <p style={{ color: "#b91c1c", marginTop: 0, whiteSpace: "pre-wrap" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runPrompt(promptBuilders.explain(result))}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: loading ? "wait" : "pointer" }}
        >
          Explain this analysis
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runPrompt(promptBuilders.risks(result))}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: loading ? "wait" : "pointer" }}
        >
          What are the risks?
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runPrompt(promptBuilders.fixes(result))}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: loading ? "wait" : "pointer" }}
        >
          How do I fix this bias?
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runPrompt(promptBuilders.compliance(result))}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: loading ? "wait" : "pointer" }}
        >
          Is this legally compliant?
        </button>
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          minHeight: 220,
          padding: 12,
          background: "#f8fafc",
          whiteSpace: "pre-wrap",
        }}
      >
        {response}
        {loading && (
          <span style={{ display: "inline-block", marginLeft: 2, animation: "blink 1s step-end infinite" }}>|</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(response)}
        disabled={!response}
        style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer" }}
      >
        Copy
      </button>

      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </section>
  );
}
