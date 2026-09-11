/**
 * FBX → skeleton template importer.
 *
 * Reads bone names, parent links and reference-pose transforms VERBATIM
 * from the FBX object tree (Objects.Model nodes typed LimbNode/Root plus
 * any node bound by a skin Cluster). Nothing is renamed, re-parented,
 * dropped or reconstructed. Every deviation from a clean single-root
 * skeleton is reported in `diagnostics` instead of being repaired.
 *
 * Internal storage is metres, Y-up (Three.js). Unit conversion is a
 * uniform scalar on translations; axis conversion (only if the file is
 * not Y-up) is applied to root bones only, so all child local transforms
 * stay bit-identical to the FBX.
 */
import { Matrix4, Vector3, Quaternion, Euler, MathUtils } from 'three';
import { FBXLoader, generateTransform, getEulerOrder } from './FBXLoaderRaw';
import { TEMPLATE_SCHEMA_VERSION } from '../quinnTemplate';

const AXIS_NAMES = ['X', 'Y', 'Z'];
const BONE_ATTR_TYPES = new Set(['LimbNode', 'Limb', 'Root', 'Effector']);

export async function parseSkeletonFromFBX(arrayBuffer, filename) {
  const warnings = [];
  const errors = [];
  const info = [];

  const loader = new FBXLoader();
  const { fbxTree: tree, connections } = loader.parseTreeOnly(arrayBuffer);
  if (!tree || !tree.Objects || !tree.Objects.Model) {
    throw new Error('FBX contains no Objects.Model section');
  }

  // ---------- Header / global settings ----------
  const gs = tree.GlobalSettings || {};
  const val = (k, d) => (gs[k] && gs[k].value !== undefined ? gs[k].value : d);
  const unitScaleFactor = Number(val('UnitScaleFactor', 1));
  const originalUnitScaleFactor = Number(val('OriginalUnitScaleFactor', unitScaleFactor));
  const upAxis = Number(val('UpAxis', 1));
  const upAxisSign = Number(val('UpAxisSign', 1));
  const frontAxis = Number(val('FrontAxis', 2));
  const frontAxisSign = Number(val('FrontAxisSign', 1));
  const coordAxis = Number(val('CoordAxis', 0));
  const coordAxisSign = Number(val('CoordAxisSign', 1));

  const header = tree.FBXHeaderExtension || {};
  const ts = header.CreationTimeStamp || {};
  const creationTimestamp = ts.Year
    ? `${ts.Year}-${pad(ts.Month)}-${pad(ts.Day)}T${pad(ts.Hour)}:${pad(ts.Minute)}:${pad(ts.Second)}`
    : null;

  const fbxVersion = tree.FBXVersion || header.FBXVersion || null;
  const creator = typeof header.Creator === 'string' ? header.Creator : null;

  if (unitScaleFactor !== 1) {
    info.push(`UnitScaleFactor = ${unitScaleFactor} (1.0 = centimetres). Translations converted to metres with factor ${unitScaleFactor / 100}.`);
  } else {
    info.push('UnitScaleFactor = 1.0 → file units are centimetres (Unreal default). Converted to metres (×0.01).');
  }
  if (upAxis !== 1 || upAxisSign !== 1) {
    warnings.push(`File up-axis is ${upAxisSign < 0 ? '-' : '+'}${AXIS_NAMES[upAxis]}, not +Y. A root-level axis conversion was applied for the viewport; child local transforms are untouched.`);
  }

  // ---------- Skinning clusters → which nodes deform ----------
  const clusterByBoneId = new Map(); // boneId -> { transformLink, vertexCount }
  const deformers = tree.Objects.Deformer || {};
  for (const idStr in deformers) {
    const d = deformers[idStr];
    if (d.attrType !== 'Cluster') continue;
    const rel = connections.get(parseInt(idStr));
    if (!rel) continue;
    for (const child of rel.children) {
      if (tree.Objects.Model[child.ID]) {
        clusterByBoneId.set(child.ID, {
          transformLink: d.TransformLink ? new Matrix4().fromArray(d.TransformLink.a) : null,
          vertexCount: d.Indexes ? d.Indexes.a.length : 0,
        });
      }
    }
  }

  // ---------- Bind poses ----------
  const bindPoseById = new Map();
  const poses = tree.Objects.Pose || {};
  for (const idStr in poses) {
    const p = poses[idStr];
    if (p.attrType !== 'BindPose' || !p.PoseNode) continue;
    const nodes = Array.isArray(p.PoseNode) ? p.PoseNode : [p.PoseNode];
    for (const pn of nodes) bindPoseById.set(pn.Node, new Matrix4().fromArray(pn.Matrix.a));
  }

  // ---------- Collect bone nodes ----------
  const models = tree.Objects.Model;
  const boneIds = [];
  const meshNodes = [];
  const otherNodes = [];
  for (const idStr in models) {
    const id = parseInt(idStr);
    const m = models[idStr];
    if (BONE_ATTR_TYPES.has(m.attrType) || clusterByBoneId.has(id)) {
      boneIds.push(id);
      if (!BONE_ATTR_TYPES.has(m.attrType)) {
        warnings.push(`Node '${m.attrName}' is typed '${m.attrType}' but is bound by a skin cluster → included as a bone (type recorded, not changed).`);
      }
    } else if (m.attrType === 'Mesh') {
      meshNodes.push({ id, name: m.attrName });
    } else {
      otherNodes.push({ id, name: m.attrName, type: m.attrType || 'unknown' });
    }
  }
  if (boneIds.length === 0) {
    errors.push('No skeleton nodes (LimbNode/Root or skin-bound) found in this FBX.');
  }

  const boneIdSet = new Set(boneIds);
  const parentOf = new Map(); // boneId -> parent boneId | null
  for (const id of boneIds) {
    const rel = connections.get(id);
    const parents = (rel ? rel.parents : []).filter(p => p.relationship === undefined); // OO (object→object) links only
    const modelParents = parents.filter(p => models[p.ID]);
    const boneParents = modelParents.filter(p => boneIdSet.has(p.ID));
    if (boneParents.length > 1) {
      warnings.push(`Bone '${models[id].attrName}' has ${boneParents.length} parent connections; first one kept, others recorded.`);
    }
    if (boneParents.length >= 1) {
      parentOf.set(id, boneParents[0].ID);
    } else {
      parentOf.set(id, null);
      const nonBoneParent = modelParents[0];
      if (nonBoneParent) {
        warnings.push(`Bone '${models[id].attrName}' is parented to non-skeleton node '${models[nonBoneParent.ID].attrName}' (${models[nonBoneParent.ID].attrType}). It is treated as a skeleton root; the container node was NOT inserted as a bone.`);
      }
    }
  }

  // ---------- Local transforms (exact FBX transform math) ----------
  const unitToM = unitScaleFactor / 100;
  const localMatrix = new Map();
  const rawByBone = new Map();
  for (const id of boneIds) {
    const node = models[id];
    const td = {};
    if ('InheritType' in node) td.inheritType = parseInt(node.InheritType.value);
    td.eulerOrder = 'RotationOrder' in node ? getEulerOrder(node.RotationOrder.value) : 'ZYX';
    if ('Lcl_Translation' in node) td.translation = node.Lcl_Translation.value;
    if ('PreRotation' in node) td.preRotation = node.PreRotation.value;
    if ('Lcl_Rotation' in node) td.rotation = node.Lcl_Rotation.value;
    if ('PostRotation' in node) td.postRotation = node.PostRotation.value;
    if ('Lcl_Scaling' in node) td.scale = node.Lcl_Scaling.value;
    if ('ScalingOffset' in node) td.scalingOffset = node.ScalingOffset.value;
    if ('ScalingPivot' in node) td.scalingPivot = node.ScalingPivot.value;
    if ('RotationOffset' in node) td.rotationOffset = node.RotationOffset.value;
    if ('RotationPivot' in node) td.rotationPivot = node.RotationPivot.value;
    localMatrix.set(id, generateTransform(td));
    rawByBone.set(id, {
      lcl_translation: td.translation ? td.translation.slice() : [0, 0, 0],
      lcl_rotation_deg: td.rotation ? td.rotation.slice() : [0, 0, 0],
      pre_rotation_deg: td.preRotation ? td.preRotation.slice() : null,
      post_rotation_deg: td.postRotation ? td.postRotation.slice() : null,
      lcl_scaling: td.scale ? td.scale.slice() : [1, 1, 1],
      rotation_order: td.eulerOrder,
      inherit_type: td.inheritType ?? null,
    });
  }

  // ---------- Order bones parent-first (depth-first from roots) ----------
  const childrenOf = new Map();
  for (const id of boneIds) {
    const p = parentOf.get(id);
    if (p !== null) {
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p).push(id);
    }
  }
  const roots = boneIds.filter(id => parentOf.get(id) === null);
  const ordered = [];
  const visited = new Set();
  const stack = [...roots].reverse();
  while (stack.length) {
    const id = stack.pop();
    if (visited.has(id)) { warnings.push(`Cycle detected at bone '${models[id].attrName}'.`); continue; }
    visited.add(id);
    ordered.push(id);
    const kids = childrenOf.get(id) || [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  }
  for (const id of boneIds) if (!visited.has(id)) { ordered.push(id); errors.push(`Bone '${models[id].attrName}' unreachable from any root (broken hierarchy).`); }

  // ---------- Axis conversion (root-level only) ----------
  const axisFix = new Matrix4();
  if (upAxis === 2) axisFix.makeRotationX(-Math.PI / 2 * upAxisSign);      // Z-up → Y-up
  else if (upAxis === 0) axisFix.makeRotationZ(Math.PI / 2 * upAxisSign);  // X-up → Y-up
  const unitFix = new Matrix4().makeScale(unitToM, unitToM, unitToM);

  // ---------- Global transforms & output ----------
  const globalMatrix = new Map(); // in internal space (m, Y-up)
  const globalFileMatrix = new Map(); // in raw file space for bind-pose comparison
  const bones = [];
  const nameCounts = new Map();
  let maxBindDeviation = 0;
  let bindCompared = 0;

  const tmpPos = new Vector3(), tmpQuat = new Quaternion(), tmpScale = new Vector3();
  for (const id of ordered) {
    const node = models[id];
    const name = node.attrName;
    nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    const pid = parentOf.get(id);
    const parentName = pid !== null ? models[pid].attrName : null;

    const L = localMatrix.get(id).clone();
    const GF = pid !== null ? globalFileMatrix.get(pid).clone().multiply(L) : L.clone();
    globalFileMatrix.set(id, GF);

    // internal-space local: scale translation only (rotation/scale untouched)
    L.decompose(tmpPos, tmpQuat, tmpScale);
    const localPosM = tmpPos.clone().multiplyScalar(unitToM);
    let Lint = new Matrix4().compose(localPosM, tmpQuat, tmpScale);
    if (pid === null) Lint = axisFix.clone().multiply(Lint);
    const lPos = new Vector3(), lQuat = new Quaternion(), lScale = new Vector3();
    Lint.decompose(lPos, lQuat, lScale);
    const G = pid !== null ? globalMatrix.get(pid).clone().multiply(Lint) : Lint.clone();
    globalMatrix.set(id, G);

    const gPos = new Vector3(), gQuat = new Quaternion(), gScale = new Vector3();
    G.decompose(gPos, gQuat, gScale);

    // bind pose consistency (file space)
    const bind = bindPoseById.get(id) || clusterByBoneId.get(id)?.transformLink || null;
    let bindDeviation = null;
    if (bind) {
      const bp = new Vector3().setFromMatrixPosition(bind);
      const gp = new Vector3().setFromMatrixPosition(GF);
      bindDeviation = bp.distanceTo(gp) * unitToM;
      maxBindDeviation = Math.max(maxBindDeviation, bindDeviation);
      bindCompared++;
    }

    const cluster = clusterByBoneId.get(id);
    const bindGlobal = bind ? unitFix.clone().multiply(axisFix).multiply(bind) : null;
    const bindPos = bindGlobal ? new Vector3().setFromMatrixPosition(bindGlobal) : null;

    bones.push({
      name,
      parent: parentName,
      kind: classifyBone(name, !!cluster, pid === null),
      kind_inferred: true,
      skinned: !!cluster,
      skin_vertex_count: cluster ? cluster.vertexCount : 0,
      fbx_node_id: id,
      fbx_attr_type: node.attrType || 'unknown',
      refLocal: {
        pos: [lPos.x, lPos.y, lPos.z],
        rot: [lQuat.x, lQuat.y, lQuat.z, lQuat.w],
        scale: [lScale.x, lScale.y, lScale.z],
      },
      refGlobal: [gPos.x, gPos.y, gPos.z],
      refGlobalRot: [gQuat.x, gQuat.y, gQuat.z, gQuat.w],
      roll: 0,
      fbx_raw: rawByBone.get(id),
      bind_pose_global_pos: bindPos ? [bindPos.x, bindPos.y, bindPos.z] : null,
      bind_pose_deviation_m: bindDeviation,
    });
  }

  for (const [n, c] of nameCounts) if (c > 1) errors.push(`Duplicate bone name '${n}' appears ${c} times.`);
  if (roots.length > 1) {
    warnings.push(`Skeleton has ${roots.length} root bones: ${roots.map(r => models[r].attrName).join(', ')}. UE5 expects exactly one root.`);
  }
  if (bindCompared > 0) {
    info.push(`Bind pose cross-check: ${bindCompared} bones compared, max deviation ${(maxBindDeviation * 1000).toFixed(3)} mm between node transforms and stored bind matrices.`);
    if (maxBindDeviation > 0.001) warnings.push(`Node reference transforms differ from stored bind-pose matrices by up to ${(maxBindDeviation * 1000).toFixed(2)} mm. Node Lcl transforms were kept as the reference pose.`);
  } else {
    info.push('No BindPose / cluster matrices present — reference pose taken from node Lcl transforms only.');
  }
  if (meshNodes.length) info.push(`${meshNodes.length} mesh node(s) present in FBX (ignored for the template): ${meshNodes.map(m => m.name).join(', ')}.`);
  if (otherNodes.length) info.push(`${otherNodes.length} non-skeleton node(s) ignored: ${otherNodes.map(n => `${n.name} (${n.type})`).join(', ')}.`);
  const anim = tree.Objects.AnimationStack ? Object.keys(tree.Objects.AnimationStack).length : 0;
  if (anim) warnings.push(`${anim} animation stack(s) present. Reference pose is taken from node transforms, not from animation frames.`);

  // skeleton extents in internal space
  let minY = Infinity, maxY = -Infinity;
  for (const b of bones) { minY = Math.min(minY, b.refGlobal[1]); maxY = Math.max(maxY, b.refGlobal[1]); }
  const heightM = bones.length ? maxY - minY : 0;

  const skinnedCount = bones.filter(b => b.skinned).length;
  const kindCounts = {};
  for (const b of bones) kindCounts[b.kind] = (kindCounts[b.kind] || 0) + 1;

  const importedAt = new Date().toISOString();
  const template = {
    schema_version: TEMPLATE_SCHEMA_VERSION,
    name: filename.replace(/\.fbx$/i, ''),
    version: fbxVersion ? `fbx-${fbxVersion}` : 'fbx',
    unit: 'm',
    up_axis: 'y',
    source: 'user_authoritative',
    provenance: {
      origin_format: 'fbx',
      origin_filename: filename,
      origin_bytes: arrayBuffer.byteLength,
      sha256: await sha256Hex(arrayBuffer),
      fbx_version: fbxVersion,
      creator,
      creation_timestamp: creationTimestamp,
      imported_at: importedAt,
      unit_scale_factor: unitScaleFactor,
      original_unit_scale_factor: originalUnitScaleFactor,
      file_units: unitLabel(unitScaleFactor),
      up_axis: `${upAxisSign < 0 ? '-' : '+'}${AXIS_NAMES[upAxis] || '?'}`,
      front_axis: `${frontAxisSign < 0 ? '-' : '+'}${AXIS_NAMES[frontAxis] || '?'}`,
      coord_axis: `${coordAxisSign < 0 ? '-' : '+'}${AXIS_NAMES[coordAxis] || '?'}`,
      handedness: 'right-handed (FBX)',
      conversion_applied: `translations ×${unitToM}${upAxis !== 1 ? ' + root axis rotation to Y-up' : ''}`,
    },
    diagnostics: {
      bone_count: bones.length,
      root_bones: roots.map(r => models[r].attrName),
      skinned_bone_count: skinnedCount,
      non_skinned_bone_count: bones.length - skinnedCount,
      kind_counts: kindCounts,
      max_depth: computeMaxDepth(bones),
      skeleton_height_m: heightM,
      mesh_nodes: meshNodes.map(m => m.name),
      bind_pose_max_deviation_mm: maxBindDeviation * 1000,
      errors,
      warnings,
      info,
    },
    bones,
  };
  return template;
}

