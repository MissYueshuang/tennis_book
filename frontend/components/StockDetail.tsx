"use client";
import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart, Area, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ReferenceLine, ReferenceArea,
} from "recharts";
import { getHistory, getNews, getTrendPrediction, type HistoryPoint, type NewsArticle, type TrendPrediction } from "@/lib/api";
import { fmtCurrency } from "@/lib/utils";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import InfoTip from "@/components/InfoTip";

const PERIODS = ["1d", "5d", "1mo", "3mo", "6mo", "1y"] as const;
type Period = typeof PERIODS[number];

// ── Compute SMA ───────────────────────────────────────────────────────────────
function sma(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const s = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    return Math.round((s / period) * 100) / 100;
  });
}

// ── Compute EMA ───────────────────────────────────────────────────────────────
function ema(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(data.length).fill(null);
  if (data.length < period) return result;
  const k = 2 / (period + 1);
  result[period - 1] = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    result[i] = data[i] * k + (result[i - 1] as number) * (1 - k);
  }
  return result.map((v) => (v !== null ? Math.round(v * 100) / 100 : null));
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

// ── Custom price tooltip ──────────────────────────────────────────────────────
function PriceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-xl text-gray-800">
      <div className="text-gray-500 mb-1">{label}</div>
      {payload.map((p: any) => (
        p.value != null && (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-gray-600 capitalize">{p.name}:</span>
            <span className="font-semibold">
              {p.name === "Volume"
                ? Number(p.value) >= 1e6 ? `${(Number(p.value) / 1e6).toFixed(1)}M` : `${(Number(p.value) / 1e3).toFixed(0)}K`
                : fmtCurrency(p.value)}
            </span>
          </div>
        )
      ))}
    </div>
  );
}

