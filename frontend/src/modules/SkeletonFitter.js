/**
 * SkeletonFitter — solves the authoritative template onto placed landmarks.
 *
 * Guarantees: output bone list has identical names, order, parents and kinds
 * as the template. Only positions/orientations change. Every bone records
 * HOW it was solved (method/anchor) and a status; unreliable bones get
 * status 'warn' (or 'error') instead of being moved silently or dropped.
 */
import { Vector3, Quaternion } from 'three';
import { JOINT_LANDMARKS, CHAINS, SEGMENT_END, TIP_LANDMARKS, FOLLOWS, HEAD_RULE, SCALE_CLAMP } from '../lib/fitRules';

const v = (a) => new Vector3(a[0], a[1], a[2]);
const q = (a) => (a ? new Quaternion(a[0], a[1], a[2], a[3]) : new Quaternion());
const arr3 = (x) => [x.x, x.y, x.z];
const arr4 = (x) => [x.x, x.y, x.z, x.w];

export class SkeletonFitter {
  fit(template, landmarks) {
    const bones = template.bones;
    const byName = Object.fromEntries(bones.map(b => [b.name, b]));
    const children = {};
    for (const b of bones) if (b.parent) (children[b.parent] = children[b.parent] || []).push(b.name);
    const lm = {};
    for (const l of landmarks) if (l.placed) lm[l.id] = new Vector3(l.position.x, l.position.y, l.position.z);

    const F = {};          // name → fitted global position (Vector3)
    const info = {};       // name → { method, anchor, status, message }
    const set = (name, pos, method, anchor, status = 'ok', message = '') => {
      F[name] = pos.clone(); info[name] = { method, anchor, status, message };
    };

    // 1. roots stay at template position (Quinn root = ground origin)
    for (const b of bones) if (!b.parent) set(b.name, v(b.refGlobal), 'template-root', null, 'ok', 'Root bone kept at template origin');

    // 2. landmark-driven joints
    for (const [bone, lmId] of Object.entries(JOINT_LANDMARKS)) {
      if (!byName[bone]) continue;
      if (lm[lmId]) set(bone, lm[lmId], 'landmark', lmId);
    }

    // 3. head heuristic
    if (byName[HEAD_RULE.bone]) {
      const c = lm[HEAD_RULE.center], t = lm[HEAD_RULE.top];
      if (c && t) {
        set(HEAD_RULE.bone, c.clone().sub(t.clone().sub(c).multiplyScalar(HEAD_RULE.k)), 'derived', `${HEAD_RULE.center}+${HEAD_RULE.top}`, 'ok',
          `Skull base estimated as head_center − ${HEAD_RULE.k}·(head_top − head_center). Verify visually.`);
      } else if (t && F.neck_01) {
        set(HEAD_RULE.bone, F.neck_01.clone().lerp(t, 0.6), 'derived', 'head_top', 'warn', 'head_center missing — head placed at 60% of neck_base→head_top');
      }
    }

    // 4. chain interpolation (template arc-length fractions)
    for (const [a, k] of CHAINS) {
      if (!byName[a] || !byName[k] || !F[a] || !F[k]) continue;
      const path = [];
      let cur = byName[k].parent;
      while (cur && cur !== a) { path.unshift(cur); cur = byName[cur].parent; }
      if (cur !== a) continue;
      const pts = [a, ...path, k].map(n => v(byName[n].refGlobal));
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const total = cum[cum.length - 1] || 1;
      path.forEach((n, i) => {
        if (F[n]) return;
        set(n, F[a].clone().lerp(F[k], cum[i + 1] / total), 'chain', `${a}→${k}`);
      });
    }

    // 5. follow rules (IK)
    const followLater = [];
    for (const b of bones) {
      const src = FOLLOWS[b.name];
      if (src && byName[src]) followLater.push(b.name);
    }

    // 6. segment-aware transfer for everything else (parent-first order)
    const segment = (anchor) => this._segment(anchor, byName, children, F, lm, info);
    for (const b of bones) {
      if (F[b.name] || followLater.includes(b.name)) continue;
      let anchor = b.parent;
      // anchor = nearest ancestor solved from landmarks/chain/derived (not itself segment-transferred),
      // so whole sub-hierarchies (fingers, twist groups) share ONE consistent similarity transform.
      while (anchor && (!F[anchor] || info[anchor].method === 'segment')) anchor = byName[anchor].parent;
      if (!anchor) { set(b.name, v(b.refGlobal), 'template-fallback', null, 'error', 'No fitted ancestor — left at template position'); continue; }
      const seg = segment(anchor);
      const offset = v(b.refGlobal).sub(v(byName[anchor].refGlobal));
      const pos = F[anchor].clone().add(offset.applyQuaternion(seg.rot).multiplyScalar(seg.scale));
      let status = seg.status, message = `${describeKind(b)} placed relative to ${seg.label} (scale ×${seg.scale.toFixed(3)})${seg.message ? ' — ' + seg.message : ''}`;
      if (JOINT_LANDMARKS[b.name] && !lm[JOINT_LANDMARKS[b.name]]) {
        status = 'warn';
        message = `Landmark '${JOINT_LANDMARKS[b.name]}' not placed — ${message}. Place the landmark or correct this joint manually.`;
      } else {
        let up = b.parent, viaUnreliable = null;
        while (up && up !== anchor) { if (info[up]?.status === 'warn' && JOINT_LANDMARKS[up]) { viaUnreliable = up; break; } up = byName[up].parent; }
        if (viaUnreliable) { status = 'warn'; message += ` — derived through '${viaUnreliable}' whose landmark is missing`; }
      }
      set(b.name, pos, 'segment', seg.label, status, message);
    }
    for (const name of followLater) {
      const src = FOLLOWS[name];
      if (F[src]) set(name, F[src], 'follows', src, info[src].status === 'warn' ? 'warn' : 'ok', `IK target copies fitted ${src}${info[src].status === 'warn' ? ' (source is unreliable)' : ''}`);
      else set(name, v(byName[name].refGlobal), 'template-fallback', src, 'warn', `Source ${src} not fitted — left at template position`);
    }

    // 7. orientation + local transforms
    const rots = solveRotations(template, F, byName, children);
    const out = bones.map(b => {
      const parent = b.parent ? byName[b.parent] : null;
      const gPos = F[b.name], gRot = rots[b.name];
      let lPos = gPos.clone(), lRot = gRot.clone();
      if (parent) {
        const pInv = rots[parent.name].clone().invert();
        lPos = gPos.clone().sub(F[parent.name]).applyQuaternion(pInv);
        lRot = pInv.clone().multiply(gRot);
      }
      const meta = info[b.name];
      const tLen = parent ? v(b.refGlobal).distanceTo(v(parent.refGlobal)) : 0;
      const fLen = parent ? gPos.distanceTo(F[parent.name]) : 0;
      let status = meta.status, message = meta.message;
      if (parent && tLen > 0.005) {
        const ratio = fLen / tLen;
        if (ratio > 3 || ratio < 0.33) { status = status === 'error' ? 'error' : 'warn'; message += ` · bone length ratio ${ratio.toFixed(2)}× template — check landmarks`; }
      }
      if (![gPos.x, gPos.y, gPos.z].every(Number.isFinite)) { status = 'error'; message += ' · non-finite position'; }
      return {
        name: b.name, parent: b.parent, kind: b.kind, skinned: b.skinned !== false && (b.kind === 'deform' || b.kind === 'twist' || b.kind === 'corrective'), fbx_attr_type: b.fbx_attr_type || null, order: bones.indexOf(b),
        globalPos: arr3(gPos), globalRot: arr4(gRot), localPos: arr3(lPos), localRot: arr4(lRot), scale: [1, 1, 1],
        method: meta.method, anchor: meta.anchor, status, message, lengthRatio: tLen > 0.005 ? fLen / tLen : null,
      };
    });

    const counts = { landmark: 0, chain: 0, derived: 0, segment: 0, follows: 0, template: 0, ok: 0, warn: 0, error: 0 };
    for (const b of out) {
      counts[b.method.startsWith('template') ? 'template' : b.method]++;
      counts[b.status]++;
    }
    const missing = Object.entries(JOINT_LANDMARKS).filter(([bone, id]) => byName[bone] && !lm[id]).map(([, id]) => id);
    const invariant = assertStructure(template, out);
    if (!invariant.ok) throw new Error('SkeletonFitter invariant violated: ' + invariant.problems.join('; '));
    return {
      bones: out,
      report: {
        fitted_at: new Date().toISOString(),
        template_name: template.name, template_sha256: template.provenance?.sha256 || null, bone_count: out.length,
        template_bone_count: template.bones.length, structure_preserved: invariant.ok,
        counts, missing_landmarks: missing,
        warnings: out.filter(b => b.status === 'warn').map(b => `${b.name}: ${b.message}`),
        errors: out.filter(b => b.status === 'error').map(b => `${b.name}: ${b.message}`),
      },
    };
  }

