from fastapi import APIRouter, HTTPException
import httpx
import yfinance as yf
import os
import json
import time
import asyncio
import numpy as np

router = APIRouter(prefix="/api/market", tags=["market"])

ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")
POLYGON_KEY = os.getenv("POLYGON_KEY", "")
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")
OLLAMA_BASE = os.getenv("OLLAMA_BASE", "http://localhost:11434")

# ── Simple file-cache for predictions ─────────────────────────────────────────
_CACHE_DIR = "/tmp/portfolio_macro_cache"
os.makedirs(_CACHE_DIR, exist_ok=True)

def _pred_cache_get(ticker: str):
    path = os.path.join(_CACHE_DIR, f"pred_{ticker}.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            d = json.load(f)
        if time.time() - d.get("ts", 0) < 86400:   # 24-hour TTL
            return d
    except Exception:
        pass
    return None

def _pred_cache_set(ticker: str, data: dict):
    path = os.path.join(_CACHE_DIR, f"pred_{ticker}.json")
    data["ts"] = time.time()
    with open(path, "w") as f:
        json.dump(data, f)

# ── Technical-indicator helpers ────────────────────────────────────────────────
def _sma(arr, n):
    result = [None] * len(arr)
    for i in range(n - 1, len(arr)):
        result[i] = float(np.mean(arr[i - n + 1 : i + 1]))
    return result

def _ema(arr, n):
    result = [None] * len(arr)
    if len(arr) < n:
        return result
    result[n - 1] = float(np.mean(arr[:n]))
    k = 2 / (n + 1)
    for i in range(n, len(arr)):
        result[i] = arr[i] * k + result[i - 1] * (1 - k)
    return result

def _rsi(closes, period=14):
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_g = np.mean(gains[:period])
    avg_l = np.mean(losses[:period])
    for i in range(period, len(gains)):
        avg_g = (avg_g * (period - 1) + gains[i]) / period
        avg_l = (avg_l * (period - 1) + losses[i]) / period
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return round(100 - 100 / (1 + rs), 1)

def _compute_signals(closes, volumes):
    closes = list(closes)
    volumes = list(volumes)

    # RSI
    rsi_val = _rsi(closes)

    # MACD
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)
    macd_line = [
        (a - b) if a is not None and b is not None else None
        for a, b in zip(ema12, ema26)
    ]
    macd_vals = [v for v in macd_line if v is not None]
    signal_line = _ema(macd_vals, 9) if len(macd_vals) >= 9 else [None]
    macd_latest = macd_vals[-1] if macd_vals else None
    signal_latest = signal_line[-1] if signal_line else None
    macd_hist = (macd_latest - signal_latest) if (macd_latest is not None and signal_latest is not None) else None

    # MA crossover
    ma20 = _sma(closes, 20)
    ma50 = _sma(closes, 50)
    golden_cross = None
    if ma20[-1] is not None and ma50[-1] is not None and ma20[-2] is not None and ma50[-2] is not None:
        golden_cross = (ma20[-2] <= ma50[-2]) and (ma20[-1] > ma50[-1])
    death_cross = None
    if ma20[-1] is not None and ma50[-1] is not None and ma20[-2] is not None and ma50[-2] is not None:
        death_cross = (ma20[-2] >= ma50[-2]) and (ma20[-1] < ma50[-1])
    above_ma20 = (closes[-1] > ma20[-1]) if ma20[-1] is not None else None
    above_ma50 = (closes[-1] > ma50[-1]) if ma50[-1] is not None else None

    # Bollinger bands (20-period)
    bb_mid = ma20[-1]
    if bb_mid is not None:
        window = closes[-20:]
        std = float(np.std(window))
        bb_upper = bb_mid + 2 * std
        bb_lower = bb_mid - 2 * std
        bb_pct = (closes[-1] - bb_lower) / (bb_upper - bb_lower) if (bb_upper - bb_lower) else 0.5
    else:
        bb_pct = 0.5

    # Volume trend (avg of last 5 vs avg of previous 5)
    vol_trend = None
    if len(volumes) >= 10:
        recent_vol = np.mean(volumes[-5:])
        prev_vol = np.mean(volumes[-10:-5])
        vol_trend = "rising" if recent_vol > prev_vol * 1.1 else "falling" if recent_vol < prev_vol * 0.9 else "flat"

    return {
        "rsi": rsi_val,
        "macd": round(macd_latest, 4) if macd_latest is not None else None,
        "macd_signal": round(signal_latest, 4) if signal_latest is not None else None,
        "macd_hist": round(macd_hist, 4) if macd_hist is not None else None,
        "macd_bullish": (macd_hist > 0) if macd_hist is not None else None,
        "golden_cross": golden_cross,
        "death_cross": death_cross,
        "above_ma20": above_ma20,
        "above_ma50": above_ma50,
        "bb_pct": round(bb_pct, 3),
        "vol_trend": vol_trend,
        "price": round(closes[-1], 2),
    }


