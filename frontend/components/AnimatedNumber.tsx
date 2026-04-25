"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  style?: CSSProperties;
  format?: (n: number) => string;
};

export default function AnimatedNumber({
  value,
  decimals = 0,
  duration = 900,
  prefix = "",
  suffix = "",
  style,
  format,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = display;
    startTimeRef.current = null;

    const tick = (ts: number) => {
      if (startTimeRef.current === null) startTimeRef.current = ts;
      const elapsed = ts - startTimeRef.current;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      }
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const text = format
    ? format(display)
    : `${prefix}${display.toFixed(decimals)}${suffix}`;

  return <span style={style}>{text}</span>;
}
