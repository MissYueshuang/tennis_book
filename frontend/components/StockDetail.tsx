"use client";
import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart, AreaChart, Area, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ReferenceLine, ReferenceArea,
} from "recharts";
import { getHistory, getNews, type HistoryPoint, type NewsArticle } from "@/lib/api";
import { fmtCurrency } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

const PERIODS = ["1d", "5d", "1mo", "3mo", "6mo", "1y"] as const;
type Period = typeof PERIODS[number];

// ── Compute MA ────────────────────────────────────────────────────────────────
function sma(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const s = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    return Math.round((s / period) * 100) / 100;
  });
}

// ── Compute RSI ───────────────────────────────────────────────────────────────
function rsi(data: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period + 1) return result;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const d = data[i] - data[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < data.length; i++) {
    if (avgLoss === 0) { result[i] = 100; continue; }
    const rs = avgGain / avgLoss;
    result[i] = Math.round((100 - 100 / (1 + rs)) * 10) / 10;
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  return result;
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function PriceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-xl text-gray-800">
      <div className="text-gray-500 mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-600 capitalize">{p.name}:</span>
          <span className="font-semibold">{fmtCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function StockDetail({ ticker, up }: { ticker: string; up: boolean }) {
  const [period, setPeriod] = useState<Period>("3mo");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [news, setNews]       = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getHistory(ticker, period), getNews(ticker, 4)])
      .then(([h, n]) => { setHistory(h); setNews(n); })
      .finally(() => setLoading(false));
  }, [ticker, period]);

  const color = up ? "#4ade80" : "#f87171";

  // Enrich data with MA + RSI
  const enriched = useMemo(() => {
    if (!history.length) return [];
    const closes  = history.map(p => p.close);
    const ma20    = sma(closes, 20);
    const ma50    = sma(closes, 50);
    const rsiVals = rsi(closes, 14);

    return history.map((p, i) => ({
      ...p,
      ma20:  ma20[i],
      ma50:  ma50[i],
      rsi:   rsiVals[i],
    }));
  }, [history]);

  const rsiColor = (v: number | null) =>
    v == null ? "#9ca3af" : v >= 70 ? "#ef4444" : v <= 30 ? "#22c55e" : "#3b82f6";

  if (loading) return (
    <div className="flex flex-col gap-4">
      {[192, 80, 120].map((h) => (
        <div key={h} className="rounded-xl border border-border bg-card animate-pulse" style={{ height: h }} />
      ))}
    </div>
  );

  const latestRsi = enriched.length ? enriched[enriched.length - 1].rsi : null;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Period selector ── */}
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {p}
          </button>
        ))}
      </div>

      {/* ── Price + MA chart ── */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground">Price + Moving Averages</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-400 inline-block rounded" />MA20</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-400 inline-block rounded" />MA50</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={enriched} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`priceGrad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={50} />
            <Tooltip content={<PriceTooltip />} />
            <Area type="monotone" dataKey="close" name="Price"
              stroke={color} strokeWidth={2} fill={`url(#priceGrad-${ticker})`} dot={false} />
            <Line type="monotone" dataKey="ma20" name="MA20"
              stroke="#facc14" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
            <Line type="monotone" dataKey="ma50" name="MA50"
              stroke="#a78bfa" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Volume chart ── */}
      <div className="rounded-xl border border-border bg-card p-3">
        <span className="text-xs font-semibold text-foreground">Volume</span>
        <ResponsiveContainer width="100%" height={70}>
          <ComposedChart data={enriched} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tick={false} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false} axisLine={false}
              tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${(v / 1e3).toFixed(0)}K`}
              width={42} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="bg-white border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 shadow-lg">
                    <div className="text-gray-500">{label}</div>
                    <div className="font-semibold">{Number(payload[0].value).toLocaleString()}</div>
                  </div>
                ) : null}
            />
            <Bar dataKey="volume" name="Volume"
              fill={color} opacity={0.65} radius={[2, 2, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── RSI chart ── */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-foreground">RSI (14)</span>
          {latestRsi !== null && (
            <span className="text-xs font-bold" style={{ color: rsiColor(latestRsi) }}>
              {latestRsi?.toFixed(1)}
              {latestRsi >= 70 ? " — Overbought" : latestRsi <= 30 ? " — Oversold" : " — Neutral"}
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart data={enriched} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false} axisLine={false} width={28} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="bg-white border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 shadow-lg">
                    <div className="text-gray-500">{label}</div>
                    <div className="font-semibold">RSI: {Number(payload[0].value).toFixed(1)}</div>
                  </div>
                ) : null}
            />
            {/* Buy / Sell zones */}
            <ReferenceArea y1={0}  y2={30}  fill="#22c55e" fillOpacity={0.08} />
            <ReferenceArea y1={70} y2={100} fill="#ef4444" fillOpacity={0.08} />
            {/* Horizontal reference lines */}
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1}
              label={{ value: "Sell (70)", position: "insideTopRight", fontSize: 9, fill: "#ef4444" }} />
            <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="4 3" strokeWidth={1}
              label={{ value: "Buy (30)", position: "insideBottomRight", fontSize: 9, fill: "#22c55e" }} />
            <ReferenceLine y={50} stroke="#9ca3af" strokeDasharray="2 4" strokeWidth={1} />
            <Line type="monotone" dataKey="rsi" name="RSI"
              stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/20 inline-block" />Below 30 = Oversold (buy signal)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/20 inline-block" />Above 70 = Overbought (sell signal)</span>
        </div>
      </div>

      {/* ── News ── */}
      <div className="rounded-xl border border-border bg-card p-3">
        <h3 className="text-xs font-semibold mb-3">Latest News</h3>
        {news.length === 0 ? (
          <p className="text-xs text-muted-foreground">No news available.</p>
        ) : (
          <ul className="space-y-2.5">
            {news.map((a, i) => (
              <li key={i} className="border-b border-border last:border-0 pb-2.5 last:pb-0">
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium hover:text-primary flex items-start gap-1">
                  {a.title}
                  <ExternalLink size={10} className="mt-0.5 shrink-0 text-muted-foreground" />
                </a>
                {a.summary && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
                )}
                <div className="text-xs text-muted-foreground mt-0.5">
                  {a.source} · {a.published_at ? new Date(a.published_at).toLocaleDateString() : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}
