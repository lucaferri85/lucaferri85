/**
 * Fit workflow orchestration: auto fit, compare, manual joint edits with
 * symmetry mirroring, per-bone reset. All operations preserve names/parents.
 */
import { Vector3 } from 'three';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { SkeletonFitter, rebuildFromPositions, assertStructure } from '../modules/SkeletonFitter';
import { RigValidator } from '../modules/RigValidator';
import { isFitAuthorized } from './templateService';
import { mirrorBoneName } from './fitRules';

export function canAutoFit(state) {
  const reasons = [];
  if (!isFitAuthorized(state.templateSource, state.templateValidation)) reasons.push('Authoritative template must be imported and validated');
  const core = state.landmarks.filter(l => l.group !== 'fingers');
  const placed = core.filter(l => l.placed).length;
  if (placed < 6) reasons.push(`Place core landmarks (${placed}/${core.length})`);
  return { ok: reasons.length === 0, reasons, placed, total: core.length };
}

export function runAutoFit() {
  const s = useAppStore.getState();
  const gate = canAutoFit(s);
  if (!gate.ok) { toast.error(gate.reasons[0]); return null; }
  let fitted;
  try {
    fitted = new SkeletonFitter().fit(s.template, s.landmarks);
  } catch (e) {
    toast.error(`Auto Fit aborted — ${e.message}`);
    return null;
  }
  const comparison = new RigValidator().compareWithSource(fitted, s.template);
  s.setFitted(fitted, comparison);
  useAppStore.setState({ showFitted: true, showSkeleton: false, rightTab: 'fit' });
  const r = fitted.report;
  const msg = `Fitted ${r.bone_count} bones · ${r.counts.warn} warning(s) · ${r.counts.error} error(s)`;
  (r.counts.error ? toast.error : r.counts.warn ? toast.warning : toast.success)(msg);
  return fitted;
}

export function runCompare() {
  const s = useAppStore.getState();
  if (!s.fitted) { toast.error('Run Auto Fit first'); return null; }
  const comparison = new RigValidator().compareWithSource(s.fitted, s.template);
  s.setComparison(comparison);
  (comparison.overall === 'fail' ? toast.error : comparison.overall === 'warning' ? toast.warning : toast.success)(`Compare with source: ${comparison.overall.toUpperCase()}`);
  return comparison;
}

/** Translate a joint (and its whole subtree) to a new global position; mirrors when symmetry is on. */
export function moveFittedJoint(name, pos, { mirror = true } = {}) {
  const s = useAppStore.getState();
  if (!s.fitted) return;
  const by = Object.fromEntries(s.fitted.bones.map(b => [b.name, b]));
  const target = by[name];
  if (!target) return;
  const delta = new Vector3(pos.x, pos.y, pos.z).sub(new Vector3(...target.globalPos));
  const moves = [{ root: name, delta }];
  if (mirror && s.symmetry.enabled) {
    const twin = mirrorBoneName(name);
    if (twin && by[twin]) {
      const md = delta.clone();
      if (s.symmetry.axis === 'x') md.x = -md.x; else if (s.symmetry.axis === 'y') md.y = -md.y; else md.z = -md.z;
      moves.push({ root: twin, delta: md });
    }
  }
  const children = {};
  for (const b of s.fitted.bones) if (b.parent) (children[b.parent] = children[b.parent] || []).push(b.name);
  const updated = Object.fromEntries(s.fitted.bones.map(b => [b.name, { ...b, globalPos: b.globalPos.slice() }]));
  for (const { root, delta: d } of moves) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      const g = updated[n].globalPos;
      updated[n].globalPos = [g[0] + d.x, g[1] + d.y, g[2] + d.z];
      updated[n].manual = true;
      for (const c of children[n] || []) stack.push(c);
    }
  }
  const rebuilt = rebuildFromPositions(s.template, s.fitted.bones.map(b => updated[b.name]));
  commitEdit(rebuilt);
}

/** Every manual edit passes the structural invariant before it is committed. */
function commitEdit(bones) {
  const s = useAppStore.getState();
  const inv = assertStructure(s.template, bones);
  if (!inv.ok) { toast.error('Edit rejected — it would alter the skeleton structure: ' + inv.problems[0]); return false; }
  s.updateFittedBones(bones);
  return true;
}

/** Approval gate: errors block; warnings/stale fit require explicit acknowledgement. */
export function approvalGate() {
  const s = useAppStore.getState();
  if (!s.fitted) return { allowed: false, reason: 'No fit to approve' };
  const errors = s.fitted.bones.filter(b => b.status === 'error').length;
  const warns = s.fitted.bones.filter(b => b.status === 'warn').length;
  const cmp = s.comparison || new RigValidator().compareWithSource(s.fitted, s.template);
  if (errors) return { allowed: false, reason: `${errors} bone(s) have fit ERRORS — fix landmarks or joints first`, errors, warns };
  if (cmp.overall === 'fail') return { allowed: false, reason: 'Compare With Source reports FAIL — structure does not match the template', errors, warns };
  if (s.fitStale) return { allowed: false, reason: 'Landmarks changed since the last fit — re-run Auto Fit first', errors, warns };
  return { allowed: true, needsAck: warns > 0 || cmp.overall === 'warning', warns, errors, comparison: cmp };
}

export function approveFit({ acknowledged = false } = {}) {
  const s = useAppStore.getState();
  const gate = approvalGate();
  if (!gate.allowed) { toast.error(gate.reason); return false; }
  if (gate.needsAck && !acknowledged) { toast.warning(`${gate.warns} unresolved warning(s) must be acknowledged before approval`); return false; }
  if (!s.comparison) s.setComparison(gate.comparison);
  s.setFitApproved(true, { acknowledged_warnings: gate.warns, acknowledged_by_user: gate.needsAck, comparison_overall: gate.comparison.overall, bone_count: s.fitted.bones.length });
  toast.success(`Fitted skeleton approved${gate.warns ? ` with ${gate.warns} acknowledged warning(s)` : ''} — skinning stays locked until Phase C is authorised`);
  return true;
}

export function resetFittedBone(name) {
  const s = useAppStore.getState();
  if (!s.fitted || !s.fittedAuto) return;
  const auto = Object.fromEntries(s.fittedAuto.bones.map(b => [b.name, b]));
  const children = {};
  for (const b of s.fitted.bones) if (b.parent) (children[b.parent] = children[b.parent] || []).push(b.name);
  const subtree = new Set(); const stack = [name];
  while (stack.length) { const n = stack.pop(); subtree.add(n); for (const c of children[n] || []) stack.push(c); }
  const bones = s.fitted.bones.map(b => subtree.has(b.name) ? { ...auto[b.name] } : b);
  if (commitEdit(rebuildFromPositions(s.template, bones))) toast.success(`Reset ${name} (+${subtree.size - 1} descendants) to auto-fit`);
}

export function resetFit() {
  const s = useAppStore.getState();
  if (!s.fittedAuto) return;
  s.setFitted(JSON.parse(JSON.stringify(s.fittedAuto)), new RigValidator().compareWithSource(s.fittedAuto, s.template));
  toast.success('Fit reset to last auto-fit result');
}

export function backToLandmarks() {
  const s = useAppStore.getState();
  s.setFitEditMode(false);
  s.setStage('landmarks');
  s.setRightTab('landmarks');
}

// Test hook for automation (viewport drags are hard to script against WebGL)
if (typeof window !== 'undefined') window.__quinnFit = { moveFittedJoint, resetFittedBone, runAutoFit, runCompare, approveFit, approvalGate };
