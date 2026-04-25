"use client";

import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Mail, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { Suspense, useEffect, useState } from "react";

import FloatField from "@/components/FloatField";
import Logo from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, user, isReady } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fromPath = params?.get("from") || "/";

  useEffect(() => {
    if (isReady && user) router.replace(fromPath);
  }, [isReady, user, router, fromPath]);

  const onSubmit = async () => {
    if (!email || !password) {
      toast.error("Email and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.success("Welcome back!", "Signed in");
      router.replace(fromPath);
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
      toast.error(message, "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background:
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(108,99,255,0.18) 0%, transparent 60%)," +
          "var(--bg)",
        position: "relative",
      }}
      className="grid-bg"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 40,
          boxShadow: "0 0 80px rgba(108,99,255,0.08), 0 20px 60px rgba(0,0,0,0.45)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <Logo size={32} />
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: -0.3,
          }}
        >
          Welcome back
        </h1>
        <p
          style={{
            margin: "6px 0 28px",
            color: "var(--text-muted)",
            fontSize: 13.5,
            textAlign: "center",
          }}
        >
          Sign in to continue auditing your datasets.
        </p>

        <div style={{ display: "grid", gap: 14 }}>
          <FloatField
            id="email"
            label="Email address"
            value={email}
            onChange={setEmail}
            icon={<Mail size={15} />}
            type="email"
            autoComplete="email"
          />
          <div>
            <FloatField
              id="password"
              label="Password"
              value={password}
              onChange={setPassword}
              icon={<Lock size={15} />}
              type={show ? "text" : "password"}
              autoComplete="current-password"
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  style={iconButtonStyle}
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
              onEnter={onSubmit}
            />
            <div style={{ textAlign: "right", marginTop: 8 }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  toast.info("Contact your admin to reset your password.", "Forgot password");
                }}
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  textDecoration: "none",
                }}
              >
                Forgot password?
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            style={{
              ...primaryButton,
              opacity: submitting ? 0.8 : 1,
              cursor: submitting ? "wait" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!submitting) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 12px 28px rgba(108,99,255,0.35)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 8px 22px rgba(108,99,255,0.25)";
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={15} className="spinner-svg" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Don&apos;t have an account?{" "}
            <Link href="/register" style={{ color: "var(--brand)", fontWeight: 600 }}>
              Create one
            </Link>
          </p>
        </div>
      </motion.div>

      <style>{`
        .spinner-svg { animation: spin 0.9s linear infinite; }
      `}</style>
    </main>
  );
}

const primaryButton = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "none",
  fontSize: 14,
  fontWeight: 700,
  color: "#fff",
  background: "linear-gradient(135deg, #6C63FF, #8B5CF6)",
  boxShadow: "0 8px 22px rgba(108,99,255,0.25)",
  transition: "transform 150ms ease, box-shadow 150ms ease",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
} as const;

const iconButtonStyle = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: 4,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
} as const;
