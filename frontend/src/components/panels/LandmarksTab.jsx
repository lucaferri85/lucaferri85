import {
  useMemo,
  useState,
} from 'react';

import {
  useAppStore,
} from '../../store/appStore';

import {
  Button,
} from '../ui/button';

import {
  Input,
} from '../ui/input';

import {
  LANDMARK_GROUPS,
} from '../../lib/landmarks';

import {
  Target,
  RotateCcw,
  FlipHorizontal2,
  ChevronRight,
  ChevronDown,
  X,
  ScanSearch,
  Move,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

import {
  toast,
} from 'sonner';

import {
  runAutoDetect,
} from '../../lib/landmarkService';

import {
  askAssistant,
} from '../../lib/assistant/assistantService';

import {
  canAutoFit,
} from '../../lib/fitService';

import {
  constrainCenterlineLandmarkPosition,
} from '../../lib/unrealCoordinateSystem';

export const CONF = {
  high: {
    label: 'HIGH',
    color: 'var(--dcc-emerald)',
  },

  medium: {
    label: 'MEDIUM',
    color: 'var(--dcc-gold)',
  },

  low: {
    label: 'LOW',
    color: 'var(--dcc-orange-glow)',
  },

  not_found: {
    label: 'NOT FOUND',
    color: 'var(--destructive)',
  },

  manual: {
    label: 'MANUAL',
    color: 'var(--dcc-cyan)',
  },
};

export default function LandmarksTab() {
  const landmarks =
    useAppStore(
      (state) => state.landmarks
    );

  const meshLoaded =
    useAppStore(
      (state) => state.meshLoaded
    );

  const landmarkMode =
    useAppStore(
      (state) => state.landmarkMode
    );

  const setLandmarkMode =
    useAppStore(
      (state) => state.setLandmarkMode
    );

  const detectionRun =
    useAppStore(
      (state) => state.detectionRun
    );

  const activeLandmarkId =
    useAppStore(
      (state) => state.activeLandmarkId
    );

  const setActiveLandmark =
    useAppStore(
      (state) => state.setActiveLandmark
    );

  const cancelPlacing =
    useAppStore(
      (state) => state.cancelPlacing
    );

  const placingMode =
    useAppStore(
      (state) => state.placingMode
    );

  const clearLandmark =
    useAppStore(
      (state) => state.clearLandmark
    );

  const resetAll =
    useAppStore(
      (state) => state.resetAllLandmarks
    );

  const mirrorAllFromLeft =
    useAppStore(
      (state) => state.mirrorAllFromLeft
    );

  const moveLandmark =
    useAppStore(
      (state) => state.moveLandmark
    );

  const templateSource =
    useAppStore(
      (state) => state.templateSource
    );

  const templateValidation =
    useAppStore(
      (state) => state.templateValidation
    );

  const setStage =
    useAppStore(
      (state) => state.setStage
    );

  const setRightTab =
    useAppStore(
      (state) => state.setRightTab
    );

  const total =
    landmarks.length;

  const placedCount =
    landmarks.filter(
      (landmark) =>
        landmark.placed
    ).length;

  const nextPending =
    landmarks.find(
      (landmark) =>
        !landmark.placed
    );

  const coreMissing =
    landmarks.filter(
      (landmark) =>
        landmark.group !==
          'fingers' &&
        !landmark.placed
    );

  const optionalMissing =
    landmarks.filter(
      (landmark) =>
        landmark.group ===
          'fingers' &&
        !landmark.placed
    );

  const fitGate =
    canAutoFit({
      landmarks,
      templateSource,
      templateValidation,
    });

  const guidedReady =
    fitGate.ok &&
    coreMissing.length === 0;

  const groupedLandmarks =
    useMemo(() => {
      const groups = {
        center: [],
        left: [],
        right: [],
        fingers: [],
      };

      for (
        const landmark
        of landmarks
      ) {
        groups[
          landmark.group
        ].push(
          landmark
        );
      }

      return groups;
    }, [landmarks]);

  const startPlacing =
    () => {
      if (placingMode) {
        cancelPlacing();
      } else if (
        nextPending
      ) {
        setActiveLandmark(
          nextPending.id
        );

        toast.info(
          'Click on the mesh to place: ' +
            nextPending.label
        );
      } else {
        toast.success(
          'All landmarks placed'
        );
      }
    };

  const continueToFit =
    () => {
      if (!guidedReady) {
        if (
          coreMissing.length
        ) {
          toast.error(
            `Required body landmarks missing: ${coreMissing
              .map(
                (landmark) =>
                  landmark.label
              )
              .join(', ')}`
          );

          return;
        }

        toast.error(
          fitGate.reasons[0] ||
            'Fit is not ready yet'
        );

        return;
      }

      cancelPlacing();

      setStage(
        'skeleton'
      );

      setRightTab(
        'fit'
      );

      toast.info(
        'Step 3: press AUTO FIT SKELETON. The 89-bone Quinn skeleton will appear on the character for review.',
        {
          duration: 8000,
        }
      );
    };

  const progressPct =
    total
      ? (placedCount /
          total) *
        100
      : 0;

  return (
    <div className="h-full flex flex-col">
      <div
        className="px-3 py-2.5 border-b space-y-2"
        style={{
          borderColor:
            'var(--panel-border)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="dcc-label">
            Progress
          </span>

          <span className="dcc-metric">
            {placedCount} /{' '}
            {total}
          </span>
        </div>

        <div
          className="h-1 rounded overflow-hidden"
          style={{
            background:
              'var(--panel-bg-raised)',
          }}
        >
          <div
            className="h-full transition-all"
            style={{
              background:
                'linear-gradient(90deg, var(--dcc-orange) 0%, var(--dcc-orange-hover) 100%)',

              width:
                progressPct +
                '%',
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            data-testid="auto-detect-landmarks-btn"
            size="sm"
            className="h-7 text-[11px] text-white gap-1.5 col-span-2"
            style={{
              background:
                'var(--dcc-orange)',
            }}
            onClick={() =>
              runAutoDetect()
            }
            disabled={
              !meshLoaded
            }
          >
            <ScanSearch className="w-3 h-3" />

            {detectionRun
              ? 'RESET / RE-DETECT LANDMARKS'
              : 'AUTO DETECT LANDMARKS'}
          </Button>

          <Button
            data-testid="edit-landmarks-btn"
            size="sm"
            variant="outline"
            className="h-7 text-[11px] border-[color:var(--panel-border)] gap-1"
            style={
              landmarkMode ===
              'edit'
                ? {
                    borderColor:
                      'var(--dcc-orange)',

                    color:
                      'var(--dcc-orange-glow)',
                  }
                : {}
            }
            onClick={() => {
              cancelPlacing();

              setLandmarkMode(
                'edit'
              );

              toast.info(
                'Edit mode: drag any marker in the viewport or type coordinates'
              );
            }}
          >
            <Move className="w-3 h-3" />
            EDIT LANDMARKS
          </Button>

          <Button
            data-testid="start-placement-btn"
            size="sm"
            variant="outline"
            className="h-7 text-[11px] border-[color:var(--panel-border)] gap-1.5"
            style={
              placingMode
                ? {
                    borderColor:
                      'var(--dcc-orange)',

                    color:
                      'var(--dcc-orange-glow)',
                  }
                : {}
            }
            onClick={() => {
              setLandmarkMode(
                'manual'
              );

              startPlacing();
            }}
            title="Fallback: place the remaining landmarks one by one by clicking the mesh"
          >
            {renderPlaceLabel(
              placingMode
            )}
          </Button>

          <Button
            data-testid="mirror-all-btn"
            size="sm"
            variant="outline"
            className="h-7 text-[11px] border-[color:var(--panel-border)] gap-1"
            onClick={() => {
              mirrorAllFromLeft();

              toast.success(
                'Mirrored L to R'
              );
            }}
            title="Mirror all placed LEFT landmarks to RIGHT"
          >
            <FlipHorizontal2 className="w-3 h-3" />
            MIRROR
          </Button>

          <Button
            data-testid="reset-landmarks-btn"
            size="sm"
            variant="outline"
            className="h-7 text-[11px] border-[color:var(--panel-border)] gap-1"
            onClick={() => {
              resetAll();

              setLandmarkMode(
                'idle'
              );

              toast.success(
                'Landmarks reset'
              );
            }}
          >
            <RotateCcw className="w-3 h-3" />
            RESET
          </Button>
        </div>

        {detectionRun && (
          <>
            <div
              className="flex items-center gap-2 text-[9px] font-mono flex-wrap"
              data-testid="detection-summary"
            >
              {[
                'high',
                'medium',
                'low',
                'not_found',
              ].map(
                (confidence) => (
                  <span
                    key={
                      confidence
                    }
                    style={{
                      color:
                        CONF[
                          confidence
                        ].color,
                    }}
                  >
                    {
                      CONF[
                        confidence
                      ].label
                    }{' '}
                    {
                      landmarks.filter(
                        (
                          landmark
                        ) =>
                          landmark.confidence ===
                          confidence
                      ).length
                    }
                  </span>
                )
              )}

              <span
                style={{
                  color:
                    'var(--dcc-cyan)',
                }}
              >
                MANUAL{' '}
                {
                  landmarks.filter(
                    (
                      landmark
                    ) =>
                      landmark.confidence ===
                      'manual'
                  ).length
                }
              </span>
            </div>

            <div
              className="rounded p-2.5 space-y-2"
              data-testid="landmark-next-step-card"
              style={{
                border:
                  guidedReady
                    ? '1px solid var(--dcc-emerald)'
                    : '1px solid var(--dcc-gold)',

                background:
                  guidedReady
                    ? 'rgba(16,185,129,0.06)'
                    : 'rgba(234,179,8,0.06)',
              }}
            >
              <div className="flex items-start gap-2">
                {guidedReady ? (
                  <CheckCircle2
                    className="w-4 h-4 mt-0.5 shrink-0"
                    style={{
                      color:
                        'var(--dcc-emerald)',
                    }}
                  />
                ) : (
                  <AlertTriangle
                    className="w-4 h-4 mt-0.5 shrink-0"
                    style={{
                      color:
                        'var(--dcc-gold)',
                    }}
                  />
                )}

                <div className="space-y-1">
                  <div className="dcc-heading text-[11px]">
                    {guidedReady
                      ? 'BODY LANDMARKS READY'
                      : 'REVIEW BEFORE FITTING'}
                  </div>

                  {guidedReady ? (
                    <>
                      <div
                        className="text-[10px]"
                        style={{
                          color:
                            'var(--text-mid)',
                        }}
                      >
                        All required body anchors are placed.
                        {optionalMissing.length >
                        0
                          ? ` ${optionalMissing.length} optional finger landmark(s) are still missing; Quinn can still be fitted and those bones will use structural fallback rules.`
                          : ' All landmarks are available.'}
                      </div>

                      <div
                        className="text-[10px]"
                        style={{
                          color:
                            'var(--text-mid)',
                        }}
                      >
                        Next: fit the exact imported Quinn skeleton to these anatomical anchors.
                      </div>
                    </>
                  ) : (
                    <div
                      className="text-[10px]"
                      style={{
                        color:
                          'var(--text-mid)',
                      }}
                    >
                      {coreMissing.length >
                      0
                        ? `Required body points missing: ${coreMissing
                            .map(
                              (
                                landmark
                              ) =>
                                landmark.label
                            )
                            .join(', ')}. Fix these before fitting the skeleton.`
                        : fitGate.reasons.join(
                            ' · '
                          )}
                    </div>
                  )}
                </div>
              </div>

              <Button
                data-testid="continue-to-fit-btn"
                size="sm"
                disabled={
                  !guidedReady
                }
                onClick={
                  continueToFit
                }
                className="h-8 w-full text-[11px] text-white"
                style={{
                  background:
                    guidedReady
                      ? 'var(--dcc-orange)'
                      : 'var(--panel-bg-raised)',
                }}
              >
                <ArrowRight className="w-3.5 h-3.5 mr-1.5" />

                {guidedReady
                  ? 'CONTINUE TO FIT SKELETON'
                  : 'FIX REQUIRED LANDMARKS FIRST'}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-auto dcc-scroll">
        <GroupSection
          groupKey="center"
          items={
            groupedLandmarks.center
          }
          activeId={
            activeLandmarkId
          }
          onSelect={
            setActiveLandmark
          }
          onClear={
            clearLandmark
          }
          onEdit={
            moveLandmark
          }
        />

        <GroupSection
          groupKey="left"
          items={
            groupedLandmarks.left
          }
          activeId={
            activeLandmarkId
          }
          onSelect={
            setActiveLandmark
          }
          onClear={
            clearLandmark
          }
          onEdit={
            moveLandmark
          }
        />

        <GroupSection
          groupKey="right"
          items={
            groupedLandmarks.right
          }
          activeId={
            activeLandmarkId
          }
          onSelect={
            setActiveLandmark
          }
          onClear={
            clearLandmark
          }
          onEdit={
            moveLandmark
          }
        />

        <GroupSection
          groupKey="fingers"
          items={
            groupedLandmarks.fingers
          }
          activeId={
            activeLandmarkId
          }
          onSelect={
            setActiveLandmark
          }
          onClear={
            clearLandmark
          }
          onEdit={
            moveLandmark
          }
        />
      </div>

      <div
        className="px-3 py-2 border-t text-[10px] font-mono flex items-center gap-2"
        style={{
          borderColor:
            'var(--panel-border)',

          color:
            'var(--text-mid)',
        }}
      >
        <span className="kbd">
          LMB
        </span>
        Place

        <span className="kbd">
          DRAG
        </span>
        Move

        <span className="kbd">
          RMB
        </span>
        Orbit
      </div>
    </div>
  );
}

function renderPlaceLabel(
  placingMode
) {
  if (placingMode) {
    return (
      <>
        <X className="w-3 h-3" />
        STOP
      </>
    );
  }

  return (
    <>
      <Target className="w-3 h-3" />
      MANUAL PLACEMENT
    </>
  );
}

function GroupSection(
  props
) {
  const {
    groupKey,
    items,
    activeId,
    onSelect,
    onClear,
    onEdit,
  } = props;

  const [
    open,
    setOpen,
  ] = useState(true);

  const meta =
    LANDMARK_GROUPS[
      groupKey
    ];

  const placed =
    items.filter(
      (item) =>
        item.placed
    ).length;

  return (
    <div
      className="border-b"
      style={{
        borderColor:
          'var(--panel-border-subtle)',
      }}
    >
      <button
        onClick={() =>
          setOpen(
            !open
          )
        }
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[color:var(--panel-bg-surface)]"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}

          <span
            className="w-2 h-2 rounded-full"
            style={{
              background:
                meta.color,

              boxShadow:
                '0 0 6px ' +
                meta.color,
            }}
          />

          <span className="dcc-heading text-[11px]">
            {meta.label}
          </span>
        </div>

        <span className="dcc-label text-[10px]">
          {placed}/
          {items.length}
        </span>
      </button>

      {open &&
        items.map(
          (item) => (
            <LandmarkRow
              key={
                item.id
              }
              item={
                item
              }
              active={
                activeId ===
                item.id
              }
              color={
                meta.color
              }
              onSelect={() =>
                onSelect(
                  item.id
                )
              }
              onClear={() =>
                onClear(
                  item.id
                )
              }
              onEdit={
                onEdit
              }
            />
          )
        )}
    </div>
  );
}

function LandmarkRow(
  props
) {
  const {
    item,
    active,
    color,
    onSelect,
    onClear,
    onEdit,
  } = props;

  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    local,
    setLocal,
  ] = useState(
    item.position
  );

  const rowStyle = {
    borderColor:
      'var(--panel-border-subtle)',

    background:
      active
        ? 'rgba(234, 88, 12, 0.10)'
        : 'transparent',
  };

  const dotStyle = {
    background:
      item.placed
        ? color
        : 'transparent',

    border:
      item.placed
        ? 'none'
        : '1px solid ' +
          color,

    opacity:
      item.mirrored
        ? 0.55
        : 1,
  };

  const conf =
    item.placed &&
    item.confidence &&
    CONF[
      item.confidence
    ]
      ? CONF[
          item.confidence
        ]
      : !item.placed &&
        item.confidence ===
          'not_found'
      ? CONF.not_found
      : null;

  const statusColor =
    active
      ? 'var(--dcc-orange-glow)'
      : conf
      ? conf.color
      : item.placed
      ? 'var(--dcc-emerald)'
      : 'var(--text-faint)';

  const statusLabel =
    active
      ? 'ACTIVE'
      : conf
      ? conf.label
      : item.placed
      ? 'PLACED'
      : 'PENDING';

  const applyEdit =
    (event) => {
      event.stopPropagation();

      onEdit(
        item.id,
        constrainCenterlineLandmarkPosition(
          item.id,
          local
        )
      );

      setEditing(
        false
      );

      toast.success(
        'Coordinates updated'
      );
    };

  return (
    <div
      data-testid={
        'landmark-row-' +
        item.id
      }
      className={
        'px-3 py-2 border-b flex flex-col gap-1 cursor-pointer transition-colors ' +
        (active
          ? 'dcc-pulse'
          : '')
      }
      style={
        rowStyle
      }
      onClick={
        onSelect
      }
    >
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={
            dotStyle
          }
        />

        <span className="text-[12px] flex-1 font-medium">
          {item.label}
        </span>

        {item.mirrored && (
          <span
            className="dcc-label text-[9px]"
            style={{
              color:
                'var(--dcc-orange-glow)',
            }}
          >
            MIR
          </span>
        )}

        <span
          className="dcc-label text-[9px]"
          style={{
            color:
              statusColor,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {item.auto &&
        item.note && (
          <div
            className="pl-4 text-[9px] leading-snug flex items-start gap-1"
            style={{
              color:
                'var(--text-faint)',
            }}
            data-testid={
              'landmark-note-' +
              item.id
            }
            title={
              item.note
            }
          >
            <span className="flex-1">
              {item.note.length >
              110
                ? item.note.slice(
                    0,
                    110
                  ) + '…'
                : item.note}
            </span>

            {(item.confidence ===
              'low' ||
              item.confidence ===
                'not_found') && (
              <button
                data-testid={
                  'landmark-explain-' +
                  item.id
                }
                onClick={(
                  event
                ) => {
                  event.stopPropagation();

                  askAssistant(
                    `Explain why landmark "${item.label}" (${item.id}) is ${
                      item.confidence ===
                      'not_found'
                        ? 'NOT FOUND'
                        : 'LOW confidence'
                    } — note: "${item.note}". Propose a geometrically justified position and apply it if you are confident, otherwise tell me what to check.`
                  );
                }}
                className="dcc-label text-[9px] shrink-0 hover:text-white"
                style={{
                  color:
                    'var(--dcc-orange-glow)',
                }}
              >
                EXPLAIN
              </button>
            )}
          </div>
        )}

      {item.placed &&
        !editing && (
          <div className="flex items-center gap-1 pl-4">
            <span className="dcc-metric text-[10px]">
              {item.position.x.toFixed(
                3
              )}
              ,{' '}
              {item.position.y.toFixed(
                3
              )}
              ,{' '}
              {item.position.z.toFixed(
                3
              )}
            </span>

            <div className="ml-auto flex items-center gap-2">
              <button
                data-testid={
                  'landmark-edit-' +
                  item.id
                }
                onClick={(
                  event
                ) => {
                  event.stopPropagation();

                  setLocal(
                    item.position
                  );

                  setEditing(
                    true
                  );
                }}
                className="dcc-label text-[9px] hover:text-[color:var(--dcc-orange-glow)]"
              >
                EDIT
              </button>

              <button
                data-testid={
                  'landmark-clear-' +
                  item.id
                }
                onClick={(
                  event
                ) => {
                  event.stopPropagation();

                  onClear();
                }}
                className="dcc-label text-[9px] hover:text-[color:var(--destructive)]"
              >
                CLEAR
              </button>
            </div>
          </div>
        )}

      {item.placed &&
        editing && (
          <div className="flex items-center gap-1 pl-4">
            <CoordInput
              axis="x"
              testId={
                item.id
              }
              value={
                local.x
              }
              onChange={(
                value
              ) =>
                setLocal({
                  ...local,
                  x: value,
                })
              }
            />

            <CoordInput
              axis="y"
              testId={
                item.id
              }
              value={
                local.y
              }
              onChange={(
                value
              ) =>
                setLocal({
                  ...local,
                  y: value,
                })
              }
            />

            <CoordInput
              axis="z"
              testId={
                item.id
              }
              value={
                local.z
              }
              onChange={(
                value
              ) =>
                setLocal({
                  ...local,
                  z: value,
                })
              }
            />

            <button
              onClick={
                applyEdit
              }
              className="dcc-label text-[9px] hover:text-white"
            >
              APPLY
            </button>

            <button
              onClick={(
                event
              ) => {
                event.stopPropagation();

                setEditing(
                  false
                );
              }}
              className="dcc-label text-[9px] hover:text-white"
            >
              CANCEL
            </button>
          </div>
        )}
    </div>
  );
}

function CoordInput({
  axis,
  testId,
  value,
  onChange,
}) {
  return (
    <Input
      data-testid={
        'landmark-' +
        testId +
        '-' +
        axis
      }
      type="number"
      step="0.01"
      value={
        value
      }
      onChange={(
        event
      ) =>
        onChange(
          parseFloat(
            event.target.value
          )
        )
      }
      onClick={(
        event
      ) =>
        event.stopPropagation()
      }
      className="h-6 w-14 text-[10px] font-mono px-1.5 bg-[color:var(--panel-bg-surface)] border-[color:var(--panel-border)]"
    />
  );
}
