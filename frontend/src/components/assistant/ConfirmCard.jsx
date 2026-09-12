import { ShieldAlert } from 'lucide-react';
import { Button } from '../ui/button';
import { useAssistantStore } from '../../store/assistantStore';

const DESCRIBE = {
  reset_all_landmarks: 'Clear ALL 30 landmarks (manual work included).',
  reset_fit: 'Discard every manual joint edit and return to the last auto-fit.',
  approve_fit: 'Mark the fitted skeleton as APPROVED (unlocks the next phase later).',
  save_project: 'Save the project to the database, overwriting the stored version.',
};

export function ConfirmCard() {
  const pending = useAssistantStore(s => s.pendingConfirm);
  const resolve = useAssistantStore(s => s.resolveConfirm);
  if (!pending) return null;
  const { call } = pending;
  return (
    <div data-testid="assist-confirm-card" className="mx-3 my-2 p-3 rounded border" style={{ borderColor: 'var(--dcc-gold)', background: 'rgba(234,179,8,0.08)' }}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert className="w-4 h-4" style={{ color: 'var(--dcc-gold)' }} />
        <span className="dcc-heading text-[11px]" style={{ color: 'var(--dcc-gold)' }}>Assistant requests approval</span>
      </div>
      <div className="text-[11px] mb-1"><span className="font-mono" style={{ color: 'var(--dcc-orange-glow)' }}>{call.name}</span> — {DESCRIBE[call.name] || 'Critical operation.'}</div>
      {Object.keys(call.arguments || {}).length > 0 && <pre className="text-[10px] font-mono mb-2" style={{ color: 'var(--text-mid)' }}>{JSON.stringify(call.arguments)}</pre>}
      <div className="flex gap-2 justify-end">
        <Button data-testid="assist-confirm-deny" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => resolve(false)}>DENY</Button>
        <Button data-testid="assist-confirm-approve" size="sm" className="h-7 text-[11px] text-white" style={{ background: 'var(--dcc-orange)' }} onClick={() => resolve(true)}>APPROVE</Button>
      </div>
    </div>
  );
}
