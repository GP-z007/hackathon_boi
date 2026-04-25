import axios, { AxiosError } from "axios";

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

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

if (!API_BASE && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.warn("NEXT_PUBLIC_API_URL is not set.");
}

const ACCESS_TOKEN_KEY = "bias_audit:access_token";
const REFRESH_TOKEN_KEY = "bias_audit:refresh_token";
const USER_KEY = "bias_audit:user";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
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
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, payload.accessToken);
  if (payload.refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, payload.refreshToken);
  }
  if (payload.user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  }
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

// Single axios instance so every call automatically picks up the bearer token.
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
  // Report endpoint is auth-gated; the Bearer token is appended client-side
  // before opening the download window (see dashboard page).
  return `${API_BASE}/report/${runId}`;
}
