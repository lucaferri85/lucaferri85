import { toast } from 'sonner';
import { useAppStore } from '../../store/appStore';
import { useAssistantStore } from '../../store/assistantStore';
import { executeTool, stateSummary, takeSnapshot } from './tools';

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api/assistant`;
const A = () => useAssistantStore.getState();

export async function loadConfig() {
  try { const r = await fetch(`${BASE}/config`); const c = await r.json(); A().setConfig(c); return c; }
  catch { A().setConfig({ configured: false, error: 'backend unreachable' }); return null; }
}

/** One session per project (or one anonymous session); reused across reloads via localStorage. */
export async function ensureSession() {
  const a = A(); const projectId = useAppStore.getState().projectId || 'unsaved';
  if (a.sessionId && a.sessionProjectId === projectId) return a.sessionId;
  const key = `quinn.assistant.session.${projectId}`;
  let sid = localStorage.getItem(key);
  if (sid) {
    const r = await fetch(`${BASE}/sessions/${sid}`);
    if (r.ok) { const s = await r.json(); a.setSession(sid, projectId, transcriptToMessages(s.transcript)); return sid; }
  }
  const r = await fetch(`${BASE}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId === 'unsaved' ? null : projectId }) });
  const s = await r.json(); sid = s.id; localStorage.setItem(key, sid); a.setSession(sid, projectId, []);
  return sid;
}

export async function newSession() {
  const projectId = useAppStore.getState().projectId || 'unsaved';
  localStorage.removeItem(`quinn.assistant.session.${projectId}`);
  A().setSession(null, null, []); A().clear();
  return ensureSession();
}

function transcriptToMessages(t = []) {
  return t.map(e => {
    if (e.role === 'tool_call') return { id: e.id, role: 'tool', name: e.name, arguments: e.arguments, status: 'done', at: e.at };
    if (e.role === 'tool_result') return { id: e.id + ':r', role: 'tool_result_hidden', name: e.name, result: e.result, at: e.at };
    return { id: crypto.randomUUID(), role: e.role, content: e.content, at: e.at };
  }).reduce((acc, m) => { // attach results to their tool card
    if (m.role === 'tool_result_hidden') { const card = acc.find(x => x.role === 'tool' && x.id === m.id.slice(0, -2)); if (card) card.result = m.result; return acc; }
    acc.push(m); return acc;
  }, []);
}

export async function sendMessage(text) {
  const a = A();
  if (a.streaming || !text.trim()) return;
  if (!a.config?.configured) { toast.error('Assistant not configured — set OPENAI_API_KEY in backend/.env'); return; }
  const sid = await ensureSession();
  a.addMessage({ role: 'user', content: text });
  a.setStreaming(true);
  try {
    await runStream(`${BASE}/chat`, { session_id: sid, message: text, state: stateSummary() });
  } catch (e) {
    a.addMessage({ role: 'error', content: e.message });
  } finally { A().setStreaming(false); }
}

/** Streams one model turn; executes any tool calls; posts results and continues until no tools are pending. */
async function runStream(url, body) {
  const a = A();
  let assistantMsgId = null;
  const pending = [];
  await readSSE(url, body, (ev) => {
    if (ev.type === 'delta') { if (!assistantMsgId) assistantMsgId = a.addMessage({ role: 'assistant', content: '' }); a.appendToMessage(assistantMsgId, ev.content); }
    else if (ev.type === 'tool_call') { pending.push(ev); a.addMessage({ id: ev.id, role: 'tool', name: ev.name, arguments: ev.arguments, confirm: ev.confirm, mutating: ev.mutating, status: 'pending' }); }
    else if (ev.type === 'error') { a.addMessage({ role: 'error', content: ev.message }); }
  });
  if (!pending.length) return;
  const results = [];
  for (const call of pending) results.push(await performCall(call));
  await runStream(`${BASE}/tool-results`, { session_id: body.session_id, results });
}

async function performCall(call) {
  const a = A();
  let approved = true;
  if (call.confirm) { a.patchMessage(call.id, { status: 'confirm' }); approved = await a.requestConfirm(call); }
  if (!approved) { const result = { ok: false, denied: true, error: 'User denied this action' }; a.patchMessage(call.id, { status: 'denied', result }); return { tool_call_id: call.id, name: call.name, result }; }
  a.patchMessage(call.id, { status: 'running' });
  const actionId = call.mutating ? `act_${call.id.slice(-6)}` : null;
  const snapshot = call.mutating ? takeSnapshot() : null;
  const result = await executeTool(call.name, call.arguments);
  if (actionId) { a.pushAction({ id: actionId, name: call.name, arguments: call.arguments, at: new Date().toISOString(), snapshot, ok: result.ok }); result.action_id = actionId; }
  a.patchMessage(call.id, { status: result.ok ? 'done' : 'failed', result, actionId });
  return { tool_call_id: call.id, name: call.name, result };
}

async function readSSE(url, body, onEvent) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { let d = ''; try { d = (await res.json()).detail; } catch { /* ignore */ } throw new Error(d || `HTTP ${res.status}`); }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of chunk.split('\n')) if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)));
    }
  }
}

/** Revert an assistant action from the UI (same path as the tool). */
export async function revertAction(actionId) {
  const r = await executeTool('revert_assistant_action', { action_id: actionId });
  (r.ok ? toast.success : toast.error)(r.ok ? `Reverted ${r.name}` : r.error);
  return r;
}

/** Pre-fill the chat with an "explain" request from another panel and open the ASSIST tab. */
export function askAssistant(text, { send = true } = {}) {
  useAppStore.setState({ rightTab: 'assist' });
  if (send) sendMessage(text); else A().setDraft(text);
}

if (typeof window !== 'undefined') window.__quinnAssistant = { sendMessage, executeTool, stateSummary, ensureSession, newSession, revertAction };
