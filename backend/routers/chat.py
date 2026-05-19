"""
Chat router — Ollama (qwen3:32b) with tool use.
- think:false disables Qwen3's silent reasoning chain (big speedup)
- Tool call rounds are non-streaming (need full response to parse tool_calls)
- Final answer is streamed token-by-token via SSE so the UI feels instant
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import json
import os

from database import get_db
from models import ChatMessage, ChatMessageIn
from mcp_client import call_mcp_tool, get_all_tools

router = APIRouter(prefix="/api/chat", tags=["chat"])

OLLAMA_BASE = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:32b")
MAX_HISTORY = 20


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
        "Keep responses concise and actionable. Format numbers clearly (e.g. $1,234.56, +2.3%)."
    )


def _base_payload(
    messages: list[dict],
    stream: bool,
    model: str,
    think: bool,
    tools: list[dict] | None = None,
) -> dict:
    payload: dict = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "think": think,
    }
    if tools:
        payload["tools"] = tools
    return payload


async def _run_tool_rounds(
    messages: list[dict],
    tools: list[dict],
    client: httpx.AsyncClient,
    model: str,
    think: bool,
) -> list[dict]:
    """Execute tool-call rounds (non-streaming) until model stops calling tools.
    Returns the updated messages list ready for the final streaming response."""
    for _ in range(5):
        payload = _base_payload(messages, stream=False, model=model, think=think, tools=tools)
        resp = await client.post(f"{OLLAMA_BASE}/api/chat", json=payload, timeout=120)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Ollama error: {resp.text}")

        msg = resp.json()["message"]
        tool_calls = msg.get("tool_calls", [])

        if not tool_calls:
            # No more tool calls — model is ready to give final answer
            return messages

        messages.append(msg)
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

    return messages


async def _stream_final(messages: list[dict], db: AsyncSession, model: str, think: bool):
    """Stream the final answer token-by-token as SSE, then persist to DB."""
    full_reply = []

    async with httpx.AsyncClient(timeout=120) as client:
        payload = _base_payload(messages, stream=True, model=model, think=think)
        async with client.stream("POST", f"{OLLAMA_BASE}/api/chat", json=payload) as resp:
            if resp.status_code != 200:
                yield f"data: {json.dumps({'error': 'Ollama unreachable'})}\n\n"
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
                    full_reply.append(token)
                    yield f"data: {json.dumps({'token': token})}\n\n"
                if chunk.get("done"):
                    break

    reply = "".join(full_reply)
    await _save_message(db, "assistant", reply)
    yield f"data: {json.dumps({'done': True})}\n\n"


@router.post("/")
async def chat(body: ChatMessageIn, db: AsyncSession = Depends(get_db)):
    model = body.model or OLLAMA_MODEL
    think = body.think

    tools = await get_all_tools()
    history = await _load_history(db)

    messages = [{"role": "system", "content": _system_prompt()}]
    messages.extend(history)
    messages.append({"role": "user", "content": body.content})
    await _save_message(db, "user", body.content)

    # Phase 1: resolve any tool calls (non-streaming)
    async with httpx.AsyncClient(timeout=120) as client:
        messages = await _run_tool_rounds(messages, tools, client, model=model, think=think)

    # Phase 2: stream the final answer
    return StreamingResponse(
        _stream_final(messages, db, model=model, think=think),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/history")
async def get_history(db: AsyncSession = Depends(get_db)):
    return await _load_history(db)


@router.delete("/history", status_code=204)
async def clear_history(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import delete
    await db.execute(delete(ChatMessage))
    await db.commit()
