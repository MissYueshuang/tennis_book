import os
import httpx
import yfinance as yf

ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")
POLYGON_KEY = os.getenv("POLYGON_KEY", "")


def get_stock_quote(ticker: str) -> dict:
    """Get current price, daily change, and volume for a ticker."""
    t = yf.Ticker(ticker.upper())
    hist = t.history(period="5d")
    if hist.empty:
        return {"error": f"No data found for {ticker.upper()}"}
    current = float(hist["Close"].iloc[-1])
    prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else current
    change = current - prev
    change_pct = (change / prev * 100) if prev else 0
    return {
        "ticker": ticker.upper(),
        "price": round(current, 2),
        "change": round(change, 2),
        "change_pct": round(change_pct, 2),
        "volume": int(hist["Volume"].iloc[-1]),
    }


def get_stock_history(ticker: str, period: str = "1mo") -> list:
    """Get closing price history. period: 1d|5d|1mo|3mo|6mo|1y|2y|5y"""
    valid = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"}
    if period not in valid:
        return [{"error": f"period must be one of {valid}"}]
    t = yf.Ticker(ticker.upper())
    hist = t.history(period=period)
    if hist.empty:
        return [{"error": f"No history for {ticker.upper()}"}]
    return [
        {"date": str(d.date()), "close": round(float(c), 2)}
        for d, c in zip(hist.index, hist["Close"])
    ]


def get_fundamentals(ticker: str) -> dict:
    """Get P/E, market cap, 52-wk range, sector, dividend yield."""
    t = yf.Ticker(ticker.upper())
    info = t.info
    return {
        "ticker": ticker.upper(),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "eps": info.get("trailingEps"),
        "52wk_high": info.get("fiftyTwoWeekHigh"),
        "52wk_low": info.get("fiftyTwoWeekLow"),
        "dividend_yield": info.get("dividendYield"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "description": (info.get("longBusinessSummary") or "")[:300],
    }


def search_ticker(query: str) -> list:
    """Search for a ticker symbol by company name."""
    try:
        results = yf.Search(query, max_results=5).quotes
        return [
            {
                "ticker": r.get("symbol", ""),
                "name": r.get("longname") or r.get("shortname", ""),
                "exchange": r.get("exchange", ""),
            }
            for r in results
        ]
    except Exception as e:
        return [{"error": str(e)}]


def get_quote_alphavantage(ticker: str) -> dict:
    """Get real-time quote from Alpha Vantage (requires ALPHA_VANTAGE_KEY)."""
    if not ALPHA_VANTAGE_KEY:
        return {"error": "ALPHA_VANTAGE_KEY not set in .env"}
    with httpx.Client(timeout=10) as client:
        resp = client.get(
            "https://www.alphavantage.co/query",
            params={"function": "GLOBAL_QUOTE", "symbol": ticker.upper(), "apikey": ALPHA_VANTAGE_KEY},
        )
    if resp.status_code != 200:
        return {"error": f"Alpha Vantage returned {resp.status_code}"}
    data = resp.json().get("Global Quote", {})
    if not data or not data.get("05. price"):
        return {"error": f"No data from Alpha Vantage for {ticker.upper()}"}
    return {
        "source": "Alpha Vantage",
        "ticker": data.get("01. symbol", ticker.upper()),
        "price": float(data.get("05. price", 0)),
        "open": float(data.get("02. open", 0)),
        "high": float(data.get("03. high", 0)),
        "low": float(data.get("04. low", 0)),
        "volume": int(data.get("06. volume", 0)),
        "change": float(data.get("09. change", 0)),
        "change_pct": data.get("10. change percent", "0%").replace("%", ""),
        "prev_close": float(data.get("08. previous close", 0)),
        "latest_trading_day": data.get("07. latest trading day", ""),
    }


def get_quote_polygon(ticker: str) -> dict:
    """Get previous-day OHLCV from Polygon.io (requires POLYGON_KEY)."""
    if not POLYGON_KEY:
        return {"error": "POLYGON_KEY not set in .env"}
    with httpx.Client(timeout=10) as client:
        resp = client.get(
            f"https://api.polygon.io/v2/aggs/ticker/{ticker.upper()}/prev",
            params={"adjusted": "true", "apiKey": POLYGON_KEY},
        )
    if resp.status_code != 200:
        return {"error": f"Polygon returned {resp.status_code}: {resp.text[:200]}"}
    body = resp.json()
    if body.get("resultsCount", 0) == 0:
        return {"error": f"No Polygon data for {ticker.upper()}"}
    r = body["results"][0]
    return {
        "source": "Polygon.io",
        "ticker": ticker.upper(),
        "date": body.get("resultsCount") and r.get("t"),
        "open": r.get("o"),
        "high": r.get("h"),
        "low": r.get("l"),
        "close": r.get("c"),
        "volume": r.get("v"),
        "vwap": r.get("vw"),
        "transactions": r.get("n"),
    }
