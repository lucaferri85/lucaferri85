/**
 * SkinWeightGenerator — Phase C
 *
 * Anatomy-aware automatic skinning for the fitted UE5 Quinn skeleton.
 *
 * Design goals:
 *  - preserve the exact fitted/template bone order (skin indices are stable)
 *  - never assign weight to root / IK / auxiliary bones
 *  - allow Quinn twist bones to receive weight
 *  - max 4 influences per vertex by default (UE-friendly)
 *  - prefer same-side limb bones and anatomically plausible body regions
 *  - never leave a vertex unweighted; fall back to nearest deform segment
 *  - work on multi-mesh imports and very dense meshes without duplicating geometry
 *
 * This is deliberately deterministic. It is not a generic "nearest bone" pass:
 * side, body-region and twist priors are folded into the distance score so armor,
 * boots and separated accessories remain much less likely to leak across the body.
 */
import * as THREE from 'three';

const EPS = 1e-8;
const DEFAULTS = {
  maxInfluences: 4,
  falloffPower: 2.25,
  sidePenalty: 0.035,
  centerPenalty: 0.65,
  regionPenalty: 0.18,
  twistMultiplier: 0.82,
  yieldEvery: 25000,
  minWeight: 0.0001,
};

const NON_DEFORM_KINDS = new Set(['root', 'ik', 'aux']);
const ARM_RE = /(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/;
const LEG_RE = /(thigh|calf|foot|ball)/;
const TORSO_RE = /^(pelvis|spine_|neck_|head$)/;
const FINGER_RE = /(thumb|index|middle|ring|pinky)/;

function sideOf(name) {
  const n = name.toLowerCase();
  if (/_l$/.test(n)) return 'l';
  if (/_r$/.test(n)) return 'r';
  return 'c';
}

function regionOf(name) {
  const n = name.toLowerCase();
  if (FINGER_RE.test(n)) return 'finger';
  if (ARM_RE.test(n)) return 'arm';
  if (LEG_RE.test(n)) return 'leg';
  if (TORSO_RE.test(n)) return n === 'head' || n.startsWith('neck_') ? 'head' : 'torso';
  return 'other';
}

function distPointSegmentSq(px, py, pz, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
  const den = abx * abx + aby * aby + abz * abz;
  let t = den > EPS ? (apx * abx + apy * aby + apz * abz) / den : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

function chooseChild(bone, children, byName) {
  const kids = (children[bone.name] || []).map(n => byName[n]).filter(Boolean);
  if (!kids.length) return null;
  // Prefer a child on the same deform chain; avoid IK/aux branches.
  const sameSide = sideOf(bone.name);
  const sameRegion = regionOf(bone.name);
  return kids.find(k => !NON_DEFORM_KINDS.has(k.kind) && sideOf(k.name) === sameSide && regionOf(k.name) === sameRegion)
    || kids.find(k => !NON_DEFORM_KINDS.has(k.kind) && sideOf(k.name) === sameSide)
    || kids.find(k => !NON_DEFORM_KINDS.has(k.kind))
    || null;
}

function metric(bones, names, axis = 1, fallback = 0) {
  const vals = names.map(n => bones[n]?.globalPos?.[axis]).filter(Number.isFinite);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : fallback;
}

function bodyMetrics(byName) {
  // Unreal workspace: X forward, Y right, Z up.
  const pelvisZ = metric(byName, ['pelvis'], 2, 0.95);
  const shoulderZ = metric(byName, ['clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r'], 2, pelvisZ + 0.42);
  const neckZ = metric(byName, ['neck_01', 'neck_02'], 2, shoulderZ + 0.16);
  const headZ = metric(byName, ['head'], 2, neckZ + 0.12);
  const kneeZ = metric(byName, ['calf_l', 'calf_r'], 2, pelvisZ * 0.52);
  const ankleZ = metric(byName, ['foot_l', 'foot_r'], 2, Math.max(0.05, kneeZ * 0.25));
  const ly = metric(byName, ['thigh_l', 'upperarm_l', 'hand_l'], 1, -0.2);
  const ry = metric(byName, ['thigh_r', 'upperarm_r', 'hand_r'], 1, 0.2);
  const centerY = metric(byName, ['pelvis', 'spine_03', 'neck_01', 'head'], 1, 0);
  const height = Math.max(0.5, headZ - Math.min(0, ankleZ));
  const leftSign = ly >= ry ? 1 : -1;
  return { pelvisZ, shoulderZ, neckZ, headZ, kneeZ, ankleZ, centerY, height, leftSign };
}

function anatomyMultiplier(seg, px, py, pz, m, opts) {
  let k = 1;
  const lateralRel = (py - m.centerY) * m.leftSign; // + = anatomical left
  const lateral = Math.abs(lateralRel);
  const sideTol = m.height * 0.035;
  if (seg.side === 'l' && lateralRel < -sideTol) k *= opts.sidePenalty;
  else if (seg.side === 'r' && lateralRel > sideTol) k *= opts.sidePenalty;

  // Center-chain bones should not win on distant hands/arms merely because a
  // long torso segment passes nearby in Y.
  if (seg.side === 'c') {
    const torsoHalf = m.height * 0.16;
    if (lateral > torsoHalf) k *= opts.centerPenalty;
  }

  const h = m.height;
  if (seg.region === 'leg') {
    if (pz > m.pelvisZ + 0.10 * h) k *= opts.regionPenalty;
  } else if (seg.region === 'arm' || seg.region === 'finger') {
    const handLike = lateral > 0.17 * h;
    if (!handLike && pz < m.shoulderZ - 0.28 * h) k *= opts.regionPenalty;
    if (pz > m.headZ + 0.05 * h) k *= opts.regionPenalty;
  } else if (seg.region === 'head') {
    if (pz < m.shoulderZ - 0.08 * h) k *= opts.regionPenalty;
  } else if (seg.region === 'torso') {
    if (pz < m.kneeZ - 0.05 * h) k *= opts.regionPenalty;
  }

  if (seg.kind === 'twist') k *= opts.twistMultiplier;
  return k;
}

function topInsert(scores, ids, score, id) {
  for (let i = 0; i < scores.length; i++) {
    if (score <= scores[i]) continue;
    for (let j = scores.length - 1; j > i; j--) { scores[j] = scores[j - 1]; ids[j] = ids[j - 1]; }
    scores[i] = score; ids[i] = id; return;
  }
}

function collectParts(mesh) {
  const parts = [];
  let total = 0;
  mesh.updateMatrixWorld(true);
  mesh.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const count = o.geometry.attributes.position.count;
    parts.push({ object: o, uuid: o.uuid, name: o.name || `Mesh_${parts.length}`, vertexOffset: total, vertexCount: count });
    total += count;
  });
  return { parts, total };
}

