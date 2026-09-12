"""Agentic Rig Assistant — SSE streaming chat with browser-executed tools.
Model/provider/key come from env: ASSISTANT_PROVIDER (openai), ASSISTANT_MODEL (gpt-5.6-sol), OPENAI_API_KEY (or EMERGENT_LLM_KEY)."""
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, ToolCallStart, ToolCallReady, StreamDone

from assistant_tools import TOOL_SCHEMAS, CONFIRM_TOOLS, MUTATING_TOOLS, SYSTEM_PROMPT

logger = logging.getLogger("assistant")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _api_key() -> Optional[str]:
    return os.environ.get("OPENAI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY") or None


def _model():
    return os.environ.get("ASSISTANT_PROVIDER", "openai"), os.environ.get("ASSISTANT_MODEL", "gpt-5.6-sol")


def _sse(obj: Dict[str, Any]) -> str:
    return f"data: {json.dumps(obj)}\n\n"


def _clean(o):
    return json.loads(json.dumps(o, default=str))


class ChatIn(BaseModel):
    session_id: str
    message: str
    state: Optional[Dict[str, Any]] = None


class ToolResultIn(BaseModel):
    tool_call_id: str
    name: str
    result: Any


class ToolResultsIn(BaseModel):
    session_id: str
    results: List[ToolResultIn]


class SessionIn(BaseModel):
    project_id: Optional[str] = None
    title: Optional[str] = None


def make_assistant_router(db) -> APIRouter:
    router = APIRouter(prefix="/api/assistant")
    col = db["assistant_sessions"]

    def build_chat(session) -> LlmChat:
        key = _api_key()
        if not key:
            raise HTTPException(status_code=503, detail="Assistant not configured: set OPENAI_API_KEY in backend/.env")
        provider, model = _model()
        chat = LlmChat(api_key=key, session_id=session["id"], system_message=SYSTEM_PROMPT,
                       initial_messages=session.get("messages") or None)
        chat = chat.with_model(provider, model).with_tools(TOOL_SCHEMAS, tool_choice="auto")
        effort = os.environ.get("ASSISTANT_REASONING_EFFORT", "none")  # gpt-5.6 chat-completions + function tools require 'none'
        if effort and effort != "default":
            chat = chat.with_params(reasoning_effort=effort)
        return chat

    async def load(session_id: str):
        s = await col.find_one({"id": session_id}, {"_id": 0})
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        return s

    async def stream_turn(session, user_msg: Optional[UserMessage], chat: LlmChat):
        pending, text = [], []
        try:
            async for ev in chat.stream_message(user_msg):
                if isinstance(ev, TextDelta):
                    text.append(ev.content)
                    yield _sse({"type": "delta", "content": ev.content})
                elif isinstance(ev, ToolCallStart):
                    yield _sse({"type": "tool_start", "name": ev.name})
                elif isinstance(ev, ToolCallReady):
                    tc = ev.tool_call
                    args = tc.arguments if isinstance(tc.arguments, dict) else _safe_json(tc.arguments)
                    pending.append({"id": tc.id, "name": tc.name, "arguments": args})
                    yield _sse({"type": "tool_call", "id": tc.id, "name": tc.name, "arguments": args,
                                "confirm": tc.name in CONFIRM_TOOLS, "mutating": tc.name in MUTATING_TOOLS})
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:  # provider / network errors surface to the UI, never crash the stream
            logger.exception("assistant stream failed")
            yield _sse({"type": "error", "message": _redact(str(e))})
            yield _sse({"type": "done", "pending_tools": []})
            return
        transcript_add = []
        if "".join(text).strip():
            transcript_add.append({"role": "assistant", "content": "".join(text), "at": _now()})
        for tc in pending:
            transcript_add.append({"role": "tool_call", "id": tc["id"], "name": tc["name"], "arguments": tc["arguments"], "at": _now()})
        await col.update_one({"id": session["id"]}, {"$set": {"messages": _clean(chat.messages), "updated_at": _now()},
                                                     "$push": {"transcript": {"$each": transcript_add}}})
        yield _sse({"type": "done", "pending_tools": pending})

    @router.get("/config")
    async def config():
        provider, model = _model()
        return {"configured": bool(_api_key()), "provider": provider, "model": model,
                "key_source": "OPENAI_API_KEY" if os.environ.get("OPENAI_API_KEY") else ("EMERGENT_LLM_KEY" if os.environ.get("EMERGENT_LLM_KEY") else None)}

    @router.get("/tools")
    async def tools():
        return [{"name": t["function"]["name"], "description": t["function"]["description"],
                 "confirm": t["function"]["name"] in CONFIRM_TOOLS, "mutating": t["function"]["name"] in MUTATING_TOOLS} for t in TOOL_SCHEMAS]

    @router.post("/sessions")
    async def create_session(body: SessionIn):
        provider, model = _model()
        s = {"id": str(uuid.uuid4()), "project_id": body.project_id, "title": body.title or "Rig Assistant",
             "model": f"{provider}/{model}", "messages": [], "transcript": [], "created_at": _now(), "updated_at": _now()}
        await col.insert_one(dict(s))
        return s

    @router.get("/sessions")
    async def list_sessions(project_id: Optional[str] = None):
        q = {"project_id": project_id} if project_id else {}
        cur = col.find(q, {"_id": 0, "messages": 0, "transcript": 0}).sort("updated_at", -1).limit(20)
        return [s async for s in cur]

    @router.get("/sessions/{session_id}")
    async def get_session(session_id: str):
        s = await load(session_id)
        s.pop("messages", None)
        return s

    @router.delete("/sessions/{session_id}")
    async def delete_session(session_id: str):
        r = await col.delete_one({"id": session_id})
        if not r.deleted_count:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"ok": True}

    @router.post("/chat")
    async def chat(body: ChatIn):
        session = await load(body.session_id)
        chat_obj = build_chat(session)
        await col.update_one({"id": session["id"]}, {"$push": {"transcript": {"role": "user", "content": body.message, "at": _now()}}})
        prefix = f"[APP STATE]\n{json.dumps(body.state, separators=(',', ':'))}\n\n" if body.state else ""
        return StreamingResponse(stream_turn(session, UserMessage(text=prefix + body.message), chat_obj),
                                 media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @router.post("/tool-results")
    async def tool_results(body: ToolResultsIn):
        session = await load(body.session_id)
        chat_obj = build_chat(session)
        entries = []
        for r in body.results:
            try:
                chat_obj.add_tool_result(r.tool_call_id, json.dumps(r.result, default=str))
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
            entries.append({"role": "tool_result", "id": r.tool_call_id, "name": r.name, "result": _clean(r.result), "at": _now()})
        await col.update_one({"id": session["id"]}, {"$set": {"messages": _clean(chat_obj.messages)}, "$push": {"transcript": {"$each": entries}}})
        return StreamingResponse(stream_turn(session, None, chat_obj), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return router


def _safe_json(s):
    try:
        return json.loads(s) if isinstance(s, str) else (s or {})
    except Exception:
        return {"_raw": s}


def _redact(msg: str) -> str:
    key = _api_key()
    return msg.replace(key, "***") if key else msg
