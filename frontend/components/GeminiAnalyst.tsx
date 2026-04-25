"use client";

import { Bot, Copy, KeyRound, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { useToast } from "@/components/Toast";
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
        "\n\n— Note: The model hit its output length limit. Click the same button again for a shorter follow-up.";
    }
    return { text: out, finishReason };
  }

  throw new Error(lastError);
}

const PROMPTS: { id: keyof typeof promptBuilders; label: string }[] = [
  { id: "explain", label: "Explain this analysis" },
  { id: "risks", label: "What are the risks?" },
  { id: "fixes", label: "How do I fix this bias?" },
  { id: "compliance", label: "Is this legally compliant?" },
];

export default function GeminiAnalyst({ result }: GeminiAnalystProps) {
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<keyof typeof promptBuilders | null>(null);

  useEffect(() => {
    setApiKey(window.localStorage.getItem("gemini_api_key") || "");
  }, []);

  const saveKey = () => {
    window.localStorage.setItem("gemini_api_key", apiKey.trim());
    toast.success("Gemini key saved.");
  };

  const runPrompt = async (id: keyof typeof promptBuilders) => {
    const key = apiKey.trim();
    if (!key) {
      toast.error("Add a Gemini API key first.");
      return;
    }
    setLoading(true);
    setActiveId(id);
    setResponse("");
    try {
      const prompt = promptBuilders[id](result);
      const { text } = await callGeminiGenerate(key, prompt);
      setResponse(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed.";
      toast.error(message, "Gemini");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid var(--brand)",
        borderRadius: 14,
        padding: 20,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "var(--brand-soft)",
            color: "var(--brand)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bot size={18} />
        </span>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>AI Analyst</h3>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Powered by Gemini · key never leaves your browser
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 4,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            paddingLeft: 10,
            color: "var(--text-muted)",
          }}
        >
          <KeyRound size={14} />
        </span>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste Gemini API key"
          type="password"
          autoComplete="off"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text)",
            fontSize: 13,
            padding: "8px 4px",
          }}
        />
        <button
          type="button"
          onClick={saveKey}
          style={{
            padding: "6px 12px",
            background: "var(--surface-3)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Save
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {PROMPTS.map((p) => {
          const isActive = activeId === p.id && loading;
          return (
            <button
              key={p.id}
              type="button"
              disabled={loading}
              onClick={() => void runPrompt(p.id)}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: isActive ? "var(--brand-soft)" : "transparent",
                color: isActive ? "var(--text)" : "var(--text-dim)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: loading ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "background 150ms ease, color 150ms ease, border-color 150ms ease",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.background = "var(--brand-soft)";
                  e.currentTarget.style.color = "var(--text)";
                  e.currentTarget.style.borderColor = "rgba(108,99,255,0.4)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-dim)";
                  e.currentTarget.style.borderColor = "var(--border)";
                }
              }}
            >
              <Sparkles size={12} />
              {p.label}
            </button>
          );
        })}
      </div>

      <div
        className="scanlines"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--text)",
          minHeight: 280,
          maxHeight: "65vh",
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {response || (
          <span style={{ color: "var(--text-muted)" }}>
            Run a prompt above to see Gemini&apos;s analysis here.
          </span>
        )}
        {loading && (
          <span
            style={{
              display: "inline-block",
              marginLeft: 2,
              animation: "blink 1s step-end infinite",
              color: "var(--brand)",
            }}
          >
            ▍
          </span>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(response);
            toast.success("Copied to clipboard.");
          }}
          disabled={!response}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "transparent",
            color: response ? "var(--text)" : "var(--text-muted)",
            fontSize: 12,
            fontWeight: 600,
            cursor: response ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Copy size={12} />
          Copy
        </button>
      </div>
    </section>
  );
}
