import { create } from 'zustand';
import { initialLandmarkState, LANDMARKS_BY_ID, LANDMARKS } from '../lib/landmarks';
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
  landmarkMode: 'idle', // idle | edit | manual
  detectionRun: false,
  symmetry: { enabled: true, axis: 'y' },

  // ---------- Skeleton template ----------
  template: DEFAULT_QUINN_TEMPLATE,
  templateSource: 'sample_dev', // sample_dev | user_authoritative | user_json
  templateValidation: null,     // detailed result from POST /api/templates/validate
  templateImportError: null,    // { file, message, at } — last failed IMPORT QUINN FBX, shown until the next successful import
  templateSavedId: null,        // id in MongoDB templates collection
  templateImporting: false,
  selectedBoneName: null,
  showBoneAxes: false,

  // ---------- Fitted skeleton (Phase B) ----------
  fitted: null,          // { bones[], report } — same names/parents/order as template
  fittedAuto: null,      // last untouched auto-fit result (for RESET BONE / RESET FIT)
  fitEditMode: false,    // draggable joints in viewport
  comparison: null,      // RigValidator.compareWithSource result
  fitApproved: false,
  fitApproval: null,     // { approved_at, acknowledged_warnings, acknowledged_by_user }
  fitStale: false,       // landmarks changed since last fit
  showFitted: true,

  // ---------- Skinning (Phase C) ----------
  skinning: null,         // in-memory typed arrays + report; intentionally not persisted in Mongo
  skinningValidation: null,
  skinningProgress: 0,
  skinningRunning: false,
  skinningStale: false,   // fit/mesh changed after weights were generated

  rightTab: 'landmarks',

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
    const landmarks = project.landmarks && project.landmarks.length ? project.landmarks : initialLandmarkState();
    const detectionRun = landmarks.some(l => l.auto);
    set({
      projectId: project.id,
      projectName: project.name,
      stage: project.stage || 'import',
      landmarks,
      detectionRun,
      landmarkMode: detectionRun ? 'edit' : 'idle',
      activeLandmarkId: null,
      placingMode: false,
      symmetry: project.symmetry || { enabled: true, axis: 'y' },
      mesh: project.mesh || emptyMesh,
      meshLoaded: !!(project.mesh && project.mesh.vertices > 0),
      template: (project.template && project.template.template_data && project.template.template_data.bones)
        ? project.template.template_data
        : DEFAULT_QUINN_TEMPLATE,
      templateSource: (project.template && project.template.template_data && project.template.template_data.bones)
        ? (project.template.source || project.template.template_data.source || 'user_json')
        : 'sample_dev',
      templateSavedId: project.template?.saved_template_id || null,
      templateValidation: null,
      selectedBoneName: null,
      fitted: project.fitted && project.fitted.bones ? project.fitted : null,
      fittedAuto: project.fitted && project.fitted.bones ? JSON.parse(JSON.stringify(project.fitted)) : null,
      comparison: null,
      fitEditMode: false,
      fitApproved: !!project.fit_approved,
      fitApproval: project.fit_approval || null,
      fitStale: false,
      skinning: null, skinningValidation: null, skinningProgress: 0, skinningRunning: false, skinningStale: false,
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
    skinning: null, skinningValidation: null, skinningProgress: 0, skinningStale: false,
    dirty: true,
    stage: get().stage === 'import' ? 'landmarks' : get().stage,
  }),

  clearMesh: () => set({ mesh: emptyMesh, meshLoaded: false, skinning: null, skinningValidation: null, skinningProgress: 0, skinningStale: false, dirty: true }),

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
        ? { ...l, placed: true, position: { x: pos.x, y: pos.y, z: pos.z }, mirrored: false, confidence: 'manual', auto: false }
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
      dirty: true, fitStale: !!get().fitted, skinningStale: !!get().skinning,
    });
  },

  moveLandmark: (id, pos) => {
    const state = get();
    state._pushHistory();
    let updated = state.landmarks.map(l =>
      l.id === id
        ? { ...l, placed: true, position: { x: pos.x, y: pos.y, z: pos.z }, mirrored: false, confidence: 'manual', auto: false }
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
    set({ landmarks: updated, dirty: true, fitStale: !!get().fitted, skinningStale: !!get().skinning });
  },

  clearLandmark: (id) => {
    const state = get();
    state._pushHistory();
    set({
      landmarks: state.landmarks.map(l =>
        l.id === id ? { ...l, placed: false, position: {x:0,y:0,z:0}, mirrored: false, confidence: undefined, note: undefined, auto: false } : l
      ),
      dirty: true, fitStale: !!get().fitted, skinningStale: !!get().skinning,
    });
  },

  resetAllLandmarks: () => {
    const state = get();
    state._pushHistory();
    set({ landmarks: initialLandmarkState(), activeLandmarkId: null, placingMode: false, landmarkMode: 'idle', detectionRun: false, dirty: true, fitStale: !!get().fitted, skinningStale: !!get().skinning });
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
    set({ landmarks: updated, dirty: true, fitStale: !!get().fitted, skinningStale: !!get().skinning });
  },

  setSymmetry: (patch) => set({ symmetry: { ...get().symmetry, ...patch }, dirty: true }),

  /** Apply auto-detected landmarks. Keeps manually-placed ones unless overwrite=true. */
  applyDetectedLandmarks: (detected, { overwrite = true } = {}) => {
    const state = get();
    state._pushHistory();
    const landmarks = state.landmarks.map(l => {
      const d = detected[l.id];
      if (!d) return l;
      if (!overwrite && l.placed && l.confidence === 'manual') return l;
      if (!d.position) return { ...l, placed: false, position: { x: 0, y: 0, z: 0 }, mirrored: false, confidence: 'not_found', note: d.note, auto: true };
      return { ...l, placed: true, position: d.position, mirrored: false, confidence: d.confidence, note: d.note, auto: true };
    });
    set({ landmarks, activeLandmarkId: null, placingMode: false, landmarkMode: 'edit', detectionRun: true, dirty: true, fitStale: !!state.fitted, skinningStale: !!state.skinning });
  },
  setLandmarkMode: (mode) => set({ landmarkMode: mode }),

  // ---------- Undo/redo ----------
  undo: () => {
    const { history, future, landmarks } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    set({
      landmarks: JSON.parse(prev),
      history: history.slice(0, -1),
      future: [JSON.stringify(landmarks), ...future].slice(0, MAX_HISTORY),
      dirty: true, fitStale: !!get().fitted, skinningStale: !!get().skinning,
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
      dirty: true, fitStale: !!get().fitted, skinningStale: !!get().skinning,
    });
  },

  // ---------- Template ----------
  setTemplate: (tpl, source = 'user_json', validation = null, savedId = null) => set({
    template: tpl,
    templateSource: source,
    templateValidation: validation,
    templateSavedId: savedId,
    selectedBoneName: null,
    fitted: null, fittedAuto: null, comparison: null, fitEditMode: false, fitApproved: false,
    skinning: null, skinningValidation: null, skinningProgress: 0, skinningStale: false,
    dirty: true,
  }),
  setTemplateValidation: (validation) => set({ templateValidation: validation }),
  setTemplateSavedId: (id) => set({ templateSavedId: id }),
  setTemplateImporting: (v) => set({ templateImporting: v }),
  resetTemplateToDefault: () => set({
    template: DEFAULT_QUINN_TEMPLATE,
    templateSource: 'sample_dev',
    templateValidation: null,
    templateSavedId: null,
    selectedBoneName: null,
    fitted: null, fittedAuto: null, comparison: null, fitEditMode: false, fitApproved: false,
    skinning: null, skinningValidation: null, skinningProgress: 0, skinningStale: false,
    dirty: true,
  }),
  setSelectedBone: (name) => set({ selectedBoneName: name }),
  toggleBoneAxes: () => set({ showBoneAxes: !get().showBoneAxes }),
  setRightTab: (tab) => set({ rightTab: tab }),

  // ---------- Fitted skeleton ----------
  setFitted: (fitted, comparison = null) => set({
    fitted, fittedAuto: fitted ? JSON.parse(JSON.stringify(fitted)) : null, comparison, fitApproved: false, fitApproval: null, fitStale: false,
    skinning: null, skinningValidation: null, skinningProgress: 0, skinningStale: false, dirty: true,
    stage: fitted ? 'skeleton' : get().stage,
  }),
  updateFittedBones: (bones) => set({ fitted: { ...get().fitted, bones, edited: true }, comparison: null, fitApproved: false, fitApproval: null, skinningStale: !!get().skinning, dirty: true }),
  setComparison: (comparison) => set({ comparison }),
  setFitEditMode: (v) => set({ fitEditMode: v, placingMode: v ? false : get().placingMode, activeLandmarkId: v ? null : get().activeLandmarkId }),
  toggleFitted: () => set({ showFitted: !get().showFitted }),
  clearFit: () => set({ fitted: null, fittedAuto: null, comparison: null, fitEditMode: false, fitApproved: false, fitApproval: null, fitStale: false, skinning: null, skinningValidation: null, skinningProgress: 0, skinningStale: false, dirty: true }),
  setFitApproved: (v, meta = null) => set({ fitApproved: v, fitApproval: v ? { approved_at: new Date().toISOString(), ...(meta || {}) } : null, dirty: true }),

  // ---------- Skinning ----------
  setSkinningRunning: (v) => set({ skinningRunning: v, skinningProgress: v ? 0 : get().skinningProgress }),
  setSkinningProgress: (v) => set({ skinningProgress: Math.max(0, Math.min(1, v)) }),
  setSkinning: (result, validation = null) => set({
    skinning: result, skinningValidation: validation, skinningRunning: false, skinningProgress: result ? 1 : 0, skinningStale: false,
    dirty: true, stage: result ? 'skinning' : get().stage,
  }),
  clearSkinning: () => set({ skinning: null, skinningValidation: null, skinningRunning: false, skinningProgress: 0, skinningStale: false, dirty: true }),

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

// Test hook: lets automation drive the store (landmark placement etc.) without canvas clicks.
if (typeof window !== 'undefined') {
  window.__quinnStore = useAppStore;
  window.__quinnLandmarks = LANDMARKS;
}
