#!/usr/bin/env python3
"""
MCP server exposing financial news tools.

Tools:
  get_stock_news(ticker, count)    — latest news for a ticker (NewsAPI or yfinance fallback)
  get_market_news(topic, count)    — broad market/topic news via NewsAPI
"""
import os
import httpx
import yfinance as yf
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("news-server")

NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")


def _yf_news(ticker: str, count: int) -> list:
    t = yf.Ticker(ticker.upper())
    news = t.news or []
    out = []
    for a in news[:count]:
        content = a.get("content", {})
        out.append({
            "title": content.get("title", ""),
            "url": content.get("canonicalUrl", {}).get("url", ""),
            "published_at": content.get("pubDate", ""),
            "source": content.get("provider", {}).get("displayName", "Yahoo Finance"),
            "summary": content.get("summary", ""),
        })
    return out


@mcp.tool()
def get_stock_news(ticker: str, count: int = 5) -> list:
    """
    Fetch the latest news articles for a given stock ticker.
    Returns a list of {title, url, published_at, source, summary}.
    """
    if not NEWS_API_KEY:
        return _yf_news(ticker, count)

    with httpx.Client(timeout=10) as client:
        resp = client.get(
            "https://newsapi.org/v2/everything",
            params={
                "q": ticker.upper(),
                "sortBy": "publishedAt",
                "pageSize": count,
                "apiKey": NEWS_API_KEY,
                "language": "en",
            },
        )
    if resp.status_code != 200:
        return _yf_news(ticker, count)  # fallback

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


@mcp.tool()
def get_market_news(topic: str = "stock market", count: int = 5) -> list:
    """
    Fetch general market or topic news (e.g. 'interest rates', 'tech stocks', 'earnings').
    Requires NEWS_API_KEY; returns empty list if not configured.
    """
    if not NEWS_API_KEY:
        return [{"error": "NEWS_API_KEY not set — set it in .env for market news"}]

    with httpx.Client(timeout=10) as client:
        resp = client.get(
            "https://newsapi.org/v2/everything",
            params={
                "q": topic,
                "sortBy": "publishedAt",
                "pageSize": count,
                "apiKey": NEWS_API_KEY,
                "language": "en",
                "domains": "reuters.com,bloomberg.com,cnbc.com,ft.com,wsj.com",
            },
        )
    if resp.status_code != 200:
        return [{"error": f"NewsAPI returned {resp.status_code}"}]

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


if __name__ == "__main__":
    mcp.run(transport="stdio")
