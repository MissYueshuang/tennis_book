from sqlalchemy import Column, Integer, String, Float, DateTime, func
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


class ChatMessageIn(BaseModel):
    content: str


class ChatMessageOut(BaseModel):
    role: str
    content: str
