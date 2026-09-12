import { useState } from 'react';
import { Wrench, Check, X, Loader2, ShieldAlert, RotateCcw, ChevronRight, ChevronDown } from 'lucide-react';
import { useAssistantStore } from '../../store/assistantStore';
import { revertAction } from '../../lib/assistant/assistantService';

const STATUS = {
  pending: { label: 'QUEUED', color: 'var(--text-faint)' },
  confirm: { label: 'AWAITING APPROVAL', color: 'var(--dcc-gold)' },
  running: { label: 'RUNNING', color: 'var(--dcc-cyan)' },
  done:    { label: 'OK', color: 'var(--dcc-emerald)' },
  failed:  { label: 'FAILED', color: 'var(--destructive)' },
  denied:  { label: 'DENIED', color: 'var(--dcc-orange-glow)' },
};

const fmtArgs = (a) => { const s = JSON.stringify(a || {}); return s.length > 90 ? s.slice(0, 90) + '…' : s; };

export function ToolCard({ m }) {
  const [open, setOpen] = useState(false);
  const action = useAssistantStore(s => s.actions.find(a => a.id === m.actionId));
  const st = STATUS[m.status] || STATUS.done;
  const Icon = m.status === 'running' ? Loader2 : m.status === 'confirm' ? ShieldAlert : m.status === 'done' ? Check : m.status === 'failed' || m.status === 'denied' ? X : Wrench;
  return (
    <div data-testid={'assist-tool-' + m.name} className="mx-3 my-1 rounded border text-[10px] font-mono" style={{ borderColor: 'var(--panel-border-subtle)', background: 'var(--panel-bg-surface)' }}>
      <button className="w-full flex items-center gap-2 px-2 py-1.5 text-left" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <Icon className={'w-3 h-3 shrink-0 ' + (m.status === 'running' ? 'animate-spin' : '')} style={{ color: st.color }} />
        <span className="font-semibold" style={{ color: 'var(--dcc-orange-glow)' }}>{m.name}</span>
        <span className="truncate flex-1" style={{ color: 'var(--text-faint)' }}>{fmtArgs(m.arguments)}</span>
        <span data-testid={'assist-tool-status-' + m.name} style={{ color: st.color }}>{st.label}</span>
      </button>
      {(open || m.status === 'failed') && m.result && (
        <pre className="px-2 pb-2 whitespace-pre-wrap break-words max-h-48 overflow-auto dcc-scroll" style={{ color: m.result.ok ? 'var(--text-mid)' : 'var(--destructive)' }}>
          {JSON.stringify(m.result, null, 1).slice(0, 4000)}
        </pre>
      )}
      {action && !action.reverted && action.snapshot && (
        <div className="px-2 pb-1.5 flex justify-end">
          <button data-testid={'assist-revert-' + action.id} onClick={() => revertAction(action.id)} className="flex items-center gap-1 hover:text-white" style={{ color: 'var(--text-mid)' }}>
            <RotateCcw className="w-3 h-3" /> REVERT
          </button>
        </div>
      )}
      {action?.reverted && <div className="px-2 pb-1.5 text-right" style={{ color: 'var(--text-faint)' }}>REVERTED</div>}
    </div>
  );
}