export class SkinWeightGenerator {
  /**
   * @param {THREE.Object3D} mesh
   * @param {object} fittedSkeleton output of SkeletonFitter.fit()
   * @param {object} opts {maxInfluences, falloffPower, onProgress}
   */
  async generate(mesh, fittedSkeleton, opts = {}) {
    if (!mesh) throw new Error('No mesh loaded');
    if (!fittedSkeleton?.bones?.length) throw new Error('No fitted skeleton');
    const o = { ...DEFAULTS, ...opts };
    o.maxInfluences = Math.max(1, Math.min(4, Math.floor(o.maxInfluences || 4)));

    const bones = fittedSkeleton.bones;
    const byName = Object.fromEntries(bones.map(b => [b.name, b]));
    const children = {};
    for (const b of bones) if (b.parent) (children[b.parent] ||= []).push(b.name);
    const metrics = bodyMetrics(byName);

    // Bone indices MUST be fitted/template order. Never compact or re-number.
    const deformBones = bones.filter(b => !NON_DEFORM_KINDS.has(b.kind) && b.skinned !== false);
    if (!deformBones.length) throw new Error('Fitted skeleton contains no deformable bones');

    const segments = deformBones.map(b => {
      const child = chooseChild(b, children, byName);
      const parent = b.parent ? byName[b.parent] : null;
      const a = b.globalPos;
      let z = child?.globalPos;
      // Terminal bones (ball, finger_03, etc.): use the parent→bone segment,
      // but keep the influence assigned to the terminal bone.
      if (!z && parent?.globalPos) z = b.globalPos;
      const start = (!child && parent?.globalPos) ? parent.globalPos : a;
      const end = z || [a[0], a[1], a[2] + 0.025];
      const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2];
      const length = Math.max(0.02, Math.sqrt(dx*dx + dy*dy + dz*dz));
      return {
        boneIndex: bones.indexOf(b), name: b.name, kind: b.kind,
        side: sideOf(b.name), region: regionOf(b.name), start, end, length,
      };
    });

