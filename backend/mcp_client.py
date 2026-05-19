"""
Tool registry for the chat router.

The MCP server scripts (mcp_servers/stock_server.py, news_server.py) remain
valid standalone MCP servers that external clients can connect to via stdio.
Internally, the backend calls the same underlying functions directly to avoid
the anyio cross-task restriction that affects stdio MCP clients.
"""
import asyncio
from typing import Any

from tools.stock_tools import get_stock_quote, get_stock_history, get_fundamentals, search_ticker, get_quote_alphavantage, get_quote_polygon
from tools.news_tools import get_stock_news, get_market_news
from tools.portfolio_tools import (
    get_portfolio, add_portfolio_holding, update_portfolio_holding, remove_portfolio_holding,
)

_TOOLS: dict[str, callable] = {
    "get_stock_quote": get_stock_quote,
    "get_stock_history": get_stock_history,
    "get_fundamentals": get_fundamentals,
    "search_ticker": search_ticker,
    "get_quote_alphavantage": get_quote_alphavantage,
    "get_quote_polygon": get_quote_polygon,
    "get_stock_news": get_stock_news,
    "get_market_news": get_market_news,
    "get_portfolio": get_portfolio,
    "add_portfolio_holding": add_portfolio_holding,
    "update_portfolio_holding": update_portfolio_holding,
    "remove_portfolio_holding": remove_portfolio_holding,
}

_TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_stock_quote",
            "description": "Get the current price, daily change %, and volume for a stock ticker.",
            "parameters": {
                "type": "object",
                "properties": {"ticker": {"type": "string", "description": "Stock ticker symbol, e.g. AAPL"}},
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stock_history",
            "description": "Get historical closing prices for a ticker. Returns list of {date, close}.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string"},
                    "period": {"type": "string", "enum": ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y"]},
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_fundamentals",
            "description": "Get key fundamental data: P/E ratio, market cap, EPS, 52-week range, sector.",
            "parameters": {
                "type": "object",
                "properties": {"ticker": {"type": "string"}},
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_ticker",
            "description": "Find a stock ticker symbol by searching a company name.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_quote_alphavantage",
            "description": "Get a real-time stock quote from Alpha Vantage. Use this to verify Alpha Vantage API connectivity or get an independent price check.",
            "parameters": {
                "type": "object",
                "properties": {"ticker": {"type": "string", "description": "Stock ticker symbol, e.g. AAPL"}},
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_quote_polygon",
            "description": "Get the previous-day OHLCV data from Polygon.io. Use this to verify Polygon API connectivity or get OHLCV details.",
            "parameters": {
                "type": "object",
                "properties": {"ticker": {"type": "string", "description": "Stock ticker symbol, e.g. AAPL"}},
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stock_news",
            "description": "Fetch the latest news articles for a stock ticker.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string"},
                    "count": {"type": "integer", "description": "Number of articles, default 5"},
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_market_news",
            "description": "Fetch broad market or topic news, e.g. 'interest rates', 'tech stocks'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {"type": "string"},
                    "count": {"type": "integer"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_portfolio",
            "description": "Get all current portfolio holdings (ticker, shares, avg cost). Call this to understand the user's current positions before answering portfolio questions.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_portfolio_holding",
            "description": "Add a new stock position to the portfolio. Use when the user says they bought shares or wants to add a position.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker":   {"type": "string",  "description": "Stock ticker symbol, e.g. AAPL"},
                    "shares":   {"type": "number",  "description": "Number of shares"},
                    "avg_cost": {"type": "number",  "description": "Average purchase price per share in USD"},
                },
                "required": ["ticker", "shares", "avg_cost"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_portfolio_holding",
            "description": "Update shares or average cost for an existing holding. Use when the user buys more, sells some, or corrects their cost basis.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker":   {"type": "string"},
                    "shares":   {"type": "number",  "description": "New total share count (optional)"},
                    "avg_cost": {"type": "number",  "description": "New average cost per share (optional)"},
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_portfolio_holding",
            "description": "Remove a stock position from the portfolio entirely. Use when the user says they sold all shares.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "Stock ticker symbol to remove"},
                },
                "required": ["ticker"],
            },
        },
    },
]


async def get_all_tools() -> list[dict]:
    return _TOOL_SCHEMAS


async def call_mcp_tool(tool_name: str, arguments: dict[str, Any]) -> Any:
    fn = _TOOLS.get(tool_name)
    if fn is None:
        return {"error": f"Unknown tool: {tool_name}"}
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: fn(**arguments))
