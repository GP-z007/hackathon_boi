import axios, { AxiosError } from "axios";

import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  USER_KEY,
  clearTokens as clearTokensClient,
  getAccessToken as getAccessTokenClient,
  saveTokens as saveTokensClient,
  saveUser as saveUserClient,
} from "@/lib/auth";

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
  all_results?: Record<
    string,
    {
      accuracy_by_group?: Record<string, number>;
      demographic_parity_diff?: number;
      equalized_odds_diff?: number;
      overall_accuracy?: number;
      disparate_impact?: number;
      statistical_parity_difference?: number;
      passes_80_percent_rule?: boolean;
      severity?: "low" | "medium" | "high";
      [key: string]: unknown;
    }
  >;
};

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  role: "analyst" | "admin";
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  user: AuthUser;
};

export type RegisterResponse = {
  message: string;
  user_id: string;
  access_token?: string;
  token_type?: "bearer";
};

export type UserProfile = AuthUser & {
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login: string | null;
  api_calls_today: number;
  api_calls_reset_at: string;
};

export type AdminStats = {
  total_users: number;
  active_users: number;
  total_runs: number;
  avg_risk_score: number;
};

export type AdminUserOut = {
  id: string;
  email: string;
  full_name: string;
  role: "analyst" | "admin";
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login: string | null;
  api_calls_today: number;
};

export type PaginatedUsers = {
  total: number;
  page: number;
  page_size: number;
  items: AdminUserOut[];
};

export type AuditRunSummary = {
  run_id: string;
  timestamp: string;
  filename: string;
  row_count: number;
  protected_attrs: string[];
  overall_risk_score: number;
};

// ───────── Advanced analysis result shapes ─────────

export type IntersectionalCombo = {
  attributes_combined: string[];
  groups_found: string[];
  accuracy_by_group: Record<string, number>;
  positive_rate_by_group: Record<string, number>;
  worst_group: string;
  best_group: string;
  accuracy_gap: number;
  demographic_parity_diff: number;
  severity: "low" | "medium" | "high";
  error?: string;
};

export type IntersectionalResult = {
  run_id: string;
  combos: Record<string, IntersectionalCombo | { error: string }>;
};

export type CausalResultPayload = {
  method: string;
  average_treatment_effect: number;
  confounders_controlled: string[];
  interpretation: string;
  refutation_passed?: boolean;
  refutation_new_effect?: number;
  is_causal_bias: boolean;
  note?: string;
};

export type CausalResult = {
  run_id: string;
  protected_attr: string;
  result: CausalResultPayload;
};

export type RecourseChange = {
  from: number;
  to: number;
  direction: "increase" | "decrease";
};

export type RecourseSuggestion = {
  changes_needed: Record<string, RecourseChange>;
  n_features_to_change: number;
};

export type RecourseResultPayload = {
  method: string;
  counterfactuals: RecourseSuggestion[];
  summary: string;
  note?: string;
};

export type RecourseResult = {
  run_id: string;
  protected_attr: string;
  rejected_row: Record<string, unknown>;
  result: RecourseResultPayload;
};

export type SyntheticResultPayload = {
  method: string;
  original_rows: number;
  synthetic_rows: number;
  original_disparate_impact: number | null;
  synthetic_disparate_impact: number | null;
  improvement: number | null;
  synthetic_csv_b64: string;
};

export type SyntheticResult = {
  run_id: string;
  protected_attr: string;
  result: SyntheticResultPayload;
};

export type ComplianceMetricCheck = {
  metric: string;
  attribute: string;
  value: number;
  threshold?: number;
  status: "PASS" | "FAIL";
  evidence?: string;
};

export type ComplianceRegulation = {
  regulation: string;
  jurisdiction: string;
  overall_status: "PASS" | "FAIL" | "MANUAL_REVIEW";
  metric_checks: ComplianceMetricCheck[];
  procedural_requirements: string[];
  penalty: string;
  effective_date: string;
};

export type ComplianceReport = Record<string, ComplianceRegulation>;

export type ModelCardJson = {
  model_details: {
    use_case: string;
    audit_date: string;
    run_id: string;
  };
  fairness_metrics: Record<string, unknown>;
  compliance: ComplianceReport;
  overall_risk_score: number;
  recommendations: string[];
};

export type ModelCardResult = {
  run_id: string;
  markdown: string;
  json: ModelCardJson;
};

export type LineageEntry = {
  stage: string;
  timestamp: string;
  row_count: number;
  missing_pct: number;
  disparate_impact: number | null;
  passes_80_rule: boolean | null;
  delta_from_previous: number | null;
  error?: string;
};

export type LineageIntroductionPoint = {
  bias_introduced_at: string | null;
  previous_clean_stage?: string;
  disparate_impact_at_introduction?: number;
  message?: string;
  full_timeline: LineageEntry[];
};

export type LineageResult = {
  run_id: string;
  lineage_log: Record<string, LineageEntry[]>;
  introduction_points: Record<string, LineageIntroductionPoint>;
};

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

if (!API_BASE && typeof window !== "undefined") {
  console.warn("NEXT_PUBLIC_API_URL is not set.");
}

export function getAccessToken(): string | null {
  return getAccessTokenClient();
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setAuthSession(payload: {
  accessToken: string;
  refreshToken?: string;
  user?: AuthUser | null;
}): void {
  saveTokensClient(payload.accessToken, payload.refreshToken);
  if (payload.user) saveUserClient(payload.user);
}

export function clearAuthSession(): void {
  clearTokensClient();
}

export const apiClient = axios.create({ baseURL: API_BASE });

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  },
);

// ───────── Auth endpoints ─────────

