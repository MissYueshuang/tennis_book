from fastapi import APIRouter, HTTPException
import httpx
import yfinance as yf
import os

router = APIRouter(prefix="/api/market", tags=["market"])

ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")
POLYGON_KEY = os.getenv("POLYGON_KEY", "")
NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")


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
