import { useAppStore } from '../../store/appStore';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Wand2, CheckCircle2, AlertTriangle, XCircle, Trash2, ShieldCheck, ArrowRight } from 'lucide-react';
import { canGenerateSkinning, runAutomaticSkinning, clearSkinning } from '../../lib/skinningService';

export default function SkinningTab() {
  const state = useAppStore();
  const { skinning, skinningValidation: validation, skinningRunning, skinningProgress, skinningStale } = state;
  const gate = canGenerateSkinning(state);
  const setStage = useAppStore(s => s.setStage);
  const setRightTab = useAppStore(s => s.setRightTab);
  const r = skinning?.report;

  return (
    <div className="h-full flex flex-col" data-testid="skinning-tab">
      <div className="px-3 py-3 border-b space-y-2" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="dcc-heading text-[11px]">AUTOMATIC QUINN SKINNING</div>
        <div className="text-[10px] leading-relaxed" style={{ color: 'var(--text-mid)' }}>
          Anatomy-aware weighting using the approved fitted Quinn skeleton. Root, IK and auxiliary bones are excluded; Quinn twist bones remain weightable. Output is limited to four normalized influences per vertex.
        </div>
        <Button data-testid="generate-skinning-btn" size="sm" disabled={!gate.ok || skinningRunning} onClick={() => runAutomaticSkinning()}
          className="h-8 w-full text-[11px] text-white" style={{ background: gate.ok ? 'var(--dcc-orange)' : 'var(--panel-bg-raised)' }}>
          <Wand2 className="w-3.5 h-3.5 mr-1.5" />{skinningRunning ? 'GENERATING WEIGHTS…' : skinning ? 'RE-GENERATE AUTOMATIC WEIGHTS' : 'GENERATE AUTOMATIC WEIGHTS'}
        </Button>
        {!gate.ok && <div className="text-[10px]" style={{ color: 'var(--dcc-gold)' }}>{gate.reasons.join(' · ')}</div>}
        {skinningRunning && (
          <div className="space-y-1">
            <Progress value={Math.round(skinningProgress * 100)} className="h-2" />
            <div className="font-mono text-[9px]" style={{ color: 'var(--text-mid)' }}>{Math.round(skinningProgress * 100)}%</div>
          </div>
        )}
        {skinningStale && <StatusLine type="warn" text="Skeleton changed after weighting — regenerate before export." />}
      </div>

      <div className="flex-1 overflow-auto dcc-scroll p-3 space-y-3">
        {!skinning && (
          <div className="dcc-panel-surface rounded p-3 text-[10px] space-y-2" style={{ color: 'var(--text-mid)' }}>
            <div><b style={{ color: 'var(--text-high)' }}>What this pass does</b></div>
            <div>• same-side anatomical bias to reduce left/right leakage</div>
            <div>• torso / arm / leg / head region priors</div>
            <div>• distance-to-bone-segment falloff, not bone-head proximity</div>
            <div>• automatic nearest-deform fallback so vertices are never left at zero weight</div>
            <div>• skinIndex + skinWeight attributes applied directly to every imported mesh part</div>
          </div>
        )}

        {r && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="VERTICES" value={r.verticesWeighted.toLocaleString()} />
              <Metric label="DEFORM BONES" value={`${r.deformBonesUsed}/${r.totalSkeletonBones}`} />
              <Metric label="AVG INFLUENCES" value={r.avgInfluences.toFixed(2)} />
              <Metric label="MAX INFLUENCES" value={r.maxInfluences} />
              <Metric label="FALLBACK VERTS" value={r.unweighted} color={r.unweighted ? 'var(--dcc-gold)' : 'var(--dcc-emerald)'} />
              <Metric label="SIDE CROSS" value={`${(r.sideCrossRate * 100).toFixed(2)}%`} color={r.sideCrossRate > 0.01 ? 'var(--dcc-gold)' : 'var(--dcc-emerald)'} />
            </div>

            <div className="dcc-panel-surface rounded p-2.5 space-y-1.5">
              <div className="dcc-heading text-[10px] flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> WEIGHT VALIDATION</div>
              {validation?.valid ? <StatusLine type="ok" text="PASS — every vertex has normalized weights, valid bone indices, ≤4 influences, and no root/IK/aux weights." /> : <StatusLine type="error" text="FAIL — resolve the errors below before export." />}
              {validation?.errors?.map((x, i) => <StatusLine key={`e${i}`} type="error" text={x} />)}
              {validation?.warnings?.map((x, i) => <StatusLine key={`v${i}`} type="warn" text={x} />)}
              {r.warnings.map((x, i) => <StatusLine key={`w${i}`} type="warn" text={x} />)}
            </div>
          </>
        )}
      </div>

      {skinning && (
        <div className="px-3 py-2 border-t space-y-2" style={{ borderColor: 'var(--panel-border)' }}>
          <div className="flex items-center justify-between">
            <span className="dcc-label text-[9px]">Weights live in memory and on mesh geometry</span>
            <Button variant="outline" size="sm" onClick={clearSkinning} className="h-7 text-[10px] border-[color:var(--panel-border)]">
              <Trash2 className="w-3 h-3 mr-1" />CLEAR
            </Button>
          </div>
          <Button
            disabled={!validation?.valid || skinningStale}
            onClick={() => { setStage('validation'); setRightTab('diag'); }}
            className="h-8 w-full text-[11px] text-white"
            style={{ background: validation?.valid && !skinningStale ? 'var(--dcc-orange)' : 'var(--panel-bg-raised)' }}
          >
            CONTINUE TO UE5 VALIDATION <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }) {
  return <div className="dcc-panel-surface rounded p-2 text-center"><div className="font-mono text-sm" style={{ color: color || 'var(--text-high)' }}>{value}</div><div className="dcc-label text-[8px]">{label}</div></div>;
}
function StatusLine({ type, text }) {
  const Icon = type === 'ok' ? CheckCircle2 : type === 'error' ? XCircle : AlertTriangle;
  const color = type === 'ok' ? 'var(--dcc-emerald)' : type === 'error' ? 'var(--destructive)' : 'var(--dcc-gold)';
  return <div className="text-[9px] flex items-start gap-1" style={{ color }}><Icon className="w-3 h-3 shrink-0 mt-0.5" /><span>{text}</span></div>;
}