export async function registerAccount(payload: {
  email: string;
  full_name: string;
  password: string;
}): Promise<RegisterResponse> {
  const response = await apiClient.post<RegisterResponse>("/auth/register", payload);
  return response.data;
}

export async function loginAccount(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);
  const response = await apiClient.post<LoginResponse>("/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return response.data;
}

export async function logoutAccount(refreshToken: string): Promise<void> {
  await apiClient.post("/auth/logout", { refresh_token: refreshToken });
}

export async function fetchMe(): Promise<UserProfile> {
  const response = await apiClient.get<UserProfile>("/auth/me");
  return response.data;
}

// ───────── Bias-audit endpoints ─────────

export async function analyzeDataset(file: File): Promise<FullAnalysisResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<FullAnalysisResponse>("/analyze", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function previewDataset(file: File): Promise<PreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<PreviewResponse>("/analyze/preview", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function getMetrics(runId: string): Promise<MetricResponse> {
  const response = await apiClient.get<MetricResponse>(`/metrics/${runId}`);
  return response.data;
}

export function getReportUrl(runId: string): string {
  return `${API_BASE}/report/${runId}`;
}

export async function listRuns(): Promise<AuditRunSummary[]> {
  const response = await apiClient.get<AuditRunSummary[]>("/runs");
  return response.data;
}

// ───────── Admin endpoints ─────────

export async function getAdminStats(): Promise<AdminStats> {
  const response = await apiClient.get<AdminStats>("/admin/stats");
  return response.data;
}

export async function listAdminUsers(
  page = 1,
  pageSize = 25,
): Promise<PaginatedUsers> {
  const response = await apiClient.get<PaginatedUsers>("/admin/users", {
    params: { page, page_size: pageSize },
  });
  return response.data;
}

export async function updateAdminUser(
  userId: string,
  payload: { is_active?: boolean; role?: "analyst" | "admin" },
): Promise<AdminUserOut> {
  const response = await apiClient.patch<AdminUserOut>(`/admin/users/${userId}`, payload);
  return response.data;
}

export async function deactivateAdminUser(userId: string): Promise<void> {
  await apiClient.delete(`/admin/users/${userId}`);
}

// ───────── Advanced analysis endpoints ─────────

const SESSION_ANALYSIS_PREFIX = "analysis:";

function readCachedAnalysis(runId: string): FullAnalysisResponse | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(`${SESSION_ANALYSIS_PREFIX}${runId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FullAnalysisResponse;
  } catch {
    return null;
  }
}

export async function runCausalAnalysis(
  runId: string,
  protectedAttr?: string,
  confounders?: string[],
): Promise<CausalResult> {
  const response = await apiClient.post<CausalResult>(
    `/analyze/${runId}/causal`,
    {
      protected_attr: protectedAttr ?? null,
      confounders: confounders && confounders.length > 0 ? confounders : null,
    },
  );
  return response.data;
}

export async function generateRecourse(
  runId: string,
  rejectedRow: Record<string, unknown>,
  options?: { protectedAttr?: string; nCounterfactuals?: number },
): Promise<RecourseResult> {
  const response = await apiClient.post<RecourseResult>(
    `/analyze/${runId}/recourse`,
    {
      rejected_row: rejectedRow,
      n_counterfactuals: options?.nCounterfactuals ?? 3,
      protected_attr: options?.protectedAttr ?? null,
    },
  );
  return response.data;
}

export async function generateSynthetic(
  runId: string,
  options?: { protectedAttr?: string; targetRows?: number },
): Promise<SyntheticResult> {
  const response = await apiClient.post<SyntheticResult>(
    `/analyze/${runId}/synthetic`,
    {
      target_rows: options?.targetRows ?? 2000,
      protected_attr: options?.protectedAttr ?? null,
    },
  );
  return response.data;
}

/**
 * Intersectional results are computed during /analyze and persisted with the
 * audit run, but the only endpoint that returns them today is /analyze itself.
 * We pull the cached envelope from sessionStorage when the user just ran the
 * upload flow; otherwise we fall back to /metrics/{runId} so callers always
 * receive a typed payload (with an empty combo map for cold runs).
 */
export async function getIntersectional(runId: string): Promise<IntersectionalResult> {
  const cached = readCachedAnalysis(runId);
  if (cached) {
    const combos = (cached as FullAnalysisResponse & {
      intersectional_analysis?: Record<string, IntersectionalCombo | { error: string }>;
    }).intersectional_analysis;
    if (combos && typeof combos === "object") {
      return { run_id: runId, combos };
    }
  }
  // Cold run: best-effort, ensure caller gets a valid (possibly empty) shape.
  await apiClient.get<MetricResponse>(`/metrics/${runId}`);
  return { run_id: runId, combos: {} };
}

export async function getCompliance(
  runId: string,
  _useCase?: string,
): Promise<{ run_id: string; report: ComplianceReport }> {
  const cached = readCachedAnalysis(runId);
  if (cached) {
    const report = (cached as FullAnalysisResponse & {
      compliance_report?: ComplianceReport;
    }).compliance_report;
    if (report && typeof report === "object" && !("error" in report)) {
      return { run_id: runId, report };
    }
  }
  return { run_id: runId, report: {} };
}

export async function getModelCard(
  runId: string,
  useCase?: string,
): Promise<ModelCardResult> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (useCase) headers["X-Use-Case"] = useCase;
  const response = await apiClient.get<ModelCardResult>(
    `/analyze/${runId}/model-card`,
    { headers },
  );
  return response.data;
}

export async function getLineage(runId: string): Promise<LineageResult> {
  const response = await apiClient.get<LineageResult>(`/analyze/${runId}/lineage`);
  return response.data;
}

export { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY };
