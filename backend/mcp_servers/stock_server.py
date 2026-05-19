#!/usr/bin/env python3
"""
MCP server exposing stock data tools.
Runs as a standalone stdio process; the FastAPI backend connects as MCP client.

Tools:
  get_stock_quote(ticker)            — current price, change, volume
  get_stock_history(ticker, period)  — OHLCV history via yfinance
  get_fundamentals(ticker)           — P/E, market cap, 52-wk range, etc.
  search_ticker(query)               — find ticker by company name
"""
import asyncio
import os
import yfinance as yf
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("stock-server")

ALPHA_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")
POLYGON_KEY = os.getenv("POLYGON_KEY", "")


@mcp.tool()
def get_stock_quote(ticker: str) -> dict:
    """Get the current price, daily change, and volume for a stock ticker."""
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


@mcp.tool()
def get_stock_history(ticker: str, period: str = "1mo") -> list:
    """
    Get closing price history for a ticker.
    period: 1d | 5d | 1mo | 3mo | 6mo | 1y | 2y | 5y
    Returns list of {date, close}.
    """
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


@mcp.tool()
def get_fundamentals(ticker: str) -> dict:
    """Get key fundamental data: market cap, P/E, EPS, 52-wk range, dividend yield."""
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


@mcp.tool()
def search_ticker(query: str) -> list:
    """Search for a stock ticker symbol by company name or partial name."""
    try:
        results = yf.Search(query, max_results=5).quotes
        return [
            {"ticker": r.get("symbol", ""), "name": r.get("longname") or r.get("shortname", ""), "exchange": r.get("exchange", "")}
            for r in results
        ]
    except Exception as e:
        return [{"error": str(e)}]


if __name__ == "__main__":
    mcp.run(transport="stdio")