export function classifyBone(name, skinned, isRoot) {
  const n = name.toLowerCase();
  if (isRoot || n === 'root') return 'root';
  if (n.startsWith('ik_')) return 'ik';
  if (n.includes('twist')) return 'twist';
  if (/corrective|_bck|_fwd|_in_|_out_|_in$|_out$|_lwr|latissimus|bicep|tricep|kneeback|_knee|_scap|_pec|wrist_inner|wrist_outer|ankle_/.test(n)) return 'corrective';
  if (n === 'interaction' || n === 'center_of_mass') return 'aux';
  return 'deform';
}

function computeMaxDepth(bones) {
  const depth = new Map();
  let max = 0;
  for (const b of bones) {
    const d = b.parent ? (depth.get(b.parent) || 0) + 1 : 0;
    depth.set(b.name, d);
    if (d > max) max = d;
  }
  return max;
}

function unitLabel(f) {
  if (Math.abs(f - 1) < 1e-6) return 'cm';
  if (Math.abs(f - 100) < 1e-6) return 'm';
  if (Math.abs(f - 2.54) < 1e-6) return 'in';
  if (Math.abs(f - 10) < 1e-6) return 'dm';
  if (Math.abs(f - 0.1) < 1e-6) return 'mm';
  return `custom (${f})`;
}

function pad(n) { return String(n ?? 0).padStart(2, '0'); }

async function sha256Hex(buffer) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const hash = await subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Quaternion [x,y,z,w] → Euler degrees (XYZ) for display. */
export function quatToEulerDeg(q) {
  const e = new Euler().setFromQuaternion(new Quaternion(q[0], q[1], q[2], q[3]), 'XYZ');
  return [MathUtils.radToDeg(e.x), MathUtils.radToDeg(e.y), MathUtils.radToDeg(e.z)];
}
