import { useAppStore } from '../../store/appStore';
import { useAssistantStore } from '../../store/assistantStore';
import { LANDMARKS_BY_ID } from '../landmarks';
import { runAutoDetect } from '../landmarkService';
import { runAutoFit, runCompare, moveFittedJoint, resetFittedBone, resetFit, approvalGate, approveFit, canAutoFit } from '../fitService';
import { runValidation, isFitAuthorized } from '../templateService';
import { saveCurrentProject } from '../projectService';

const S = () => useAppStore.getState();
const r3 = (v) => Math.round(v * 1000) / 1000;
const pos = (p) => p ? { x: r3(p.x), y: r3(p.y), z: r3(p.z) } : null;
const arr3 = (a) => a ? { x: r3(a[0]), y: r3(a[1]), z: r3(a[2]) } : null;
const ok = (data) => ({ ok: true, ...data });
const fail = (error, data = {}) => ({ ok: false, error, ...data });
const lmRec = (l) => ({ id: l.id, label: l.label, group: l.group, placed: l.placed, confidence: l.confidence || (l.placed ? 'manual' : 'pending'), position: l.placed ? pos(l.position) : null, note: l.note || null, mirrored: !!l.mirrored, bone_target: LANDMARKS_BY_ID[l.id]?.bone_target });
const boneRec = (b) => ({ name: b.name, parent: b.parent, kind: b.kind, status: b.status, method: b.method, anchor: b.anchor, message: b.message || null, manual: !!b.manual, position: arr3(b.globalPos), length_ratio: b.lengthRatio != null ? r3(b.lengthRatio) : undefined });
const findLm = (id) => S().landmarks.find(l => l.id === id);

/** Compact snapshot sent with every user message. */
export function stateSummary() {
  const s = S();
  const lm = s.landmarks;
  const conf = {}; for (const l of lm) { const c = l.confidence || (l.placed ? 'manual' : 'pending'); conf[c] = (conf[c] || 0) + 1; }
  const f = s.fitted;
  return {
    project: { id: s.projectId, name: s.projectName, stage: s.stage, dirty: s.dirty },
    mesh: s.meshLoaded ? { file: s.mesh.filename, format: s.mesh.format, vertices: s.mesh.vertices, faces: s.mesh.faces, height_m: s.mesh.height_m } : null,
    template: { name: s.template?.name, source: s.templateSource, bones: s.template?.bones?.length || 0, validation: s.templateValidation?.status || null, fit_authorised: isFitAuthorized(s.templateSource, s.templateValidation) },
    symmetry: s.symmetry,
    landmarks: { placed: lm.filter(l => l.placed).length, total: lm.length, detection_run: s.detectionRun, mode: s.landmarkMode, by_confidence: conf,
      problems: lm.filter(l => !l.placed || l.confidence === 'low').map(l => `${l.id}:${l.placed ? 'low' : (l.confidence === 'not_found' ? 'not_found' : 'pending')}`) },
    fit: f ? { bones: f.bones.length, warn: f.report?.counts?.warn ?? f.bones.filter(b => b.status === 'warn').length, error: f.report?.counts?.error ?? f.bones.filter(b => b.status === 'error').length, manual_joints: f.bones.filter(b => b.manual).length, stale: s.fitStale, approved: s.fitApproved, compare: s.comparison?.overall || null } : null,
    assistant_actions: useAssistantStore.getState().actions.filter(a => !a.reverted).map(a => ({ id: a.id, name: a.name })).slice(-10),
  };
}

export function takeSnapshot() {
  const s = S();
  return JSON.parse(JSON.stringify({ landmarks: s.landmarks, fitted: s.fitted, fittedAuto: s.fittedAuto, comparison: s.comparison, fitApproved: s.fitApproved, fitApproval: s.fitApproval, fitStale: s.fitStale, symmetry: s.symmetry, stage: s.stage, detectionRun: s.detectionRun, landmarkMode: s.landmarkMode }));
}

export function restoreSnapshot(snap) {
  useAppStore.setState({ ...snap, dirty: true, activeLandmarkId: null, placingMode: false, fitEditMode: false });
}

