"use client";

import {
  Activity,
  BarChart2,
  Bell,
  ChevronRight,
  FileText,
  FlaskConical,
  GitBranch,
  GitCommit,
  GitMerge,
  Home,
  LogOut,
  Menu,
  Scale,
  Shield,
  UserCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";

import Logo from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth-context";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Upload", icon: Home, exact: true },
  { href: "/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/monitor", label: "Monitor", icon: Activity },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/intersectional", label: "Intersectional", icon: GitBranch },
  { href: "/causal", label: "Causal analysis", icon: GitMerge },
  { href: "/recourse", label: "Recourse", icon: UserCheck },
  { href: "/synthetic", label: "Synthetic data", icon: FlaskConical },
  { href: "/compliance", label: "Compliance", icon: Scale },
  { href: "/model-card", label: "Model card", icon: FileText },
  { href: "/lineage", label: "Data lineage", icon: GitCommit },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isReady } = useAuth();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isReady && !user) {
      router.replace("/login");
    }
  }, [isReady, user, router]);

  const items = useMemo(
    () => NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === "admin"),
    [user?.role],
  );

  const breadcrumb = useMemo(() => {
    if (pathname === "/") return "Upload";
    const seg = pathname?.split("/").filter(Boolean)[0] ?? "";
    return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : "";
  }, [pathname]);

  if (!isReady || !user) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          gap: 12,
          flexDirection: "column",
        }}
      >
        <span className="spinner lg" />
        <span>Restoring your session…</span>
      </main>
    );
  }

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname?.startsWith(item.href);

  const sidebarStyle: CSSProperties = {
    width: 240,
    height: "100vh",
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    position: "fixed",
    top: 0,
    left: 0,
    display: "flex",
    flexDirection: "column",
    zIndex: 50,
  };

  const mainStyle: CSSProperties = {
    marginLeft: 240,
    minHeight: "100vh",
    padding: 32,
  };

  const onLogout = async () => {
    try {
      await logout();
      toast.info("Signed out");
    } catch {
      toast.error("Failed to sign out");
    }
  };

  return (
    <>
      <aside
        className={`app-sidebar ${mobileOpen ? "open" : ""}`}
        style={sidebarStyle}
      >
        <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid var(--border)" }}>
          <Link href="/" style={{ display: "inline-flex" }}>
            <Logo size={26} />
          </Link>
        </div>

        <nav style={{ flex: 1, padding: "12px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 1.4,
              fontWeight: 700,
              color: "var(--text-muted)",
              padding: "8px 8px 6px",
              textTransform: "uppercase",
            }}
          >
            Workspace
          </div>
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: active ? "var(--text)" : "var(--text-dim)",
                  background: active ? "var(--brand-soft)" : "transparent",
                  borderLeft: `2px solid ${active ? "var(--brand)" : "transparent"}`,
                  paddingLeft: 12,
                  transition: "background 150ms ease, color 150ms ease",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--surface-2)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <Icon size={16} color={active ? "var(--brand)" : "currentColor"} />
                <span>{item.label}</span>
                {active && (
                  <ChevronRight
                    size={14}
                    style={{ marginLeft: "auto", color: "var(--brand)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div style={{ borderTop: "1px solid var(--border)", padding: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px",
              borderRadius: 10,
              background: "var(--surface-2)",
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
                color: "#fff",
                fontWeight: 700,
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initials(user.full_name)}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={user.full_name}
              >
                {user.full_name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  textTransform: "capitalize",
                }}
              >
                {user.role}
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                padding: 6,
                borderRadius: 8,
                cursor: "pointer",
                display: "inline-flex",
              }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 40,
          }}
        />
      )}

      <div className="app-main" style={mainStyle}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            paddingBottom: 24,
          }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            style={{
              display: "none",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              padding: 8,
              borderRadius: 10,
              cursor: "pointer",
            }}
            className="mobile-only"
          >
            <Menu size={16} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>dasViewer</span>
            <ChevronRight size={14} color="var(--text-muted)" />
            <span style={{ color: "var(--text)", fontWeight: 600 }}>{breadcrumb}</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
            <button
              type="button"
              aria-label="Notifications"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text-dim)",
                padding: 8,
                borderRadius: 10,
                cursor: "pointer",
                position: "relative",
                display: "inline-flex",
              }}
              onClick={() => toast.info("You're all caught up.", "Notifications")}
            >
              <Bell size={16} />
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 6,
                  height: 6,
                  background: "var(--brand)",
                  borderRadius: 999,
                }}
              />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                padding: "6px 10px 6px 6px",
                borderRadius: 999,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {initials(user.full_name)}
              </span>
              <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.full_name.split(" ")[0]}
              </span>
            </button>
            {menuOpen && (
              <div
                onMouseLeave={() => setMenuOpen(false)}
                style={{
                  position: "absolute",
                  top: 44,
                  right: 0,
                  width: 220,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 6,
                  boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
                  zIndex: 60,
                }}
              >
                <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{user.full_name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    padding: "9px 10px",
                    color: "var(--text)",
                    cursor: "pointer",
                    borderRadius: 8,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--surface-3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {children}
      </div>

      <style>{`
        @media (max-width: 880px) {
          .mobile-only { display: inline-flex !important; }
          .app-main { padding: 20px !important; }
        }
      `}</style>

      {/* Mobile floating close-button when sidebar open */}
      {mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          style={{
            position: "fixed",
            top: 16,
            left: 240 + 16,
            zIndex: 60,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            padding: 8,
            borderRadius: 10,
            cursor: "pointer",
            display: "inline-flex",
          }}
        >
          <X size={16} />
        </button>
      )}
    </>
  );
}
