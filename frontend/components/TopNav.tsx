"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CSSProperties } from "react";

import { useAuth } from "@/lib/auth-context";

const wrap: CSSProperties = {
  borderBottom: "1px solid #e5e7eb",
  background: "rgba(255, 255, 255, 0.85)",
  backdropFilter: "saturate(180%) blur(8px)",
  position: "sticky",
  top: 0,
  zIndex: 30,
};

const inner: CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: "10px 16px",
  display: "flex",
  alignItems: "center",
  gap: 16,
};

const brand: CSSProperties = {
  fontWeight: 800,
  letterSpacing: 0.2,
  color: "#0f172a",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const dot: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "linear-gradient(135deg, #2563eb, #06b6d4)",
};

const linkBase: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  fontSize: 14,
  color: "#334155",
};

const linkActive: CSSProperties = {
  ...linkBase,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 700,
};

const right: CSSProperties = {
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const userPill: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 10px 4px 4px",
  borderRadius: 999,
  background: "#f1f5f9",
  fontSize: 13,
  color: "#0f172a",
};

const avatar: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 999,
  background: "linear-gradient(135deg, #2563eb, #06b6d4)",
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 700,
};

const logoutBtn: CSSProperties = {
  background: "transparent",
  border: "1px solid #e2e8f0",
  color: "#0f172a",
  fontSize: 13,
  fontWeight: 600,
  padding: "6px 10px",
  borderRadius: 8,
  cursor: "pointer",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

export default function TopNav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  // Hide on auth screens — those have their own focused layout.
  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <nav style={wrap}>
      <div style={inner}>
        <Link href={user ? "/" : "/login"} style={brand}>
          <span style={dot} />
          Bias Audit
        </Link>

        {user && (
          <div style={{ display: "flex", gap: 4 }}>
            <Link href="/" style={isActive("/") ? linkActive : linkBase}>
              Upload
            </Link>
            <Link href="/dashboard" style={isActive("/dashboard") ? linkActive : linkBase}>
              Dashboard
            </Link>
            <Link href="/monitor" style={isActive("/monitor") ? linkActive : linkBase}>
              Monitor
            </Link>
          </div>
        )}

        <div style={right}>
          {user ? (
            <>
              <span style={userPill} title={user.email}>
                <span style={avatar}>{initials(user.full_name)}</span>
                <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.full_name}
                </span>
              </span>
              <button type="button" onClick={() => void logout()} style={logoutBtn}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" style={linkBase}>
                Sign in
              </Link>
              <Link
                href="/register"
                style={{
                  ...linkBase,
                  background: "linear-gradient(180deg, #2563eb, #1d4ed8)",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
