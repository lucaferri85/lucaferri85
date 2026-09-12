import {
  useRef,
  useState,
} from 'react';

import {
  useAppStore,
} from '../../store/appStore';

import {
  getViewportManager,
} from '../viewport/viewportBridge';

import {
  Switch,
} from '../ui/switch';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

import {
  Button,
} from '../ui/button';

import {
  UploadCloud,
  Trash2,
  HardDrive,
  Crosshair,
} from 'lucide-react';

import {
  toast,
} from 'sonner';

import TemplateSection from './TemplateSection';

import {
  storeMeshFile,
  deleteStoredMesh,
} from '../../lib/meshStorage';

import {
  centerViewportMesh,
} from '../../lib/meshAlignmentService';

function addDelta(position, delta) {
  return {
    x: (position?.x || 0) + delta.x,
    y: (position?.y || 0) + delta.y,
    z: (position?.z || 0) + delta.z,
  };
}

function shiftFitted(fitted, delta) {
  if (!fitted?.bones) return fitted;

  return {
    ...fitted,
    bones: fitted.bones.map((bone) => ({
      ...bone,
      globalPos: Array.isArray(bone.globalPos)
        ? [
            bone.globalPos[0] + delta.x,
            bone.globalPos[1] + delta.y,
            bone.globalPos[2] + delta.z,
          ]
        : bone.globalPos,
    })),
  };
}

