const BASE = "/api/macro";

export const getMacroScorecard    = () => fetch(`${BASE}/scorecard`).then(r => r.json());
export const getMacroValuation    = () => fetch(`${BASE}/valuation`).then(r => r.json());
export const getMacroHistory      = () => fetch(`${BASE}/history`).then(r => r.json());
export const getMacroEconomic     = () => fetch(`${BASE}/economic`).then(r => r.json());
export const getMacroSentiment    = () => fetch(`${BASE}/sentiment`).then(r => r.json());
export const getBulkSignals       = (tickers: string[]) =>
  fetch(`${BASE}/signals?tickers=${tickers.join(",")}`).then(r => r.json());
export const getIndicatorDetail   = (name: string) =>
  fetch(`${BASE}/indicator/${name}`).then(r => r.json());