    const { parts, total } = collectParts(mesh);
    if (!total) throw new Error('Loaded object has no mesh vertices');

    const weights = new Float32Array(total * 4);
    const indices = new Uint16Array(total * 4);
    const world = new THREE.Vector3();
    const scores = new Float64Array(o.maxInfluences);
    const ids = new Int32Array(o.maxInfluences);
    let global = 0, unweighted = 0, influenceSum = 0, sideCross = 0, sideChecked = 0;
    const strongestCounts = new Uint32Array(bones.length);

    for (const part of parts) {
      const pos = part.object.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++, global++) {
        world.fromBufferAttribute(pos, i).applyMatrix4(part.object.matrixWorld);
        scores.fill(-Infinity); ids.fill(-1);

        for (let s = 0; s < segments.length; s++) {
          const seg = segments[s];
          const d2 = distPointSegmentSq(world.x, world.y, world.z, seg.start, seg.end);
          const d = Math.sqrt(d2);
          // Normalize partly by segment length: tiny finger bones still get a
          // fair local field without allowing long thigh/spine segments to dominate.
          const radius = Math.max(0.025, Math.min(0.18, seg.length * 0.55));
          const normalized = d / radius;
          const anatomy = anatomyMultiplier(seg, world.x, world.y, world.z, metrics, o);
          const score = anatomy / Math.pow(normalized + 0.18, o.falloffPower);
          topInsert(scores, ids, score, s);
        }

        let sum = 0;
        for (let k = 0; k < o.maxInfluences; k++) if (ids[k] >= 0 && Number.isFinite(scores[k]) && scores[k] > 0) sum += scores[k];
        if (!(sum > EPS)) {
          // Defensive nearest-segment fallback. In normal operation this path
          // should never run, but it guarantees no zero-weight vertices.
          let best = 0, bestD = Infinity;
          for (let s = 0; s < segments.length; s++) {
            const sg = segments[s];
            const d2 = distPointSegmentSq(world.x, world.y, world.z, sg.start, sg.end);
            if (d2 < bestD) { bestD = d2; best = s; }
          }
          ids[0] = best; scores[0] = 1; sum = 1; unweighted++;
        }

        let kept = 0, norm = 0;
        for (let k = 0; k < o.maxInfluences; k++) {
          if (ids[k] < 0) continue;
          const w = scores[k] / sum;
          if (w >= o.minWeight || k === 0) { norm += w; kept++; }
        }
        if (norm <= EPS) norm = 1;
        let outK = 0;
        for (let k = 0; k < o.maxInfluences && outK < 4; k++) {
          if (ids[k] < 0) continue;
          const raw = scores[k] / sum;
          if (raw < o.minWeight && k !== 0) continue;
          const sg = segments[ids[k]];
          indices[global * 4 + outK] = sg.boneIndex;
          weights[global * 4 + outK] = raw / norm;
          outK++;
        }
        influenceSum += outK;
        strongestCounts[indices[global * 4]]++;

        const lateralRel = (world.y - metrics.centerY) * metrics.leftSign;
        if (Math.abs(lateralRel) > metrics.height * 0.12) {
          const strongest = bones[indices[global * 4]];
          const ss = strongest ? sideOf(strongest.name) : 'c';
          sideChecked++;
          if ((lateralRel > 0 && ss === 'r') || (lateralRel < 0 && ss === 'l')) sideCross++;
        }

        if (o.onProgress && (global % o.yieldEvery === 0 || global === total - 1)) {
          o.onProgress({ done: global + 1, total, progress: (global + 1) / total });
        }
        if (global > 0 && global % o.yieldEvery === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    const partMeta = parts.map(({ uuid, name, vertexOffset, vertexCount }) => ({ uuid, name, vertexOffset, vertexCount }));
    const sideCrossRate = sideChecked ? sideCross / sideChecked : 0;
    const warnings = [];
    if (unweighted) warnings.push(`${unweighted} vertex/vertices required nearest-bone fallback.`);
    if (sideCrossRate > 0.01) warnings.push(`${(sideCrossRate * 100).toFixed(2)}% of strongly lateral vertices have a strongest influence from the opposite side; inspect shoulders/hands/boots.`);
    if (total > 2_000_000) warnings.push(`Dense mesh: ${total.toLocaleString()} vertices. Consider retopology for production deformation/performance even when weighting succeeds.`);

    return {
      weights,
      indices,
      boneNames: bones.map(b => b.name),
      parts: partMeta,
      options: { maxInfluences: o.maxInfluences, falloffPower: o.falloffPower },
      report: {
        generated_at: new Date().toISOString(),
        verticesWeighted: total,
        unweighted,
        maxInfluences: o.maxInfluences,
        avgInfluences: total ? influenceSum / total : 0,
        deformBonesUsed: deformBones.length,
        totalSkeletonBones: bones.length,
        sideCrossRate,
        strongestBoneCounts: Object.fromEntries(bones.map((b, i) => [b.name, strongestCounts[i]]).filter(([, n]) => n > 0)),
        warnings,
      },
    };
  }

  /** Apply generated skinIndex/skinWeight attributes back to the loaded mesh geometries. */
  applyToMesh(mesh, result) {
    if (!mesh || !result?.parts?.length) throw new Error('Missing mesh or skin result');
    const byUuid = {};
    mesh.traverse(o => { if (o.isMesh) byUuid[o.uuid] = o; });
    for (const part of result.parts) {
      const obj = byUuid[part.uuid];
      if (!obj?.geometry) continue;
      const a = part.vertexOffset * 4;
      const b = (part.vertexOffset + part.vertexCount) * 4;
      obj.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(result.indices.slice(a, b), 4));
      obj.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(result.weights.slice(a, b), 4));
      obj.geometry.attributes.skinIndex.needsUpdate = true;
      obj.geometry.attributes.skinWeight.needsUpdate = true;
    }
    return true;
  }

  validate(result, fittedSkeleton, tolerance = 0.002) {
    if (!result?.weights || !result?.indices) return { valid: false, errors: ['No skin weights generated'], warnings: [] };
    const { weights, indices } = result;
    const bones = fittedSkeleton?.bones || [];
    const vertexCount = Math.floor(weights.length / 4);
    const errors = [], warnings = [];
    let zero = 0, badNorm = 0, badIndex = 0, nonFinite = 0, overFour = 0;
    const forbidden = new Set(bones.map((b, i) => NON_DEFORM_KINDS.has(b.kind) ? i : -1).filter(i => i >= 0));
    let forbiddenUsed = 0;
    for (let v = 0; v < vertexCount; v++) {
      let sum = 0, n = 0;
      for (let k = 0; k < 4; k++) {
        const w = weights[v*4+k], idx = indices[v*4+k];
        if (!Number.isFinite(w)) { nonFinite++; continue; }
        if (w > 0) { sum += w; n++; if (idx >= bones.length) badIndex++; if (forbidden.has(idx)) forbiddenUsed++; }
      }
      if (n === 0 || sum <= EPS) zero++;
      if (n > 4) overFour++;
      if (n && Math.abs(sum - 1) > tolerance) badNorm++;
    }
    if (zero) errors.push(`${zero} unweighted vertices`);
    if (badIndex) errors.push(`${badIndex} influences reference invalid bone indices`);
    if (nonFinite) errors.push(`${nonFinite} non-finite weights`);
    if (forbiddenUsed) errors.push(`${forbiddenUsed} influences use root/IK/aux bones`);
    if (badNorm) warnings.push(`${badNorm} vertices are not normalized within ±${tolerance}`);
    if (overFour) errors.push(`${overFour} vertices exceed 4 influences`);
    return {
      valid: errors.length === 0,
      errors, warnings,
      stats: { vertexCount, zero, badNorm, badIndex, nonFinite, forbiddenUsed, maxInfluences: 4 },
    };
  }
}
