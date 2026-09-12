import { create } from 'zustand';

/** UI state of the Rig Assistant (transcript, streaming, confirmations, action log). */
export const useAssistantStore = create((set, get) => ({
  config: null,           // { configured, provider, model }
  sessionId: null,
  sessionProjectId: null,
  messages: [],           // { id, role: 'user'|'assistant'|'tool'|'error', content, name, arguments, result, status, actionId, at }
  streaming: false,
  pendingConfirm: null,   // { call, resolve }
  actions: [],            // [{ id, name, arguments, at, snapshot, reverted }]
  draft: '',

  setConfig: (config) => set({ config }),
  setSession: (sessionId, sessionProjectId, messages = []) => set({ sessionId, sessionProjectId, messages }),
  setDraft: (draft) => set({ draft }),
  setStreaming: (streaming) => set({ streaming }),
  addMessage: (m) => { const msg = { id: m.id || crypto.randomUUID(), at: new Date().toISOString(), ...m }; set({ messages: [...get().messages, msg] }); return msg.id; },
  appendToMessage: (id, delta) => set({ messages: get().messages.map(m => m.id === id ? { ...m, content: (m.content || '') + delta } : m) }),
  patchMessage: (id, patch) => set({ messages: get().messages.map(m => m.id === id ? { ...m, ...patch } : m) }),
  requestConfirm: (call) => new Promise(resolve => set({ pendingConfirm: { call, resolve } })),
  resolveConfirm: (approved) => { const p = get().pendingConfirm; set({ pendingConfirm: null }); p?.resolve(approved); },
  pushAction: (a) => set({ actions: [...get().actions, a] }),
  markReverted: (id) => set({ actions: get().actions.map(a => a.id === id ? { ...a, reverted: true } : a) }),
  clear: () => set({ messages: [], actions: [], pendingConfirm: null }),
}));