  _segment(anchor, byName, children, F, lm, info) {
    const tA = v(byName[anchor].refGlobal);
    let endT = null, endF = null, label = null, status = 'ok', message = '';
    const preferred = SEGMENT_END[anchor];
    if (preferred && byName[preferred] && F[preferred]) { endT = v(byName[preferred].refGlobal); endF = F[preferred]; label = `${anchor}→${preferred}`; }
    if (!endT && TIP_LANDMARKS[anchor]) {
      const tip = TIP_LANDMARKS[anchor];
      if (lm[tip.landmark] && byName[tip.templateBone]) { endT = v(byName[tip.templateBone].refGlobal); endF = lm[tip.landmark]; label = `${anchor}→landmark '${tip.landmark}' (tip)`; }
      else { status = 'warn'; message = `tip landmark '${tip.landmark}' not placed`; }
    }
    if (!endT) {
      let best = null, bestD = 0.005;
      for (const c of children[anchor] || []) {
        if (!F[c] || info[c]?.method === 'segment') continue;
        const d = v(byName[c].refGlobal).distanceTo(tA);
        if (d > bestD) { best = c; bestD = d; }
      }
      if (best) { endT = v(byName[best].refGlobal); endF = F[best]; label = `${anchor}→${best}`; }
    }
    if (!endT && byName[anchor].parent && F[byName[anchor].parent]) {
      const p = byName[anchor].parent;
      endT = tA.clone().sub(v(byName[p].refGlobal)).add(tA); endF = F[anchor].clone().sub(F[p]).add(F[anchor]);
      label = `${p}→${anchor} (parent segment)`; status = 'warn'; message += (message ? '; ' : '') + 'no fitted child — direction taken from parent segment';
    }
    if (!endT) return { rot: new Quaternion(), scale: 1, label: anchor, status: 'warn', message: 'anchor has no direction reference; template offset kept unscaled' };
    const dT = endT.clone().sub(tA), dF = endF.clone().sub(F[anchor]);
    if (dT.length() < 1e-6 || dF.length() < 1e-6) return { rot: new Quaternion(), scale: 1, label, status: 'warn', message: 'degenerate segment' };
    let scale = dF.length() / dT.length();
    if (scale < SCALE_CLAMP[0] || scale > SCALE_CLAMP[1]) { status = 'warn'; message += (message ? '; ' : '') + `scale ${scale.toFixed(2)} clamped`; scale = Math.min(SCALE_CLAMP[1], Math.max(SCALE_CLAMP[0], scale)); }
    const rot = new Quaternion().setFromUnitVectors(dT.normalize(), dF.normalize());
    return { rot, scale, label, status, message };
  }
}

