import {
  useAppStore,
} from '../../store/appStore';

import {
  CheckCircle2,
  Lock,
  Wand2,
  AlertTriangle,
} from 'lucide-react';

export default function SkinningTab() {
  const fitApproved =
    useAppStore(
      (state) =>
        state.fitApproved
    );

  const fitApproval =
    useAppStore(
      (state) =>
        state.fitApproval
    );

  const fitted =
    useAppStore(
      (state) =>
        state.fitted
    );

  if (
    !fitApproved ||
    !fitted
  ) {
    return (
      <div className="h-full p-3">
        <div
          className="rounded p-3 space-y-2"
          style={{
            border:
              '1px solid var(--panel-border)',

            background:
              'var(--panel-bg-surface)',
          }}
        >
          <div className="flex items-center gap-2 dcc-heading text-[11px]">
            <Lock className="w-4 h-4" />
            PHASE C LOCKED
          </div>

          <div
            className="text-[10px]"
            style={{
              color:
                'var(--text-mid)',
            }}
          >
            Approve the fitted Quinn skeleton before continuing to skinning.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full p-3 overflow-auto dcc-scroll"
      data-testid="skinning-tab"
    >
      <div
        className="rounded p-3 space-y-3"
        style={{
          border:
            '1px solid var(--dcc-emerald)',

          background:
            'rgba(16,185,129,0.06)',
        }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2
            className="w-4 h-4"
            style={{
              color:
                'var(--dcc-emerald)',
            }}
          />

          <div className="dcc-heading text-[11px]">
            PHASE C UNLOCKED
          </div>
        </div>

        <div
          className="text-[10px] leading-relaxed"
          style={{
            color:
              'var(--text-mid)',
          }}
        >
          The fitted Quinn skeleton has been approved. Skinning is now available for this project.
        </div>

        <div className="dcc-panel-surface rounded p-2 grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="font-mono text-[13px]">
              {
                fitted.bones
                  ?.length ||
                0
              }
            </div>

            <div className="dcc-label text-[8px]">
              APPROVED BONES
            </div>
          </div>

          <div>
            <div
              className="font-mono text-[13px]"
              style={{
                color:
                  'var(--dcc-emerald)',
              }}
            >
              READY
            </div>

            <div className="dcc-label text-[8px]">
              FIT STATUS
            </div>
          </div>
        </div>

        {fitApproval
          ?.acknowledged_warnings >
          0 && (
          <div
            className="text-[10px] flex items-start gap-1.5"
            style={{
              color:
                'var(--dcc-gold)',
            }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />

            <span>
              {
                fitApproval
                  .acknowledged_warnings
              }{' '}
              fit warning(s) were explicitly acknowledged before approval. They no longer block Phase C.
            </span>
          </div>
        )}
      </div>

      <div
        className="mt-3 rounded p-3 space-y-2"
        style={{
          border:
            '1px solid var(--panel-border)',

          background:
            'var(--panel-bg-surface)',
        }}
      >
        <div className="flex items-center gap-2 dcc-heading text-[11px]">
          <Wand2 className="w-4 h-4" />
          AUTOMATIC SKINNING
        </div>

        <div
          className="text-[10px] leading-relaxed"
          style={{
            color:
              'var(--text-mid)',
          }}
        >
          Phase C is unlocked correctly. The automatic vertex-weight generation engine is not yet implemented in the current repository; this is the next functional module to build.
        </div>
      </div>
    </div>
  );
}
