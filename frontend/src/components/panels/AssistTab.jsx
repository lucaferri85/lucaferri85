import { useEffect, useRef } from 'react';
import { Bot, Plus, Cpu } from 'lucide-react';
import { useAssistantStore } from '../../store/assistantStore';
import { useAppStore } from '../../store/appStore';
import { loadConfig, ensureSession, newSession } from '../../lib/assistant/assistantService';
import { MessageBubble } from '../assistant/MessageBubble';
import { ToolCard } from '../assistant/ToolCard';
import { ConfirmCard } from '../assistant/ConfirmCard';
import { AssistInput } from '../assistant/AssistInput';

export default function AssistTab() {
  const config = useAssistantStore(s => s.config);
  const messages = useAssistantStore(s => s.messages);
  const streaming = useAssistantStore(s => s.streaming);
  const actions = useAssistantStore(s => s.actions);
  const projectId = useAppStore(s => s.projectId);
  const endRef = useRef(null);

  useEffect(() => { loadConfig().then(c => { if (c?.configured) ensureSession().catch(() => {}); }); }, [projectId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, streaming]);

  const configured = !!config?.configured;
  const active = actions.filter(a => !a.reverted).length;

  return (
    <div className="h-full flex flex-col" data-testid="assist-tab">
      <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: 'var(--panel-border)' }}>
        <Bot className="w-4 h-4" style={{ color: 'var(--dcc-orange-glow)' }} />
        <div className="flex-1 min-w-0">
          <div className="dcc-heading text-[11px]">Rig Assistant</div>
          <div className="dcc-label text-[9px] truncate flex items-center gap-1" data-testid="assist-model-label">
            <Cpu className="w-3 h-3 shrink-0" /> <span className="truncate">{config ? `${config.provider}/${config.model}` : 'loading…'}</span><span className="shrink-0"> · {configured ? 'tools enabled' : 'NOT CONFIGURED'}</span>
          </div>
        </div>
        {active > 0 && <span className="dcc-label text-[9px]" data-testid="assist-actions-count" style={{ color: 'var(--dcc-cyan)' }}>{active} ACTION{active > 1 ? 'S' : ''}</span>}
        <button data-testid="assist-new-session" title="New conversation" onClick={() => newSession()} className="h-6 w-6 rounded flex items-center justify-center hover:bg-[color:var(--panel-bg-raised)]"><Plus className="w-3.5 h-3.5" /></button>
      </div>

      {!configured && config && (
        <div data-testid="assist-not-configured" className="m-3 p-3 rounded border text-[11px] leading-relaxed" style={{ borderColor: 'var(--dcc-gold)', color: 'var(--text-mid)' }}>
          Add <span className="font-mono" style={{ color: 'var(--dcc-orange-glow)' }}>OPENAI_API_KEY</span> to <span className="font-mono">backend/.env</span> and restart the backend. The key never reaches the browser. Model is set by <span className="font-mono">ASSISTANT_MODEL</span> (currently {config.model}).
        </div>
      )}

      <div className="flex-1 overflow-auto dcc-scroll py-1" data-testid="assist-messages">
        {configured && messages.length === 0 && (
          <div className="mx-3 my-3 text-[11px] leading-relaxed" style={{ color: 'var(--text-mid)' }}>
            I can inspect and operate this rig: review detected landmarks, move or clear them, re-run detection, fit the exact Quinn skeleton, run Compare With Source, and explain every warning. Critical actions ask for your approval; every edit has a REVERT button.
          </div>
        )}
        {messages.map(m => m.role === 'tool' ? <ToolCard key={m.id} m={m} /> : <MessageBubble key={m.id} m={m} />)}
        <ConfirmCard />
        {streaming && !messages.some(m => m.role === 'assistant' && m.id === messages[messages.length - 1]?.id) && (
          <div className="mx-3 my-1 dcc-label text-[9px] dcc-pulse" data-testid="assist-thinking" style={{ color: 'var(--dcc-orange-glow)' }}>THINKING…</div>
        )}
        <div ref={endRef} />
      </div>
      <AssistInput disabled={!configured} />
    </div>
  );
}
