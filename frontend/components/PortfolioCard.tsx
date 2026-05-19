"use client";
import { useState } from "react";
import { TrendingUp, TrendingDown, Trash2, Edit2, Check, X } from "lucide-react";
import { type Holding, type Quote, updateHolding, removeHolding } from "@/lib/api";
import { cn, fmtCurrency, fmtPct, fmtCompact } from "@/lib/utils";
import MiniChart from "./MiniChart";

interface Props {
  holding: Holding;
  quote?: Quote;
  onMutate: () => void;
  onClick: () => void;
  selected: boolean;
}

export default function PortfolioCard({ holding, quote, onMutate, onClick, selected }: Props) {
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
  const dayUp = (quote?.change ?? 0) >= 0;

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
        "relative rounded-xl border p-4 cursor-pointer transition-all",
        "bg-card hover:border-primary/50",
        selected ? "border-primary ring-1 ring-primary/30" : "border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight">{holding.ticker}</span>
            {quote && (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded font-medium",
                  dayUp ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                )}
              >
                {fmtPct(quote.change_pct)}
              </span>
            )}
          </div>
          <div className="text-2xl font-semibold mt-0.5">{fmtCurrency(price)}</div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); del(); }}
            className="p-1.5 rounded-lg hover:bg-red-500/15 text-muted-foreground hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <div className="flex gap-1 absolute top-3 right-3">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); del(); }}
            className="p-1.5 rounded-lg hover:bg-red-500/15 text-muted-foreground hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Edit mode */}
      {editing ? (
        <div className="space-y-2 mt-2" onClick={(e) => e.stopPropagation()}>
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
          <div className="text-xs text-muted-foreground mb-2">
            {holding.shares} shares · avg {fmtCurrency(holding.avg_cost)}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Market Value</div>
              <div className="font-semibold">{fmtCurrency(marketValue)}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Total P&L</div>
              <div className={cn("font-semibold flex items-center gap-1 justify-end", up ? "text-green-400" : "text-red-400")}>
                {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {fmtCurrency(Math.abs(pnl))} ({fmtPct(pnlPct)})
              </div>
            </div>
          </div>
          {quote?.volume && (
            <div className="mt-2 text-xs text-muted-foreground">
              Vol: {fmtCompact(quote.volume)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
