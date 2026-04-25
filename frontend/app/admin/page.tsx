"use client";

import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  Edit2,
  Loader2,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import AnimatedNumber from "@/components/AnimatedNumber";
import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import Skeleton from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  AdminStats,
  AdminUserOut,
  deactivateAdminUser,
  getAdminStats,
  listAdminUsers,
  updateAdminUser,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function AdminPage() {
  return (
    <AppShell>
      <AdminGate />
    </AppShell>
  );
}

function AdminGate() {
  const { user, isReady } = useAuth();
  if (!isReady) return null;
  if (user?.role !== "admin") {
    return (
      <div
        style={{
          maxWidth: 540,
          margin: "10vh auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 32,
          textAlign: "center",
        }}
      >
        <AlertTriangle size={28} color="var(--warning)" style={{ marginBottom: 8 }} />
        <h2 style={{ margin: 0, fontSize: 18 }}>Admin access required</h2>
        <p style={{ color: "var(--text-muted)", marginTop: 6, fontSize: 13.5 }}>
          You need an admin role to view this page. Ask an existing admin to grant access.
        </p>
      </div>
    );
  }
  return <AdminView />;
}

function AdminView() {
  const toast = useToast();
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserOut[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useMemo(
    () => async () => {
      try {
        const [s, u] = await Promise.all([getAdminStats(), listAdminUsers(1, 100)]);
        setStats(s);
        setUsers(u.items);
      } catch {
        toast.error("Failed to load admin data.");
      } finally {
        setLoadingStats(false);
        setLoadingUsers(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onToggleActive = async (u: AdminUserOut) => {
    if (u.id === user?.id) {
      toast.warning("You cannot deactivate yourself.");
      return;
    }
    setBusyId(u.id);
    try {
      if (u.is_active) {
        await deactivateAdminUser(u.id);
        toast.success(`${u.full_name} deactivated.`);
      } else {
        await updateAdminUser(u.id, { is_active: true });
        toast.success(`${u.full_name} reactivated.`);
      }
      await refresh();
    } catch {
      toast.error("Update failed.");
    } finally {
      setBusyId(null);
    }
  };

  const onChangeRole = async (u: AdminUserOut, role: "analyst" | "admin") => {
    if (u.role === role) {
      setEditingId(null);
      return;
    }
    setBusyId(u.id);
    try {
      await updateAdminUser(u.id, { role });
      toast.success(`Role updated to ${role}.`);
      await refresh();
    } catch {
      toast.error("Role update failed.");
    } finally {
      setBusyId(null);
      setEditingId(null);
    }
  };

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 22 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.4 }}>
          Admin
        </h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13.5 }}>
          Manage users, roles, and platform-level activity.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 14,
        }}
        className="admin-stats"
      >
        <StatCard
          icon={<Users size={16} />}
          label="Total users"
          value={stats?.total_users ?? 0}
          loading={loadingStats}
        />
        <StatCard
          icon={<UserCheck size={16} />}
          label="Active users"
          value={stats?.active_users ?? 0}
          loading={loadingStats}
        />
        <StatCard
          icon={<Activity size={16} />}
          label="Total analyses"
          value={stats?.total_runs ?? 0}
          loading={loadingStats}
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          label="Avg risk score"
          value={(stats?.avg_risk_score ?? 0) * 100}
          decimals={1}
          suffix="%"
          loading={loadingStats}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <ShieldCheck size={16} color="var(--brand)" />
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Users</h2>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
            {loadingUsers ? "Loading…" : `${users.length} accounts`}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last login</Th>
                <Th align="right">API calls today</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={`s-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} style={{ padding: 14 }}>
                        <Skeleton variant="text-line" width="80%" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loadingUsers &&
                users.map((u) => {
                  const isMe = u.id === user?.id;
                  return (
                    <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              width: 34,
                              height: 34,
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
                            {initialsOf(u.full_name)}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13.5,
                                fontWeight: 600,
                                color: "var(--text)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: 240,
                              }}
                            >
                              {u.full_name} {isMe && <span style={{ color: "var(--brand)", fontSize: 11 }}>(you)</span>}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--text-muted)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: 240,
                              }}
                            >
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: 14 }}>
                        <RoleEditor
                          user={u}
                          editing={editingId === u.id}
                          setEditing={(v) => setEditingId(v ? u.id : null)}
                          onChange={(role) => void onChangeRole(u, role)}
                          busy={busyId === u.id}
                        />
                      </td>
                      <td style={{ padding: 14 }}>
                        <button
                          type="button"
                          disabled={busyId === u.id || isMe}
                          onClick={() => void onToggleActive(u)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "5px 10px",
                            borderRadius: 999,
                            border: `1px solid ${u.is_active ? "rgba(34,211,160,0.4)" : "rgba(239,68,68,0.4)"}`,
                            background: u.is_active ? "rgba(34,211,160,0.10)" : "rgba(239,68,68,0.10)",
                            color: u.is_active ? "#6EE7B7" : "#FCA5A5",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: isMe ? "not-allowed" : "pointer",
                            opacity: isMe ? 0.6 : 1,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 999,
                              background: u.is_active ? "var(--success)" : "var(--danger)",
                            }}
                          />
                          {u.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td style={{ padding: 14, fontSize: 12.5, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                        {u.last_login
                          ? new Date(u.last_login).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td
                        style={{
                          padding: 14,
                          textAlign: "right",
                          fontSize: 13,
                          color: "var(--text-dim)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {u.api_calls_today.toLocaleString()}
                      </td>
                      <td style={{ padding: 14, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setEditingId(editingId === u.id ? null : u.id)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "transparent",
                              color: "var(--text)",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Edit2 size={12} />
                            Role
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id || isMe}
                            onClick={() => void onToggleActive(u)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: `1px solid ${u.is_active ? "rgba(239,68,68,0.4)" : "rgba(34,211,160,0.4)"}`,
                              background: u.is_active ? "rgba(239,68,68,0.10)" : "rgba(34,211,160,0.10)",
                              color: u.is_active ? "#FCA5A5" : "#6EE7B7",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: isMe ? "not-allowed" : busyId === u.id ? "wait" : "pointer",
                              opacity: isMe ? 0.6 : 1,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {busyId === u.id ? <Loader2 size={12} className="spinner-svg" /> : <UserX size={12} />}
                            {u.is_active ? "Deactivate" : "Reactivate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!loadingUsers && users.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: 32,
                      textAlign: "center",
                      color: "var(--text-muted)",
                    }}
                  >
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <style>{`
        .spinner-svg { animation: spin 0.9s linear infinite; }
        @media (max-width: 880px) {
          .admin-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  decimals = 0,
  suffix = "",
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  loading: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11.5,
          color: "var(--text-muted)",
          marginBottom: 10,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        <span style={{ color: "var(--brand)", display: "inline-flex" }}>{icon}</span>
        {label}
      </div>
      {loading ? (
        <Skeleton variant="text-line" width={120} height={24} />
      ) : (
        <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: -0.4 }}>
          <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
        </div>
      )}
    </div>
  );
}

function RoleEditor({
  user,
  editing,
  setEditing,
  onChange,
  busy,
}: {
  user: AdminUserOut;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onChange: (role: "analyst" | "admin") => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [editing, setEditing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={busy}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Badge
          variant={user.role === "admin" ? "brand" : "neutral"}
          label={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {user.role}
              <ChevronDown size={10} />
            </span>
          }
        />
      </button>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        display: "inline-block",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -6,
          left: 0,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 4,
          minWidth: 140,
          zIndex: 5,
          boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
        }}
      >
        {(["analyst", "admin"] as const).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => onChange(role)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              background: user.role === role ? "var(--brand-soft)" : "transparent",
              border: "none",
              borderRadius: 6,
              color: "var(--text)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {role}
          </button>
        ))}
      </div>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        padding: "12px 14px",
        fontSize: 11,
        color: "var(--text-muted)",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}
