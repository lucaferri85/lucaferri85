import { useAppStore } from '../../store/appStore';
import { CheckCircle2, Circle, Lock } from 'lucide-react';

const STAGES = [
  { id: 'import',     step: '01', name: 'IMPORT MESH',     desc: 'Load GLB / GLTF / FBX / OBJ' },
  { id: 'landmarks',  step: '02', name: 'PLACE LANDMARKS', desc: 'Define anatomical anchors' },
  { id: 'skeleton',   step: '03', name: 'FIT SKELETON',    desc: 'Solve Quinn template · Phase 2' },
  { id: 'skinning',   step: '04', name: 'SKINNING',        desc: 'Heat-diffusion weights · Phase 3' },
  { id: 'validation', step: '05', name: 'UE5 VALIDATE',    desc: 'Bone parity vs template · Phase 3' },
  { id: 'export',     step: '06', name: 'EXPORT RIG',      desc: 'FBX / GLTF for UE5 · Phase 4' },
];

const IMPLEMENTED = new Set(['import', 'landmarks', 'skeleton']);

export default function BottomStageBar() {
  const stage = useAppStore(s => s.stage);
  const setStage = useAppStore(s => s.setStage);
  const meshLoaded = useAppStore(s => s.meshLoaded);
  const landmarks = useAppStore(s => s.landmarks);
  const showSkeleton = useAppStore(s => s.showSkeleton);
  const toggleSkeleton = useAppStore(s => s.toggleSkeleton);

  const placedCount = landmarks.filter(l => l.placed).length;

  const statusFor = (id) => {
    if (id === 'import')    return meshLoaded ? 'done' : 'active';
    if (id === 'landmarks') return placedCount === landmarks.length ? 'done' : (meshLoaded ? 'active' : 'locked');
    if (id === 'skeleton')  return showSkeleton ? 'done' : (meshLoaded ? 'ready' : 'locked');
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
        const clickable = IMPLEMENTED.has(s.id);
        const testId = `stage-nav-${s.id}`;

        return (
          <button
            key={s.id}
            data-testid={testId}
            onClick={() => {
              if (!clickable) return;
              setStage(s.id);
              if (s.id === 'skeleton' && !showSkeleton) toggleSkeleton();
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
