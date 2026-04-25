"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type BiasBarChartProps = {
  data: Array<{ group: string; value: number }>;
  threshold: number;
};

export default function BiasBarChart({ data, threshold }: BiasBarChartProps) {
  return (
    <div style={{ width: "100%", height: 320, background: "#fff", borderRadius: 10, padding: 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="group" />
          <YAxis domain={[0, 1]} />
          <Tooltip />
          <ReferenceLine y={threshold} stroke="red" strokeDasharray="5 5" />
          <Bar dataKey="value" fill="#2563eb" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
