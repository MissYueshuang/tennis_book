"""
Portfolio management tools callable by the LLM.
Uses a synchronous SQLAlchemy session (safe inside run_in_executor threads).
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

DB_PATH = os.getenv("DB_PATH", "portfolio.db")
_engine = create_engine(f"sqlite:///{DB_PATH}")


def _get_holding(session: Session, ticker: str):
    from models import Holding
    return session.query(Holding).filter(Holding.ticker == ticker.upper()).first()


def get_portfolio() -> list:
    """Return all current portfolio holdings with ticker, shares, and average cost."""
    from models import Holding
    with Session(_engine) as s:
        holdings = s.query(Holding).order_by(Holding.ticker).all()
        return [
            {"ticker": h.ticker, "shares": h.shares, "avg_cost": h.avg_cost}
            for h in holdings
        ]


def add_portfolio_holding(ticker: str, shares: float, avg_cost: float) -> dict:
    """
    Add a new stock position to the portfolio.
    ticker: stock symbol e.g. AAPL
    shares: number of shares purchased
    avg_cost: average purchase price per share in USD
    """
    from models import Holding
    ticker = ticker.upper().strip()
    with Session(_engine) as s:
        if _get_holding(s, ticker):
            return {
                "error": f"{ticker} is already in the portfolio. "
                         "Use update_portfolio_holding to change shares or cost."
            }
        s.add(Holding(ticker=ticker, shares=shares, avg_cost=avg_cost))
        s.commit()
    return {"success": True, "message": f"Added {shares} shares of {ticker} at ${avg_cost:.2f} avg cost."}


def update_portfolio_holding(ticker: str, shares: float | None = None, avg_cost: float | None = None) -> dict:
    """
    Update shares and/or average cost for an existing holding.
    Provide only the fields you want to change.
    """
    ticker = ticker.upper().strip()
    with Session(_engine) as s:
        h = _get_holding(s, ticker)
        if not h:
            return {"error": f"{ticker} not found in portfolio. Use add_portfolio_holding to add it."}
        if shares is not None:
            h.shares = shares
        if avg_cost is not None:
            h.avg_cost = avg_cost
        s.commit()
    return {"success": True, "message": f"Updated {ticker}: shares={h.shares}, avg_cost=${h.avg_cost:.2f}."}


def remove_portfolio_holding(ticker: str) -> dict:
    """Remove a stock position from the portfolio entirely."""
    ticker = ticker.upper().strip()
    with Session(_engine) as s:
        h = _get_holding(s, ticker)
        if not h:
            return {"error": f"{ticker} not found in portfolio."}
        s.delete(h)
        s.commit()
    return {"success": True, "message": f"Removed {ticker} from portfolio."}