@router.get("/quote/{ticker}")
async def get_quote(ticker: str):
    try:
        t = yf.Ticker(ticker.upper())
        info = t.fast_info
        hist = t.history(period="5d")
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No data for {ticker.upper()}")

        current = float(hist["Close"].iloc[-1])
        prev_close = float(hist["Close"].iloc[-2]) if len(hist) > 1 else current
        change = current - prev_close
        change_pct = (change / prev_close) * 100 if prev_close else 0

        return {
            "ticker": ticker.upper(),
            "price": round(current, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "market_cap": getattr(info, "market_cap", None),
            "volume": getattr(info, "last_volume", None),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{ticker}")
async def get_history(ticker: str, period: str = "1mo"):
    valid_periods = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"}
    if period not in valid_periods:
        raise HTTPException(status_code=400, detail=f"period must be one of {valid_periods}")
    try:
        t = yf.Ticker(ticker.upper())
        hist = t.history(period=period)
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"No history for {ticker.upper()}")
        return [
            {"date": str(d.date()), "close": round(float(c), 2), "volume": int(v)}
            for d, c, v in zip(hist.index, hist["Close"], hist["Volume"])
        ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/news/{ticker}")
async def get_news(ticker: str, page_size: int = 5):
    if not NEWS_API_KEY:
        # Fall back to yfinance news
        try:
            t = yf.Ticker(ticker.upper())
            news = t.news or []
            return [
                {
                    "title": a.get("content", {}).get("title", ""),
                    "url": a.get("content", {}).get("canonicalUrl", {}).get("url", ""),
                    "published_at": a.get("content", {}).get("pubDate", ""),
                    "source": a.get("content", {}).get("provider", {}).get("displayName", "Yahoo Finance"),
                    "summary": a.get("content", {}).get("summary", ""),
                }
                for a in news[:page_size]
            ]
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://newsapi.org/v2/everything",
            params={
                "q": ticker.upper(),
                "sortBy": "publishedAt",
                "pageSize": page_size,
                "apiKey": NEWS_API_KEY,
                "language": "en",
            },
            timeout=10,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="NewsAPI error")
    articles = resp.json().get("articles", [])
    return [
        {
            "title": a.get("title", ""),
            "url": a.get("url", ""),
            "published_at": a.get("publishedAt", ""),
            "source": a.get("source", {}).get("name", ""),
            "summary": a.get("description", ""),
        }
        for a in articles
    ]


@router.get("/bulk-quotes")
async def bulk_quotes(tickers: str):
    """Comma-separated list of tickers."""
    symbols = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    results = []
    for sym in symbols:
        try:
            t = yf.Ticker(sym)
            hist = t.history(period="5d")
            if hist.empty:
                continue
            current = float(hist["Close"].iloc[-1])
            prev_close = float(hist["Close"].iloc[-2]) if len(hist) > 1 else current
            change = current - prev_close
            change_pct = (change / prev_close) * 100 if prev_close else 0
            results.append({
                "ticker": sym,
                "price": round(current, 2),
                "change": round(change, 2),
                "change_pct": round(change_pct, 2),
            })
        except Exception:
            continue
    return results


@router.get("/predict/{ticker}")
async def predict_trend(ticker: str):
    """
    10-day trend prediction based on technical indicators.
    Result is cached for 24 hours per ticker (LLM call is expensive).
    Returns: { direction: 'up'|'down'|'neutral', confidence: int, reason: str, signals: {...} }
    """
    sym = ticker.upper()

    # Return cached result if fresh
    cached = _pred_cache_get(sym)
    if cached:
        return cached

    # Fetch ~3 months of daily data for signal computation
    try:
        t = yf.Ticker(sym)
        hist = t.history(period="3mo")
        if hist.empty or len(hist) < 30:
            raise HTTPException(status_code=404, detail=f"Not enough data for {sym}")
        closes = list(hist["Close"].astype(float))
        volumes = list(hist["Volume"].astype(float))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    sigs = _compute_signals(closes, volumes)

    # Build a concise LLM prompt
    signal_text = (
        f"Ticker: {sym}\n"
        f"Current price: ${sigs['price']}\n"
        f"RSI(14): {sigs['rsi']} ({'overbought' if sigs['rsi'] and sigs['rsi'] > 70 else 'oversold' if sigs['rsi'] and sigs['rsi'] < 30 else 'neutral'})\n"
        f"MACD histogram: {sigs['macd_hist']} ({'bullish' if sigs['macd_bullish'] else 'bearish' if sigs['macd_bullish'] is False else 'unknown'})\n"
        f"Above MA20: {sigs['above_ma20']}, Above MA50: {sigs['above_ma50']}\n"
        f"Golden cross (MA20 crossed above MA50 today): {sigs['golden_cross']}\n"
        f"Death cross (MA20 crossed below MA50 today): {sigs['death_cross']}\n"
        f"Bollinger Band position (0=lower, 1=upper): {sigs['bb_pct']}\n"
        f"Volume trend (last 5 vs prev 5 days): {sigs['vol_trend']}\n"
    )

    prompt = (
        "You are a quantitative technical analyst. Based ONLY on the following technical indicators, "
        "predict the 10-day price direction for the stock. "
        "Respond with a JSON object only (no markdown, no explanation outside JSON) with keys: "
        "\"direction\" (one of: up, down, neutral), \"confidence\" (integer 1-100), "
        "\"reason\" (2-3 sentence plain-English explanation citing the specific signals).\n\n"
        + signal_text
    )

    direction = "neutral"
    confidence = 50
    reason = "Insufficient data from LLM to form a prediction."

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{OLLAMA_BASE}/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
                      "options": {"temperature": 0.2, "num_predict": 300}},
            )
        if resp.status_code == 200:
            raw = resp.json().get("response", "")
            # Strip /think tags if present (qwen3 chain-of-thought)
            import re
            raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
            # Extract JSON from response
            json_match = re.search(r"\{.*\}", raw, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                direction = parsed.get("direction", "neutral")
                confidence = int(parsed.get("confidence", 50))
                reason = parsed.get("reason", reason)
    except Exception:
        pass  # Return heuristic fallback below

    result = {
        "ticker": sym,
        "direction": direction,
        "confidence": confidence,
        "reason": reason,
        "signals": sigs,
    }
    _pred_cache_set(sym, result)
    return result
