"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Settings, MessageSquare, Plus, Trash2, Loader2, BarChart2 } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import ChatWindow from "@/components/ChatWindow";
import {
  getEtfProfile, saveEtfProfile,
  getEtfSuggestions, getEtfHoldings,
  addEtfTransaction,
} from "@/lib/api";
import { cn, fmtCurrency, fmtPct } from "@/lib/utils";

const PIE_COLORS = [
  "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#84cc16",
  "#f97316", "#a78bfa", "#34d399", "#60a5fa",
  "#e879f9", "#2dd4bf",
];

const TYPE_COLORS: Record<string, string> = {
  equity:    "#3b82f6",
  bond:      "#f59e0b",
  commodity: "#f97316",
  cash:      "#9ca3af",
};

const REGION_OPTIONS = ["US", "Europe", "Asia", "Global", "Emerging Markets"];
const SECTOR_OPTIONS = ["Tech", "Healthcare", "Energy", "Real Estate", "ESG", "All-Market"];
const HORIZON_OPTIONS = [5, 10, 15, 20, 30];

const LS_ETF_SIZES = "etf-panel-sizes-v1";

function loadSizes(def: number[]): number[] {
  try {
    const v = localStorage.getItem(LS_ETF_SIZES);
    return v ? JSON.parse(v) : def;
  } catch { return def; }
}

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
  num_etfs: 6,
  include_bonds: true,
};

// ── TypeBadge ─────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    equity:    "bg-blue-500/20 text-blue-400",
    bond:      "bg-yellow-500/20 text-yellow-400",
    commodity: "bg-orange-500/20 text-orange-400",
    cash:      "bg-gray-500/20 text-gray-400",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium capitalize", styles[type] ?? styles.cash)}>
      {type}
    </span>
  );
}

