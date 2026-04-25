"use client";

import { motion } from "framer-motion";
import { Activity, AlertTriangle, Radio, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import Badge from "@/components/Badge";
import { useAuth } from "@/lib/auth-context";

type MonitorEvent = {
  timestamp: string;
  demographic_parity_diff: number;
  equalized_odds_diff: number;
  alert: string | null;
};

export default function MonitorPage() {
  return (
    <AppShell>
      <MonitorView />
    </AppShell>
  );
}

function MonitorView() {
  const { accessToken } = useAuth();
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [latestAlert, setLatestAlert] = useState<string | null>(null);
  const [alertVisible, setAlertVisible] = useState(true);

  useEffect(() => {
    const wsBase = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsBase || !accessToken) return;

    const socket = new WebSocket(
      `${wsBase}/ws/monitor?token=${encodeURIComponent(accessToken)}`,
    );

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = () => setConnected(false);
    socket.onmessage = (messageEvent) => {
      const payload = JSON.parse(messageEvent.data) as MonitorEvent;
      if ((payload as unknown as { type?: string }).type === "connected") return;
      setEvents((prev) => [payload, ...prev].slice(0, 30));
      setLatestAlert(payload.alert);
      setAlertVisible(true);
    };

    return () => {
      socket.close();
    };
  }, [accessToken]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 18 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.4 }}>
            Live Monitor
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 13.5 }}>
            Real-time fairness drift across your deployed models.
          </p>
        </div>
        <ConnectionPill connected={connected} />
      </header>

      {latestAlert && alertVisible && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background:
              "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))",
            border: "1px solid rgba(239,68,68,0.4)",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <AlertTriangle size={18} color="#FCA5A5" />
          <div style={{ flex: 1, fontSize: 13.5, color: "#FECACA" }}>{latestAlert}</div>
          <button
            type="button"
            onClick={() => setAlertVisible(false)}
            aria-label="Dismiss alert"
            style={{
              background: "transparent",
              border: "none",
              color: "#FCA5A5",
              cursor: "pointer",
              padding: 4,
              display: "inline-flex",
            }}
          >
            <X size={14} />
          </button>
        </motion.div>
      )}

      <div
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
          <Radio size={16} color="var(--brand)" />
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Event stream</h2>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>
            {events.length} {events.length === 1 ? "event" : "events"} buffered
          </span>
        </div>

        <div style={{ maxHeight: 540, overflowY: "auto" }}>
          {events.length === 0 ? (
            <div
              style={{
                padding: "60px 20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13.5,
              }}
            >
              <Activity size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div>{connected ? "Listening for events…" : "Not connected. Start your monitor source to see events."}</div>
            </div>
          ) : (
            <div style={{ display: "grid" }}>
              {events.map((event, index) => (
                <MonitorRow key={`${event.timestamp}-${index}`} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectionPill({ connected }: { connected: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        background: connected ? "rgba(34,211,160,0.10)" : "rgba(239,68,68,0.10)",
        border: `1px solid ${connected ? "rgba(34,211,160,0.4)" : "rgba(239,68,68,0.4)"}`,
        color: connected ? "#6EE7B7" : "#FCA5A5",
        fontSize: 12.5,
        fontWeight: 700,
      }}
    >
      {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
      {connected ? "Live" : "Disconnected"}
      {connected && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: "var(--success)",
            animation: "pulse-ring 1.6s infinite",
          }}
        />
      )}
    </span>
  );
}

function MonitorRow({ event }: { event: MonitorEvent }) {
  const dpd = event.demographic_parity_diff;
  const eod = event.equalized_odds_diff;
  const dpdBad = Math.abs(dpd) > 0.1;
  const eodBad = Math.abs(eod) > 0.1;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.5fr 1fr 1fr auto",
        alignItems: "center",
        gap: 12,
        padding: "12px 18px",
        borderTop: "1px solid var(--border)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>
        {new Date(event.timestamp).toLocaleString()}
      </span>
      <span style={{ color: dpdBad ? "var(--warning)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        DP Δ {dpd.toFixed(4)}
      </span>
      <span style={{ color: eodBad ? "var(--warning)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        EO Δ {eod.toFixed(4)}
      </span>
      <Badge
        variant={event.alert ? "high" : dpdBad || eodBad ? "medium" : "low"}
        label={event.alert ? "Alert" : dpdBad || eodBad ? "Watch" : "OK"}
      />
    </div>
  );
}
