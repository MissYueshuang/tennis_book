const BASE = "/api";

export interface Holding {
  id: number;
  ticker: string;
  shares: number;
  avg_cost: number;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  market_cap?: number;
  volume?: number;
}

export interface HistoryPoint {
  date: string;
  close: number;
  volume?: number;
}

export interface NewsArticle {
  title: string;
  url: string;
  published_at: string;
  source: string;
  summary: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Portfolio
export const getHoldings = () => fetch(`${BASE}/portfolio/`).then((r) => r.json() as Promise<Holding[]>);

export const addHolding = (ticker: string, shares: number, avg_cost: number) =>
  fetch(`${BASE}/portfolio/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, shares, avg_cost }),
  }).then((r) => r.json() as Promise<Holding>);

export const updateHolding = (ticker: string, data: { shares?: number; avg_cost?: number }) =>
  fetch(`${BASE}/portfolio/${ticker}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => r.json() as Promise<Holding>);

export const removeHolding = (ticker: string) =>
  fetch(`${BASE}/portfolio/${ticker}`, { method: "DELETE" });

// Market
export const getQuote = (ticker: string) =>
  fetch(`${BASE}/market/quote/${ticker}`).then((r) => r.json() as Promise<Quote>);

export const getBulkQuotes = (tickers: string[]) =>
  fetch(`${BASE}/market/bulk-quotes?tickers=${tickers.join(",")}`).then(
    (r) => r.json() as Promise<Quote[]>
  );

export const getHistory = (ticker: string, period = "1mo") =>
  fetch(`${BASE}/market/history/${ticker}?period=${period}`).then(
    (r) => r.json() as Promise<HistoryPoint[]>
  );

export const getNews = (ticker: string, count = 5) =>
  fetch(`${BASE}/market/news/${ticker}?page_size=${count}`).then(
    (r) => r.json() as Promise<NewsArticle[]>
  );

export interface TrendPrediction {
  ticker: string;
  direction: "up" | "down" | "neutral";
  confidence: number;
  reason: string;
  signals: {
    rsi: number | null;
    macd: number | null;
    macd_signal: number | null;
    macd_hist: number | null;
    macd_bullish: boolean | null;
    golden_cross: boolean | null;
    death_cross: boolean | null;
    above_ma20: boolean | null;
    above_ma50: boolean | null;
    bb_pct: number;
    vol_trend: string | null;
    price: number;
  };
}

export const getTrendPrediction = (ticker: string) =>
  fetch(`${BASE}/market/predict/${ticker}`).then(
    (r) => r.json() as Promise<TrendPrediction>
  );

// Chat
export const sendChat = (content: string) =>
  fetch(`${BASE}/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  }).then((r) => r.json() as Promise<ChatMessage>);

export const getChatHistory = () =>
  fetch(`${BASE}/chat/history`).then((r) => r.json() as Promise<ChatMessage[]>);

export const clearChatHistory = () =>
  fetch(`${BASE}/chat/history`, { method: "DELETE" });

// ETF Portfolio
export const getEtfProfile = () => fetch(`${BASE}/etf/profile`).then(r => r.json());
export const saveEtfProfile = (p: any) => fetch(`${BASE}/etf/profile`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(p) }).then(r => r.json());
export const getEtfSuggestions = () => fetch(`${BASE}/etf/suggestions`).then(r => r.json());
export const getEtfHoldings = () => fetch(`${BASE}/etf/holdings`).then(r => r.json());
export const addEtfTransaction = (t: any) => fetch(`${BASE}/etf/transaction`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(t) }).then(r => r.json());
export const deleteEtfTransaction = (id: number) => fetch(`${BASE}/etf/transaction/${id}`, { method: "DELETE" });
