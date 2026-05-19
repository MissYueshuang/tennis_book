"""
Chat router — streams responses from local Ollama (qwen2.5:7b).
Tools are sourced from MCP servers (stock + news) via mcp_client.py.
When the model emits tool_calls, the router executes them via MCP and feeds
results back, then lets the model produce the final answer.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import json
import os

from database import get_db
from models import Holding, ChatMessage, ChatMessageIn
from mcp_client import call_mcp_tool, get_all_tools

router = APIRouter(prefix="/api/chat", tags=["chat"])

OLLAMA_BASE = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:32b")
MAX_HISTORY = 20  # messages to keep in context


async def _load_history(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(ChatMessage).order_by(ChatMessage.created_at.desc()).limit(MAX_HISTORY)
    )
    msgs = result.scalars().all()
    return [{"role": m.role, "content": m.content} for m in reversed(msgs)]


async def _save_message(db: AsyncSession, role: str, content: str):
    db.add(ChatMessage(role=role, content=content))
    await db.commit()


def _system_prompt() -> str:
    return (
        "You are a smart stock portfolio assistant. "
        "You have access to tools to look up real-time stock prices, historical data, "
        "and financial news. Use them to give accurate, data-driven answers. "
        "When the user asks to add, update, or remove holdings, call the appropriate tool. "
        "Keep responses concise and actionable. Format numbers clearly (e.g. $1,234.56, +2.3%)."
    )


async def _run_tool_loop(messages: list[dict], tools: list[dict]) -> str:
    """Run Ollama with tool use in a loop until the model stops calling tools."""
    async with httpx.AsyncClient(timeout=120) as client:
        for _ in range(5):  # max 5 tool call rounds
            payload = {
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
            }
            if tools:
                payload["tools"] = tools

            resp = await client.post(f"{OLLAMA_BASE}/api/chat", json=payload)
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Ollama error: {resp.text}")

            data = resp.json()
            msg = data["message"]
            tool_calls = msg.get("tool_calls", [])

            if not tool_calls:
                return msg.get("content", "")

            # Append assistant message with tool calls
            messages.append(msg)

            # Execute each tool call via MCP
            for tc in tool_calls:
                fn = tc.get("function", {})
                tool_name = fn.get("name", "")
                args = fn.get("arguments", {})
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except Exception:
                        args = {}

                result = await call_mcp_tool(tool_name, args)
                messages.append({
                    "role": "tool",
                    "content": json.dumps(result) if not isinstance(result, str) else result,
                })

        # If we hit the loop limit, ask for a plain response
        payload["tools"] = []
        resp = await client.post(f"{OLLAMA_BASE}/api/chat", json=payload)
        return resp.json()["message"].get("content", "")


@router.post("/")
async def chat(body: ChatMessageIn, db: AsyncSession = Depends(get_db)):
    tools = await get_all_tools()
    history = await _load_history(db)

    messages = [{"role": "system", "content": _system_prompt()}]
    messages.extend(history)
    messages.append({"role": "user", "content": body.content})

    await _save_message(db, "user", body.content)

    reply = await _run_tool_loop(messages, tools)

    await _save_message(db, "assistant", reply)
    return {"role": "assistant", "content": reply}


@router.get("/history")
async def get_history(db: AsyncSession = Depends(get_db)):
    return await _load_history(db)


@router.delete("/history", status_code=204)
async def clear_history(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import delete
    await db.execute(delete(ChatMessage))
    await db.commit()
