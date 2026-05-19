from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Holding, HoldingCreate, HoldingUpdate, HoldingOut

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/", response_model=list[HoldingOut])
async def list_holdings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Holding).order_by(Holding.ticker))
    return result.scalars().all()


@router.post("/", response_model=HoldingOut, status_code=201)
async def add_holding(data: HoldingCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Holding).where(Holding.ticker == data.ticker.upper()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"{data.ticker.upper()} already in portfolio")
    holding = Holding(ticker=data.ticker.upper(), shares=data.shares, avg_cost=data.avg_cost)
    db.add(holding)
    await db.commit()
    await db.refresh(holding)
    return holding


@router.patch("/{ticker}", response_model=HoldingOut)
async def update_holding(ticker: str, data: HoldingUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Holding).where(Holding.ticker == ticker.upper()))
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(status_code=404, detail=f"{ticker.upper()} not in portfolio")
    if data.shares is not None:
        holding.shares = data.shares
    if data.avg_cost is not None:
        holding.avg_cost = data.avg_cost
    await db.commit()
    await db.refresh(holding)
    return holding


@router.delete("/{ticker}", status_code=204)
async def remove_holding(ticker: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Holding).where(Holding.ticker == ticker.upper()))
    holding = result.scalar_one_or_none()
    if not holding:
        raise HTTPException(status_code=404, detail=f"{ticker.upper()} not in portfolio")
    await db.delete(holding)
    await db.commit()