export default function LeftPanel() {
  const setMesh =
    useAppStore(
      (state) => state.setMesh
    );

  const clearMesh =
    useAppStore(
      (state) => state.clearMesh
    );

  const mesh =
    useAppStore(
      (state) => state.mesh
    );

  const meshLoaded =
    useAppStore(
      (state) => state.meshLoaded
    );

  const symmetry =
    useAppStore(
      (state) => state.symmetry
    );

  const setSymmetry =
    useAppStore(
      (state) => state.setSymmetry
    );

  const landmarks =
    useAppStore(
      (state) => state.landmarks
    );

  const fitted =
    useAppStore(
      (state) => state.fitted
    );

  const fileInputRef =
    useRef(null);

  const [
    dragOver,
    setDragOver,
  ] = useState(false);

  const applyAlignmentToState = (
    alignment,
    {
      shiftExistingRig = false,
      preserveAssetMeta = {},
    } = {}
  ) => {
    const state =
      useAppStore.getState();

    const previousDelta =
      state.mesh?.alignment?.delta || {
        x: 0,
        y: 0,
        z: 0,
      };

    const cumulativeDelta = {
      x:
        previousDelta.x +
        alignment.delta.x,

      y:
        previousDelta.y +
        alignment.delta.y,

      z:
        previousDelta.z +
        alignment.delta.z,
    };

    const nextMesh = {
      ...state.mesh,
      ...preserveAssetMeta,

      height_m:
        alignment.height_m,

      bounds_min:
        alignment.bounds_min,

      bounds_max:
        alignment.bounds_max,

      centered:
        true,

      alignment: {
        ...alignment,
        delta:
          cumulativeDelta,
      },
    };

    const update = {
      mesh:
        nextMesh,

      meshLoaded:
        true,

      dirty:
        true,
    };

    if (shiftExistingRig) {
      update.landmarks =
        state.landmarks.map(
          (landmark) =>
            landmark.placed
              ? {
                  ...landmark,
                  position:
                    addDelta(
                      landmark.position,
                      alignment.delta
                    ),
                }
              : landmark
        );

      update.fitted =
        shiftFitted(
          state.fitted,
          alignment.delta
        );

      update.fittedAuto =
        shiftFitted(
          state.fittedAuto,
          alignment.delta
        );

      update.comparison =
        null;

      update.fitApproved =
        false;

      update.fitApproval =
        null;

      update.fitStale =
        !!state.fitted;
    }

    useAppStore.setState(
      update
    );
  };

  const onFilePicked =
    async (file) => {
      if (!file) return;

      const ext =
        file.name
          .split('.')
          .pop()
          .toLowerCase();

      if (
        ![
          'glb',
          'gltf',
          'obj',
          'fbx',
        ].includes(ext)
      ) {
        toast.error(
          `Unsupported format: .${ext} (use glb, gltf, obj, or fbx)`
        );

        return;
      }

      const manager =
        getViewportManager();

      if (!manager) {
        toast.error(
          'Viewport not ready yet'
        );

        return;
      }

      const loadingToast =
        toast.loading(
          `Loading and centering ${file.name}…`
        );

      try {
        const meshInfo =
          await manager.loadMeshFromFile(
            file
          );

        // First set the normal mesh metadata.
        setMesh(
          meshInfo
        );

        // Save the original binary file locally for project restore.
        const stored =
          await storeMeshFile(
            file
          );

        useAppStore.setState({
          mesh: {
            ...useAppStore.getState().mesh,

            local_asset_id:
              stored.id,

            local_asset_saved:
              true,

            local_asset_size:
              stored.size,

            local_asset_saved_at:
              stored.saved_at,
          },
        });

        // Extra robust centering after ViewportManager's base normalization.
        const alignment =
          centerViewportMesh(
            manager
          );

        applyAlignmentToState(
          alignment,
          {
            shiftExistingRig:
              false,

            preserveAssetMeta: {
              local_asset_id:
                stored.id,

              local_asset_saved:
                true,

              local_asset_size:
                stored.size,

              local_asset_saved_at:
                stored.saved_at,
            },
          }
        );

        toast.success(
          `Loaded ${file.name} · ${meshInfo.vertices.toLocaleString()} verts · centered to origin`,
          {
            id:
              loadingToast,
          }
        );
      } catch (error) {
        console.error(
          error
        );

        toast.error(
          `Load failed: ${error.message}`,
          {
            id:
              loadingToast,
          }
        );
      }
    };

  const centerCurrentMesh =
    () => {
      const manager =
        getViewportManager();

      if (!manager?.currentMesh) {
        toast.error(
          'No mesh loaded'
        );

        return;
      }

      try {
        const alignment =
          centerViewportMesh(
            manager
          );

        applyAlignmentToState(
          alignment,
          {
            shiftExistingRig:
              landmarks.some(
                (landmark) =>
                  landmark.placed
              ) ||
              !!fitted,
          }
        );

        const d =
          alignment.delta;

        toast.success(
          `Mesh centered · ΔX ${d.x.toFixed(
            4
          )} · ΔY ${d.y.toFixed(
            4
          )} · ΔZ ${d.z.toFixed(
            4
          )}`
        );
      } catch (error) {
        toast.error(
          `Centering failed: ${error.message}`
        );
      }
    };

  const removeMesh =
    async () => {
      const manager =
        getViewportManager();

      if (manager) {
        manager.removeMesh();
      }

      const assetId =
        mesh?.local_asset_id;

      if (assetId) {
        try {
          await deleteStoredMesh(
            assetId
          );
        } catch (error) {
          console.warn(
            'Could not remove stored mesh:',
            error
          );
        }
      }

      clearMesh();

      toast.success(
        'Mesh removed'
      );
    };

  const alignmentDelta =
    mesh?.alignment?.delta;

  return (
    <aside
      className="flex flex-col border-r overflow-hidden"
      style={{
        background:
          'var(--panel-bg-deep)',

        borderColor:
          'var(--panel-border)',

        width: 320,
      }}
    >
      <Section
        title="Mesh & Assets"
        step="01"
      >
        <div
          data-testid="mesh-upload-dropzone"
          onDragOver={(
            event
          ) => {
            event.preventDefault();

            setDragOver(
              true
            );
          }}
          onDragLeave={() =>
            setDragOver(
              false
            )
          }
          onDrop={(
            event
          ) => {
            event.preventDefault();

            setDragOver(
              false
            );

            onFilePicked(
              event
                .dataTransfer
                .files?.[0]
            );
          }}
          onClick={() =>
            fileInputRef
              .current
              ?.click()
          }
          className="cursor-pointer rounded border-2 border-dashed p-4 flex flex-col items-center justify-center gap-2 transition-colors"
          style={{
            borderColor:
              dragOver
                ? 'var(--dcc-orange)'
                : 'var(--panel-border)',

            background:
              dragOver
                ? 'rgba(234, 88, 12, 0.06)'
                : 'transparent',
          }}
        >
          <UploadCloud
            className="w-6 h-6"
            style={{
              color:
                'var(--dcc-orange-glow)',
            }}
          />

          <div className="text-xs text-center leading-tight">
            <div className="font-medium">
              Drop mesh or click to browse
            </div>

            <div className="dcc-label mt-1 text-[9px]">
              GLB · GLTF · FBX · OBJ
            </div>
          </div>

          <input
            ref={
              fileInputRef
            }
            type="file"
            accept=".glb,.gltf,.obj,.fbx"
            className="hidden"
            data-testid="mesh-file-input"
            onChange={(
              event
            ) => {
              onFilePicked(
                event.target
                  .files?.[0]
              );

              event.target.value =
                '';
            }}
          />
        </div>

        {meshLoaded && (
          <div className="mt-3 dcc-panel-surface rounded p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="dcc-label">
                Mesh Info
              </span>

              <button
                data-testid="mesh-remove-btn"
                onClick={
                  removeMesh
                }
                className="text-[color:var(--text-faint)] hover:text-[color:var(--dcc-orange)]"
                title="Remove mesh"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <MetricRow
              label="FILE"
              value={
                mesh.filename ||
                '—'
              }
            />

            <MetricRow
              label="FORMAT"
              value={(
                mesh.format ||
                '—'
              ).toUpperCase()}
            />

            <MetricRow
              label="VERTS"
              value={
                mesh.vertices
                  ?.toLocaleString() ||
                '0'
              }
            />

            <MetricRow
              label="FACES"
              value={
                mesh.faces
                  ?.toLocaleString() ||
                '0'
              }
            />

            <MetricRow
              label="HEIGHT"
              value={`${mesh.height_m?.toFixed(
                2
              )} m`}
            />

            <div
              className="flex items-center gap-1.5 pt-1 font-mono text-[9px]"
              style={{
                color:
                  mesh.local_asset_id
                    ? 'var(--dcc-emerald)'
                    : 'var(--dcc-gold)',
              }}
            >
              <HardDrive className="w-3 h-3" />

              {mesh.local_asset_id
                ? 'MESH FILE STORED LOCALLY'
                : 'MESH FILE NOT YET STORED'}
            </div>

            <div
              className="rounded p-2 space-y-1"
              style={{
                border:
                  '1px solid var(--panel-border)',

                background:
                  'var(--panel-bg-deep)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="dcc-label">
                  WORLD ALIGNMENT
                </span>

                <span
                  className="font-mono text-[9px]"
                  style={{
                    color:
                      mesh.centered
                        ? 'var(--dcc-emerald)'
                        : 'var(--dcc-gold)',
                  }}
                >
                  {mesh.centered
                    ? 'CENTERED'
                    : 'CHECK'}
                </span>
              </div>

              {alignmentDelta && (
                <div
                  className="font-mono text-[9px]"
                  style={{
                    color:
                      'var(--text-mid)',
                  }}
                >
                  X {alignmentDelta.x.toFixed(4)}
                  {' · '}
                  Y {alignmentDelta.y.toFixed(4)}
                  {' · '}
                  Z {alignmentDelta.z.toFixed(4)}
                </div>
              )}

              <Button
                data-testid="mesh-center-origin-btn"
                size="sm"
                variant="outline"
                className="h-7 w-full text-[10px] border-[color:var(--panel-border)]"
                onClick={
                  centerCurrentMesh
                }
                title="Recalculate a robust humanoid center and place the feet on Y=0. Existing landmarks and fitted bones move with the mesh."
              >
                <Crosshair className="w-3 h-3 mr-1.5" />
                CENTER MESH TO ORIGIN
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Symmetry"
        step="02"
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs">
              Auto-mirror Left → Right
            </span>

            <span className="dcc-label text-[9px]">
              Placed left markers mirror to right
            </span>
          </div>

          <Switch
            data-testid="symmetry-toggle"
            checked={
              symmetry.enabled
            }
            onCheckedChange={(
              value
            ) =>
              setSymmetry({
                enabled:
                  value,
              })
            }
            className="data-[state=checked]:bg-[color:var(--dcc-orange)]"
          />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="dcc-label">
            Mirror Axis
          </span>

          <Select
            value={
              symmetry.axis
            }
            onValueChange={(
              value
            ) =>
              setSymmetry({
                axis:
                  value,
              })
            }
          >
            <SelectTrigger
              data-testid="symmetry-axis-select"
              className="h-7 w-24 text-xs bg-[color:var(--panel-bg-surface)] border-[color:var(--panel-border)]"
            >
              <SelectValue />
            </SelectTrigger>

            <SelectContent className="dcc-panel-raised">
              <SelectItem value="x">
                X (default)
              </SelectItem>

              <SelectItem value="y">
                Y
              </SelectItem>

              <SelectItem value="z">
                Z
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section
        title="Skeleton Template"
        step="03"
      >
        <TemplateSection />
      </Section>

      <div className="flex-1" />
    </aside>
  );
}

function Section({
  title,
  step,
  children,
}) {
  return (
    <div
      className="border-b p-3.5 space-y-2.5"
      style={{
        borderColor:
          'var(--panel-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background:
              'var(--panel-bg-raised)',

            color:
              'var(--dcc-orange-glow)',
          }}
        >
          {step}
        </span>

        <span className="dcc-heading text-[11px]">
          {title}
        </span>
      </div>

      {children}
    </div>
  );
}

function MetricRow({
  label,
  value,
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="dcc-label">
        {label}
      </span>

      <span
        className="dcc-metric truncate max-w-[180px]"
        title={
          value
        }
      >
        {value}
      </span>
    </div>
  );
}
