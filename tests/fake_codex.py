"""Synthetic transport substitute used only by tests, never by the app runtime."""
from server.codex_adapter import CodexError


class FakeCodex:
    def __init__(self, cwd):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass

    async def account(self):
        return {"provider": "codex-subscription", "plan": "synthetic"}

    async def turn(self, thread_id, message, tools):
        yield {"type": "session", "thread_id": thread_id or "test-thread", "model": "synthetic-test", **await self.account()}
        if "test failure" in message:
            raise CodexError("Synthetic quota failure")
        tools.call("get_plans", {})
        if "test guide" in message:
            found = tools.call("search_guides", {"query": "birding"})
            tools.call("read_guide", {"source_id": found[0]["id"]})
        elif "test route" in message:
            tools.call("show_scenario", {"scenario_id": "source-F"})
            tools.call("preview_route", {"place_ids": ["sol", "pohnpei", "palau"]})
        else:
            tools.call("preview_plan", {"base_revision": tools.revision, "operations": [{"op": "extend_stay", "stage_id": "van", "nights": 21}]})
        while tools.events:
            yield tools.events.pop(0)
        yield {"type": "delta", "text": "Synthetic test reply. <img src=x onerror=window.__chatInjection=true>"}
        yield {"type": "done", "citations": tools.citations}
