"use client";

import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from "lucide-react";
import {
  CSSProperties,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

type Toast = {
  id: number;
  variant: ToastVariant;
  title?: string;
  message: string;
  duration: number;
};

type ToastContextValue = {
  show: (toast: Omit<Toast, "id" | "duration"> & { duration?: number }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const variantConfig: Record<
  ToastVariant,
  { color: string; bg: string; border: string; icon: ReactNode }
> = {
  success: {
    color: "#6EE7B7",
    bg: "rgba(34, 211, 160, 0.10)",
    border: "rgba(34, 211, 160, 0.4)",
    icon: <CheckCircle2 size={18} />,
  },
  error: {
    color: "#FCA5A5",
    bg: "rgba(239, 68, 68, 0.10)",
    border: "rgba(239, 68, 68, 0.4)",
    icon: <AlertCircle size={18} />,
  },
  warning: {
    color: "#FCD34D",
    bg: "rgba(245, 158, 11, 0.10)",
    border: "rgba(245, 158, 11, 0.4)",
    icon: <AlertTriangle size={18} />,
  },
  info: {
    color: "#7DD3FC",
    bg: "rgba(56, 189, 248, 0.10)",
    border: "rgba(56, 189, 248, 0.4)",
    icon: <Info size={18} />,
  },
};

const stackStyle: CSSProperties = {
  position: "fixed",
  bottom: 20,
  right: 20,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  zIndex: 9999,
  pointerEvents: "none",
  maxWidth: 380,
  width: "calc(100% - 40px)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastContextValue["show"]>(
    ({ variant, title, message, duration = 4000 }) => {
      idRef.current += 1;
      const id = idRef.current;
      setToasts((prev) => {
        const next = [...prev, { id, variant, title, message, duration }];
        return next.slice(-3);
      });
      window.setTimeout(() => remove(id), duration);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message, title) => show({ variant: "success", message, title }),
      error: (message, title) => show({ variant: "error", message, title }),
      warning: (message, title) => show({ variant: "warning", message, title }),
      info: (message, title) => show({ variant: "info", message, title }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={stackStyle} aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const config = variantConfig[toast.variant];
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setClosing(true), toast.duration - 220);
    return () => window.clearTimeout(t);
  }, [toast.duration]);

  return (
    <div
      style={{
        pointerEvents: "auto",
        background: "var(--surface)",
        border: `1px solid ${config.border}`,
        borderLeft: `3px solid ${config.color}`,
        borderRadius: 12,
        padding: "12px 14px 14px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        animation: closing
          ? "slideOutRight 220ms ease forwards"
          : "slideInRight 240ms cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards",
        position: "relative",
        overflow: "hidden",
        backgroundImage: `linear-gradient(90deg, ${config.bg}, transparent 60%)`,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ color: config.color, marginTop: 1 }}>{config.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {toast.title && (
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 2 }}>
              {toast.title}
            </div>
          )}
          <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.45, wordWrap: "break-word" }}>
            {toast.message}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 0,
            display: "inline-flex",
          }}
        >
          <X size={14} />
        </button>
      </div>
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: config.color,
          transformOrigin: "left",
          animation: `toastProgress ${toast.duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
