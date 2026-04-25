"use client";

import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import AuthShell, {
  errorBox,
  helperText,
  inputStyle,
  labelStyle,
  linkStyle,
  primaryButton,
} from "@/components/AuthShell";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login, user, isReady } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isReady && user) router.replace("/");
  }, [isReady, user, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/");
    } catch (err) {
      let message = "Could not log in. Please try again.";
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data;
        if (detail && typeof detail === "object" && "detail" in detail) {
          const d = (detail as { detail: unknown }).detail;
          if (typeof d === "string") message = d;
        } else if (typeof detail === "string" && detail.trim()) {
          message = detail;
        } else if (err.message) {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue auditing your datasets for bias."
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <div>
          <label htmlFor="email" style={labelStyle}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={inputStyle}
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label htmlFor="password" style={labelStyle}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={inputStyle}
            placeholder="Your password"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          style={{ ...primaryButton, opacity: submitting ? 0.7 : 1, cursor: submitting ? "wait" : "pointer" }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        {error && <div style={errorBox}>{error}</div>}
      </form>
      <div style={helperText}>
        Don&apos;t have an account?{" "}
        <Link href="/register" style={linkStyle}>
          Create one
        </Link>
      </div>
    </AuthShell>
  );
}
