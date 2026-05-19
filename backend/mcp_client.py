"""
Lightweight MCP client that spawns stdio MCP servers as subprocesses and:
  1. Queries each server for its tool list (converted to Ollama/OpenAI tool format)
  2. Routes tool-call requests from the LLM back to the correct server

Servers are started lazily on first use and kept alive for the process lifetime.
"""
import asyncio
import sys
import os
import json
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

_SERVERS_DIR = Path(__file__).parent / "mcp_servers"

# Map server_name -> (server_script_path, list_of_tool_names, ClientSession)
_sessions: dict[str, dict] = {}
_lock = asyncio.Lock()

SERVER_SCRIPTS = {
    "stock": str(_SERVERS_DIR / "stock_server.py"),
    "news": str(_SERVERS_DIR / "news_server.py"),
}


async def _start_server(name: str) -> dict:
    script = SERVER_SCRIPTS[name]
    params = StdioServerParameters(
        command=sys.executable,
        args=[script],
        env={**os.environ},
    )
    read, write = await stdio_client(params).__aenter__()
    session = ClientSession(read, write)
    await session.__aenter__()
    await session.initialize()
    tools_resp = await session.list_tools()
    tool_names = [t.name for t in tools_resp.tools]
    return {"session": session, "tools": tools_resp.tools, "tool_names": tool_names}


async def _ensure_started(name: str):
    async with _lock:
        if name not in _sessions:
            _sessions[name] = await _start_server(name)


def _mcp_tool_to_ollama(tool) -> dict:
    """Convert an MCP Tool object to the Ollama/OpenAI function-calling schema."""
    schema = tool.inputSchema or {}
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": schema,
        },
    }


async def get_all_tools() -> list[dict]:
    """Return all tools from all MCP servers in Ollama function-calling format."""
    tasks = [_ensure_started(name) for name in SERVER_SCRIPTS]
    await asyncio.gather(*tasks)

    tools = []
    for name, state in _sessions.items():
        for t in state["tools"]:
            tools.append(_mcp_tool_to_ollama(t))
    return tools


async def call_mcp_tool(tool_name: str, arguments: dict[str, Any]) -> Any:
    """Route a tool call to the correct MCP server and return its result."""
    for name, state in _sessions.items():
        if tool_name in state["tool_names"]:
            result = await state["session"].call_tool(tool_name, arguments)
            # MCP returns content list; extract text
            if result.content:
                parts = []
                for c in result.content:
                    if hasattr(c, "text"):
                        parts.append(c.text)
                    else:
                        parts.append(str(c))
                combined = "\n".join(parts)
                try:
                    return json.loads(combined)
                except Exception:
                    return combined
            return {}

    return {"error": f"Tool '{tool_name}' not found in any MCP server"}
