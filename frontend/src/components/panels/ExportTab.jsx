import { useAppStore } from '../../store/appStore';
import { Button } from '../ui/button';
import { Download, FileJson, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import { canExport, exportRig } from '../../lib/exportService';

export default function ExportTab() {
  const state = useAppStore();
  const gate = canExport(state);
  return (
    <div className="h-full flex flex-col" data-testid="export-tab">
      <div className="px-3 py-3 border-b space-y-2" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="dcc-heading text-[11px]">EXPORT RIG</div>
        {gate.ok ? (
          <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--dcc-emerald)' }}><CheckCircle2 className="w-3 h-3" /> Skeleton + skin validation passed.</div>
        ) : (
          <div className="text-[10px] flex items-start gap-1" style={{ color: 'var(--dcc-gold)' }}><Lock className="w-3 h-3 shrink-0" /><span>{gate.reasons.join(' · ')}</span></div>
        )}
      </div>
      <div className="p-3 space-y-3 overflow-auto dcc-scroll">
        <div className="dcc-panel-surface rounded p-3 space-y-2">
          <div className="dcc-heading text-[10px]">GLB — SKINNED RIG</div>
          <div className="text-[10px]" style={{ color: 'var(--text-mid)' }}>Exports the normalized mesh, four-influence skin weights and the fitted Quinn hierarchy as a binary glTF. Bone names and hierarchy are preserved.</div>
          <Button disabled={!gate.ok} onClick={() => exportRig('glb')} className="h-8 w-full text-[11px] text-white" style={{ background: gate.ok ? 'var(--dcc-orange)' : 'var(--panel-bg-raised)' }}>
            <Download className="w-3.5 h-3.5 mr-1.5" />EXPORT SKINNED GLB
          </Button>
        </div>
        <div className="dcc-panel-surface rounded p-3 space-y-2">
          <div className="dcc-heading text-[10px]">QUINN RIG SNAPSHOT</div>
          <div className="text-[10px]" style={{ color: 'var(--text-mid)' }}>Reproducible JSON snapshot containing every fitted bone plus the exact Uint16 skin indices and Float32 weights encoded losslessly.</div>
          <Button disabled={!gate.ok} variant="outline" onClick={() => exportRig('json')} className="h-8 w-full text-[11px] border-[color:var(--panel-border)]">
            <FileJson className="w-3.5 h-3.5 mr-1.5" />EXPORT .QUINNRIG.JSON
          </Button>
        </div>
        <div className="dcc-panel-surface rounded p-3 space-y-1.5">
          <div className="dcc-heading text-[10px] flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> FBX / UE5</div>
          <div className="text-[10px] leading-relaxed" style={{ color: 'var(--text-mid)' }}>Direct browser FBX writing stays blocked on purpose: we will not fake a UE-compatible FBX. Use the included Blender bridge for the final FBX conversion so armature export options are explicit and testable.</div>
        </div>
      </div>
    </div>
  );
}