const TOOLS = {
  get_project_state: () => ok({ state: stateSummary(), landmarks: S().landmarks.map(lmRec) }),

  inspect_landmarks: ({ ids, filter = 'all' }) => {
    let lm = S().landmarks;
    if (ids?.length) lm = lm.filter(l => ids.includes(l.id));
    const f = {
      placed: l => l.placed, unplaced: l => !l.placed, not_found: l => l.confidence === 'not_found', low: l => l.confidence === 'low', medium: l => l.confidence === 'medium',
      high: l => l.confidence === 'high', manual: l => l.confidence === 'manual', left: l => l.group === 'left', right: l => l.group === 'right', center: l => l.group === 'center',
    }[filter];
    if (f) lm = lm.filter(f);
    return ok({ count: lm.length, landmarks: lm.map(lmRec) });
  },

  move_landmark: ({ id, position }) => {
    const l = findLm(id); if (!l) return fail(`Unknown landmark '${id}'`);
    if (![position?.x, position?.y, position?.z].every(Number.isFinite)) return fail('position must have finite x,y,z');
    const before = l.placed ? pos(l.position) : null;
    S().moveLandmark(id, position);
    const after = findLm(id);
    const twin = Object.values(LANDMARKS_BY_ID).find(d => d.mirror_of === id)?.id;
    return ok({ id, before, after: pos(after.position), confidence: after.confidence, mirrored_to: S().symmetry.enabled && twin ? twin : null });
  },

  offset_landmark: ({ id, delta }) => {
    const l = findLm(id); if (!l) return fail(`Unknown landmark '${id}'`);
    if (!l.placed) return fail(`Landmark '${id}' is not placed — use move_landmark with an absolute position`);
    const p = { x: l.position.x + (delta.x || 0), y: l.position.y + (delta.y || 0), z: l.position.z + (delta.z || 0) };
    return TOOLS.move_landmark({ id, position: p });
  },

  clear_landmark: ({ id }) => { if (!findLm(id)) return fail(`Unknown landmark '${id}'`); S().clearLandmark(id); return ok({ id, placed: false }); },

  run_auto_detect: ({ overwrite = false } = {}) => {
    if (!S().meshLoaded) return fail('No mesh imported — the user must import a mesh first (drag & drop in the left panel)');
    const res = runAutoDetect({ overwrite });
    if (!res) return fail('Detection failed (mesh too small or not humanoid)');
    const c = {}; for (const v of Object.values(res.landmarks)) c[v.confidence] = (c[v.confidence] || 0) + 1;
    return ok({ counts: c, midline_offset_m: r3(res.midlineX), landmarks: S().landmarks.map(lmRec), fit_marked_stale: !!S().fitted });
  },

  mirror_landmarks_left_to_right: () => { S().mirrorAllFromLeft(); return ok({ right: S().landmarks.filter(l => l.group === 'right').map(lmRec) }); },
  reset_all_landmarks: () => { S().resetAllLandmarks(); return ok({ placed: 0 }); },
  set_symmetry: ({ enabled, axis }) => { const patch = {}; if (enabled != null) patch.enabled = !!enabled; if (axis) patch.axis = axis; S().setSymmetry(patch); return ok({ symmetry: S().symmetry }); },

  get_template_summary: () => {
    const s = S(); const v = s.templateValidation;
    return ok({ name: s.template?.name, source: s.templateSource, bones: s.template?.bones?.length || 0, version: s.template?.version, provenance: s.template?.provenance || null,
      validation: v ? { status: v.status, failing: (v.checks || []).filter(c => c.status !== 'pass').map(c => ({ id: c.id, status: c.status, detail: c.detail })) } : null,
      fit_authorised: isFitAuthorized(s.templateSource, s.templateValidation), gate: canAutoFit(s) });
  },
  validate_template: async () => { const v = await runValidation(S().template); return ok({ status: v.status, failing: (v.checks || []).filter(c => c.status !== 'pass').map(c => ({ id: c.id, status: c.status, detail: c.detail })) }); },

  run_auto_fit: () => {
    const gate = canAutoFit(S()); if (!gate.ok) return fail(gate.reasons.join('; '), { gate });
    const f = runAutoFit(); if (!f) return fail('Auto Fit aborted');
    const r = f.report;
    return ok({ bones: r.bone_count, template_bones: r.template_bone_count, structure_preserved: r.structure_preserved, counts: r.counts, missing_landmarks: r.missing_landmarks, warnings: r.warnings.slice(0, 40), errors: r.errors, compare: S().comparison?.overall });
  },

  inspect_fitted_bones: ({ names, status = 'all', limit = 60 }) => {
    const f = S().fitted; if (!f) return fail('No fitted skeleton — run Auto Fit first');
    let b = f.bones;
    if (names?.length) b = b.filter(x => names.includes(x.name));
    if (status === 'manual') b = b.filter(x => x.manual); else if (status !== 'all') b = b.filter(x => x.status === status);
    return ok({ count: b.length, bones: b.slice(0, limit).map(boneRec) });
  },

  move_fitted_joint: ({ name, position }) => {
    const f = S().fitted; if (!f) return fail('No fitted skeleton');
    const b = f.bones.find(x => x.name === name); if (!b) return fail(`Unknown bone '${name}'`);
    if (![position?.x, position?.y, position?.z].every(Number.isFinite)) return fail('position must have finite x,y,z');
    const before = arr3(b.globalPos);
    moveFittedJoint(name, position);
    const after = S().fitted.bones.find(x => x.name === name);
    const moved = after.globalPos.some((v, i) => Math.abs(v - b.globalPos[i]) > 1e-6);
    return moved ? ok({ name, before, after: arr3(after.globalPos), approval_invalidated: true }) : fail('Edit rejected — it would alter skeleton structure');
  },
  reset_fitted_bone: ({ name }) => { if (!S().fitted?.bones.find(x => x.name === name)) return fail(`Unknown bone '${name}'`); resetFittedBone(name); return ok({ name, position: arr3(S().fitted.bones.find(x => x.name === name).globalPos) }); },
  reset_fit: () => { if (!S().fittedAuto) return fail('No auto-fit to reset to'); resetFit(); return ok({ manual_joints: 0 }); },

  run_compare_validation: () => { const c = runCompare(); if (!c) return fail('No fitted skeleton'); return ok({ overall: c.overall, bone_count: c.bone_count, template_bone_count: c.template_bone_count, checks: c.checks.map(k => ({ id: k.id, status: k.status, detail: k.detail, items: (k.items || []).slice(0, 15) })) }); },

  get_diagnostics: () => {
    const s = S(); const f = s.fitted;
    return ok({
      landmarks: { not_found: s.landmarks.filter(l => l.confidence === 'not_found').map(l => ({ id: l.id, note: l.note })), low: s.landmarks.filter(l => l.confidence === 'low').map(l => ({ id: l.id, note: l.note })), pending: s.landmarks.filter(l => !l.placed && l.confidence !== 'not_found').map(l => l.id) },
      template: { source: s.templateSource, validation: s.templateValidation?.status || null, fit_authorised: isFitAuthorized(s.templateSource, s.templateValidation), gate: canAutoFit(s) },
      fit: f ? { stale: s.fitStale, warnings: f.bones.filter(b => b.status === 'warn').map(b => `${b.name}: ${b.message}`).slice(0, 40), errors: f.bones.filter(b => b.status === 'error').map(b => `${b.name}: ${b.message}`), manual_joints: f.bones.filter(b => b.manual).map(b => b.name) } : null,
      compare: s.comparison ? { overall: s.comparison.overall, failing: s.comparison.checks.filter(c => c.status !== 'pass').map(c => ({ id: c.id, status: c.status, detail: c.detail })) } : null,
      approval: f ? approvalGate() : { allowed: false, reason: 'No fit' }, approved: s.fitApproved,
      phase_c: 'Skinning / weights / export not available yet (locked)',
    });
  },

  approve_fit: ({ acknowledge_warnings = false } = {}) => { const g = approvalGate(); if (!g.allowed) return fail(g.reason, { gate: g }); const done = approveFit({ acknowledged: acknowledge_warnings }); return done ? ok({ approved: true, acknowledged_warnings: g.warns }) : fail(`${g.warns} warning(s) need acknowledge_warnings=true (ask the user first)`, { gate: g }); },

  undo_last_change: () => { const n = S().history.length; if (!n) return fail('Nothing to undo'); S().undo(); return ok({ remaining_undo_steps: S().history.length }); },

  revert_assistant_action: ({ action_id } = {}) => {
    const a = useAssistantStore.getState();
    const target = action_id ? a.actions.find(x => x.id === action_id) : [...a.actions].reverse().find(x => !x.reverted && x.snapshot);
    if (!target) return fail(action_id ? `No action '${action_id}'` : 'No revertible action');
    if (!target.snapshot) return fail('Action has no snapshot');
    restoreSnapshot(target.snapshot); a.markReverted(target.id);
    return ok({ reverted: target.id, name: target.name });
  },

  set_camera_view: ({ view }) => { S().setCameraView(view); return ok({ view }); },
  focus_landmark: ({ id }) => { if (!findLm(id)) return fail(`Unknown landmark '${id}'`); useAppStore.setState({ rightTab: 'landmarks', showLandmarks: true, activeLandmarkId: id, placingMode: false }); return ok({ id }); },
  select_bone: ({ name }) => { const b = (S().fitted?.bones || S().template.bones).find(x => x.name === name); if (!b) return fail(`Unknown bone '${name}'`); S().setSelectedBone(name); useAppStore.setState({ rightTab: 'bones' }); return ok({ name }); },
  save_project: async ({ name } = {}) => { const p = await saveCurrentProject(name); return ok({ project_id: p.id, name: p.name }); },
};

export async function executeTool(name, args) {
  const fn = TOOLS[name];
  if (!fn) return fail(`Unknown tool '${name}'`);
  try { return await fn(args || {}); } catch (e) { return fail(e.message || String(e)); }
}

export const TOOL_NAMES = Object.keys(TOOLS);
