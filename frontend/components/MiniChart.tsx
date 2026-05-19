"use client";
import { useEffect, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { getHistory, type HistoryPoint } from "@/lib/api";

export default function MiniChart({ ticker, up }: { ticker: string; up: boolean }) {
  const [data, setData] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    getHistory(ticker, "1mo").then(setData).catch(() => {});
  }, [ticker]);

  if (!data.length) return null;

  const color = up ? "#4ade80" : "#f87171";

  return (
    <ResponsiveContainer width="100%" height={50}>
      <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <defs>
          <linearGradient id={`g-${ticker}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="text-xs bg-card border border-border px-2 py-1 rounded">
                ${payload[0].value}
              </div>
            ) : null
          }
        />
        <Area
          type="monotone"
          dataKey="close"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#g-${ticker})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
