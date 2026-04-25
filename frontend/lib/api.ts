import axios from "axios";

export type FullAnalysisResponse = {
  run_id: string;
  timestamp: string;
  auto_detection: {
    label_col: string;
    label_col_confidence: number;
    protected_attrs: string[];
    detection_reasoning: Record<string, string>;
  };
  dataset_summary: {
    row_count: number;
    column_count: number;
    label_distribution: Record<string, number>;
    group_distributions: Record<string, Record<string, number>>;
    dataset_quality_score: number;
  };
  bias_results: Record<
    string,
    {
      disparate_impact: number;
      statistical_parity_difference: number;
      passes_80_percent_rule: boolean;
      severity: "low" | "medium" | "high";
    }
  >;
  overall_risk_score: number;
};

export type PreviewResponse = {
  auto_detection: {
    label_col: string;
    label_col_confidence: number;
    protected_attrs: string[];
    detection_reasoning: Record<string, string>;
  };
  dataset_summary: {
    row_count: number;
    column_count: number;
    label_distribution: Record<string, number>;
    group_distributions: Record<string, Record<string, number>>;
    dataset_quality_score: number;
  };
};

export type MetricResponse = {
  run_id: string;
  results: {
    accuracy_by_group?: Record<string, number>;
    demographic_parity_diff?: number;
    equalized_odds_diff?: number;
    overall_accuracy?: number;
    [key: string]: unknown;
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE) {
  // Kept as runtime guard for local misconfiguration.
  // eslint-disable-next-line no-console
  console.warn("NEXT_PUBLIC_API_URL is not set.");
}

export async function analyzeDataset(file: File): Promise<FullAnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axios.post<FullAnalysisResponse>(
    `${API_BASE}/analyze`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response.data;
}

export async function previewDataset(file: File): Promise<PreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await axios.post<PreviewResponse>(
    `${API_BASE}/analyze/preview`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response.data;
}

export async function getMetrics(runId: string): Promise<MetricResponse> {
  const response = await axios.get<MetricResponse>(`${API_BASE}/metrics/${runId}`);
  return response.data;
}

export function getReportUrl(runId: string): string {
  return `${API_BASE}/report/${runId}`;
}
