"use client";

import { useEffect, useState } from "react";

import { FullAnalysisResponse } from "@/lib/api";

type GeminiAnalystProps = {
  result: FullAnalysisResponse;
};

const promptBuilders = {
  explain: (result: FullAnalysisResponse) => `You are a fairness auditing expert. Explain this bias report to a non-technical business stakeholder.

Rules: Start immediately with the substantive analysis—no greetings, no "let's break down", no meta commentary. Use plain English, no jargon. Write a complete answer through a clear closing summary (do not trail off mid-sentence).

Dataset: ${result.dataset_summary.row_count} rows, ${result.dataset_summary.column_count} columns
Label column auto-detected: "${result.auto_detection.label_col}"
Protected attributes found: ${result.auto_detection.protected_attrs.join(", ")}
Overall risk score: ${result.overall_risk_score}/1.0

Bias results per group:
${JSON.stringify(result.bias_results, null, 2)}

Cover: what the numbers mean, which groups are most disadvantaged, how serious it is, and one practical takeaway.`,
  risks: (result: FullAnalysisResponse) => `You are an AI ethics and legal risk expert. No preamble—answer directly.

Given this bias audit result, identify the top 3 risks this organization faces - legal, reputational, and operational.
For each risk: state the risk, the evidence from the data, and its severity. End with a complete closing sentence.

Bias audit data:
${JSON.stringify(result.bias_results, null, 2)}
Overall risk: ${result.overall_risk_score}`,
  fixes: (result: FullAnalysisResponse) => `You are a machine learning fairness engineer. No preamble—answer directly.

Given these bias metrics, recommend a concrete remediation plan in 3 steps.

For each step: name the technique (e.g. re-weighting, adversarial debiasing,
threshold calibration), when to use it, and roughly how much it typically
reduces the disparate impact gap. Be specific and actionable.

Bias results:
${JSON.stringify(result.bias_results, null, 2)}`,
  compliance: (result: FullAnalysisResponse) => `You are an AI compliance lawyer specializing in EU AI Act and US EEOC law. No preamble—answer directly.

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

const MAX_OUTPUT_TOKENS = 8192;

type GeminiGenerateResult = {
  text: string;
  finishReason?: string;
};

async function callGeminiGenerate(apiKey: string, prompt: string): Promise<GeminiGenerateResult> {
  const modelCandidates = ["gemini-2.5-flash", "gemini-2.0-flash"];
  let lastError = "Request failed.";

  for (const model of modelCandidates) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        }),
      },
    );

    const raw = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      lastError = raw.slice(0, 400) || `HTTP ${res.status}`;
      continue;
    }

    if (!res.ok) {
      const err = data as { error?: { message?: string; status?: string } };
      const msg = err?.error?.message || raw.slice(0, 400) || `HTTP ${res.status}`;
      if (res.status === 429 || msg.toLowerCase().includes("quota")) {
        throw new Error(
          "Gemini quota exceeded for this key/project. In Google AI Studio, enable billing or wait for quota reset, then retry.",
        );
      }
      lastError = msg;
      continue;
    }

    const parsed = data as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const candidate = parsed?.candidates?.[0];
    const text =
      candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) {
      lastError = "Empty response from Gemini. Check API key and model access.";
      continue;
    }
    const finishReason = candidate?.finishReason;
    let out = text;
    if (finishReason === "MAX_TOKENS") {
      out +=
        "\n\n— Note: The model hit its output length limit. Click the same button again for a shorter follow-up, or use a smaller dataset summary.";
    }
    return { text: out, finishReason };
  }

  throw new Error(lastError);
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
      const { text } = await callGeminiGenerate(key, prompt);
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
          minHeight: 480,
          maxHeight: "75vh",
          overflowY: "auto",
          padding: 12,
          background: "#f8fafc",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
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
