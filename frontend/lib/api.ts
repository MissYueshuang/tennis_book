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
