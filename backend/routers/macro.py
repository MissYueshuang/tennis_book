from fastapi import APIRouter, Query
from typing import List
import asyncio
from tools.macro_tools import (
    get_scorecard, get_valuation, get_history_patterns,
    get_economic, get_sentiment, get_signals_bulk
)

router = APIRouter(prefix="/api/macro")

async def _run(fn, *args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn, *args)

@router.get("/scorecard")
async def scorecard():
    return await _run(get_scorecard)

@router.get("/valuation")
async def valuation():
    return await _run(get_valuation)

@router.get("/history")
async def history():
    return await _run(get_history_patterns)

@router.get("/economic")
async def economic():
    return await _run(get_economic)

@router.get("/sentiment")
async def sentiment():
    return await _run(get_sentiment)

@router.get("/signals")
async def signals(tickers: str = Query(...)):
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    return await _run(get_signals_bulk, ticker_list)
