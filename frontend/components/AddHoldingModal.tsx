"use client";
import { useState } from "react";
import { X, Plus } from "lucide-react";
import { addHolding } from "@/lib/api";

export default function AddHoldingModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!ticker || !shares || !cost) { setError("All fields required"); return; }
    const s = parseFloat(shares), c = parseFloat(cost);
    if (isNaN(s) || s <= 0) { setError("Shares must be a positive number"); return; }
    if (isNaN(c) || c <= 0) { setError("Cost must be a positive number"); return; }
    setBusy(true);
    try {
      await addHolding(ticker.trim().toUpperCase(), s, c);
      onAdded();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add holding";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Add Holding</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground font-medium">Ticker Symbol</label>
            <input
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-input text-sm focus:outline-none focus:border-primary uppercase"
              placeholder="e.g. AAPL"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              maxLength={10}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground font-medium">Shares</label>
              <input
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-input text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. 10"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                type="number"
                step="0.001"
                min="0"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground font-medium">Avg Cost (USD)</label>
              <input
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-input text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. 150.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                type="number"
                step="0.01"
                min="0"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm disabled:opacity-50"
          >
            <Plus size={15} />
            {busy ? "Adding…" : "Add to Portfolio"}
          </button>
        </form>
      </div>
    </div>
  );
}
