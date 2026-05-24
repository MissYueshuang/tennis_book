"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Settings, MessageSquare, RefreshCw, Plus, Trash2, Loader2 } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import ChatWindow from "@/components/ChatWindow";
import {
  getEtfProfile, saveEtfProfile,
  getEtfSuggestions, getEtfHoldings,
  addEtfTransaction, deleteEtfTransaction,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const PIE_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#84cc16",
  "#f97316", "#a78bfa", "#34d399", "#60a5fa",
];

const REGION_OPTIONS = ["US", "Europe", "Asia", "Global", "Emerging Markets"];
const SECTOR_OPTIONS = ["Tech", "Healthcare", "Energy", "Real Estate", "ESG", "All-Market"];
const HORIZON_OPTIONS = [5, 10, 15, 20, 30];

type Risk = "conservative" | "moderate" | "aggressive";

interface Profile {
  risk: Risk;
  expected_return: number;
  horizon_years: number;
  regions: string[];
  sectors: string[];
  num_etfs: number;
  include_bonds: boolean;
}

interface Suggestion {
  id: number;
  ticker: string;
  name: string;
  etf_type: string;
  weight: number;
  justification: string;
}

interface Holding {
  ticker: string;
  shares: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  pnl_pct: number;
}

const DEFAULT_PROFILE: Profile = {
  risk: "moderate",
  expected_return: 8,
  horizon_years: 10,
  regions: ["US"],
  sectors: ["All-Market"],
  num_etfs: 5,
  include_bonds: true,
};

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    equity: "bg-blue-500/20 text-blue-400",
    bond: "bg-yellow-500/20 text-yellow-400",
    commodity: "bg-orange-500/20 text-orange-400",
    cash: "bg-gray-500/20 text-gray-400",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", styles[type] ?? styles.cash)}>
      {type}
    </span>
  );
}

