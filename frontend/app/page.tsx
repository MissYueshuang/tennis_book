"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Plus, RefreshCw, BarChart2, LayoutGrid, TrendingUp, DollarSign } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

import { getHoldings, getBulkQuotes, type Holding, type Quote } from "@/lib/api";
import { getBulkSignals } from "@/lib/macroApi";
import { cn, fmtCurrency, fmtPct } from "@/lib/utils";
import Widget from "@/components/Widget";
import PortfolioCard from "@/components/PortfolioCard";
import StockDetail from "@/components/StockDetail";
import ChatWindow from "@/components/ChatWindow";
import AddHoldingModal from "@/components/AddHoldingModal";
import MacroTab from "@/components/MacroTab";

const COLORS = ["#3b82f6","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#84cc16"];
const LS_SIZES  = "portfolio-sizes-v1";
const LS_ORDER  = "portfolio-order-v1";
const DEFAULT_SIZES: number[] = [22, 45, 33];
const DEFAULT_ORDER = ["portfolio", "view", "chat"];

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export default function Home() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes,   setQuotes]   = useState<Record<string, Quote>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd,  setShowAdd]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"portfolio" | "macro">("portfolio");
  const [signals, setSignals] = useState<Record<string, any>>({});

  // Panel sizes (percentages) and widget order (for swap)
  const [sizes, setSizes]   = useState<number[]>(DEFAULT_SIZES);
  const [order, setOrder]   = useState<string[]>(DEFAULT_ORDER);
  const [mounted, setMounted] = useState(false);

  // Drag-to-swap state
  const dragging = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  useEffect(() => {
    setSizes(load(LS_SIZES, DEFAULT_SIZES));
    setOrder(load(LS_ORDER, DEFAULT_ORDER));
    setMounted(true);
  }, []);

  const load_ = useCallback(async () => {
    setLoading(true);
    try {
      const h = await getHoldings();
      setHoldings(h);
      if (h.length > 0) {
        const qs = await getBulkQuotes(h.map((x) => x.ticker));
        const qmap: Record<string, Quote> = {};
        qs.forEach((q) => { qmap[q.ticker] = q; });
        setQuotes(qmap);
        const sigs = await getBulkSignals(h.map(x => x.ticker));
        const smap: Record<string, any> = {};
        sigs.forEach((s: any) => { if (s.ticker) smap[s.ticker] = s; });
        setSignals(smap);
      }
      setLastRefresh(new Date());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load_(); }, [load_]);
  useEffect(() => { const id = setInterval(load_, 60_000); return () => clearInterval(id); }, [load_]);

  function onSizesChange(layout: Record<string, number>) {
    // layout is { widgetId: percentage } — convert to ordered array matching current `order`
    const newSizes = order.map((id) => layout[id] ?? 33);
    setSizes(newSizes);
    localStorage.setItem(LS_SIZES, JSON.stringify(newSizes));
  }

  function resetLayout() {
    setSizes(DEFAULT_SIZES);
    setOrder(DEFAULT_ORDER);
    localStorage.removeItem(LS_SIZES);
    localStorage.removeItem(LS_ORDER);
  }

  function onDragStart(id: string) { dragging.current = id; }
  function onDragOver(id: string)  { setDragOver(id); }
  function onDrop(targetId: string) {
    const srcId = dragging.current;
    if (!srcId || srcId === targetId) { setDragOver(null); return; }
    setOrder((prev) => {
      const next = [...prev];
      const a = next.indexOf(srcId);
      const b = next.indexOf(targetId);
      [next[a], next[b]] = [next[b], next[a]];
      localStorage.setItem(LS_ORDER, JSON.stringify(next));
      return next;
    });
    dragging.current = null;
    setDragOver(null);
  }

  const totalCost   = holdings.reduce((s, h) => s + h.avg_cost * h.shares, 0);
  const totalValue  = holdings.reduce((s, h) => s + (quotes[h.ticker]?.price ?? h.avg_cost) * h.shares, 0);
  const totalPnl    = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const dayChange   = holdings.reduce((s, h) => s + (quotes[h.ticker]?.change ?? 0) * h.shares, 0);
  const selectedHolding = holdings.find((h) => h.ticker === selected);
  const selectedQuote   = selected ? quotes[selected] : undefined;
  const pieData = holdings.map((h) => ({
    name: h.ticker,
    value: (quotes[h.ticker]?.price ?? h.avg_cost) * h.shares,
  }));

  const sharedWidgetProps = { onDragStart, onDragOver, onDrop };

  // ── Widget render map ──────────────────────────────────────────────────────
  function renderWidget(id: string) {
    const isDragOver = dragOver === id;

    if (id === "portfolio") return (
      <Widget id="portfolio" title="Portfolio" icon={<DollarSign size={14} />}
        isDragOver={isDragOver} {...sharedWidgetProps}
        controls={
          <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded",
            totalPnl >= 0 ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10")}>
            {fmtPct(totalPnlPct)}
          </span>
        }
      >
        <div className="flex flex-col h-full">
          <div className="px-3 py-2.5 border-b border-border shrink-0 space-y-1.5">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs text-muted-foreground">Total Value</div>
                <div className="text-xl font-bold">{fmtCurrency(totalValue)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Day Change</div>
                <div className={cn("text-sm font-semibold", dayChange >= 0 ? "text-green-400" : "text-red-400")}>
                  {dayChange >= 0 ? "+" : ""}{fmtCurrency(Math.abs(dayChange))}
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground flex gap-2">
              <span>Cost {fmtCurrency(totalCost)}</span>
              <span>·</span>
              <span className={totalPnl >= 0 ? "text-green-400" : "text-red-400"}>
                P&L {totalPnl >= 0 ? "+" : ""}{fmtCurrency(Math.abs(totalPnl))}
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {holdings.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-6">No holdings. Add your first stock!</p>
            )}
            {holdings.map((h) => (
              <PortfolioCard key={h.ticker} holding={h} quote={quotes[h.ticker]} signals={signals[h.ticker]} onMutate={load_}
                onClick={() => setSelected(selected === h.ticker ? null : h.ticker)}
                selected={selected === h.ticker} />
            ))}
          </div>
        </div>
      </Widget>
    );

    if (id === "view") return (
      <Widget id="view" title={selectedHolding ? selectedHolding.ticker : "Allocation"}
        icon={<TrendingUp size={14} />} isDragOver={isDragOver} {...sharedWidgetProps}
        controls={selectedHolding && (
          <button onClick={() => setSelected(null)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-accent transition-colors">
            ← All
          </button>
        )}
      >
        <div className="h-full overflow-y-auto p-3">
          {selectedHolding ? (
            <StockDetail ticker={selectedHolding.ticker} up={(selectedQuote?.change ?? 0) >= 0} />
          ) : (
            <div className="space-y-4">
              {pieData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Add holdings to see allocation.</p>
              ) : (
                <div className="rounded-xl border border-border bg-card/50 p-3">
                  <h3 className="text-sm font-semibold mb-2">Allocation by Market Value</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2} dataKey="value">
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtCurrency(v)}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                      <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              {holdings.length > 0 && (
                <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left px-3 py-2.5 font-medium">Ticker</th>
                        <th className="text-right px-3 py-2.5 font-medium">Price</th>
                        <th className="text-right px-3 py-2.5 font-medium">Day</th>
                        <th className="text-right px-3 py-2.5 font-medium">Value</th>
                        <th className="text-right px-3 py-2.5 font-medium">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h, i) => {
                        const q = quotes[h.ticker];
                        const price = q?.price ?? h.avg_cost;
                        const value = price * h.shares;
                        const pnlPct = h.avg_cost > 0 ? ((price - h.avg_cost) / h.avg_cost) * 100 : 0;
                        return (
                          <tr key={h.ticker} onClick={() => setSelected(h.ticker)}
                            className={cn("border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer transition-colors", i % 2 !== 0 && "bg-muted/20")}>
                            <td className="px-3 py-2.5 font-semibold">{h.ticker}</td>
                            <td className="px-3 py-2.5 text-right">{fmtCurrency(price)}</td>
                            <td className={cn("px-3 py-2.5 text-right text-xs", (q?.change ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                              {q ? fmtPct(q.change_pct) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium">{fmtCurrency(value)}</td>
                            <td className={cn("px-3 py-2.5 text-right text-xs font-medium", pnlPct >= 0 ? "text-green-400" : "text-red-400")}>
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
      </Widget>
    );

    if (id === "chat") return (
      <Widget id="chat" title="" slim isDragOver={isDragOver} {...sharedWidgetProps}>
        <ChatWindow onPortfolioChange={load_} />
      </Widget>
    );

    return null;
  }

  if (!mounted) return null;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <header className="border-b border-border px-4 py-2.5 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          <BarChart2 size={18} className="text-primary" />
          <h1 className="text-base font-bold tracking-tight">Portfolio Dashboard</h1>
          <span className="text-xs text-muted-foreground hidden sm:block">
            · {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(["portfolio","macro"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn("px-3 py-1 rounded-md text-sm font-medium transition-colors",
                activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {tab === "portfolio" ? "Portfolio" : "Market Signals"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetLayout} title="Reset layout"
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <LayoutGrid size={15} />
          </button>
          <button onClick={load_}
            className={cn("p-1.5 rounded-lg hover:bg-accent text-muted-foreground", loading && "animate-spin")}>
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            <Plus size={14} /> Add Stock
          </button>
        </div>
      </header>

      {/* Panel canvas — fills remaining height */}
      {activeTab === "portfolio" ? (
      <div className="flex-1 min-h-0 p-2">
        <PanelGroup
          orientation="horizontal"
          onLayoutChanged={onSizesChange}
          defaultLayout={Object.fromEntries(order.map((id, i) => [id, sizes[i] ?? DEFAULT_SIZES[i] ?? 33]))}
          className="h-full"
        >
          {order.map((widgetId, idx) => (
            <>
              <Panel
                key={widgetId}
                id={widgetId}
                defaultSize={sizes[idx] ?? DEFAULT_SIZES[idx] ?? 33}
                minSize={15}
                className="min-w-0"
              >
                <div className="h-full p-1">
                  {renderWidget(widgetId)}
                </div>
              </Panel>
              {idx < order.length - 1 && (
                <PanelResizeHandle
                  key={`handle-${idx}`}
                  className="group relative w-2 flex items-center justify-center"
                >
                  <div className="w-px h-full bg-border group-hover:bg-primary/60 transition-colors duration-150" />
                  <div className="absolute w-1 h-8 rounded-full bg-border group-hover:bg-primary/60 transition-colors duration-150" />
                </PanelResizeHandle>
              )}
            </>
          ))}
        </PanelGroup>
      </div>

      ) : (
        <div className="flex-1 min-h-0">
          <MacroTab />
        </div>
      )}

      {showAdd && <AddHoldingModal onClose={() => setShowAdd(false)} onAdded={load_} />}
    </div>
  );
}
