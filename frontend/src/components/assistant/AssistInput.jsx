import { SendHorizonal, Loader2 } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import { useAssistantStore } from '../../store/assistantStore';
import { sendMessage } from '../../lib/assistant/assistantService';

const SUGGESTIONS = [
  'Review the detected landmarks and list what needs correction',
  'Check the right shoulder',
  'Fix the landmarks, then fit the Quinn skeleton',
  'Validate the Quinn skeleton and explain any warnings',
];

export function AssistInput({ disabled }) {
  const draft = useAssistantStore(s => s.draft);
  const setDraft = useAssistantStore(s => s.setDraft);
  const streaming = useAssistantStore(s => s.streaming);
  const empty = useAssistantStore(s => s.messages.length === 0);
  const submit = () => { const t = draft.trim(); if (!t || streaming || disabled) return; setDraft(''); sendMessage(t); };
  return (
    <div className="border-t px-3 py-2 space-y-2" style={{ borderColor: 'var(--panel-border)' }}>
      {empty && (
        <div className="flex flex-wrap gap-1">
          {SUGGESTIONS.map(s => (
            <button key={s} data-testid="assist-suggestion" disabled={disabled} onClick={() => sendMessage(s)} className="text-[10px] px-2 py-1 rounded border hover:border-[color:var(--dcc-orange)] transition-colors" style={{ borderColor: 'var(--panel-border)', color: 'var(--text-mid)' }}>{s}</button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          data-testid="assist-input"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={disabled ? 'Assistant not configured' : 'Ask or instruct the Rig Assistant… (Enter to send)'}
          className="min-h-[38px] max-h-28 text-[12px] bg-[color:var(--panel-bg-surface)] border-[color:var(--panel-border)] resize-none"
          rows={1}
        />
        <button data-testid="assist-send-btn" onClick={submit} disabled={disabled || streaming || !draft.trim()} className="h-9 w-9 shrink-0 rounded flex items-center justify-center text-white disabled:opacity-40" style={{ background: 'var(--dcc-orange)' }}>
          {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