export default function EtfTab() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [addTxOpen, setAddTxOpen] = useState(false);
  const [txForm, setTxForm] = useState({ ticker: "", action: "buy", shares: "", price: "", date: new Date().toISOString().split("T")[0] });
  const [savingProfile, setSavingProfile] = useState(false);
  const [recordingAll, setRecordingAll] = useState(false);

  const loadAll = useCallback(async () => {
    const [p, s, h] = await Promise.all([
      getEtfProfile(),
      getEtfSuggestions(),
      getEtfHoldings(),
    ]);
    if (p && p.risk) {
      setProfile({
        risk: p.risk as Risk,
        expected_return: p.expected_return ?? 8,
        horizon_years: p.horizon_years ?? 10,
        regions: p.regions ?? ["US"],
        sectors: p.sectors ?? ["All-Market"],
        num_etfs: p.num_etfs ?? 5,
        include_bonds: p.include_bonds ?? true,
      });
    }
    setSuggestions(Array.isArray(s) ? s : []);
    setHoldings(Array.isArray(h) ? h : []);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      await saveEtfProfile(profile);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setStreamText("");
    try {
      await saveEtfProfile(profile);
      const resp = await fetch("/api/etf/suggest", { method: "POST" });
      if (!resp.body) return;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const chunk = line.slice(6);
            if (chunk === "[DONE]") break;
            setStreamText(prev => prev + chunk);
          }
        }
      }
      const s = await getEtfSuggestions();
      setSuggestions(Array.isArray(s) ? s : []);
    } finally {
      setGenerating(false);
      setStreamText("");
    }
  }

  async function handleRecordAll() {
    setRecordingAll(true);
    try {
      for (const s of suggestions) {
        let price = 100;
        try {
          const r = await fetch(`/api/market/quote/${s.ticker}`);
          if (r.ok) {
            const q = await r.json();
            price = q.price ?? 100;
          }
        } catch {}
        await addEtfTransaction({
          ticker: s.ticker,
          action: "buy",
          shares: 1,
          price,
          date: new Date().toISOString().split("T")[0],
        });
      }
      const h = await getEtfHoldings();
      setHoldings(Array.isArray(h) ? h : []);
    } finally {
      setRecordingAll(false);
    }
  }

  async function handleAddTx(e: React.FormEvent) {
    e.preventDefault();
    await addEtfTransaction({
      ticker: txForm.ticker,
      action: txForm.action,
      shares: parseFloat(txForm.shares),
      price: parseFloat(txForm.price),
      date: txForm.date,
    });
    setAddTxOpen(false);
    setTxForm({ ticker: "", action: "buy", shares: "", price: "", date: new Date().toISOString().split("T")[0] });
    const h = await getEtfHoldings();
    setHoldings(Array.isArray(h) ? h : []);
  }

  async function handleDeleteTx(holding: Holding) {
    // We don't have transaction IDs in holdings — find all transactions for this ticker and delete via a workaround
    // The holdings endpoint aggregates transactions, so we use a fresh transaction approach
    // For simplicity, we add a sell transaction to cancel the position
    await addEtfTransaction({
      ticker: holding.ticker,
      action: "sell",
      shares: holding.shares,
      price: holding.current_price,
      date: new Date().toISOString().split("T")[0],
    });
    const h = await getEtfHoldings();
    setHoldings(Array.isArray(h) ? h : []);
  }

  function toggleArrayItem(arr: string[], item: string): string[] {
    return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
  }

  const pieData = suggestions.map(s => ({ name: s.ticker, value: s.weight }));

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — ETF Advisor Chat */}
      <div className="w-[350px] shrink-0 p-2 flex flex-col">
        <div className="rounded-xl border border-border bg-card flex flex-col h-full overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
            <MessageSquare size={14} className="text-primary" />
            <span className="text-sm font-semibold">ETF Advisor</span>
          </div>
          <div className="flex-1 min-h-0">
            <ChatWindow onPortfolioChange={() => {}} />
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-4">

        {/* Section 1: Profile Config */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Settings size={14} className="text-primary" />
            <h2 className="text-sm font-semibold">Portfolio Configuration</h2>
          </div>

          <div className="space-y-4">
            {/* Risk */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Risk Tolerance</label>
              <div className="flex gap-2">
                {(["conservative", "moderate", "aggressive"] as Risk[]).map(r => (
                  <button
                    key={r}
                    onClick={() => setProfile(p => ({ ...p, risk: r }))}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors",
                      profile.risk === r
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Expected YoY Return */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                Expected YoY Return: <span className="text-foreground font-semibold">{profile.expected_return.toFixed(1)}%</span>
              </label>
              <input
                type="range" min="2" max="20" step="0.5"
                value={profile.expected_return}
                onChange={e => setProfile(p => ({ ...p, expected_return: parseFloat(e.target.value) }))}
                className="w-full accent-primary"
              />
            </div>

            {/* Horizon */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Investment Horizon</label>
              <select
                value={profile.horizon_years}
                onChange={e => setProfile(p => ({ ...p, horizon_years: parseInt(e.target.value) }))}
                className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
              >
                {HORIZON_OPTIONS.map(y => (
                  <option key={y} value={y}>{y} years</option>
                ))}
              </select>
            </div>

            {/* Regions */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Regions</label>
              <div className="grid grid-cols-3 gap-2">
                {REGION_OPTIONS.map(r => (
                  <label key={r} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={profile.regions.includes(r)}
                      onChange={() => setProfile(p => ({ ...p, regions: toggleArrayItem(p.regions, r) }))}
                      className="accent-primary"
                    />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            {/* Sectors */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Sectors</label>
              <div className="grid grid-cols-3 gap-2">
                {SECTOR_OPTIONS.map(s => (
                  <label key={s} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={profile.sectors.includes(s)}
                      onChange={() => setProfile(p => ({ ...p, sectors: toggleArrayItem(p.sectors, s) }))}
                      className="accent-primary"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            {/* Num ETFs */}
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Number of ETFs</label>
              <input
                type="number" min="3" max="15"
                value={profile.num_etfs}
                onChange={e => setProfile(p => ({ ...p, num_etfs: parseInt(e.target.value) || 5 }))}
                className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
              />
            </div>

            {/* Include Bonds */}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={profile.include_bonds}
                onChange={e => setProfile(p => ({ ...p, include_bonds: e.target.checked }))}
                className="accent-primary w-4 h-4"
              />
              Include Bonds
            </label>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex-1 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Suggestions"
                )}
              </button>
            </div>

            {generating && streamText && (
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground font-mono max-h-32 overflow-y-auto whitespace-pre-wrap">
                {streamText}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Suggested Portfolio */}
        {suggestions.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Suggested Allocation</h2>
              <button
                onClick={handleRecordAll}
                disabled={recordingAll}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
              >
                {recordingAll ? <Loader2 size={12} className="animate-spin" /> : null}
                Record All as Holdings
              </button>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" paddingAngle={2}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => `${v}%`}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>

            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-left px-2 py-2 font-medium">Ticker</th>
                    <th className="text-left px-2 py-2 font-medium">Name</th>
                    <th className="text-left px-2 py-2 font-medium">Type</th>
                    <th className="text-right px-2 py-2 font-medium">Weight</th>
                    <th className="text-left px-2 py-2 font-medium">Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s, i) => (
                    <tr key={s.id} className={cn("border-b border-border last:border-0", i % 2 !== 0 && "bg-muted/20")}>
                      <td className="px-2 py-2 font-bold">{s.ticker}</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{s.name}</td>
                      <td className="px-2 py-2"><TypeBadge type={s.etf_type} /></td>
                      <td className="px-2 py-2 text-right font-semibold">{s.weight}%</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground max-w-[200px]">
                        <span className="line-clamp-2">{s.justification}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 3: ETF Holdings */}
        {holdings.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">My ETF Holdings</h2>
              <button
                onClick={() => setAddTxOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors"
              >
                <Plus size={12} />
                Add Transaction
              </button>
            </div>

            {addTxOpen && (
              <form onSubmit={handleAddTx} className="rounded-lg bg-muted p-3 mb-4 grid grid-cols-2 gap-2">
                <input
                  placeholder="Ticker (e.g. VTI)"
                  value={txForm.ticker}
                  onChange={e => setTxForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  required
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm col-span-2"
                />
                <select
                  value={txForm.action}
                  onChange={e => setTxForm(f => ({ ...f, action: e.target.value }))}
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm"
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
                <input
                  type="number" placeholder="Shares" step="any" min="0.001"
                  value={txForm.shares}
                  onChange={e => setTxForm(f => ({ ...f, shares: e.target.value }))}
                  required
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm"
                />
                <input
                  type="number" placeholder="Price per share" step="any" min="0.01"
                  value={txForm.price}
                  onChange={e => setTxForm(f => ({ ...f, price: e.target.value }))}
                  required
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm"
                />
                <input
                  type="date"
                  value={txForm.date}
                  onChange={e => setTxForm(f => ({ ...f, date: e.target.value }))}
                  required
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm"
                />
                <div className="col-span-2 flex gap-2 pt-1">
                  <button type="submit" className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium">
                    Submit
                  </button>
                  <button type="button" onClick={() => setAddTxOpen(false)} className="flex-1 py-1.5 rounded border border-border text-xs font-medium">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-left px-2 py-2 font-medium">Ticker</th>
                    <th className="text-right px-2 py-2 font-medium">Shares</th>
                    <th className="text-right px-2 py-2 font-medium">Avg Cost</th>
                    <th className="text-right px-2 py-2 font-medium">Current</th>
                    <th className="text-right px-2 py-2 font-medium">Mkt Value</th>
                    <th className="text-right px-2 py-2 font-medium">P&L%</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => (
                    <tr key={h.ticker} className={cn("border-b border-border last:border-0", i % 2 !== 0 && "bg-muted/20")}>
                      <td className="px-2 py-2 font-bold">{h.ticker}</td>
                      <td className="px-2 py-2 text-right">{h.shares.toFixed(4)}</td>
                      <td className="px-2 py-2 text-right">${h.avg_cost.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">${h.current_price.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right font-medium">${h.market_value.toFixed(2)}</td>
                      <td className={cn("px-2 py-2 text-right text-xs font-semibold", h.pnl_pct >= 0 ? "text-green-400" : "text-red-400")}>
                        {h.pnl_pct >= 0 ? "+" : ""}{h.pnl_pct.toFixed(2)}%
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => handleDeleteTx(h)}
                          className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                          title="Close position"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty holdings state — show add button even when holdings empty */}
        {holdings.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">My ETF Holdings</h2>
              <button
                onClick={() => setAddTxOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors"
              >
                <Plus size={12} />
                Add Transaction
              </button>
            </div>

            {addTxOpen && (
              <form onSubmit={handleAddTx} className="rounded-lg bg-muted p-3 mb-4 grid grid-cols-2 gap-2">
                <input
                  placeholder="Ticker (e.g. VTI)"
                  value={txForm.ticker}
                  onChange={e => setTxForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  required
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm col-span-2"
                />
                <select
                  value={txForm.action}
                  onChange={e => setTxForm(f => ({ ...f, action: e.target.value }))}
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm"
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
                <input
                  type="number" placeholder="Shares" step="any" min="0.001"
                  value={txForm.shares}
                  onChange={e => setTxForm(f => ({ ...f, shares: e.target.value }))}
                  required
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm"
                />
                <input
                  type="number" placeholder="Price per share" step="any" min="0.01"
                  value={txForm.price}
                  onChange={e => setTxForm(f => ({ ...f, price: e.target.value }))}
                  required
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm"
                />
                <input
                  type="date"
                  value={txForm.date}
                  onChange={e => setTxForm(f => ({ ...f, date: e.target.value }))}
                  required
                  className="bg-background border border-border rounded px-2 py-1.5 text-sm"
                />
                <div className="col-span-2 flex gap-2 pt-1">
                  <button type="submit" className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium">
                    Submit
                  </button>
                  <button type="button" onClick={() => setAddTxOpen(false)} className="flex-1 py-1.5 rounded border border-border text-xs font-medium">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {!addTxOpen && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No holdings yet. Generate suggestions above or add a transaction manually.
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
