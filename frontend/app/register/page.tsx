"use client";

import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AuthShell, {
  errorBox,
  helperText,
  inputStyle,
  labelStyle,
  linkStyle,
  primaryButton,
} from "@/components/AuthShell";
import { useAuth } from "@/lib/auth-context";

const passwordChecks = (value: string) => ({
  length: value.length >= 8,
  uppercase: /[A-Z]/.test(value),
  number: /\d/.test(value),
});

export default function RegisterPage() {
  const router = useRouter();
  const { register, user, isReady } = useAuth();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (isReady && user) router.replace("/");
  }, [isReady, user, router]);

  const checks = useMemo(() => passwordChecks(password), [password]);
  const passwordValid = checks.length && checks.uppercase && checks.number;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setInfo("");
    if (!passwordValid) {
      setError("Password must be 8+ characters with at least one uppercase letter and one number.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await register({
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        password,
      });
      if (result) {
        // Dev mode: auto-logged-in. Send to home.
        router.replace("/");
      } else {
        setInfo("Account created. Please sign in to continue.");
        setTimeout(() => router.replace("/login"), 1200);
      }
    } catch (err) {
      let message = "Could not create your account.";
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data;
        if (detail && typeof detail === "object" && "detail" in detail) {
          const d = (detail as { detail: unknown }).detail;
          if (typeof d === "string") {
            message = d;
          } else if (Array.isArray(d) && d[0] && typeof d[0] === "object" && "msg" in d[0]) {
            message = (d[0] as { msg: string }).msg;
          }
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

  const Check = ({ ok, label }: { ok: boolean; label: string }) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: ok ? "#15803d" : "#94a3b8",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: ok ? "#dcfce7" : "#f1f5f9",
          color: ok ? "#15803d" : "#94a3b8",
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {ok ? "✓" : "•"}
      </span>
      {label}
    </span>
  );

  return (
    <AuthShell
      title="Create your account"
      subtitle="Audit datasets, monitor fairness drift, and download compliance reports."
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
        <div>
          <label htmlFor="full_name" style={labelStyle}>
            Full name
          </label>
          <input
            id="full_name"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            style={inputStyle}
            placeholder="Ada Lovelace"
          />
        </div>
        <div>
          <label htmlFor="email" style={labelStyle}>
            Work email
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
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={inputStyle}
            placeholder="Create a strong password"
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
            <Check ok={checks.length} label="8+ characters" />
            <Check ok={checks.uppercase} label="1 uppercase" />
            <Check ok={checks.number} label="1 number" />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting || !passwordValid}
          style={{
            ...primaryButton,
            opacity: submitting || !passwordValid ? 0.6 : 1,
            cursor: submitting ? "wait" : passwordValid ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Creating…" : "Create account"}
        </button>
        {error && <div style={errorBox}>{error}</div>}
        {info && (
          <div
            style={{
              marginTop: 4,
              padding: "10px 12px",
              borderRadius: 10,
              background: "#ecfdf5",
              color: "#065f46",
              border: "1px solid #a7f3d0",
              fontSize: 13,
            }}
          >
            {info}
          </div>
        )}
      </form>
      <div style={helperText}>
        Already have an account?{" "}
        <Link href="/login" style={linkStyle}>
          Sign in
        </Link>
      </div>
    </AuthShell>
  );
}
