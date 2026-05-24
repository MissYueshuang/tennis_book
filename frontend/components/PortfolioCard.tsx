"use client";
import { useState } from "react";
import { TrendingUp, TrendingDown, Trash2, Edit2, Check, X } from "lucide-react";
import { type Holding, type Quote, updateHolding, removeHolding } from "@/lib/api";
import { cn, fmtCurrency, fmtPct } from "@/lib/utils";

interface Props {
  holding: Holding;
  quote?: Quote;
  signals?: { rsi: number; above_ma200: boolean | null; golden_cross: boolean | null };
  onMutate: () => void;
  onClick: () => void;
  selected: boolean;
}

export default function PortfolioCard({ holding, quote, signals, onMutate, onClick, selected }: Props) {
  const [editing, setEditing] = useState(false);
  const [shares, setShares] = useState(String(holding.shares));
  const [cost, setCost] = useState(String(holding.avg_cost));
  const [busy, setBusy] = useState(false);

  const price = quote?.price ?? holding.avg_cost;
  const marketValue = price * holding.shares;
  const costBasis = holding.avg_cost * holding.shares;
  const pnl = marketValue - costBasis;
  const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
  const up = pnl >= 0;

  async function save() {
    setBusy(true);
    await updateHolding(holding.ticker, {
      shares: parseFloat(shares),
      avg_cost: parseFloat(cost),
    });
    setBusy(false);
    setEditing(false);
    onMutate();
  }

  async function del() {
    if (!confirm(`Remove ${holding.ticker} from portfolio?`)) return;
    await removeHolding(holding.ticker);
    onMutate();
  }

  return (
    <div
      onClick={() => !editing && onClick()}
      className={cn(
        "relative rounded-xl border px-4 py-3 cursor-pointer transition-all",
        "bg-card hover:border-primary/50",
        selected ? "border-primary ring-1 ring-primary/30" : "border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-base font-bold tracking-tight">{holding.ticker}</span>
        <div className="flex gap-1 absolute top-2.5 right-2.5">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <Edit2 size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); del(); }}
            className="p-1 rounded hover:bg-red-500/15 text-muted-foreground hover:text-red-400"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Edit mode */}
      {editing ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Shares</label>
              <input
                className="w-full mt-0.5 px-2 py-1 rounded bg-input border border-border text-sm focus:outline-none focus:border-primary"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                type="number"
                step="0.001"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Avg Cost</label>
              <input
                className="w-full mt-0.5 px-2 py-1 rounded bg-input border border-border text-sm focus:outline-none focus:border-primary"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                type="number"
                step="0.01"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-primary text-primary-foreground text-sm font-medium"
            >
              <Check size={13} /> Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-muted text-muted-foreground text-sm"
            >
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Avg Cost</div>
              <div className="font-medium">{fmtCurrency(holding.avg_cost)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Mkt Value</div>
              <div className="font-medium">{fmtCurrency(marketValue)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Total P&L</div>
              <div className={cn("font-medium flex items-center gap-0.5 justify-end", up ? "text-green-400" : "text-red-400")}>
                {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {fmtPct(pnlPct)}
              </div>
            </div>
          </div>
          {signals && (
            <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-border/50">
              <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium",
                signals.rsi > 70 ? "bg-red-500/15 text-red-400" :
                signals.rsi < 30 ? "bg-green-500/15 text-green-400" :
                "bg-muted text-muted-foreground")}>
                RSI {signals.rsi}
              </span>
              {signals.above_ma200 !== null && (
                <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium",
                  signals.above_ma200 ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400")}>
                  {signals.above_ma200 ? "▲ 200MA" : "▼ 200MA"}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
