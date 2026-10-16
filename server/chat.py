import asyncio
import json
import uuid

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import Field

from server.adapters.store import canonical, now
from server.assistant_tools import PlannerTools
from server.codex_adapter import CodexError
from server.domain.models import StrictModel


class ChatRequest(StrictModel):
    chat_id: uuid.UUID | None = None
    message: str = Field(min_length=1, max_length=6000)
    scenario_id: str = Field(min_length=1, max_length=100)
    base_revision: int = Field(ge=1)
    proposal_id: uuid.UUID | None = None


def install_chat(app, store, factory):
    locks = {}
    work = store.directory/"assistant"
    work.mkdir(exist_ok=True)

    @app.get("/api/v1/assistant/status")
    async def status():
        try:
            async with asyncio.timeout(20):
                async with factory(work) as codex:
                    identity = await codex.account()
            return {"ready": True, "message": "Signed in with ChatGPT", **identity}
        except (CodexError, TimeoutError, OSError):
            return {"ready": False, "message": "Connect the Codex CLI with ChatGPT on this host. No API-key fallback is used."}

    @app.get("/api/v1/chats/{chat_id}")
    def history(chat_id: uuid.UUID):
        with store.connection() as db:
            if not db.execute("SELECT 1 FROM chats WHERE id=?", (str(chat_id),)).fetchone():
                raise HTTPException(404, "Chat not found")
            return [{"role": r["role"], **json.loads(r["payload"])} for r in db.execute("SELECT role,payload FROM chat_messages WHERE chat_id=? ORDER BY id", (str(chat_id),))]

    @app.post("/api/v1/chat")
    async def chat(body: ChatRequest):
        if not body.message.strip():
            raise HTTPException(422, "Enter a question")
        base = store.scenario(body.scenario_id)
        if not base or base["revision"] != body.base_revision:
            raise HTTPException(409, "Scenario changed. Refresh before chatting.")
        chat_id = str(body.chat_id or uuid.uuid4())
        with store.connection() as db:
            row = db.execute("SELECT thread_id FROM chats WHERE id=?", (chat_id,)).fetchone()
            if body.chat_id and not row:
                raise HTTPException(404, "Chat not found")
            if not row:
                db.execute("INSERT INTO chats VALUES(?,?,?)", (chat_id, None, now()))
        lock = locks.setdefault(chat_id, asyncio.Lock())
        if lock.locked():
            raise HTTPException(409, "A reply is already running in this chat")
        await lock.acquire()

        async def stream():
            fragments, citations = [], []
            def event(value):
                return canonical(value)+"\n"
            try:
                with store.connection() as db:
                    thread_id = db.execute("SELECT thread_id FROM chats WHERE id=?", (chat_id,)).fetchone()[0]
                    db.execute("INSERT INTO chat_messages(chat_id,role,payload,created_at) VALUES(?,?,?,?)", (chat_id, "user", canonical({"text": body.message}), now()))
                tools = PlannerTools(store, body.scenario_id, body.base_revision, str(body.proposal_id) if body.proposal_id else None)
                context = canonical({"displayed_scenario_id": body.scenario_id, "base_revision": body.base_revision,
                                     "active_proposal_id": str(body.proposal_id) if body.proposal_id else None})
                prompt = "Application view for this turn: "+context+"\nUser request:\n"+body.message
                yield event({"type": "chat", "chat_id": chat_id})
                async with asyncio.timeout(240):
                    async with factory(work) as codex:
                        async for item in codex.turn(thread_id, prompt, tools):
                            if item["type"] == "session":
                                with store.connection() as db:
                                    db.execute("UPDATE chats SET thread_id=? WHERE id=?", (item.pop("thread_id"), chat_id))
                            elif item["type"] == "delta":
                                fragments.append(item["text"])
                            elif item["type"] == "done":
                                citations = item["citations"]
                                with store.connection() as db:
                                    db.execute("INSERT INTO chat_messages(chat_id,role,payload,created_at) VALUES(?,?,?,?)", (chat_id, "assistant", canonical({"text": "".join(fragments), "citations": citations}), now()))
                            yield event(item)
            except (CodexError, TimeoutError, OSError) as error:
                text = str(error) if isinstance(error, CodexError) else "The Codex connection timed out or stopped. Retry; displayed changes remain previews."
                yield event({"type": "error", "message": text})
            finally:
                lock.release()
        return StreamingResponse(stream(), media_type="application/x-ndjson")
