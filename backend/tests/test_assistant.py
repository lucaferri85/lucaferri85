"""Backend tests for the agentic Rig Assistant (config/tools/sessions/chat SSE)."""
import json
import os
import time
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://quinn-fitter.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api/assistant"

CONFIRM_EXPECTED = {"reset_all_landmarks", "reset_fit", "approve_fit", "save_project"}


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- config ----------
def test_config_no_key_leak(s):
    r = s.get(f"{API}/config", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body["configured"] is True
    assert body["provider"] == "openai"
    assert body["model"] == "gpt-5.6-sol"
    assert body["key_source"] in ("OPENAI_API_KEY", "EMERGENT_LLM_KEY")
    raw = r.text
    assert "sk-" not in raw
    assert "sk-emergent" not in raw
    # no verbatim key value under any known keys
    for k in ("api_key", "key", "openai_api_key", "emergent_llm_key"):
        assert k not in body


# ---------- tools ----------
def test_tools_catalog(s):
    r = s.get(f"{API}/tools", timeout=20)
    assert r.status_code == 200
    tools = r.json()
    assert isinstance(tools, list) and len(tools) == 25
    names = {t["name"] for t in tools}
    for t in tools:
        assert set(t.keys()) >= {"name", "description", "confirm", "mutating"}
    confirms = {t["name"] for t in tools if t["confirm"]}
    assert confirms == CONFIRM_EXPECTED
    for req in ("inspect_landmarks", "move_landmark", "offset_landmark", "run_auto_fit",
                "approve_fit", "reset_all_landmarks", "get_project_state", "save_project"):
        assert req in names


# ---------- sessions ----------
@pytest.fixture(scope="module")
def sess_id(s):
    r = s.post(f"{API}/sessions", json={"project_id": None}, timeout=20)
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    yield sid
    s.delete(f"{API}/sessions/{sid}", timeout=20)


def test_session_created(sess_id):
    assert isinstance(sess_id, str) and len(sess_id) > 10


def test_get_session_has_transcript_no_messages(s, sess_id):
    r = s.get(f"{API}/sessions/{sess_id}", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "transcript" in body
    assert "messages" not in body
    assert body["id"] == sess_id


def test_list_sessions_filter(s, sess_id):
    r = s.get(f"{API}/sessions", timeout=20)
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert sess_id in ids


def test_get_unknown_session_404(s):
    r = s.get(f"{API}/sessions/does-not-exist-xyz", timeout=20)
    assert r.status_code == 404


def test_chat_unknown_session_404(s):
    r = s.post(f"{API}/chat",
               json={"session_id": "does-not-exist-xyz", "message": "hi"},
               timeout=20)
    assert r.status_code == 404


def test_tool_result_wrong_id_400(s, sess_id):
    r = s.post(f"{API}/tool-results",
               json={"session_id": sess_id,
                     "results": [{"tool_call_id": "bogus-id", "name": "inspect_landmarks",
                                  "result": {"ok": True}}]},
               timeout=20)
    assert r.status_code == 400


def test_delete_session(s):
    r = s.post(f"{API}/sessions", json={"project_id": None}, timeout=20)
    sid = r.json()["id"]
    d = s.delete(f"{API}/sessions/{sid}", timeout=20)
    assert d.status_code == 200
    assert d.json() == {"ok": True}
    g = s.get(f"{API}/sessions/{sid}", timeout=20)
    assert g.status_code == 404


# ---------- SSE tool loop ----------
def _parse_sse(text):
    events = []
    for line in text.splitlines():
        if line.startswith("data:"):
            try:
                events.append(json.loads(line[5:].strip()))
            except Exception:
                pass
    return events


def test_chat_sse_tool_loop(s):
    # fresh session
    sid = s.post(f"{API}/sessions", json={"project_id": None}, timeout=20).json()["id"]
    try:
        payload = {
            "session_id": sid,
            "message": "Inspect the shoulder_r landmark only (call inspect_landmarks with ids [shoulder_r]) and nothing else",
            "state": {"landmarks": {"problems": ["shoulder_r:low"]}}
        }
        with s.post(f"{API}/chat", json=payload, stream=True, timeout=120) as r:
            assert r.status_code == 200
            body = r.text  # collect full text
        events = _parse_sse(body)
        assert any(e.get("type") == "done" for e in events), f"no done event; events={events}"
        tool_calls = [e for e in events if e.get("type") == "tool_call"]
        # Model may issue parallel tool calls; verify inspect_landmarks is one of them
        assert any(tc["name"] == "inspect_landmarks" for tc in tool_calls), f"tool_calls={tool_calls}"
        insp = next(tc for tc in tool_calls if tc["name"] == "inspect_landmarks")
        assert insp["confirm"] is False
        assert insp["mutating"] is False
        assert "id" in insp and "arguments" in insp
        done = [e for e in events if e.get("type") == "done"][-1]
        assert done.get("pending_tools"), "pending_tools empty on done"

        # Post tool result with correct id
        tc_id = insp["id"]
        results = [{
            "tool_call_id": tc_id,
            "name": "inspect_landmarks",
            "result": {"ok": True, "landmarks": [{"id": "shoulder_r", "confidence": "low",
                                                    "position": {"x": -0.2, "y": 1.35, "z": 0}, "note": "test"}]}
        }]
        # Also satisfy any other parallel tool calls with a minimal ok result so the model can finalise
        for tc in tool_calls:
            if tc["id"] != tc_id:
                results.append({"tool_call_id": tc["id"], "name": tc["name"], "result": {"ok": True}})

        with s.post(f"{API}/tool-results",
                    json={"session_id": sid, "results": results},
                    stream=True, timeout=120) as r2:
            assert r2.status_code == 200
            body2 = r2.text
        events2 = _parse_sse(body2)
        assert any(e.get("type") == "done" for e in events2), f"no final done; events2={events2}"

        # Wrong tool_call_id → 400
        bad = s.post(f"{API}/tool-results",
                     json={"session_id": sid,
                           "results": [{"tool_call_id": "wrong-xyz", "name": "inspect_landmarks",
                                        "result": {"ok": True}}]},
                     timeout=30)
        assert bad.status_code == 400

        # Transcript should contain user, tool_call, tool_result entries
        tr = s.get(f"{API}/sessions/{sid}", timeout=20).json()["transcript"]
        roles = {e["role"] for e in tr}
        assert "user" in roles
        assert "tool_call" in roles
        assert "tool_result" in roles
    finally:
        s.delete(f"{API}/sessions/{sid}", timeout=20)
