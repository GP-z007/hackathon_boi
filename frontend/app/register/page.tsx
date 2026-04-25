"use client";

import axios from "axios";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import FloatField from "@/components/FloatField";
import Logo from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth-context";

const SPECIAL_RX = /[^A-Za-z0-9]/;

function calcStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (SPECIAL_RX.test(pw)) score += 1;
  return score;
}

const STRENGTH_META = [
  { label: "Too short", color: "var(--danger)" },
  { label: "Weak", color: "#EF4444" },
  { label: "Fair", color: "#F97316" },
  { label: "Good", color: "#F59E0B" },
  { label: "Strong", color: "#22D3A0" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register, user, isReady } = useAuth();
  const toast = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isReady && user) router.replace("/");
  }, [isReady, user, router]);

  const strength = useMemo(() => calcStrength(password), [password]);
  const meta = STRENGTH_META[strength] ?? STRENGTH_META[0];
  const passwordValid = strength >= 3 && password.length >= 8 && /[A-Z]/.test(password) && /\d/.test(password);

  const onSubmit = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      toast.error("Please fill in every field.");
      return;
    }
    if (!passwordValid) {
      toast.warning(
        "Password must be 8+ chars with an uppercase letter and a number.",
        "Strengthen your password",
      );
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
        toast.success("Account created. Redirecting…", "Welcome to dasViewer");
        router.replace("/");
      } else {
        toast.success("Account created. Please sign in.");
        setTimeout(() => router.replace("/login"), 800);
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
      toast.error(message, "Sign-up failed");
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
          Create your account
        </h1>
        <p
          style={{
            margin: "6px 0 28px",
            color: "var(--text-muted)",
            fontSize: 13.5,
            textAlign: "center",
          }}
        >
          Audit datasets and monitor fairness drift in seconds.
        </p>

        <div style={{ display: "grid", gap: 14 }}>
          <FloatField
            id="full_name"
            label="Full name"
            value={fullName}
            onChange={setFullName}
            icon={<User size={15} />}
            autoComplete="name"
          />
          <FloatField
            id="email"
            label="Work email"
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
              autoComplete="new-password"
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 4,
                    display: "inline-flex",
                  }}
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
              onEnter={onSubmit}
            />
            <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 999,
                    background: i < strength ? meta.color : "var(--border)",
                    transition: "background 200ms ease",
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 6,
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              <span>Min 8 chars · uppercase · number · special</span>
              <span style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            style={{
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
              cursor: submitting ? "wait" : "pointer",
              opacity: submitting ? 0.8 : 1,
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
                Creating…
              </>
            ) : (
              "Create account"
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
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--brand)", fontWeight: 600 }}>
              Sign in
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
