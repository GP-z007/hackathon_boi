"use client";

import { AuthUser } from "@/lib/api";

export const ACCESS_TOKEN_KEY = "dasviewer:access_token";
export const REFRESH_TOKEN_KEY = "dasviewer:refresh_token";
export const USER_KEY = "dasviewer:user";

type JwtPayload = {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
  [key: string]: unknown;
};

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  if (typeof atob === "function") return atob(base64);
  return Buffer.from(base64, "base64").toString("utf-8");
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const json = base64UrlDecode(payload);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  const decoded = decodeJwt(token);
  if (!decoded?.exp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return decoded.exp <= nowSec;
}

export const COOKIE_NAME = "dv_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

function writeCookie(value: string, maxAge = COOKIE_MAX_AGE): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function clearCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function saveTokens(access: string, refresh?: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
  if (refresh) window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  writeCookie(access);
}

export function saveUser(user: AuthUser): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  clearCookie();
}

export function isAuthenticated(): boolean {
  const token = getAccessToken();
  return !!token && !isTokenExpired(token);
}

export function getCurrentUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}
