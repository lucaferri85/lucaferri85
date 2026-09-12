import {
  useAppStore,
} from '../../store/appStore';

import {
  CheckCircle2,
  Lock,
} from 'lucide-react';

const STAGES = [
  {
    id: 'import',
    step: '01',
    name: 'IMPORT MESH',
    desc: 'Import · auto-center · verify origin',
  },

  {
    id: 'landmarks',
    step: '02',
    name: 'LANDMARKS',
    desc: 'Auto-detect · review required anchors · continue',
  },

  {
    id: 'skeleton',
    step: '03',
    name: 'FIT SKELETON',
    desc: 'Auto Fit Quinn 89 · review · approve',
  },

  {
    id: 'skinning',
    step: '04',
    name: 'SKINNING',
    desc: 'Automatic weights · validate · repair',
  },

  {
    id: 'validation',
    step: '05',
    name: 'UE5 VALIDATE',
    desc: 'Verify structure and Unreal compatibility',
  },

  {
    id: 'export',
    step: '06',
    name: 'EXPORT RIG',
    desc: 'FBX / GLTF ready for UE5',
  },
];

export default function BottomStageBar() {
  const stage =
    useAppStore(
      (state) =>
        state.stage
    );

  const setStage =
    useAppStore(
      (state) =>
        state.setStage
    );

  const meshLoaded =
    useAppStore(
      (state) =>
        state.meshLoaded
    );

  const landmarks =
    useAppStore(
      (state) =>
        state.landmarks
    );

  const fitted =
    useAppStore(
      (state) =>
        state.fitted
    );

  const fitApproved =
    useAppStore(
      (state) =>
        state.fitApproved
    );

  const setRightTab =
    useAppStore(
      (state) =>
        state.setRightTab
    );

  const coreLandmarks =
    landmarks.filter(
      (landmark) =>
        landmark.group !==
        'fingers'
    );

  const coreReady =
    coreLandmarks.length > 0 &&
    coreLandmarks.every(
      (landmark) =>
        landmark.placed
    );

  const statusFor =
    (id) => {
      if (id === 'import') {
        return meshLoaded
          ? 'done'
          : 'active';
      }

      if (id === 'landmarks') {
        return coreReady
          ? 'done'
          : meshLoaded
          ? 'active'
          : 'locked';
      }

      if (id === 'skeleton') {
        return fitted
          ? 'done'
          : coreReady
          ? 'ready'
          : 'locked';
      }

      if (id === 'skinning') {
        return fitApproved
          ? 'ready'
          : 'locked';
      }

      return 'locked';
    };

  const currentIndex =
    STAGES.findIndex(
      (item) =>
        item.id ===
        stage
    );

  const navigate =
    (id) => {
      const status =
        statusFor(id);

      if (status === 'locked') {
        return;
      }

      setStage(id);

      if (id === 'landmarks') {
        setRightTab(
          'landmarks'
        );
      } else if (id === 'skeleton') {
        setRightTab(
          'fit'
        );
      } else if (id === 'skinning') {
        setRightTab(
          'skinning'
        );
      }
    };

  return (
    <div
      className="h-16 flex items-stretch border-t"
      style={{
        background:
          'var(--panel-bg-deep)',

        borderColor:
          'var(--panel-border)',
      }}
    >
      {STAGES.map(
        (item, index) => {
          const status =
            statusFor(
              item.id
            );

          const isCurrent =
            index ===
            currentIndex;

          const clickable =
            status !==
            'locked';

          return (
            <button
              key={
                item.id
              }
              data-testid={`stage-nav-${item.id}`}
              onClick={() =>
                navigate(
                  item.id
                )
              }
              disabled={
                !clickable
              }
              className={`flex-1 flex items-center gap-3 px-4 border-r relative transition-colors disabled:opacity-40 ${
                clickable
                  ? 'hover:bg-[color:var(--panel-bg-surface)]'
                  : ''
              }`}
              style={{
                borderColor:
                  'var(--panel-border)',
              }}
            >
              <span
                className="font-mono text-[11px] w-6 h-6 flex items-center justify-center rounded shrink-0"
                style={{
                  background:
                    isCurrent
                      ? 'var(--dcc-orange)'
                      : item.id ===
                          'skinning' &&
                        fitApproved
                      ? 'var(--dcc-emerald)'
                      : 'var(--panel-bg-raised)',

                  color:
                    isCurrent ||
                    (
                      item.id ===
                        'skinning' &&
                      fitApproved
                    )
                      ? '#fff'
                      : 'var(--text-mid)',
                }}
              >
                {status ===
                'done' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : status ===
                  'locked' ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  item.step
                )}
              </span>

              <div className="flex flex-col items-start text-left">
                <span
                  className="dcc-heading text-[11px]"
                  style={{
                    color:
                      isCurrent
                        ? 'var(--dcc-orange-glow)'
                        : item.id ===
                            'skinning' &&
                          fitApproved
                        ? 'var(--dcc-emerald)'
                        : 'var(--text-high)',
                  }}
                >
                  {
                    item.name
                  }
                </span>

                <span className="dcc-label text-[9px]">
                  {
                    item.desc
                  }
                </span>
              </div>

              {isCurrent && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{
                    background:
                      'var(--dcc-orange)',
                  }}
                />
              )}
            </button>
          );
        }
      )}
    </div>
  );
}
