"""
ETF Portfolio router — profile configuration, AI suggestions, and holdings tracking.
"""
import json
import os
import re
from typing import AsyncGenerator

import httpx
import yfinance as yf
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import EtfProfile, EtfSuggestion, EtfTransaction

router = APIRouter(prefix="/api/etf", tags=["etf"])

OLLAMA_BASE = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")


# ── Pydantic request/response schemas ────────────────────────────────────────

class ProfileIn(BaseModel):
    risk: str
    expected_return: float
    horizon_years: int
    regions: list[str]
    sectors: list[str]
    num_etfs: int
    include_bonds: bool = True


class TransactionIn(BaseModel):
    ticker: str
    action: str   # buy / sell
    shares: float
    price: float
    date: str     # ISO date string


# ── Helpers ───────────────────────────────────────────────────────────────────

def _strip_think(text: str) -> str:
    """Remove <think>...</think> blocks that some Qwen3 models emit."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _extract_json_array(text: str) -> list[dict]:
    """Extract the first JSON array from a (possibly noisy) string."""
    clean = _strip_think(text)
    # Try direct parse first
    try:
        obj = json.loads(clean)
        if isinstance(obj, list):
            return obj
    except Exception:
        pass
    # Fallback: find [ ... ] block
    match = re.search(r"\[.*\]", clean, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    return []


async def _get_latest_profile(db: AsyncSession) -> EtfProfile | None:
    result = await db.execute(select(EtfProfile).order_by(EtfProfile.id.desc()).limit(1))
    return result.scalar_one_or_none()


# ── Profile endpoints ─────────────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(db: AsyncSession = Depends(get_db)):
    profile = await _get_latest_profile(db)
    if not profile:
        return {}
    return {
        "id": profile.id,
        "risk": profile.risk,
        "expected_return": profile.expected_return,
        "horizon_years": profile.horizon_years,
        "regions": json.loads(profile.regions or "[]"),
        "sectors": json.loads(profile.sectors or "[]"),
        "num_etfs": profile.num_etfs,
        "include_bonds": profile.include_bonds,
        "updated_at": profile.updated_at,
    }


@router.post("/profile")
async def save_profile(body: ProfileIn, db: AsyncSession = Depends(get_db)):
    profile = await _get_latest_profile(db)
    if profile:
        profile.risk = body.risk
        profile.expected_return = body.expected_return
        profile.horizon_years = body.horizon_years
        profile.regions = json.dumps(body.regions)
        profile.sectors = json.dumps(body.sectors)
        profile.num_etfs = body.num_etfs
        profile.include_bonds = body.include_bonds
    else:
        profile = EtfProfile(
            risk=body.risk,
            expected_return=body.expected_return,
            horizon_years=body.horizon_years,
            regions=json.dumps(body.regions),
            sectors=json.dumps(body.sectors),
            num_etfs=body.num_etfs,
            include_bonds=body.include_bonds,
        )
        db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return {"id": profile.id, "updated_at": profile.updated_at}


# ── Suggestions endpoints ─────────────────────────────────────────────────────

@router.get("/suggestions")
async def get_suggestions(db: AsyncSession = Depends(get_db)):
    profile = await _get_latest_profile(db)
    if not profile:
        return []
    result = await db.execute(
        select(EtfSuggestion)
        .where(EtfSuggestion.profile_id == profile.id)
        .order_by(EtfSuggestion.id.asc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "ticker": r.ticker,
            "name": r.name,
            "etf_type": r.etf_type,
            "weight": r.weight,
            "justification": r.justification,
        }
        for r in rows
    ]


@router.post("/suggest")
async def suggest_etfs(db: AsyncSession = Depends(get_db)):
    profile = await _get_latest_profile(db)
    if not profile:
        raise HTTPException(status_code=400, detail="Save a profile first")

    regions = json.loads(profile.regions or "[]")
    sectors = json.loads(profile.sectors or "[]")
    prompt = (
        "You are an ETF portfolio manager for long-term/retirement investing. "
        f"Investor profile: risk={profile.risk}, target={profile.expected_return}% YoY, "
        f"horizon={profile.horizon_years} years, regions={regions}, sectors={sectors}, "
        f"num_etfs={profile.num_etfs}, include_bonds={profile.include_bonds}.\n\n"
        "Create a diversified low-cost ETF portfolio. "
        "Use well-known ETFs (SPY, VTI, QQQ, BND, GLD, VGK, EEM, EWJ, SCHD, JEPI, etc.).\n\n"
        f"Return ONLY valid JSON array (no markdown, no /think tags) of exactly {profile.num_etfs} ETFs:\n"
        '[{"ticker":"VTI","name":"Vanguard Total Stock Market ETF","type":"equity","weight":40,'
        '"justification":"..."}]\n'
        "Weights must sum to 100."
    )

    async def _stream() -> AsyncGenerator[str, None]:
        accumulated: list[str] = []
        payload = {
            "model": OLLAMA_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
            "think": False,
        }
        async with httpx.AsyncClient(timeout=180) as client:
            async with client.stream("POST", f"{OLLAMA_BASE}/api/chat", json=payload) as resp:
                if resp.status_code != 200:
                    yield f"data: Error contacting Ollama\n\n"
                    return
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        accumulated.append(token)
                        yield f"data: {token}\n\n"
                    if chunk.get("done"):
                        break

        # Parse and persist suggestions
        full_text = "".join(accumulated)
        etfs = _extract_json_array(full_text)

        # Clear old suggestions for this profile
        await db.execute(
            delete(EtfSuggestion).where(EtfSuggestion.profile_id == profile.id)
        )
        for etf in etfs:
            suggestion = EtfSuggestion(
                profile_id=profile.id,
                ticker=etf.get("ticker", ""),
                name=etf.get("name", ""),
                etf_type=etf.get("type", "equity"),
                weight=float(etf.get("weight", 0)),
                justification=etf.get("justification", ""),
            )
            db.add(suggestion)
        await db.commit()
        yield f"data: [DONE]\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Holdings endpoints ────────────────────────────────────────────────────────

@router.get("/holdings")
async def get_holdings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EtfTransaction).order_by(EtfTransaction.created_at.asc()))
    transactions = result.scalars().all()

    # Aggregate by ticker
    agg: dict[str, dict] = {}
    for tx in transactions:
        ticker = tx.ticker.upper()
        if ticker not in agg:
            agg[ticker] = {"shares": 0.0, "cost_basis": 0.0}
        if tx.action == "buy":
            old_shares = agg[ticker]["shares"]
            old_cost = agg[ticker]["cost_basis"]
            new_shares = old_shares + tx.shares
            # Weighted avg cost
            if new_shares > 0:
                agg[ticker]["cost_basis"] = (old_cost * old_shares + tx.price * tx.shares) / new_shares
            agg[ticker]["shares"] = new_shares
        elif tx.action == "sell":
            agg[ticker]["shares"] = max(0.0, agg[ticker]["shares"] - tx.shares)

    # Filter out zeroed positions
    agg = {t: v for t, v in agg.items() if v["shares"] > 0}

    if not agg:
        return []

    # Fetch current prices via yfinance
    holdings_out = []
    for ticker, data in agg.items():
        try:
            info = yf.Ticker(ticker).fast_info
            current_price = float(info.get("lastPrice") or info.get("regularMarketPrice") or data["cost_basis"])
        except Exception:
            current_price = data["cost_basis"]
        avg_cost = data["cost_basis"]
        shares = data["shares"]
        market_value = current_price * shares
        pnl_pct = ((current_price - avg_cost) / avg_cost * 100) if avg_cost > 0 else 0.0
        holdings_out.append({
            "ticker": ticker,
            "shares": shares,
            "avg_cost": avg_cost,
            "current_price": current_price,
            "market_value": market_value,
            "pnl_pct": pnl_pct,
        })

    return holdings_out


@router.post("/transaction", status_code=201)
async def add_transaction(body: TransactionIn, db: AsyncSession = Depends(get_db)):
    tx = EtfTransaction(
        ticker=body.ticker.upper(),
        action=body.action,
        shares=body.shares,
        price=body.price,
        date=body.date,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return {"id": tx.id, "ticker": tx.ticker, "action": tx.action, "shares": tx.shares, "price": tx.price, "date": tx.date}


@router.delete("/transaction/{tx_id}", status_code=204)
async def delete_transaction(tx_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(EtfTransaction).where(EtfTransaction.id == tx_id))
    tx = result.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await db.delete(tx)
    await db.commit()
