"use client";
import { useState, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from "recharts";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import InfoTip from "@/components/InfoTip";
import ChatWindow from "@/components/ChatWindow";
import { cn } from "@/lib/utils";
import {
  getMacroScorecard, getMacroValuation, getMacroHistory,
  getMacroEconomic, getMacroSentiment,
} from "@/lib/macroApi";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScorecardData {
  vix?: { value: number; change_pct: number; trend_1m: number };
  yield_curve?: { value: number };
  t10y?: { value: number; change_pct: number; trend_1m: number };
  t2y?: { value: number; change_pct: number; trend_1m: number };
  dxy?: { value: number; change_pct: number; trend_1m: number };
  oil?: { value: number; change_pct: number; trend_1m: number };
}

interface ValuationData {
  cape?: number;
  cape_hist?: { date: string; value: number }[];
  spy_rsi?: number;
  spy_price?: number;
  spy_ma50?: number;
  spy_ma200?: number;
  spy_52wk_high?: number;
  spy_pct_from_high?: number;
  gold_silver_ratio?: number;
  gold?: number;
  silver?: number;
  gold_hist?: { date: string; value: number }[];
  t10y?: number;
  earnings_yield?: number;
}

interface HistoryData {
  current?: { vix: number; yc: number; cape: number };
  analog_count?: number;
  s3m?: { median: number; pct_pos: number; best: number; worst: number; n: number };
  s6m?: { median: number; pct_pos: number; best: number; worst: number; n: number };
  s12m?: { median: number; pct_pos: number; best: number; worst: number; n: number };
  top10?: Array<{
    date: string; vix: number; yc?: number; cape?: number;
    r3m?: number; r6m?: number; r12m?: number;
  }>;
  chart_lines?: Array<{ label: string; path: Array<{ m: number; v: number }> }>;
  cur_path?: Array<{ m: number; v: number }>;
}

interface EconomicData {
  fed_rate?: { current: number; hist: { date: string; value: number }[] } | { error: string };
  cpi?: { current: number; hist: { date: string; value: number }[] } | { error: string };
  unemp?: { current: number; hist: { date: string; value: number }[] } | { error: string };
  gdp?: { current: number; hist: { date: string; value: number }[] } | { error: string };
  payroll?: { current: number; hist: { date: string; value: number }[] } | { error: string };
  cons_sent?: { current: number; hist: { date: string; value: number }[] } | { error: string };
  infl_exp?: { current: number; hist: { date: string; value: number }[] } | { error: string };
  m2?: { current: number; hist: { date: string; value: number }[] } | { error: string };
}

interface SentimentData {
  composite?: {
    score: number;
    rating: string;
    components: { vix: number; momentum: number; breadth: number; safe_haven: number };
  } | { error: string };
  crypto_fg?: {
    current_score: number;
    current_rating: string;
    hist: { date: string; value: number }[];
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusDot({ color }: { color: "green" | "yellow" | "red" }) {
  return (
    <span className={cn("inline-block w-2 h-2 rounded-full",
      color === "green" ? "bg-green-400" :
      color === "yellow" ? "bg-yellow-400" : "bg-red-400"
    )} />
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

function SectionHeader({ title, tip }: { title: string; tip?: string }) {
  return (
    <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
      {title}
      {tip && <InfoTip text={tip} />}
    </h2>
  );
}

function hasError(obj: any): obj is { error: string } {
  return obj && typeof obj === "object" && "error" in obj;
}

function getEconValue(item: any): { current: number; hist: { date: string; value: number }[] } | null {
  if (!item || hasError(item)) return null;
  return item;
}

function directionArrow(current: number, prev: number | undefined) {
  if (prev === undefined) return <Minus size={12} className="text-muted-foreground" />;
  if (current > prev * 1.005) return <TrendingUp size={12} className="text-green-400" />;
  if (current < prev * 0.995) return <TrendingDown size={12} className="text-red-400" />;
  return <Minus size={12} className="text-muted-foreground" />;
}

const ANALOG_COLORS = [
  "#60a5fa", "#a78bfa", "#34d399", "#fbbf24", "#f87171",
];

// ── MacroTab Component ────────────────────────────────────────────────────────

const MACRO_SUGGESTIONS = [
  "What does the current CAPE ratio mean for returns?",
  "Is the yield curve signaling a recession?",
  "Which sectors do well when VIX is elevated?",
  "What historically happens after the Fed starts cutting?",
];

function MacroChatWrapper() {
  return (
    <div className="h-full">
      <ChatWindow
        onPortfolioChange={() => {}}
        suggestionsOverride={MACRO_SUGGESTIONS}
      />
    </div>
  );
}

// ── Section 1: Scorecard ─────────────────────────────────────────────────────

function ScorecardSection({ data, loading }: { data: ScorecardData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="mb-6">
        <SectionHeader title="Macro Health Scorecard" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (!data) return (
    <div className="mb-6">
      <SectionHeader title="Macro Health Scorecard" />
      <p className="text-sm text-muted-foreground">Data unavailable</p>
    </div>
  );

  const vix = data.vix;
  const yc = data.yield_curve;
  const dxy = data.dxy;
  const oil = data.oil;

  const vixStatus: "green" | "yellow" | "red" =
    !vix ? "yellow" :
    vix.value < 15 ? "green" :
    vix.value <= 25 ? "yellow" : "red";

  const vixLabel = !vix ? "—" : vix.value < 15 ? "Low Volatility" : vix.value <= 25 ? "Normal" : "Elevated Fear";

  const ycStatus: "green" | "yellow" | "red" =
    !yc ? "yellow" :
    yc.value < 0 ? "red" :
    yc.value < 0.5 ? "yellow" : "green";

  const ycLabel = !yc ? "—" : yc.value < 0 ? "Inverted" : yc.value < 0.5 ? "Flat" : "Normal";

  const dxyStatus: "green" | "yellow" | "red" =
    !dxy ? "yellow" :
    dxy.trend_1m < -1 ? "green" :
    dxy.trend_1m > 2 ? "red" : "yellow";

  const dxyLabel = !dxy ? "—" : dxy.trend_1m < -1 ? "Weakening" : dxy.trend_1m > 2 ? "Strengthening" : "Stable";

  const oilStatus: "green" | "yellow" | "red" =
    !oil ? "yellow" :
    oil.value < 70 ? "green" :
    oil.value <= 90 ? "yellow" : "red";

  const oilLabel = !oil ? "—" : oil.value < 70 ? "Benign" : oil.value <= 90 ? "Moderate" : "Elevated";

  const cards = [
    {
      title: "VIX",
      value: vix ? vix.value.toFixed(1) : "—",
      change: vix?.change_pct,
      status: vixStatus,
      label: vixLabel,
      tip: "The CBOE Volatility Index measures expected market turbulence. Below 15 = complacency; 15–25 = normal; above 25 = elevated fear. Historically, VIX spikes above 35 have marked excellent buying opportunities — panic usually peaks before the bottom.",
    },
    {
      title: "Yield Curve (10Y-2Y)",
      value: yc ? (yc.value >= 0 ? "+" : "") + yc.value.toFixed(2) + "%" : "—",
      change: undefined,
      status: ycStatus,
      label: ycLabel,
      tip: "The difference between 10-year and 2-year Treasury yields. When negative (inverted), short-term rates exceed long-term — banks compress margins and credit tightens. The yield curve has inverted before every US recession since 1955. A positive spread after inversion often signals recession is near.",
    },
    {
      title: "DXY (US Dollar)",
      value: dxy ? dxy.value.toFixed(1) : "—",
      change: dxy?.change_pct,
      status: dxyStatus,
      label: dxyLabel,
      tip: "A rising dollar makes US exports more expensive and reduces overseas earnings when repatriated. It also pressures commodities (priced in USD) and emerging markets. Falling dollar is generally a tailwind for equities and gold.",
    },
    {
      title: "Oil WTI",
      value: oil ? "$" + oil.value.toFixed(0) : "—",
      change: oil?.change_pct,
      status: oilStatus,
      label: oilLabel,
      tip: "Oil prices feed through to inflation via transportation and manufacturing costs. A spike above $100 has historically preceded economic slowdowns. Sharp drops signal demand weakness. Watch the rate of change more than the level.",
    },
  ];

  return (
    <div className="mb-6">
      <SectionHeader title="Macro Health Scorecard" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
            <div className="flex items-center text-xs text-muted-foreground">
              {c.title}
              <InfoTip text={c.tip} />
            </div>
            <div className="text-xl font-bold">{c.value}</div>
            <div className="flex items-center gap-1.5">
              <StatusDot color={c.status} />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
            {c.change !== undefined && (
              <span className={cn("text-xs font-medium",
                c.change >= 0 ? "text-green-400" : "text-red-400")}>
                {c.change >= 0 ? "+" : ""}{c.change.toFixed(2)}% today
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section 2: Valuation ──────────────────────────────────────────────────────

function ValuationSection({ data, loading }: { data: ValuationData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="mb-6">
        <SectionHeader title="Valuation Signals" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (!data) return (
    <div className="mb-6">
      <SectionHeader title="Valuation Signals" />
      <p className="text-sm text-muted-foreground">Data unavailable</p>
    </div>
  );

  const capeStatus: "green" | "yellow" | "red" =
    !data.cape ? "yellow" :
    data.cape < 20 ? "green" :
    data.cape < 30 ? "yellow" : "red";

  const capeLabel =
    !data.cape ? "—" :
    data.cape > 37 ? "Extremely Stretched" :
    data.cape > 30 ? "Expensive" :
    data.cape > 20 ? "Moderate" : "Cheap";

  const rsiStatus: "green" | "yellow" | "red" =
    !data.spy_rsi ? "yellow" :
    data.spy_rsi > 70 ? "red" :
    data.spy_rsi < 30 ? "green" : "yellow";

  const rsiLabel = !data.spy_rsi ? "—" :
    data.spy_rsi > 70 ? "Overbought" :
    data.spy_rsi < 30 ? "Oversold" : "Neutral";

  const gsStatus: "green" | "yellow" | "red" =
    !data.gold_silver_ratio ? "yellow" :
    data.gold_silver_ratio < 50 ? "green" :
    data.gold_silver_ratio <= 80 ? "yellow" : "red";

  const gsLabel = !data.gold_silver_ratio ? "—" :
    data.gold_silver_ratio < 50 ? "Risk-On" :
    data.gold_silver_ratio <= 80 ? "Neutral" : "Extreme Risk-Off";

  const bondsVsStocksStatus: "green" | "yellow" | "red" =
    data.t10y && data.earnings_yield
      ? data.t10y > data.earnings_yield ? "red" : "green"
      : "yellow";

  const ma200Status: "green" | "yellow" | "red" =
    data.spy_pct_from_high !== undefined
      ? data.spy_pct_from_high > -5 ? "green" : "red"
      : "yellow";

  const cards = [
    {
      title: "Shiller CAPE",
      value: data.cape ? data.cape.toFixed(1) : "—",
      status: capeStatus,
      label: capeLabel,
      tip: "Cyclically Adjusted P/E averages 10 years of inflation-adjusted earnings to smooth business cycles. Historical average ~17. Above 30 = expensive; above 37 = extremely stretched. CAPE is a poor short-term timer but strongly predicts low 10-year forward returns.",
    },
    {
      title: "SPY RSI (14d)",
      value: data.spy_rsi ? data.spy_rsi.toFixed(1) : "—",
      status: rsiStatus,
      label: rsiLabel,
      tip: "Relative Strength Index measures price momentum on 0–100 scale. Above 70 = overbought — the market may be due for a pullback. Below 30 = oversold — potential buying opportunity. In strong bull markets, RSI can stay >70 for months.",
    },
    {
      title: "Gold/Silver Ratio",
      value: data.gold_silver_ratio ? data.gold_silver_ratio.toFixed(1) : "—",
      status: gsStatus,
      label: gsLabel,
      tip: "How many ounces of silver to buy one ounce of gold. Above 80 = silver is historically cheap vs gold and the ratio tends to mean-revert — often preceding a risk-on environment. Below 50 = silver expensive, high risk appetite. The ratio peaked at 124 in March 2020 (COVID crash bottom).",
    },
    {
      title: "Bond vs Stock Yield",
      value: data.t10y && data.earnings_yield
        ? `Bonds ${data.t10y.toFixed(2)}% vs Stocks ${data.earnings_yield.toFixed(2)}%`
        : "—",
      status: bondsVsStocksStatus,
      label: bondsVsStocksStatus === "red" ? "Bonds Attractive" : "Stocks Attractive",
      tip: "Comparing the 10-year Treasury yield to the stock market's earnings yield (1/CAPE). When bonds yield more than stocks, they offer a competing return without equity risk — this weakens the 'TINA' (There Is No Alternative) argument for stocks.",
    },
    {
      title: "SPY vs 200-day MA",
      value: data.spy_pct_from_high !== undefined
        ? (data.spy_pct_from_high >= 0 ? "+" : "") + data.spy_pct_from_high.toFixed(1) + "% from 52wk high"
        : "—",
      status: ma200Status,
      label: data.spy_price && data.spy_ma200
        ? data.spy_price > data.spy_ma200 ? "Above 200MA" : "Below 200MA"
        : "—",
      tip: "The 200-day moving average is a key long-term trend indicator. The S&P 500 being above its 200-day MA signals an uptrend; below signals a downtrend. Market breadth (% of stocks above their 200-day MA) is an even better measure.",
    },
  ];

  return (
    <div className="mb-6">
      <SectionHeader title="Valuation Signals" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
            <div className="flex items-center text-xs text-muted-foreground">
              {c.title}
              <InfoTip text={c.tip} />
            </div>
            <div className="text-base font-bold leading-tight">{c.value}</div>
            <div className="flex items-center gap-1.5">
              <StatusDot color={c.status} />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* CAPE sparkline */}
      {data.cape_hist && data.cape_hist.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground mb-1">CAPE History (10 Years)</div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={data.cape_hist} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
              <defs>
                <linearGradient id="capeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke="#f59e0b" fill="url(#capeGrad)" strokeWidth={1.5} dot={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                formatter={(v: number) => [v.toFixed(1), "CAPE"]}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Section 3: History Patterns ───────────────────────────────────────────────

function HistorySection({ data, loading }: { data: HistoryData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="mb-6">
        <SectionHeader
          title="Learn from History"
          tip="Finds historical months where VIX, yield curve, and CAPE were similar to today, then shows what happened to the S&P 500 over the following 12 months. Analog lines show the median path — not a prediction, but a base-rate probability framework."
        />
        <div className="flex items-center justify-center h-40">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 size={16} className="animate-spin" />
            Computing historical analogs… (may take 20-30s)
          </div>
        </div>
      </div>
    );
  }

  if (!data) return (
    <div className="mb-6">
      <SectionHeader title="Learn from History" />
      <p className="text-sm text-muted-foreground">Data unavailable</p>
    </div>
  );

  // Build chart dataset combining cur_path (-12 to 0) and chart_lines (0 to 12)
  const chartMap: Record<number, Record<string, number>> = {};

  (data.cur_path || []).forEach(({ m, v }) => {
    if (!chartMap[m]) chartMap[m] = {};
    chartMap[m]["current"] = v;
  });

  (data.chart_lines || []).forEach(({ label, path }) => {
    path.forEach(({ m, v }) => {
      if (!chartMap[m]) chartMap[m] = {};
      chartMap[m][label] = v;
    });
  });

  const chartData = Object.entries(chartMap)
    .map(([m, vals]) => ({ m: Number(m), ...vals }))
    .sort((a, b) => a.m - b.m);

  const analogLabels = (data.chart_lines || []).map((l) => l.label);

  return (
    <div className="mb-6">
      <SectionHeader
        title="Learn from History"
        tip="Finds historical months where VIX, yield curve, and CAPE were similar to today, then shows what happened to the S&P 500 over the following 12 months. Analog lines show the median path — not a prediction, but a base-rate probability framework."
      />

      {/* Current conditions */}
      {data.current && (
        <div className="flex gap-2 mb-3 flex-wrap">
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
            VIX {data.current.vix}
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
            Yield Curve {data.current.yc >= 0 ? "+" : ""}{data.current.yc}%
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
            CAPE {data.current.cape}
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-blue-500/15 text-blue-400 font-medium">
            Found {data.analog_count} similar periods since 1993
          </span>
        </div>
      )}

      {/* Stat boxes */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {([["3M", data.s3m], ["6M", data.s6m], ["12M", data.s12m]] as const).map(([label, s]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Median {label} Return</div>
            {s && "median" in s ? (
              <>
                <div className={cn("text-lg font-bold", s.median >= 0 ? "text-green-400" : "text-red-400")}>
                  {s.median >= 0 ? "+" : ""}{s.median}%
                </div>
                <div className="text-xs text-muted-foreground">{s.pct_pos}% positive · n={s.n}</div>
              </>
            ) : (
              <div className="text-muted-foreground text-sm">—</div>
            )}
          </div>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3 mb-4">
          <div className="text-xs text-muted-foreground mb-2">SPY path: past 12 months → now → analog projections</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, bottom: 5, left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis
                dataKey="m"
                domain={[-12, 12]}
                type="number"
                tickCount={7}
                tickFormatter={(v) => v === 0 ? "Now" : v === -12 ? "-12M" : v === 12 ? "+12M" : `${v > 0 ? "+" : ""}${v}M`}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                width={40}
              />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name === "current" ? "Now" : name]}
              />
              <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" opacity={0.7} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              {analogLabels.map((label, i) => (
                <Line
                  key={label}
                  type="monotone"
                  dataKey={label}
                  stroke={ANALOG_COLORS[i % ANALOG_COLORS.length]}
                  strokeWidth={1.5}
                  dot={false}
                  opacity={0.7}
                />
              ))}
              <Line
                type="monotone"
                dataKey="current"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={false}
                name="Now"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top analog table */}
      {data.top10 && data.top10.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Date</th>
                <th className="text-right px-3 py-2 font-medium">VIX</th>
                <th className="text-right px-3 py-2 font-medium">YC</th>
                <th className="text-right px-3 py-2 font-medium">CAPE</th>
                <th className="text-right px-3 py-2 font-medium">3M</th>
                <th className="text-right px-3 py-2 font-medium">6M</th>
                <th className="text-right px-3 py-2 font-medium">12M</th>
              </tr>
            </thead>
            <tbody>
              {data.top10.slice(0, 5).map((a, i) => (
                <tr key={a.date} className={cn("border-b border-border last:border-0", i % 2 !== 0 && "bg-muted/20")}>
                  <td className="px-3 py-2 font-medium">{a.date}</td>
                  <td className="px-3 py-2 text-right">{a.vix}</td>
                  <td className="px-3 py-2 text-right">{a.yc ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{a.cape ?? "—"}</td>
                  {(["r3m", "r6m", "r12m"] as const).map((k) => (
                    <td key={k} className={cn("px-3 py-2 text-right font-medium",
                      a[k] === undefined ? "text-muted-foreground" :
                      a[k]! >= 0 ? "text-green-400" : "text-red-400")}>
                      {a[k] !== undefined ? `${a[k]! >= 0 ? "+" : ""}${a[k]}%` : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Section 4: Economic ───────────────────────────────────────────────────────

function EconCard({
  title, tip, data, format,
}: {
  title: string;
  tip: string;
  data: { current: number; hist: { date: string; value: number }[] } | null;
  format: (v: number) => string;
}) {
  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center text-xs text-muted-foreground mb-2">
          {title}<InfoTip text={tip} />
        </div>
        <div className="text-sm text-muted-foreground">Data unavailable</div>
      </div>
    );
  }

  const prev3m = data.hist[3]?.value;
  const chartData = [...data.hist].reverse();

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center text-xs text-muted-foreground mb-1">
        {title}<InfoTip text={tip} />
      </div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-base font-bold">{format(data.current)}</span>
        {directionArrow(data.current, prev3m)}
      </div>
      {chartData.length > 1 && (
        <ResponsiveContainer width="100%" height={60}>
          <AreaChart data={chartData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
            <defs>
              <linearGradient id={`econ-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke="#3b82f6" fill={`url(#econ-${title})`} strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function EconomicSection({ data, loading }: { data: EconomicData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="mb-6">
        <SectionHeader title="US Macro / Economic Indicators" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (!data) return (
    <div className="mb-6">
      <SectionHeader title="US Macro / Economic Indicators" />
      <p className="text-sm text-muted-foreground">Data unavailable</p>
    </div>
  );

  const indicators: {
    title: string; tip: string;
    data: { current: number; hist: { date: string; value: number }[] } | null;
    format: (v: number) => string;
  }[] = [
    {
      title: "Fed Funds Rate",
      tip: "The Fed's benchmark rate. Rising = tighter credit, headwind for growth stocks and housing. Cutting = stimulative. The pace of change matters more than the level — a Fed 'pause' after hiking is often bullish.",
      data: getEconValue(data.fed_rate),
      format: (v) => v.toFixed(2) + "%",
    },
    {
      title: "CPI Inflation",
      tip: "Consumer Price Index YoY change. Fed's target is 2%. Above target forces the Fed to keep rates higher for longer. The 2022-23 surge to 9% drove the fastest rate-hiking cycle in 40 years. Trend matters: peaking CPI is often bullish even if still above target.",
      data: getEconValue(data.cpi),
      format: (v) => v.toFixed(1) + "%",
    },
    {
      title: "Unemployment",
      tip: "A rising unemployment rate signals economic slowdown and prompts Fed rate cuts. The 'Sahm Rule' says a recession has started when the 3-month average unemployment rate rises 0.5pp above its prior 12-month low.",
      data: getEconValue(data.unemp),
      format: (v) => v.toFixed(1) + "%",
    },
    {
      title: "Real GDP Growth",
      tip: "Quarterly annualized real GDP growth. Two consecutive negative quarters = technical recession. 'Goldilocks' growth of 2-3% supports corporate earnings without overheating. GDP data lags by ~1 quarter.",
      data: getEconValue(data.gdp),
      format: (v) => v.toFixed(1) + "%",
    },
    {
      title: "Nonfarm Payrolls",
      tip: "Monthly jobs added. Below 100k = weak labor market. 150-250k = healthy. Above 300k = very hot — the Fed may need to keep hiking to cool wage inflation. Watch the 3-month trend.",
      data: getEconValue(data.payroll),
      format: (v) => (v / 1000).toFixed(0) + "k jobs",
    },
    {
      title: "M2 Money Supply",
      tip: "Total broad money supply. Rapid M2 growth (2020-21 +25%) created excess liquidity that flowed into risk assets and drove inflation. M2 contraction (2022-23) was historically rare and presaged tighter conditions. Rising M2 generally supports asset prices long-term.",
      data: getEconValue(data.m2),
      format: (v) => "$" + (v / 1000).toFixed(1) + "T",
    },
  ];

  return (
    <div className="mb-6">
      <SectionHeader title="US Macro / Economic Indicators" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {indicators.map((ind) => (
          <EconCard key={ind.title} {...ind} />
        ))}
      </div>
    </div>
  );
}

// ── Section 5: Sentiment ──────────────────────────────────────────────────────

function SentimentGauge({ score, rating }: { score: number; rating: string }) {
  const pct = Math.max(0, Math.min(100, score));
  const ratingColor =
    rating === "Extreme Fear" ? "text-red-500" :
    rating === "Fear" ? "text-red-400" :
    rating === "Neutral" ? "text-yellow-400" :
    rating === "Greed" ? "text-green-400" : "text-green-500";

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold">{score.toFixed(0)}</span>
        <span className={cn("text-sm font-semibold", ratingColor)}>{rating}</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden"
        style={{ background: "linear-gradient(to right, #ef4444 0%, #f59e0b 50%, #22c55e 100%)" }}>
        <div
          className="absolute top-0 w-3 h-3 rounded-full bg-white border-2 border-background shadow"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Extreme Fear</span>
        <span>Neutral</span>
        <span>Extreme Greed</span>
      </div>
    </div>
  );
}

function MiniBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value.toFixed(0)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(to right, #ef4444, #f59e0b, #22c55e)`,
          }}
        />
      </div>
    </div>
  );
}

function SentimentSection({
  sentData, econData, sentLoading, econLoading,
}: {
  sentData: SentimentData | null;
  econData: EconomicData | null;
  sentLoading: boolean;
  econLoading: boolean;
}) {
  if (sentLoading && econLoading) {
    return (
      <div className="mb-6">
        <SectionHeader title="Market Sentiment" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-48" />
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
      </div>
    );
  }

  const composite = sentData?.composite && !hasError(sentData.composite) ? sentData.composite : null;
  const cryptoFg = sentData?.crypto_fg ?? null;
  const consSent = getEconValue(econData?.cons_sent ?? null);
  const inflExp = getEconValue(econData?.infl_exp ?? null);

  return (
    <div className="mb-6">
      <SectionHeader title="Market Sentiment" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Composite Fear/Greed */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center text-sm font-medium">
            Composite Fear/Greed
            <InfoTip text="Composite 0-100 score built from VIX level (35%), price momentum/RSI (30%), distance from 52-week high (20%), and gold vs equities relative performance (15%). 0=extreme fear, 100=extreme greed. Historically, buying at extreme fear and selling at extreme greed has been profitable — it's a contrarian indicator." />
          </div>
          {composite ? (
            <>
              <SentimentGauge score={composite.score} rating={composite.rating} />
              <div className="space-y-2 pt-2">
                <MiniBar label="VIX" value={composite.components.vix} />
                <MiniBar label="Momentum" value={composite.components.momentum} />
                <MiniBar label="Breadth" value={composite.components.breadth} />
                <MiniBar label="Safe Haven" value={composite.components.safe_haven} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {sentLoading ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              {sentLoading ? "Loading…" : "Data unavailable"}
            </p>
          )}
        </div>

        {/* Right: Consumer Sentiment, Inflation Expectations, Crypto F&G */}
        <div className="space-y-3">
          {/* Consumer Sentiment */}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center text-xs text-muted-foreground mb-1">
              Consumer Sentiment
              <InfoTip text="University of Michigan monthly survey. Consumers feel most pessimistic near market bottoms — low sentiment often signals a buying opportunity. Sentiment hit a 70-year low in June 2022, which was near the S&P 500 bear market bottom." />
            </div>
            {econLoading ? (
              <Skeleton className="h-14" />
            ) : consSent ? (
              <div className="flex items-center gap-4">
                <span className="text-xl font-bold">{consSent.current.toFixed(1)}</span>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height={40}>
                    <AreaChart data={[...consSent.hist].reverse()} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                      <defs>
                        <linearGradient id="csGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#csGrad)" strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Data unavailable</p>
            )}
          </div>

          {/* Inflation Expectations */}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center text-xs text-muted-foreground mb-1">
              Inflation Expectations 1Y
              <InfoTip text="What consumers expect inflation to be 1 year ahead. If expectations de-anchor upward, the Fed must act aggressively to prevent a wage-price spiral. Stable or falling expectations give the Fed room to cut." />
            </div>
            {econLoading ? (
              <Skeleton className="h-14" />
            ) : inflExp ? (
              <div className="flex items-center gap-4">
                <span className="text-xl font-bold">{inflExp.current.toFixed(1)}%</span>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height={40}>
                    <AreaChart data={[...inflExp.hist].reverse()} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                      <defs>
                        <linearGradient id="ieGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke="#f59e0b" fill="url(#ieGrad)" strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Data unavailable</p>
            )}
          </div>

          {/* Crypto Fear & Greed */}
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center text-xs text-muted-foreground mb-1">
              Crypto Fear & Greed
              <InfoTip text="Alternative.me's crypto sentiment index. While crypto-specific, extreme crypto fear often coincides with broader risk-off sentiment. Note: crypto and equity markets have become more correlated since 2020." />
            </div>
            {sentLoading ? (
              <Skeleton className="h-10" />
            ) : cryptoFg ? (
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold">{cryptoFg.current_score}</span>
                <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
                  cryptoFg.current_score < 25 ? "bg-red-500/15 text-red-400" :
                  cryptoFg.current_score < 45 ? "bg-orange-500/15 text-orange-400" :
                  cryptoFg.current_score < 55 ? "bg-yellow-500/15 text-yellow-400" :
                  cryptoFg.current_score < 75 ? "bg-green-500/15 text-green-400" : "bg-emerald-500/15 text-emerald-400"
                )}>
                  {cryptoFg.current_rating}
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Data unavailable</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main MacroTab ─────────────────────────────────────────────────────────────

export default function MacroTab() {
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [valuation, setValuation] = useState<ValuationData | null>(null);
  const [history, setHistory]     = useState<HistoryData | null>(null);
  const [economic, setEconomic]   = useState<EconomicData | null>(null);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);

  const [loadingSc, setLoadingSc]   = useState(true);
  const [loadingVal, setLoadingVal] = useState(true);
  const [loadingHist, setLoadingHist] = useState(true);
  const [loadingEcon, setLoadingEcon] = useState(true);
  const [loadingSent, setLoadingSent] = useState(true);

  useEffect(() => {
    // Fetch scorecard + valuation in parallel
    Promise.all([
      getMacroScorecard().then(setScorecard).catch(() => setScorecard(null)),
      getMacroValuation().then(setValuation).catch(() => setValuation(null)),
    ]).finally(() => { setLoadingSc(false); setLoadingVal(false); });

    // Economic independently
    getMacroEconomic()
      .then(setEconomic)
      .catch(() => setEconomic(null))
      .finally(() => setLoadingEcon(false));

    // Sentiment independently
    getMacroSentiment()
      .then(setSentiment)
      .catch(() => setSentiment(null))
      .finally(() => setLoadingSent(false));

    // History independently (slowest)
    getMacroHistory()
      .then(setHistory)
      .catch(() => setHistory(null))
      .finally(() => setLoadingHist(false));
  }, []);

  return (
    <div className="flex h-full min-h-0">
      {/* Left: scrollable content */}
      <div className="flex-[65] min-w-0 overflow-y-auto p-4">
        <ScorecardSection data={scorecard} loading={loadingSc} />
        <ValuationSection data={valuation} loading={loadingVal} />
        <HistorySection data={history} loading={loadingHist} />
        <EconomicSection data={economic} loading={loadingEcon} />
        <SentimentSection
          sentData={sentiment}
          econData={economic}
          sentLoading={loadingSent}
          econLoading={loadingEcon}
        />
      </div>

      {/* Right: ChatWindow with macro suggestions */}
      <div className="flex-[35] min-w-0 border-l border-border p-2">
        <MacroChatWrapper />
      </div>
    </div>
  );
}
