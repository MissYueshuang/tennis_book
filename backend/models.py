from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, func
from sqlalchemy.orm import mapped_column, Mapped
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import Base


class Holding(Base):
    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticker: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    shares: Mapped[float] = mapped_column(Float, nullable=False)
    avg_cost: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    role: Mapped[str] = mapped_column(String, nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# Pydantic schemas
class HoldingCreate(BaseModel):
    ticker: str
    shares: float
    avg_cost: float


class HoldingUpdate(BaseModel):
    shares: Optional[float] = None
    avg_cost: Optional[float] = None


class HoldingOut(BaseModel):
    id: int
    ticker: str
    shares: float
    avg_cost: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EtfProfile(Base):
    __tablename__ = "etf_profiles"
    id = Column(Integer, primary_key=True)
    risk = Column(String)           # conservative / moderate / aggressive
    expected_return = Column(Float) # target YoY %
    horizon_years = Column(Integer) # investment horizon
    regions = Column(String)        # JSON-encoded list e.g. '["US","Global"]'
    sectors = Column(String)        # JSON-encoded list
    num_etfs = Column(Integer)
    include_bonds = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EtfSuggestion(Base):
    __tablename__ = "etf_suggestions"
    id = Column(Integer, primary_key=True)
    profile_id = Column(Integer, ForeignKey("etf_profiles.id"))
    ticker = Column(String)
    name = Column(String)
    etf_type = Column(String)       # equity / bond / commodity / cash
    weight = Column(Float)          # 0-100
    justification = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class EtfTransaction(Base):
    __tablename__ = "etf_transactions"
    id = Column(Integer, primary_key=True)
    ticker = Column(String)
    action = Column(String)         # buy / sell
    shares = Column(Float)
    price = Column(Float)
    date = Column(String)           # ISO date string
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatMessageIn(BaseModel):
    content: str
    model: Optional[str] = None   # overrides OLLAMA_MODEL env var if set
    think: bool = False            # Qwen3 thinking mode


class ChatMessageOut(BaseModel):
    role: str
    content: str