/** Global rotations: swing template refGlobalRot by the template→fitted direction change of each bone's segment. */
export function solveRotations(template, F, byName, children) {
  const rots = {}, deltas = {};
  for (const b of template.bones) {
    const src = FOLLOWS[b.name];
    if (src && rots[src]) { rots[b.name] = rots[src].clone(); deltas[b.name] = deltas[src] || new Quaternion(); continue; }
    const tA = v(b.refGlobal);
    let end = SEGMENT_END[b.name];
    if (!end || !byName[end]) {
      let bestD = 0.005; end = null;
      for (const c of children[b.name] || []) { const d = v(byName[c].refGlobal).distanceTo(tA); if (d > bestD) { end = c; bestD = d; } }
    }
    let delta;
    if (end && F[end]) {
      const dT = v(byName[end].refGlobal).sub(tA), dF = F[end].clone().sub(F[b.name]);
      delta = (dT.length() > 1e-6 && dF.length() > 1e-6) ? new Quaternion().setFromUnitVectors(dT.normalize(), dF.normalize()) : new Quaternion();
    } else {
      delta = b.parent && deltas[b.parent] ? deltas[b.parent].clone() : new Quaternion();
    }
    deltas[b.name] = delta;
    rots[b.name] = delta.clone().multiply(q(b.refGlobalRot));
  }
  return rots;
}

