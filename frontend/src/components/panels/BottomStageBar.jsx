import { useAppStore } from '../../store/appStore';
import { CheckCircle2, Circle, Lock } from 'lucide-react';

const STAGES = [
  { id: 'import',     step: '01', name: 'IMPORT MESH',     desc: 'Load GLB / GLTF / FBX / OBJ' },
  { id: 'landmarks',  step: '02', name: 'PLACE LANDMARKS', desc: 'Define anatomical anchors' },
  { id: 'skeleton',   step: '03', name: 'FIT SKELETON',    desc: 'Import Quinn FBX · Auto Fit · Edit Fit · Compare' },
  { id: 'skinning',   step: '04', name: 'SKINNING',        desc: 'Automatic anatomy-aware Quinn weights' },
  { id: 'validation', step: '05', name: 'UE5 VALIDATE',    desc: 'Skeleton + skin integrity checks' },
  { id: 'export',     step: '06', name: 'EXPORT RIG',      desc: 'Skinned GLB + rig snapshot' },
];

const IMPLEMENTED = new Set(['import', 'landmarks', 'skeleton', 'skinning', 'validation', 'export']);

export default function BottomStageBar() {
  const stage = useAppStore(s => s.stage);
  const setStage = useAppStore(s => s.setStage);
  const meshLoaded = useAppStore(s => s.meshLoaded);
  const landmarks = useAppStore(s => s.landmarks);
  const fitted = useAppStore(s => s.fitted);
  const fitApproved = useAppStore(s => s.fitApproved);
  const skinning = useAppStore(s => s.skinning);
  const skinningValidation = useAppStore(s => s.skinningValidation);
  const comparison = useAppStore(s => s.comparison);
  const skinningStale = useAppStore(s => s.skinningStale);
  const setRightTab = useAppStore(s => s.setRightTab);

  const coreLandmarks = landmarks.filter(l => l.group !== 'fingers');
  const coreReady = coreLandmarks.length > 0 && coreLandmarks.every(l => l.placed);

  const statusFor = (id) => {
    if (id === 'import')    return meshLoaded ? 'done' : 'active';
    if (id === 'landmarks') return coreReady ? 'done' : (meshLoaded ? 'active' : 'locked');
    if (id === 'skeleton')  return fitted ? 'done' : (coreReady ? 'ready' : 'locked');
    if (id === 'skinning')  return skinning ? 'done' : (fitApproved ? 'ready' : 'locked');
    if (id === 'validation') return skinning && skinningValidation?.valid && comparison?.overall !== 'fail' && !skinningStale ? 'done' : (skinning ? 'ready' : 'locked');
    if (id === 'export') return skinning && skinningValidation?.valid && comparison?.overall !== 'fail' && !skinningStale ? 'ready' : 'locked';
    return IMPLEMENTED.has(id) ? 'ready' : 'planned';
  };

  const currentIndex = STAGES.findIndex(s => s.id === stage);

  return (
    <div
      className="h-16 flex items-stretch border-t"
      style={{ background: 'var(--panel-bg-deep)', borderColor: 'var(--panel-border)' }}
    >
      {STAGES.map((s, i) => {
        const st = statusFor(s.id);
        const isCurrent = i === currentIndex;
        const exportReady = !!(skinning && skinningValidation?.valid && comparison?.overall !== 'fail' && !skinningStale);
        const clickable = IMPLEMENTED.has(s.id) && (s.id !== 'skinning' || fitApproved) && (s.id !== 'validation' || !!skinning) && (s.id !== 'export' || exportReady);
        const testId = `stage-nav-${s.id}`;

        return (
          <button
            key={s.id}
            data-testid={testId}
            onClick={() => {
              if (!clickable) return;
              setStage(s.id);
              if (s.id === 'skeleton') setRightTab('fit');
              if (s.id === 'landmarks') setRightTab('landmarks');
              if (s.id === 'skinning') setRightTab('skinning');
              if (s.id === 'validation') setRightTab('diag');
              if (s.id === 'export') setRightTab('export');
            }}
            disabled={!clickable}
            className={`flex-1 flex items-center gap-3 px-4 border-r relative transition-colors disabled:opacity-40 ${clickable ? 'hover:bg-[color:var(--panel-bg-surface)]' : ''}`}
            style={{ borderColor: 'var(--panel-border)' }}
          >
            {/* Step badge */}
            <span
              className="font-mono text-[11px] w-6 h-6 flex items-center justify-center rounded shrink-0"
              style={{
                background: isCurrent ? 'var(--dcc-orange)' : 'var(--panel-bg-raised)',
                color: isCurrent ? '#fff' : 'var(--text-mid)',
              }}
            >
              {st === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
               st === 'locked' ? <Lock className="w-3 h-3" /> :
               s.step}
            </span>

            <div className="flex flex-col items-start text-left">
              <span
                className="dcc-heading text-[11px]"
                style={{ color: isCurrent ? 'var(--dcc-orange-glow)' : 'var(--text-high)' }}
              >
                {s.name}
              </span>
              <span className="dcc-label text-[9px]">
                {clickable ? s.desc : `${s.desc}`}
              </span>
            </div>

            {isCurrent && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: 'var(--dcc-orange)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
