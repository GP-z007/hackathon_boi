"use client";

import { useEffect, useMemo, useState } from "react";

import AlertBanner from "@/components/AlertBanner";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";

type MonitorEvent = {
  timestamp: string;
  demographic_parity_diff: number;
  equalized_odds_diff: number;
  alert: string | null;
};

export default function MonitorPage() {
  return (
    <RequireAuth>
      <MonitorPageInner />
    </RequireAuth>
  );
}

function MonitorPageInner() {
  const { accessToken } = useAuth();
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [latestAlert, setLatestAlert] = useState<string | null>(null);

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
      // The backend's first message is a connection ack {type: "connected"};
      // the bias-monitor messages don't have a `type` field. Filter the ack.
      if ((payload as unknown as { type?: string }).type === "connected") return;
      setEvents((prev) => [payload, ...prev].slice(0, 20));
      setLatestAlert(payload.alert);
    };

    return () => {
      socket.close();
    };
  }, [accessToken]);

  const statusStyle = useMemo(
    () => ({
      display: "inline-block",
      padding: "6px 10px",
      borderRadius: 999,
      background: connected ? "#dcfce7" : "#fee2e2",
      color: connected ? "#166534" : "#991b1b",
      fontWeight: 700,
      marginBottom: 12,
    }),
    [connected],
  );

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px 40px" }}>
      <h1 style={{ marginBottom: 8 }}>Live Fairness Monitor</h1>
      <span style={statusStyle}>{connected ? "Connected" : "Disconnected"}</span>

      {latestAlert && <AlertBanner message={latestAlert} />}

      <div style={{ marginTop: 14, background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", maxHeight: 520, overflowY: "auto" }}>
        {events.map((event, index) => (
          <div
            key={`${event.timestamp}-${index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1fr",
              gap: 12,
              padding: "10px 12px",
              borderBottom: "1px solid #f3f4f6",
              fontSize: 14,
            }}
          >
            <span>{new Date(event.timestamp).toLocaleString()}</span>
            <span>{event.demographic_parity_diff.toFixed(4)}</span>
            <span>{event.equalized_odds_diff.toFixed(4)}</span>
          </div>
        ))}
        {events.length === 0 && <p style={{ padding: 12, margin: 0 }}>No events yet.</p>}
      </div>
    </main>
  );
}
