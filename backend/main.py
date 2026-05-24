from contextlib import asynccontextmanager # define startup/shutdown logic
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from database import init_db
from routers import portfolio, market, chat
from routers import macro


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Code before yield runs once when the server starts → here it initializes the database (creates tables if they don't exist).
    Code after yield would run when the server shuts down (none here yet — you might add await db.close() later).
    expensive one-time setup (opening DB connections, loading ML models) to happen once at boot, not on every request.
    """
    await init_db()
    yield


app = FastAPI(title="Portfolio API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # let's talk to front-end
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio.router)
app.include_router(market.router)
app.include_router(chat.router)
app.include_router(macro.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
