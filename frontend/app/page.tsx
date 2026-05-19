"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw, TrendingUp, TrendingDown, DollarSign, BarChart2 } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

import { getHoldings, getBulkQuotes, type Holding, type Quote } from "@/lib/api";
import { cn, fmtCurrency, fmtPct, fmtCompact } from "@/lib/utils";
import PortfolioCard from "@/components/PortfolioCard";
import StockDetail from "@/components/StockDetail";
import ChatWindow from "@/components/ChatWindow";
import AddHoldingModal from "@/components/AddHoldingModal";

const COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#84cc16",
];

export default function Home() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = await getHoldings();
      setHoldings(h);
      if (h.length > 0) {
        const tickers = h.map((x) => x.ticker);
        const qs = await getBulkQuotes(tickers);
        const qmap: Record<string, Quote> = {};
        qs.forEach((q) => { qmap[q.ticker] = q; });
        setQuotes(qmap);
      }
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Summary stats
  const totalCost = holdings.reduce((s, h) => s + h.avg_cost * h.shares, 0);
  const totalValue = holdings.reduce((s, h) => {
    const price = quotes[h.ticker]?.price ?? h.avg_cost;
    return s + price * h.shares;
  }, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const dayChange = holdings.reduce((s, h) => {
    const q = quotes[h.ticker];
    return s + (q ? q.change * h.shares : 0);
  }, 0);

  const selectedHolding = holdings.find((h) => h.ticker === selected);
  const selectedQuote = selected ? quotes[selected] : undefined;

  // Pie chart data
  const pieData = holdings.map((h) => ({
    name: h.ticker,
    value: (quotes[h.ticker]?.price ?? h.avg_cost) * h.shares,
  }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart2 size={20} className="text-primary" />
          <h1 className="text-lg font-bold tracking-tight">Portfolio Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={load}
            className={cn("p-1.5 rounded-lg hover:bg-accent text-muted-foreground", loading && "animate-spin")}
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus size={14} /> Add Stock
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-53px)]">
        {/* Left panel: holdings list */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col">
          {/* Summary strip */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-muted-foreground">Total Value</div>
                <div className="text-2xl font-bold">{fmtCurrency(totalValue)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Total P&L</div>
                <div className={cn("text-lg font-semibold", totalPnl >= 0 ? "text-green-400" : "text-red-400")}>
                  {fmtPct(totalPnlPct)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat
                icon={<DollarSign size={12} />}
                label="Day Change"
                value={fmtCurrency(Math.abs(dayChange))}
                sub={dayChange >= 0 ? "▲" : "▼"}
                up={dayChange >= 0}
              />
              <Stat
                icon={<TrendingUp size={12} />}
                label="Cost Basis"
                value={fmtCurrency(totalCost)}
              />
            </div>
          </div>

          {/* Holdings scroll list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {holdings.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No holdings yet. Add your first stock!
              </p>
            )}
            {holdings.map((h) => (
              <PortfolioCard
                key={h.ticker}
                holding={h}
                quote={quotes[h.ticker]}
                onMutate={load}
                onClick={() => setSelected(selected === h.ticker ? null : h.ticker)}
                selected={selected === h.ticker}
              />
            ))}
          </div>
        </div>

        {/* Center: detail or allocation */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-w-0">
          {selectedHolding ? (
            <StockDetail
              ticker={selectedHolding.ticker}
              up={(selectedQuote?.change ?? 0) >= 0}
            />
          ) : (
            <div className="space-y-4">
              {/* Allocation pie */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h2 className="font-semibold mb-4">Portfolio Allocation</h2>
                {pieData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add holdings to see allocation.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => fmtCurrency(v)}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend
                        formatter={(value) => (
                          <span className="text-xs text-muted-foreground">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Holdings table */}
              {holdings.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left px-4 py-3 font-medium">Ticker</th>
                        <th className="text-right px-4 py-3 font-medium">Price</th>
                        <th className="text-right px-4 py-3 font-medium">Day</th>
                        <th className="text-right px-4 py-3 font-medium">Shares</th>
                        <th className="text-right px-4 py-3 font-medium">Value</th>
                        <th className="text-right px-4 py-3 font-medium">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h, i) => {
                        const q = quotes[h.ticker];
                        const price = q?.price ?? h.avg_cost;
                        const value = price * h.shares;
                        const pnl = value - h.avg_cost * h.shares;
                        const pnlPct = h.avg_cost > 0 ? (pnl / (h.avg_cost * h.shares)) * 100 : 0;
                        const up = pnl >= 0;
                        return (
                          <tr
                            key={h.ticker}
                            className={cn(
                              "border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer transition-colors",
                              i % 2 === 0 ? "" : "bg-muted/20"
                            )}
                            onClick={() => setSelected(h.ticker)}
                          >
                            <td className="px-4 py-3 font-semibold">{h.ticker}</td>
                            <td className="px-4 py-3 text-right">{fmtCurrency(price)}</td>
                            <td className={cn("px-4 py-3 text-right text-xs", (q?.change ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                              {q ? fmtPct(q.change_pct) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{h.shares}</td>
                            <td className="px-4 py-3 text-right font-medium">{fmtCurrency(value)}</td>
                            <td className={cn("px-4 py-3 text-right text-xs font-medium", up ? "text-green-400" : "text-red-400")}>
                              {fmtPct(pnlPct)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel: chat */}
        <div className="w-80 shrink-0 border-l border-border p-3">
          <ChatWindow onPortfolioChange={load} />
        </div>
      </div>

      {showAdd && (
        <AddHoldingModal onClose={() => setShowAdd(false)} onAdded={load} />
      )}
    </div>
  );
}

function Stat({
  icon, label, value, sub, up,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  up?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
        {icon}
        {label}
      </div>
      <div className="font-semibold text-sm">
        {sub && (
          <span className={cn("mr-1 text-xs", up ? "text-green-400" : "text-red-400")}>{sub}</span>
        )}
        {value}
      </div>
    </div>
  );
}
