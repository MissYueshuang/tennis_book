# Portfolio Dashboard

A local-first stock portfolio management app with an AI chat assistant powered by **Qwen 2.5** (via Ollama) and real-time market data via **MCP tool servers**.

```
┌──────────────────────────────────────────────────────────────┐
│  Holdings Sidebar   │   Chart / Allocation View  │   Chat   │
│  ─────────────────  │   ─────────────────────── │  ──────   │
│  AAPL  $191 +1.2%   │      [Area Chart]          │  User >   │
│  NVDA  $875 -0.8%   │      [Pie Chart]           │  Bot  >   │
│  TSLA  $248 +3.1%   │      [Holdings Table]      │  ...      │
│                     │                            │           │
│  Total: $42,310     │  Click a card for detail   │  [Input]  │
│  P&L:  +12.4%       │  + news for that ticker    │           │
└──────────────────────────────────────────────────────────────┘
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, Tailwind CSS, shadcn-style components, Recharts |
| Backend | FastAPI (Python), SQLite via SQLAlchemy async |
| LLM | Ollama · qwen3:32b (~20 GB RAM, no API key needed) |
| MCP Servers | `mcp` Python SDK · stock_server + news_server |
| Stock Data | yfinance (free, primary) + Alpha Vantage + Polygon.io (optional) |
| News | yfinance news (fallback) + NewsAPI (optional, better quality) |

---

## Setup

### 1. Prerequisites

```bash
# Install Homebrew (if not already)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Install Ollama
brew install ollama

# Pull the Qwen model (~4.7 GB)
ollama pull qwen3:32b
```

### 2. Backend

```bash
cd backend

# Create a virtual environment (using uv — fast)
pip install uv          # or: brew install uv
uv venv .venv
source .venv/bin/activate

# Install dependencies
uv pip install -r requirements.txt

# Copy env file
cp ../.env.example ../.env
# Edit .env if you want to add API keys (all optional)

# Start the backend
uvicorn main:app --reload --port 8000
```

The API will be live at http://localhost:8000. Visit http://localhost:8000/docs for Swagger UI.

### 3. Frontend

```bash
# In a new terminal tab
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

### 4. Start Ollama

```bash
# In a separate terminal (or it auto-starts with `ollama run`)
ollama serve
```

---

## Features

### Dashboard
- **Portfolio sidebar** — all holdings with live price, day change %, and total P&L
- **Allocation pie chart** — visual breakdown by market value
- **Holdings table** — sortable overview with cost basis and unrealised P&L
- **Stock detail view** — click any holding to see a full price chart (1d → 5y) + latest news

### AI Chat (right panel)
Chat with **Qwen 2.5** — the model has access to MCP tools and can:

| What you can ask | Tool used |
|---|---|
| "What's AAPL trading at?" | `get_stock_quote` |
| "Show me NVDA's 6-month chart" | `get_stock_history` |
| "Any news on my holdings?" | `get_stock_news` |
| "What's the market doing today?" | `get_market_news` |
| "Tell me about Tesla's fundamentals" | `get_fundamentals` |
| "Add 5 shares of MSFT at $420" | Portfolio API |

> Chat history is persisted in SQLite and loaded on refresh.

### Portfolio Management
- Add holdings via **+ Add Stock** button or by asking the AI
- Edit shares / average cost inline on any card
- Remove holdings with the trash icon (or ask the AI)
- Prices auto-refresh every 60 seconds

---

## MCP Architecture

```
FastAPI backend
    │
    ├── mcp_client.py  ←  spawns stdio subprocesses
    │       │
    │       ├── mcp_servers/stock_server.py  (yfinance tools)
    │       └── mcp_servers/news_server.py   (NewsAPI / yfinance news)
    │
    └── routers/chat.py
            │
            ├── loads tool schemas from MCP servers
            ├── sends to Ollama with tools list
            └── routes tool_calls back to correct MCP server
```

The MCP servers are standalone Python scripts using `mcp.server.fastmcp.FastMCP`. They run as child processes connected via stdio, so they can be swapped or extended independently.

---

## Optional API Keys

All optional — the app works without any keys using yfinance.

| Key | Where to get | What it adds |
|---|---|---|
| `NEWS_API_KEY` | newsapi.org/register | Better news quality, more sources |
| `ALPHA_VANTAGE_KEY` | alphavantage.co | Backup quote source |
| `POLYGON_KEY` | polygon.io | Real-time data (5 req/min free) |

Add to `.env` in the project root.

---

## Project Structure

```
├── backend/
│   ├── main.py               # FastAPI app + CORS + lifespan
│   ├── database.py           # SQLite async engine
│   ├── models.py             # ORM + Pydantic schemas
│   ├── mcp_client.py         # Spawns & talks to MCP servers
│   ├── mcp_servers/
│   │   ├── stock_server.py   # get_stock_quote, history, fundamentals
│   │   └── news_server.py    # get_stock_news, get_market_news
│   └── routers/
│       ├── portfolio.py      # CRUD for holdings
│       ├── market.py         # Direct REST endpoints for charts/news
│       └── chat.py           # Ollama chat + tool-call loop
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx          # Main dashboard
│   │   └── globals.css       # Dark theme CSS variables
│   ├── components/
│   │   ├── PortfolioCard.tsx # Holding card with inline edit
│   │   ├── StockDetail.tsx   # Chart + news for selected stock
│   │   ├── ChatWindow.tsx    # AI chat interface
│   │   ├── AddHoldingModal.tsx
│   │   └── MiniChart.tsx     # Sparkline
│   └── lib/
│       ├── api.ts            # Typed fetch wrappers
│       └── utils.ts          # Formatting helpers
└── .env.example
```
