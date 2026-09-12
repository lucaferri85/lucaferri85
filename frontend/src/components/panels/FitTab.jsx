import { useMemo, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Wand2, GitCompare, Move3d, Undo2, RotateCcw, ArrowLeft, Lock, CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { canAutoFit, runAutoFit, runCompare, resetFittedBone, resetFit, backToLandmarks, approveFit, approvalGate } from '../../lib/fitService';
import TemplateBadge from './TemplateBadge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { Checkbox } from '../ui/checkbox';

const STATUS = {
  ok:   { Icon: CheckCircle2, color: 'var(--dcc-emerald)', label: 'OK' },
  warn: { Icon: AlertTriangle, color: 'var(--dcc-gold)', label: 'WARN' },
  error:{ Icon: XCircle, color: 'var(--destructive)', label: 'ERROR' },
  pass: { Icon: CheckCircle2, color: 'var(--dcc-emerald)', label: 'PASS' },
  fail: { Icon: XCircle, color: 'var(--destructive)', label: 'FAIL' },
  info: { Icon: Info, color: 'var(--dcc-cyan)', label: 'INFO' },
};

export default function FitTab() {
  const state = useAppStore();
  const { fitted, comparison, fitEditMode, setFitEditMode, selectedBoneName, setSelectedBone, templateSource, fitApproved, setFitApproved, showFitted, toggleFitted } = state;
  const gate = canAutoFit(state);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    if (!fitted) return [];
    const q = search.toLowerCase();
    return fitted.bones.filter(b => (filter === 'all' || b.status === filter || (filter === 'manual' && b.manual)) && (!q || b.name.toLowerCase().includes(q)));
  }, [fitted, filter, search]);

  const r = fitted?.report;

  return (
    <div className="h-full flex flex-col" data-testid="fit-tab">
      <div className="px-3 py-2.5 border-b space-y-2" style={{ borderColor: 'var(--panel-border)' }}>
        <TemplateBadge source={templateSource} compact />
        <Button data-testid="auto-fit-btn" size="sm" disabled={!gate.ok} onClick={runAutoFit}
          className="h-8 w-full text-[11px] text-white" style={{ background: gate.ok ? 'var(--dcc-orange)' : 'var(--panel-bg-raised)' }}>
          <Wand2 className="w-3.5 h-3.5 mr-1.5" />{fitted ? 'RE-RUN AUTO FIT SKELETON' : 'AUTO FIT SKELETON'}
        </Button>
        {!gate.ok && <div className="text-[10px]" style={{ color: 'var(--dcc-gold)' }} data-testid="auto-fit-blockers">{gate.reasons.join(' · ')}</div>}
        {fitted && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Button data-testid="fit-edit-toggle" size="sm" onClick={() => setFitEditMode(!fitEditMode)} className="h-7 text-[11px] text-white"
                style={{ background: fitEditMode ? 'var(--dcc-orange)' : 'var(--panel-bg-raised)' }}>
                <Move3d className="w-3.5 h-3.5 mr-1.5" />{fitEditMode ? 'EXIT EDIT FIT' : 'EDIT FIT (DRAG JOINTS)'}
              </Button>
              <Button data-testid="compare-source-btn" size="sm" onClick={runCompare} className="h-7 text-[11px] text-white" style={{ background: 'var(--panel-bg-raised)' }}>
                <GitCompare className="w-3.5 h-3.5 mr-1.5" />COMPARE WITH SOURCE
              </Button>
              <Button data-testid="back-to-landmarks-btn" variant="outline" size="sm" onClick={backToLandmarks} className="h-7 text-[11px] border-[color:var(--panel-border)]">
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />BACK TO LANDMARKS
              </Button>
              <Button data-testid="reset-fit-btn" variant="outline" size="sm" onClick={resetFit} className="h-7 text-[11px] border-[color:var(--panel-border)]">
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />RESET FIT
              </Button>
              <Button data-testid="fitted-visibility-toggle" variant="ghost" size="sm" onClick={toggleFitted} className="h-6 text-[10px] col-span-2" style={{ color: 'var(--text-mid)' }}>
                {showFitted ? 'HIDE FITTED SKELETON' : 'SHOW FITTED SKELETON'}
              </Button>
            </div>
            <div className="dcc-panel-surface rounded p-2 grid grid-cols-3 gap-1 text-center" data-testid="fit-summary">
              <Stat label="BONES" value={`${r.bone_count}/${r.template_bone_count ?? r.bone_count}`} testId="fit-bone-count" />
              <Stat label="LANDMARK" value={r.counts.landmark} />
              <Stat label="CHAIN" value={r.counts.chain} />
              <Stat label="SEGMENT" value={r.counts.segment} />
              <Stat label="WARN" value={r.counts.warn} color="var(--dcc-gold)" testId="fit-warn-count" />
              <Stat label="ERROR" value={r.counts.error} color="var(--destructive)" testId="fit-error-count" />
            </div>
            <div className="text-[10px] flex items-center gap-1" data-testid="fit-structure-banner" data-ok={comparison ? comparison.overall !== 'fail' : true}
              style={{ color: comparison?.overall === 'fail' ? 'var(--destructive)' : 'var(--dcc-emerald)' }}>
              {comparison?.overall === 'fail' ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
              {comparison?.overall === 'fail' ? 'STRUCTURE MISMATCH — see Compare With Source' : `Structure preserved: ${r.bone_count} bones · names, order & parents identical to template`}
            </div>
            {(r.counts.warn > 0 || r.counts.error > 0) && (
              <div className="text-[10px] flex items-center gap-1" style={{ color: r.counts.error ? 'var(--destructive)' : 'var(--dcc-gold)' }} data-testid="fit-warning-banner">
                <AlertTriangle className="w-3 h-3" /> {r.counts.error ? `${r.counts.error} bone(s) could not be solved` : `${r.counts.warn} bone(s) placed with reduced reliability`} — review the list below (filter WARN/ERROR) before approving.
              </div>
            )}
            {r.missing_landmarks.length > 0 && (
              <div className="text-[10px]" style={{ color: 'var(--dcc-gold)' }} data-testid="fit-missing-landmarks">Missing landmarks: {r.missing_landmarks.join(', ')}</div>
            )}
            {fitEditMode && <div className="text-[10px]" style={{ color: 'var(--dcc-orange-glow)' }}>Drag an orange joint in the viewport. Children follow; {state.symmetry.enabled ? 'the mirrored bone moves too (symmetry ON).' : 'symmetry is OFF.'}</div>}
          </>
        )}
      </div>

      <div className="flex-1 overflow-auto dcc-scroll">
        {comparison && <CompareBlock comparison={comparison} />}
        {fitted && (
          <div className="px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-1 flex-wrap">
              {['all', 'warn', 'error', 'ok', 'manual'].map(f => (
                <button key={f} data-testid={`fit-filter-${f}`} onClick={() => setFilter(f)} className="font-mono text-[9px] px-1.5 py-0.5 rounded uppercase"
                  style={{ background: filter === f ? 'var(--dcc-orange)' : 'var(--panel-bg-raised)', color: filter === f ? '#fff' : 'var(--text-mid)' }}>{f}</button>
              ))}
              <Input data-testid="fit-bone-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="bone…" className="h-6 ml-auto w-28 text-[10px] font-mono bg-[color:var(--panel-bg-surface)] border-[color:var(--panel-border)]" />
            </div>
            {rows.map(b => <BoneRow key={b.name} b={b} selected={selectedBoneName === b.name} onSelect={() => setSelectedBone(b.name)} onReset={() => resetFittedBone(b.name)} />)}
            {rows.length === 0 && <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>No bones match.</div>}
          </div>
        )}
        {!fitted && (
          <div className="p-3 text-[11px] space-y-2" style={{ color: 'var(--text-mid)' }}>
            <p>Auto Fit solves the loaded authoritative template onto your landmarks: primary chains from landmarks, spine/neck by template arc-length, twist / IK / metacarpal / auxiliary bones relative to their fitted parent segment. No bone is ever renamed, dropped or re-parented.</p>
            <p>Core landmarks placed: {gate.placed}/{gate.total}.</p>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t space-y-1.5" style={{ borderColor: 'var(--panel-border)' }}>
        {fitted && state.fitStale && (
          <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--dcc-gold)' }} data-testid="fit-stale-banner">
            <AlertTriangle className="w-3 h-3" /> Landmarks changed since this fit — re-run Auto Fit before approving.
          </div>
        )}
        {fitApproved && state.fitApproval && (
          <div className="text-[10px]" style={{ color: 'var(--dcc-emerald)' }} data-testid="fit-approval-meta">
            Approved {new Date(state.fitApproval.approved_at).toLocaleString()}{state.fitApproval.acknowledged_warnings ? ` · ${state.fitApproval.acknowledged_warnings} warning(s) acknowledged` : ''}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="dcc-label text-[9px] flex items-center gap-1"><Lock className="w-3 h-3" /> Skinning locked (Phase C)</span>
          <ApproveControl fitted={fitted} fitApproved={fitApproved} onWithdraw={() => { setFitApproved(false); toast.info('Approval withdrawn'); }} />
        </div>
      </div>
    </div>
  );
}

function ApproveControl({ fitted, fitApproved, onWithdraw }) {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const gate = fitted ? approvalGate() : { allowed: false, reason: 'No fit' };
  if (fitApproved) {
    return <Button data-testid="approve-fit-btn" size="sm" onClick={onWithdraw} className="h-7 text-[10px] text-white" style={{ background: 'var(--dcc-emerald)' }}>APPROVED ✓ (click to withdraw)</Button>;
  }
  const click = () => {
    if (!gate.allowed) { toast.error(gate.reason); return; }
    if (gate.needsAck) { setAck(false); setOpen(true); return; }
    approveFit();
  };
  return (
    <>
      <Button data-testid="approve-fit-btn" size="sm" disabled={!fitted} onClick={click} title={gate.allowed ? '' : gate.reason}
        className="h-7 text-[10px] text-white" style={{ background: gate.allowed ? 'var(--panel-bg-raised)' : 'var(--panel-bg-surface)', opacity: gate.allowed ? 1 : 0.7 }}>
        {gate.allowed ? (gate.needsAck ? `MARK FIT APPROVED (${gate.warns} WARN)` : 'MARK FIT APPROVED') : 'APPROVAL BLOCKED'}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="dcc-panel-raised border-[color:var(--panel-border)]" data-testid="approve-ack-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="dcc-heading text-sm">Unresolved fit warnings</AlertDialogTitle>
            <AlertDialogDescription className="text-xs" style={{ color: 'var(--text-mid)' }}>
              This fit has <b>{gate.warns}</b> bone(s) flagged WARN{gate.comparison?.overall === 'warning' ? ' and Compare With Source reports WARNING' : ''}. Approving means you accept these placements as-is. Nothing has been renamed, dropped or re-parented; the warnings concern placement reliability only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox data-testid="approve-ack-checkbox" checked={ack} onCheckedChange={(v) => setAck(!!v)} />
            I have reviewed the {gate.warns} warning(s) in the bone list and accept them.
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="approve-ack-cancel" className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="approve-ack-confirm" disabled={!ack} className="h-8 text-xs text-white" style={{ background: 'var(--dcc-orange)' }}
              onClick={() => { if (approveFit({ acknowledged: true })) setOpen(false); }}>
              Approve with acknowledged warnings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Stat({ label, value, color, testId }) {
  return <div><div className="font-mono text-[13px]" style={{ color: color || 'var(--text-high)' }} data-testid={testId}>{value}</div><div className="dcc-label text-[8px]">{label}</div></div>;
}

function BoneRow({ b, selected, onSelect, onReset }) {
  const s = STATUS[b.status] || STATUS.info;
  return (
    <div data-testid={`fit-bone-${b.name}`} data-status={b.status} onClick={onSelect} className="rounded px-2 py-1 cursor-pointer"
      style={{ background: selected ? 'rgba(234,88,12,0.14)' : 'var(--panel-bg-raised)' }}>
      <div className="flex items-center gap-1.5">
        <s.Icon className="w-3 h-3 shrink-0" style={{ color: s.color }} />
        <span className="font-mono text-[11px] flex-1 truncate" style={{ color: selected ? 'var(--dcc-orange-glow)' : 'var(--text-high)' }}>{b.name}</span>
        {b.manual && <span className="font-mono text-[8px]" style={{ color: 'var(--dcc-orange-glow)' }}>MANUAL</span>}
        <span className="font-mono text-[8px] uppercase" style={{ color: 'var(--text-faint)' }}>{b.method}</span>
        {b.manual && <button data-testid={`fit-bone-reset-${b.name}`} onClick={(e) => { e.stopPropagation(); onReset(); }} title="Reset bone to auto-fit"><Undo2 className="w-3 h-3" style={{ color: 'var(--text-mid)' }} /></button>}
      </div>
      {(selected || b.status !== 'ok') && (
        <div className="text-[9px] mt-0.5 pl-4 leading-snug" style={{ color: 'var(--text-mid)' }}>
          {b.anchor ? `via ${b.anchor} · ` : ''}{b.message || 'Solved directly from landmark'}{b.lengthRatio ? ` · length ${b.lengthRatio.toFixed(2)}×` : ''}
        </div>
      )}
    </div>
  );
}

function CompareBlock({ comparison }) {
  const [open, setOpen] = useState(true);
  const c = STATUS[comparison.overall === 'warning' ? 'warn' : comparison.overall];
  return (
    <div className="mx-3 mt-2 dcc-panel-surface rounded" data-testid="compare-result" data-overall={comparison.overall}>
      <button className="w-full flex items-center justify-between px-2.5 py-2" onClick={() => setOpen(o => !o)}>
        <span className="flex items-center gap-1.5 dcc-heading text-[11px]">{open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}Compare With Source</span>
        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded uppercase" style={{ color: c.color, border: `1px solid ${c.color}` }}>{comparison.overall}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 space-y-1">
          {comparison.checks.map(ch => <CheckRow key={ch.id} ch={ch} />)}
          <div className="dcc-label text-[8px]">{comparison.bone_count} fitted vs {comparison.template_bone_count} template · {new Date(comparison.compared_at).toLocaleTimeString()}</div>
        </div>
      )}
    </div>
  );
}

function CheckRow({ ch }) {
  const [open, setOpen] = useState(false);
  const s = STATUS[ch.status] || STATUS.info;
  return (
    <div className="rounded px-2 py-1" style={{ background: 'var(--panel-bg-raised)' }} data-testid={`compare-check-${ch.id}`} data-status={ch.status}>
      <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => ch.items.length && setOpen(o => !o)}>
        <s.Icon className="w-3 h-3 shrink-0" style={{ color: s.color }} />
        <span className="text-[10px] flex-1">{ch.label}</span>
        <span className="font-mono text-[8px]" style={{ color: s.color }}>{s.label}</span>
      </div>
      <div className="text-[9px] pl-4" style={{ color: 'var(--text-mid)' }}>{ch.detail}{ch.items.length > 0 && <span className="underline ml-1">{open ? 'hide' : `show ${ch.items.length}`}</span>}</div>
      {open && <ul className="pl-4 font-mono text-[9px] max-h-32 overflow-auto dcc-scroll" style={{ color: 'var(--text-high)' }}>{ch.items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
    </div>
  );
}
