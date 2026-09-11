import { create } from 'zustand';
import { initialLandmarkState, LANDMARKS_BY_ID } from '../lib/landmarks';
import { DEFAULT_QUINN_TEMPLATE } from '../lib/quinnTemplate';

const MAX_HISTORY = 50;

const emptyMesh = { filename: null, format: null, vertices: 0, faces: 0, height_m: 0, bounds_min: {x:0,y:0,z:0}, bounds_max: {x:0,y:0,z:0} };

export const useAppStore = create((set, get) => ({
  // ---------- Project ----------
  projectId: null,
  projectName: 'Untitled Rig',
  saving: false,
  lastSavedAt: null,
  dirty: false,

  // ---------- Workflow ----------
  stage: 'import', // import | landmarks | skeleton | skinning | validation | export

  // ---------- Mesh ----------
  mesh: emptyMesh,
  meshLoaded: false,

  // ---------- Landmarks ----------
  landmarks: initialLandmarkState(),
  activeLandmarkId: null,
  placingMode: false,
  symmetry: { enabled: true, axis: 'x' },

  // ---------- Skeleton template ----------
  template: DEFAULT_QUINN_TEMPLATE,
  templateSource: 'bundled_default',
  templateValidation: null, // { valid, errors, warnings, bones_count }
  selectedBoneName: null,

  // ---------- Viewport ----------
  showSkeleton: false,
  showWireframe: false,
  showXray: false,
  showLandmarks: true,
  showGrid: true,
  projection: 'perspective', // perspective | orthographic
  shadingMode: 'clay', // clay | wireframe | xray

  // ---------- Undo/redo ----------
  history: [],  // stack of landmark snapshots (past)
  future: [],   // redo

  // ---------- Actions ----------
  setStage: (stage) => set({ stage }),

  setProject: (project) => {
    set({
      projectId: project.id,
      projectName: project.name,
      stage: project.stage || 'import',
      landmarks: project.landmarks && project.landmarks.length
        ? project.landmarks
        : initialLandmarkState(),
      symmetry: project.symmetry || { enabled: true, axis: 'x' },
      mesh: project.mesh || emptyMesh,
      meshLoaded: !!(project.mesh && project.mesh.vertices > 0),
      template: (project.template && project.template.template_data && project.template.template_data.bones)
        ? project.template.template_data
        : DEFAULT_QUINN_TEMPLATE,
      dirty: false,
      lastSavedAt: project.updated_at,
      history: [],
      future: [],
    });
  },

  setProjectName: (name) => set({ projectName: name, dirty: true }),

  markSaved: (project) => set({
    projectId: project.id,
    dirty: false,
    saving: false,
    lastSavedAt: project.updated_at,
  }),

  setSaving: (v) => set({ saving: v }),

  // ---------- Mesh ----------
  setMesh: (meshInfo) => set({
    mesh: meshInfo,
    meshLoaded: true,
    dirty: true,
    stage: get().stage === 'import' ? 'landmarks' : get().stage,
  }),

  clearMesh: () => set({ mesh: emptyMesh, meshLoaded: false, dirty: true }),

  // ---------- Landmarks ----------
  _pushHistory: () => {
    const snap = JSON.stringify(get().landmarks);
    const history = [...get().history, snap].slice(-MAX_HISTORY);
    set({ history, future: [] });
  },

  setActiveLandmark: (id) => set({ activeLandmarkId: id, placingMode: !!id }),
  cancelPlacing: () => set({ placingMode: false, activeLandmarkId: null }),

  placeLandmark: (id, pos) => {
    const state = get();
    state._pushHistory();
    const def = LANDMARKS_BY_ID[id];
    const landmarks = state.landmarks.map(l =>
      l.id === id
        ? { ...l, placed: true, position: { x: pos.x, y: pos.y, z: pos.z }, mirrored: false }
        : l
    );

    // Symmetry: if this landmark has a `mirror_of` counterpart we mirror the counterpart
    // We support left→right mirroring by finding any landmark whose mirror_of == id
    let updated = landmarks;
    if (state.symmetry.enabled) {
      const axis = state.symmetry.axis;
      // Case A: we placed a LEFT landmark and its RIGHT counterpart should mirror
      const counterpartDef = Object.values(LANDMARKS_BY_ID).find(d => d.mirror_of === id);
      if (counterpartDef) {
        const mirrored = mirrorPos(pos, axis);
        updated = updated.map(l =>
          l.id === counterpartDef.id
            ? { ...l, placed: true, position: mirrored, mirrored: true }
            : l
        );
      }
      // Case B: we placed a RIGHT landmark that itself is mirror_of a LEFT one -> mirror to left
      if (def?.mirror_of) {
        const mirrored = mirrorPos(pos, axis);
        updated = updated.map(l =>
          l.id === def.mirror_of
            ? { ...l, placed: true, position: mirrored, mirrored: true }
            : l
        );
      }
    }

    // Auto-advance activeLandmark to the next pending one
    let nextActive = null;
    const idx = updated.findIndex(l => l.id === id);
    for (let i = idx + 1; i < updated.length; i++) {
      if (!updated[i].placed) { nextActive = updated[i].id; break; }
    }
    // if none after, look from the beginning
    if (!nextActive) {
      const firstPending = updated.find(l => !l.placed);
      if (firstPending) nextActive = firstPending.id;
    }

    set({
      landmarks: updated,
      activeLandmarkId: nextActive,
      placingMode: !!nextActive,
      dirty: true,
    });
  },

  moveLandmark: (id, pos) => {
    const state = get();
    state._pushHistory();
    let updated = state.landmarks.map(l =>
      l.id === id
        ? { ...l, placed: true, position: { x: pos.x, y: pos.y, z: pos.z }, mirrored: false }
        : l
    );
    if (state.symmetry.enabled) {
      const axis = state.symmetry.axis;
      const counterpartDef = Object.values(LANDMARKS_BY_ID).find(d => d.mirror_of === id);
      if (counterpartDef) {
        updated = updated.map(l =>
          l.id === counterpartDef.id
            ? { ...l, placed: true, position: mirrorPos(pos, axis), mirrored: true }
            : l
        );
      }
      const def = LANDMARKS_BY_ID[id];
      if (def?.mirror_of) {
        updated = updated.map(l =>
          l.id === def.mirror_of
            ? { ...l, placed: true, position: mirrorPos(pos, axis), mirrored: true }
            : l
        );
      }
    }
    set({ landmarks: updated, dirty: true });
  },

  clearLandmark: (id) => {
    const state = get();
    state._pushHistory();
    set({
      landmarks: state.landmarks.map(l =>
        l.id === id ? { ...l, placed: false, position: {x:0,y:0,z:0}, mirrored: false } : l
      ),
      dirty: true,
    });
  },

  resetAllLandmarks: () => {
    const state = get();
    state._pushHistory();
    set({ landmarks: initialLandmarkState(), activeLandmarkId: null, placingMode: false, dirty: true });
  },

  mirrorAllFromLeft: () => {
    const state = get();
    state._pushHistory();
    const axis = state.symmetry.axis;
    const updated = state.landmarks.map(l => {
      const def = LANDMARKS_BY_ID[l.id];
      if (def?.mirror_of) {
        const src = state.landmarks.find(x => x.id === def.mirror_of);
        if (src && src.placed) {
          return {
            ...l,
            placed: true,
            position: mirrorPos(src.position, axis),
            mirrored: true,
          };
        }
      }
      return l;
    });
    set({ landmarks: updated, dirty: true });
  },

  setSymmetry: (patch) => set({ symmetry: { ...get().symmetry, ...patch }, dirty: true }),

  // ---------- Undo/redo ----------
  undo: () => {
    const { history, future, landmarks } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    set({
      landmarks: JSON.parse(prev),
      history: history.slice(0, -1),
      future: [JSON.stringify(landmarks), ...future].slice(0, MAX_HISTORY),
      dirty: true,
    });
  },
  redo: () => {
    const { history, future, landmarks } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      landmarks: JSON.parse(next),
      history: [...history, JSON.stringify(landmarks)].slice(-MAX_HISTORY),
      future: future.slice(1),
      dirty: true,
    });
  },

  // ---------- Template ----------
  setTemplate: (tpl, source = 'user_upload', validation = null) => set({
    template: tpl,
    templateSource: source,
    templateValidation: validation,
    dirty: true,
  }),
  resetTemplateToDefault: () => set({
    template: DEFAULT_QUINN_TEMPLATE,
    templateSource: 'bundled_default',
    templateValidation: null,
    dirty: true,
  }),
  setSelectedBone: (name) => set({ selectedBoneName: name }),

  // ---------- Viewport toggles ----------
  toggleSkeleton:   () => set({ showSkeleton:   !get().showSkeleton }),
  toggleWireframe:  () => set({ showWireframe:  !get().showWireframe }),
  toggleXray:       () => set({ showXray:       !get().showXray }),
  toggleLandmarks:  () => set({ showLandmarks:  !get().showLandmarks }),
  toggleGrid:       () => set({ showGrid:       !get().showGrid }),
  toggleProjection: () => set({ projection: get().projection === 'perspective' ? 'orthographic' : 'perspective' }),
  setShadingMode:   (mode) => set({ shadingMode: mode, showWireframe: mode === 'wireframe', showXray: mode === 'xray' }),

  // Camera preset commands - the Viewport listens to these
  cameraCommand: { verb: null, at: 0 },
  setCameraView: (verb) => set({ cameraCommand: { verb, at: Date.now() } }),
}));

function mirrorPos(pos, axis) {
  const p = { x: pos.x, y: pos.y, z: pos.z };
  if (axis === 'x') p.x = -p.x;
  else if (axis === 'y') p.y = -p.y;
  else if (axis === 'z') p.z = -p.z;
  return p;
}