// ── Dual pie chart section ────────────────────────────────────────────────────
function DualPieCharts({
  suggestions,
  holdings,
}: {
  suggestions: Suggestion[];
  holdings: Holding[];
}) {
  const suggestPie = suggestions.map((s, i) => ({
    name: s.ticker,
    value: s.weight,
    fill: PIE_COLORS[i % PIE_COLORS.length],
    type: s.etf_type,
  }));

  const totalMktValue = holdings.reduce((s, h) => s + h.market_value, 0);
  const holdingsPie = holdings.map((h, i) => ({
    name: h.ticker,
    value: totalMktValue > 0 ? Math.round((h.market_value / totalMktValue) * 1000) / 10 : 0,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <BarChart2 size={14} className="text-primary" />
        Allocation Comparison
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {/* Suggested */}
        <div>
          <div className="text-xs text-muted-foreground text-center mb-1 font-medium">
            Suggested Target
            {suggestions.length === 0 && (
              <span className="ml-1 text-muted-foreground/50">(generate to see)</span>
            )}
          </div>
          {suggestions.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={suggestPie} cx="50%" cy="50%"
                  innerRadius={45} outerRadius={75}
                  paddingAngle={2} dataKey="value"
                >
                  {suggestPie.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, name: string) => [`${v}%`, name]}
                  contentStyle={tooltipStyle}
                />
                <Legend
                  formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-xs text-muted-foreground">
              No suggestions yet
            </div>
          )}
        </div>

        {/* Current Holdings */}
        <div>
          <div className="text-xs text-muted-foreground text-center mb-1 font-medium">
            Current Holdings
            {holdings.length === 0 && (
              <span className="ml-1 text-muted-foreground/50">(no positions yet)</span>
            )}
          </div>
          {holdings.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={holdingsPie} cx="50%" cy="50%"
                  innerRadius={45} outerRadius={75}
                  paddingAngle={2} dataKey="value"
                >
                  {holdingsPie.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number, name: string) => [`${v}%`, name]}
                  contentStyle={tooltipStyle}
                />
                <Legend
                  formatter={(v) => <span className="text-xs text-muted-foreground">{v}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-xs text-muted-foreground">
              No positions yet
            </div>
          )}
        </div>
      </div>

      {/* Type breakdown legend */}
      {suggestions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-3">
          {Object.entries(
            suggestions.reduce((acc, s) => {
              acc[s.etf_type] = (acc[s.etf_type] ?? 0) + s.weight;
              return acc;
            }, {} as Record<string, number>)
          ).map(([type, weight]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[type] ?? "#9ca3af" }} />
              <span className="capitalize text-muted-foreground">{type}</span>
              <span className="font-semibold">{weight}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Transaction form (shared between holdings=empty and holdings table) ───────
function TransactionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (form: { ticker: string; action: string; shares: string; price: string; date: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    ticker: "", action: "buy", shares: "", price: "",
    date: new Date().toISOString().split("T")[0],
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
      className="rounded-lg bg-muted p-3 mb-4 grid grid-cols-2 gap-2"
    >
      <input
        placeholder="Ticker (e.g. VTI)"
        value={form.ticker}
        onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
        required
        className="bg-background border border-border rounded px-2 py-1.5 text-sm col-span-2"
      />
      <select
        value={form.action}
        onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
        className="bg-background border border-border rounded px-2 py-1.5 text-sm"
      >
        <option value="buy">Buy</option>
        <option value="sell">Sell</option>
      </select>
      <input
        type="number" placeholder="Shares" step="any" min="0.001"
        value={form.shares}
        onChange={e => setForm(f => ({ ...f, shares: e.target.value }))}
        required
        className="bg-background border border-border rounded px-2 py-1.5 text-sm"
      />
      <input
        type="number" placeholder="Price / share" step="any" min="0.01"
        value={form.price}
        onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
        required
        className="bg-background border border-border rounded px-2 py-1.5 text-sm"
      />
      <input
        type="date"
        value={form.date}
        onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
        required
        className="bg-background border border-border rounded px-2 py-1.5 text-sm"
      />
      <div className="col-span-2 flex gap-2 pt-1">
        <button type="submit" className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium">
          Submit
        </button>
        <button type="button" onClick={onCancel} className="flex-1 py-1.5 rounded border border-border text-xs font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EtfTab() {
  const [mounted, setMounted] = useState(false);
  const [sizes, setSizes] = useState([25, 30, 45]);

  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [addTxOpen, setAddTxOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [recordingAll, setRecordingAll] = useState(false);

  useEffect(() => {
    setSizes(loadSizes([25, 30, 45]));
    setMounted(true);
  }, []);

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
        regions: Array.isArray(p.regions) ? p.regions : ["US"],
        sectors: Array.isArray(p.sectors) ? p.sectors : ["All-Market"],
        num_etfs: p.num_etfs ?? 6,
        include_bonds: p.include_bonds ?? true,
      });
    }
    setSuggestions(Array.isArray(s) ? s : []);
    setHoldings(Array.isArray(h) ? h : []);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  function onSizesChange(layout: Record<string, number>) {
    const newSizes = ["chat", "config", "view"].map((id) => layout[id] ?? 33);
    setSizes(newSizes);
    localStorage.setItem(LS_ETF_SIZES, JSON.stringify(newSizes));
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    try { await saveEtfProfile(profile); }
    finally { setSavingProfile(false); }
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
          if (r.ok) { const q = await r.json(); price = q.price ?? 100; }
        } catch {}
        await addEtfTransaction({
          ticker: s.ticker, action: "buy", shares: 1, price,
          date: new Date().toISOString().split("T")[0],
        });
      }
      const h = await getEtfHoldings();
      setHoldings(Array.isArray(h) ? h : []);
    } finally {
      setRecordingAll(false);
    }
  }

  async function handleAddTx(form: { ticker: string; action: string; shares: string; price: string; date: string }) {
    await addEtfTransaction({
      ticker: form.ticker, action: form.action,
      shares: parseFloat(form.shares), price: parseFloat(form.price), date: form.date,
    });
    setAddTxOpen(false);
    const h = await getEtfHoldings();
    setHoldings(Array.isArray(h) ? h : []);
  }

  async function handleClosePosition(holding: Holding) {
    await addEtfTransaction({
      ticker: holding.ticker, action: "sell",
      shares: holding.shares, price: holding.current_price,
      date: new Date().toISOString().split("T")[0],
    });
    const h = await getEtfHoldings();
    setHoldings(Array.isArray(h) ? h : []);
  }

  function toggleArr(arr: string[], item: string) {
    return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
  }

  if (!mounted) return null;

  const totalMktValue = holdings.reduce((s, h) => s + h.market_value, 0);

  return (
    <div className="h-full p-2">
      <PanelGroup
        orientation="horizontal"
        onLayoutChanged={onSizesChange}
        defaultLayout={{ chat: sizes[0], config: sizes[1], view: sizes[2] }}
        className="h-full"
      >
        {/* ── Panel 1: ETF Advisor Chat ── */}
        <Panel id="chat" defaultSize={sizes[0]} minSize={15} className="min-w-0">
          <div className="h-full p-1">
            <div className="rounded-xl border border-border bg-card flex flex-col h-full overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 shrink-0">
                <MessageSquare size={14} className="text-primary" />
                <span className="text-sm font-semibold">ETF Advisor</span>
              </div>
              <div className="flex-1 min-h-0">
                <ChatWindow onPortfolioChange={() => {}} />
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="group relative w-2 flex items-center justify-center">
          <div className="w-px h-full bg-border group-hover:bg-primary/60 transition-colors duration-150" />
          <div className="absolute w-1 h-8 rounded-full bg-border group-hover:bg-primary/60 transition-colors duration-150" />
        </PanelResizeHandle>

        {/* ── Panel 2: Portfolio Configuration ── */}
        <Panel id="config" defaultSize={sizes[1]} minSize={20} className="min-w-0">
          <div className="h-full p-1 overflow-y-auto">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <Settings size={14} className="text-primary" />
                <h2 className="text-sm font-semibold">Portfolio Configuration</h2>
              </div>

              <div className="space-y-4">
                {/* Risk */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Risk Tolerance</label>
                  <div className="flex gap-1.5">
                    {(["conservative", "moderate", "aggressive"] as Risk[]).map(r => (
                      <button key={r} onClick={() => setProfile(p => ({ ...p, risk: r }))}
                        className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors",
                          profile.risk === r
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground")}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* YoY Return */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    Expected YoY Return:{" "}
                    <span className="text-foreground font-semibold">{profile.expected_return.toFixed(1)}%</span>
                  </label>
                  <input type="range" min="2" max="20" step="0.5"
                    value={profile.expected_return}
                    onChange={e => setProfile(p => ({ ...p, expected_return: parseFloat(e.target.value) }))}
                    className="w-full accent-primary" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                    <span>2%</span><span>20%</span>
                  </div>
                </div>

                {/* Horizon */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Investment Horizon</label>
                  <select value={profile.horizon_years}
                    onChange={e => setProfile(p => ({ ...p, horizon_years: parseInt(e.target.value) }))}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground">
                    {HORIZON_OPTIONS.map(y => <option key={y} value={y}>{y} years</option>)}
                  </select>
                </div>

                {/* Regions */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Regions</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {REGION_OPTIONS.map(r => (
                      <label key={r} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={profile.regions.includes(r)}
                          onChange={() => setProfile(p => ({ ...p, regions: toggleArr(p.regions, r) }))}
                          className="accent-primary" />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Sectors */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Sectors / Themes</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SECTOR_OPTIONS.map(s => (
                      <label key={s} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={profile.sectors.includes(s)}
                          onChange={() => setProfile(p => ({ ...p, sectors: toggleArr(p.sectors, s) }))}
                          className="accent-primary" />
                        {s}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Num ETFs */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">
                    Number of ETFs <span className="text-muted-foreground/60">(incl. 1 cash position)</span>
                  </label>
                  <input type="number" min="4" max="15"
                    value={profile.num_etfs}
                    onChange={e => setProfile(p => ({ ...p, num_etfs: parseInt(e.target.value) || 6 }))}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground" />
                </div>

                {/* Include Bonds */}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={profile.include_bonds}
                    onChange={e => setProfile(p => ({ ...p, include_bonds: e.target.checked }))}
                    className="accent-primary w-4 h-4" />
                  Include Bonds
                </label>

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleSaveProfile} disabled={savingProfile}
                    className="flex-1 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50">
                    {savingProfile ? "Saving…" : "Save Profile"}
                  </button>
                  <button onClick={handleGenerate} disabled={generating}
                    className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
                    {generating ? <><Loader2 size={14} className="animate-spin" />Generating…</> : "✨ Generate"}
                  </button>
                </div>

                {generating && streamText && (
                  <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground font-mono max-h-28 overflow-y-auto whitespace-pre-wrap">
                    {streamText}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="group relative w-2 flex items-center justify-center">
          <div className="w-px h-full bg-border group-hover:bg-primary/60 transition-colors duration-150" />
          <div className="absolute w-1 h-8 rounded-full bg-border group-hover:bg-primary/60 transition-colors duration-150" />
        </PanelResizeHandle>

        {/* ── Panel 3: Pie Charts + Suggestions Table + Holdings ── */}
        <Panel id="view" defaultSize={sizes[2]} minSize={20} className="min-w-0">
          <div className="h-full p-1 overflow-y-auto flex flex-col gap-4">

            {/* Dual pie charts — always visible */}
            <DualPieCharts suggestions={suggestions} holdings={holdings} />

            {/* Suggestions table */}
            {suggestions.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Suggested Portfolio</h2>
                  <button onClick={handleRecordAll} disabled={recordingAll}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                    {recordingAll ? <Loader2 size={12} className="animate-spin" /> : null}
                    Record All as Holdings
                  </button>
                </div>
                <div className="overflow-x-auto">
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
                        <tr key={s.id}
                          className={cn("border-b border-border last:border-0 text-xs",
                            i % 2 !== 0 && "bg-muted/20")}>
                          <td className="px-2 py-2 font-bold text-sm">{s.ticker}</td>
                          <td className="px-2 py-2 text-muted-foreground max-w-[140px]">
                            <span className="line-clamp-1">{s.name}</span>
                          </td>
                          <td className="px-2 py-2"><TypeBadge type={s.etf_type} /></td>
                          <td className="px-2 py-2 text-right font-semibold">{s.weight}%</td>
                          <td className="px-2 py-2 text-muted-foreground max-w-[180px]">
                            <span className="line-clamp-2">{s.justification}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Holdings */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold">My ETF Holdings</h2>
                  {holdings.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Total value: <span className="text-foreground font-medium">{fmtCurrency(totalMktValue)}</span>
                    </div>
                  )}
                </div>
                <button onClick={() => setAddTxOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-accent transition-colors">
                  <Plus size={12} />
                  Add Transaction
                </button>
              </div>

              {addTxOpen && (
                <TransactionForm onSubmit={handleAddTx} onCancel={() => setAddTxOpen(false)} />
              )}

              {holdings.length === 0 ? (
                !addTxOpen && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No holdings yet. Generate suggestions above or add a transaction manually.
                  </p>
                )
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left px-2 py-2 font-medium">Ticker</th>
                        <th className="text-right px-2 py-2 font-medium">Shares</th>
                        <th className="text-right px-2 py-2 font-medium">Avg Cost</th>
                        <th className="text-right px-2 py-2 font-medium">Price</th>
                        <th className="text-right px-2 py-2 font-medium">Mkt Value</th>
                        <th className="text-right px-2 py-2 font-medium">Weight</th>
                        <th className="text-right px-2 py-2 font-medium">P&L%</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h, i) => {
                        const weight = totalMktValue > 0
                          ? Math.round((h.market_value / totalMktValue) * 1000) / 10
                          : 0;
                        return (
                          <tr key={h.ticker}
                            className={cn("border-b border-border last:border-0", i % 2 !== 0 && "bg-muted/20")}>
                            <td className="px-2 py-2 font-bold">{h.ticker}</td>
                            <td className="px-2 py-2 text-right text-xs">{h.shares.toFixed(4)}</td>
                            <td className="px-2 py-2 text-right text-xs">{fmtCurrency(h.avg_cost)}</td>
                            <td className="px-2 py-2 text-right text-xs">{fmtCurrency(h.current_price)}</td>
                            <td className="px-2 py-2 text-right font-medium text-xs">{fmtCurrency(h.market_value)}</td>
                            <td className="px-2 py-2 text-right text-xs text-muted-foreground">{weight}%</td>
                            <td className={cn("px-2 py-2 text-right text-xs font-semibold",
                              h.pnl_pct >= 0 ? "text-green-400" : "text-red-400")}>
                              {h.pnl_pct >= 0 ? "+" : ""}{h.pnl_pct.toFixed(2)}%
                            </td>
                            <td className="px-2 py-2">
                              <button onClick={() => handleClosePosition(h)}
                                className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                                title="Close position">
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