// ── Prediction arrow badge ────────────────────────────────────────────────────
function PredictionBadge({ pred }: { pred: TrendPrediction }) {
  const isUp = pred.direction === "up";
  const isDown = pred.direction === "down";
  const color = isUp ? "text-green-400" : isDown ? "text-red-400" : "text-yellow-400";
  const bg = isUp ? "bg-green-400/10 border-green-400/30" : isDown ? "bg-red-400/10 border-red-400/30" : "bg-yellow-400/10 border-yellow-400/30";
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const label = isUp ? "Bullish 10d" : isDown ? "Bearish 10d" : "Neutral 10d";

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-semibold ${color} ${bg}`}>
      <Icon size={13} />
      <span>{label}</span>
      <span className="text-xs opacity-70 font-normal">({pred.confidence}%)</span>
      <InfoTip text={pred.reason} />
    </div>
  );
}

export default function StockDetail({ ticker, up }: { ticker: string; up: boolean }) {
  const [period, setPeriod] = useState<Period>("3mo");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [news, setNews]       = useState<NewsArticle[]>([]);
  const [pred, setPred]       = useState<TrendPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [predLoading, setPredLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getHistory(ticker, period), getNews(ticker, 4)])
      .then(([h, n]) => { setHistory(h); setNews(n); })
      .finally(() => setLoading(false));
  }, [ticker, period]);

  // Fetch prediction independently (cached 24h, can be slow first time)
  useEffect(() => {
    setPred(null);
    setPredLoading(true);
    getTrendPrediction(ticker)
      .then(setPred)
      .catch(() => {})
      .finally(() => setPredLoading(false));
  }, [ticker]);

  const color = up ? "#4ade80" : "#f87171";

  // Enrich data with MA, EMA, MACD, RSI
  const enriched = useMemo(() => {
    if (!history.length) return [];
    const closes  = history.map(p => p.close);

    const ma20    = sma(closes, 20);
    const ma50    = sma(closes, 50);
    const rsiVals = rsi(closes, 14);

    // MACD
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macdLine = closes.map((_, i) =>
      ema12[i] != null && ema26[i] != null ? Math.round((ema12[i]! - ema26[i]!) * 10000) / 10000 : null
    );
    const macdNonNull = macdLine.filter((v): v is number => v !== null);
    const signalRaw = ema(macdNonNull, 9);
    // Re-align signal to full length
    let sigIdx = 0;
    const signalLine = macdLine.map((v) => {
      if (v === null) return null;
      const s = signalRaw[sigIdx++] ?? null;
      return s;
    });
    const histogram = macdLine.map((m, i) =>
      m != null && signalLine[i] != null ? Math.round((m - signalLine[i]!) * 10000) / 10000 : null
    );

    return history.map((p, i) => ({
      ...p,
      ma20:  ma20[i],
      ma50:  ma50[i],
      rsi:   rsiVals[i],
      macd:  macdLine[i],
      signal: signalLine[i],
      hist:  histogram[i],
    }));
  }, [history]);

  const rsiColor = (v: number | null) =>
    v == null ? "#9ca3af" : v >= 70 ? "#ef4444" : v <= 30 ? "#22c55e" : "#3b82f6";

  if (loading) return (
    <div className="flex flex-col gap-4">
      {[220, 120, 110].map((h) => (
        <div key={h} className="rounded-xl border border-border bg-card animate-pulse" style={{ height: h }} />
      ))}
    </div>
  );

  const latestRsi = enriched.length ? enriched[enriched.length - 1].rsi : null;

  // Volume Y-axis scale — show bars in bottom 30% of price chart
  const maxVol = Math.max(...enriched.map(d => d.volume ?? 0));
  const prices  = enriched.map(d => d.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  // Scale volume so its max = 30% of price range, offset at minPrice
  const volScale = (v: number) => minPrice + (v / maxVol) * priceRange * 0.28;

  return (
    <div className="flex flex-col gap-3">

      {/* ── Period selector + prediction badge ── */}
      <div className="flex items-center justify-between">
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
        {predLoading && (
          <span className="text-xs text-muted-foreground animate-pulse">Analysing…</span>
        )}
        {pred && !predLoading && <PredictionBadge pred={pred} />}
      </div>

      {/* ── Combined Price + MA + Volume chart ── */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground">Price · Moving Averages · Volume</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-400 inline-block rounded" />MA20</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-400 inline-block rounded" />MA50</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm opacity-40" style={{ background: color }} />Vol</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
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
            {/* Left Y-axis: price */}
            <YAxis yAxisId="price" domain={["auto", "auto"]}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} width={50} />
            {/* Volume bars scaled to sit in bottom 28% via custom accessor */}
            <Bar yAxisId="price" dataKey={(d) => d.volume != null ? volScale(d.volume) : null}
              name="Volume" fill={color} opacity={0.25} radius={[1, 1, 0, 0]}
              isAnimationActive={false} />
            <Area yAxisId="price" type="monotone" dataKey="close" name="Price"
              stroke={color} strokeWidth={2} fill={`url(#priceGrad-${ticker})`} dot={false} />
            <Line yAxisId="price" type="monotone" dataKey="ma20" name="MA20"
              stroke="#facc14" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
            <Line yAxisId="price" type="monotone" dataKey="ma50" name="MA50"
              stroke="#a78bfa" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
            <Tooltip content={<PriceTooltip />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── MACD chart ── */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-foreground">MACD (12, 26, 9)</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block rounded" />MACD</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block rounded" />Signal</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart data={enriched} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false} axisLine={false} width={38}
              tickFormatter={(v) => v.toFixed(1)} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
            {/* Histogram bars */}
            <Bar dataKey="hist" name="Histogram"
              fill="#3b82f6" opacity={0.7} radius={[1, 1, 0, 0]}
              isAnimationActive={false}
              label={false}
              /* green if positive, red if negative */
              shape={(props: any) => {
                const { x, y, width, height, value } = props;
                const fill = value >= 0 ? "#22c55e" : "#ef4444";
                const absH = Math.abs(height);
                const top = value >= 0 ? y : y + height;
                return <rect x={x} y={top} width={width} height={absH} fill={fill} opacity={0.65} rx={1} />;
              }}
            />
            <Line type="monotone" dataKey="macd" name="MACD"
              stroke="#60a5fa" strokeWidth={1.5} dot={false} connectNulls />
            <Line type="monotone" dataKey="signal" name="Signal"
              stroke="#fb923c" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="3 2" />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="bg-white border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-800 shadow-lg">
                    <div className="text-gray-500 mb-1">{label}</div>
                    {payload.map((p: any) => p.value != null && (
                      <div key={p.name} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
                        <span className="text-gray-500">{p.name}:</span>
                        <span className="font-semibold">{Number(p.value).toFixed(3)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/30 inline-block" />Histogram above 0 = bullish momentum</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/30 inline-block" />Below 0 = bearish momentum</span>
        </div>
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
            <ReferenceArea y1={0}  y2={30}  fill="#22c55e" fillOpacity={0.08} />
            <ReferenceArea y1={70} y2={100} fill="#ef4444" fillOpacity={0.08} />
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
