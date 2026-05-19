"use client";
import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { getHistory, getNews, type HistoryPoint, type NewsArticle } from "@/lib/api";
import { fmtCurrency } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

const PERIODS = ["1d", "5d", "1mo", "3mo", "6mo", "1y"] as const;
type Period = typeof PERIODS[number];

export default function StockDetail({ ticker, up }: { ticker: string; up: boolean }) {
  const [period, setPeriod] = useState<Period>("1mo");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getHistory(ticker, period), getNews(ticker, 4)])
      .then(([h, n]) => { setHistory(h); setNews(n); })
      .finally(() => setLoading(false));
  }, [ticker, period]);

  const color = up ? "#4ade80" : "#f87171";

  return (
    <div className="flex flex-col gap-4">
      {/* Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{ticker} Chart</h3>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={192}>
            <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`detail-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
                width={54}
              />
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="bg-card border border-border rounded px-3 py-2 text-xs">
                      <div className="text-muted-foreground">{label}</div>
                      <div className="font-semibold">{fmtCurrency(payload[0].value as number)}</div>
                    </div>
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={color}
                strokeWidth={2}
                fill={`url(#detail-${ticker})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* News */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold mb-3">Latest News</h3>
        {news.length === 0 ? (
          <p className="text-sm text-muted-foreground">No news available.</p>
        ) : (
          <ul className="space-y-3">
            {news.map((a, i) => (
              <li key={i} className="border-b border-border last:border-0 pb-3 last:pb-0">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:text-primary flex items-start gap-1"
                >
                  {a.title}
                  <ExternalLink size={11} className="mt-0.5 shrink-0 text-muted-foreground" />
                </a>
                {a.summary && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
                )}
                <div className="text-xs text-muted-foreground mt-1">
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