/** Recompute rotations + local transforms after manual joint edits (positions already updated). */
export function rebuildFromPositions(template, fittedBones) {
  const byName = Object.fromEntries(template.bones.map(b => [b.name, b]));
  const children = {};
  for (const b of template.bones) if (b.parent) (children[b.parent] = children[b.parent] || []).push(b.name);
  const F = Object.fromEntries(fittedBones.map(b => [b.name, v(b.globalPos)]));
  const rots = solveRotations(template, F, byName, children);
  return fittedBones.map(b => {
    const gPos = F[b.name], gRot = rots[b.name];
    let lPos = gPos.clone(), lRot = gRot.clone();
    if (b.parent) {
      const pInv = rots[b.parent].clone().invert();
      lPos = gPos.clone().sub(F[b.parent]).applyQuaternion(pInv);
      lRot = pInv.clone().multiply(gRot);
    }
    const tLen = b.parent ? v(byName[b.name].refGlobal).distanceTo(v(byName[b.parent].refGlobal)) : 0;
    return { ...b, globalRot: arr4(gRot), localPos: arr3(lPos), localRot: arr4(lRot), lengthRatio: tLen > 0.005 ? gPos.distanceTo(F[b.parent]) / tLen : null };
  });
}

/** Hard structural invariant: same count, same names in same order, same parents, no duplicates. */
export function assertStructure(template, bones) {
  const problems = [];
  if (bones.length !== template.bones.length) problems.push(`bone count ${bones.length} ≠ ${template.bones.length}`);
  const seen = new Set();
  template.bones.forEach((t, i) => {
    const f = bones[i];
    if (!f) { problems.push(`missing ${t.name}`); return; }
    if (f.name !== t.name) problems.push(`name/order mismatch at ${i}: ${f.name} ≠ ${t.name}`);
    if ((f.parent || null) !== (t.parent || null)) problems.push(`parent mismatch ${t.name}: ${f.parent} ≠ ${t.parent}`);
    if (seen.has(f.name)) problems.push(`duplicate ${f.name}`);
    seen.add(f.name);
  });
  return { ok: problems.length === 0, problems };
}

function describeKind(b) {
  return { twist: 'Twist bone', ik: 'IK bone', corrective: 'Corrective bone', aux: 'Auxiliary bone', root: 'Root' }[b.kind]
    || (/metacarpal/.test(b.name) ? 'Metacarpal' : /thumb|index|middle|ring|pinky/.test(b.name) ? 'Finger bone' : 'Deform bone');
}
