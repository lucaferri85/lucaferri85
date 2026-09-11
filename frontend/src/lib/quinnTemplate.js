/**
 * Default UE5 SKM_Quinn skeleton template.
 *
 * This is the authoritative reference bundled with the application so users
 * can immediately load and visualize the Quinn hierarchy. The Skeleton
 * Template Manager treats it identically to a user-uploaded JSON file - the
 * fitter never assumes these specific bone names in code; it always reads
 * them from whichever template is currently loaded.
 *
 * File format (JSON schema):
 * {
 *   "name": "UE5 Quinn",
 *   "version": "1.0",
 *   "unit": "m",         // internal storage unit (converted on UE export)
 *   "up_axis": "y",      // Three.js viewport axis
 *   "bones": [
 *     {
 *       "name": "root",              // exact UE bone name
 *       "parent": null,              // string parent name, null = root
 *       "kind": "root|deform|twist|ik|aux",
 *       "refLocal": {                // Quinn A-pose local transform
 *         "pos":   [x,y,z],
 *         "rot":   [x,y,z,w],
 *         "scale": [1,1,1]
 *       },
 *       "refGlobal": [x,y,z],        // computed absolute Quinn A-pose position
 *       "roll": 0.0,
 *       "derived": {                 // optional rule for IK/aux bones
 *         "source": "hand_l",        // bone whose pose this follows
 *         "space":  "global"
 *       }
 *     },
 *     ...
 *   ]
 * }
 *
 * Positions below are Quinn A-pose reference positions in metres, Y-up.
 * They are approximations of the actual SKM_Quinn asset from UE5 5.4.
 * When the user has the real skeleton, they upload their own JSON to
 * override this file completely.
 */

// Helper to build a bone entry succinctly
const B = (name, parent, refGlobal, kind = 'deform', extra = {}) => ({
  name,
  parent,
  kind,
  refGlobal: refGlobal.slice(),
  refLocal: null,       // filled in by buildTemplate() below
  roll: extra.roll || 0,
  ...extra,
});

const rawBones = [
  // ---------- Root & spine ----------
  B('root',    null,      [0.000, 0.000, 0.000], 'root'),
  B('pelvis',  'root',    [0.000, 0.98,  0.000]),
  B('spine_01','pelvis',  [0.000, 1.05,  0.010]),
  B('spine_02','spine_01',[0.000, 1.15,  0.010]),
  B('spine_03','spine_02',[0.000, 1.24,  0.015]),
  B('spine_04','spine_03',[0.000, 1.36,  0.020]),
  B('spine_05','spine_04',[0.000, 1.47,  0.020]),

  // ---------- Neck & head ----------
  B('neck_01', 'spine_05', [0.000, 1.55, 0.010]),
  B('neck_02', 'neck_01',  [0.000, 1.62, 0.010]),
  B('head',    'neck_02',  [0.000, 1.70, 0.020]),

  // ---------- Left arm ----------
  B('clavicle_l',          'spine_05',           [ 0.030, 1.52,  0.010]),
  B('upperarm_l',          'clavicle_l',         [ 0.180, 1.48, -0.020]),
  B('upperarm_twist_01_l', 'upperarm_l',         [ 0.310, 1.40, -0.030], 'twist', { twist_ratio: 0.5 }),
  B('lowerarm_l',          'upperarm_l',         [ 0.440, 1.32, -0.045]),
  B('lowerarm_twist_01_l', 'lowerarm_l',         [ 0.560, 1.24, -0.035], 'twist', { twist_ratio: 0.5 }),
  B('hand_l',              'lowerarm_l',         [ 0.680, 1.15, -0.020]),

  // Left fingers (thumb/index/middle/ring/pinky × 3 phalanges)
  B('thumb_01_l',  'hand_l', [0.700, 1.13, 0.010]),
  B('thumb_02_l',  'thumb_01_l', [0.720, 1.12, 0.025]),
  B('thumb_03_l',  'thumb_02_l', [0.735, 1.11, 0.035]),
  B('index_01_l',  'hand_l', [0.740, 1.14, -0.010]),
  B('index_02_l',  'index_01_l', [0.770, 1.13, -0.010]),
  B('index_03_l',  'index_02_l', [0.790, 1.12, -0.010]),
  B('middle_01_l', 'hand_l', [0.745, 1.13, -0.025]),
  B('middle_02_l', 'middle_01_l', [0.780, 1.11, -0.025]),
  B('middle_03_l', 'middle_02_l', [0.805, 1.10, -0.025]),
  B('ring_01_l',   'hand_l', [0.740, 1.12, -0.040]),
  B('ring_02_l',   'ring_01_l', [0.770, 1.10, -0.040]),
  B('ring_03_l',   'ring_02_l', [0.790, 1.09, -0.040]),
  B('pinky_01_l',  'hand_l', [0.730, 1.11, -0.055]),
  B('pinky_02_l',  'pinky_01_l', [0.755, 1.09, -0.055]),
  B('pinky_03_l',  'pinky_02_l', [0.775, 1.08, -0.055]),

  // ---------- Right arm (mirrored X) ----------
  B('clavicle_r',          'spine_05',           [-0.030, 1.52,  0.010]),
  B('upperarm_r',          'clavicle_r',         [-0.180, 1.48, -0.020]),
  B('upperarm_twist_01_r', 'upperarm_r',         [-0.310, 1.40, -0.030], 'twist', { twist_ratio: 0.5 }),
  B('lowerarm_r',          'upperarm_r',         [-0.440, 1.32, -0.045]),
  B('lowerarm_twist_01_r', 'lowerarm_r',         [-0.560, 1.24, -0.035], 'twist', { twist_ratio: 0.5 }),
  B('hand_r',              'lowerarm_r',         [-0.680, 1.15, -0.020]),

  B('thumb_01_r',  'hand_r', [-0.700, 1.13, 0.010]),
  B('thumb_02_r',  'thumb_01_r', [-0.720, 1.12, 0.025]),
  B('thumb_03_r',  'thumb_02_r', [-0.735, 1.11, 0.035]),
  B('index_01_r',  'hand_r', [-0.740, 1.14, -0.010]),
  B('index_02_r',  'index_01_r', [-0.770, 1.13, -0.010]),
  B('index_03_r',  'index_02_r', [-0.790, 1.12, -0.010]),
  B('middle_01_r', 'hand_r', [-0.745, 1.13, -0.025]),
  B('middle_02_r', 'middle_01_r', [-0.780, 1.11, -0.025]),
  B('middle_03_r', 'middle_02_r', [-0.805, 1.10, -0.025]),
  B('ring_01_r',   'hand_r', [-0.740, 1.12, -0.040]),
  B('ring_02_r',   'ring_01_r', [-0.770, 1.10, -0.040]),
  B('ring_03_r',   'ring_02_r', [-0.790, 1.09, -0.040]),
  B('pinky_01_r',  'hand_r', [-0.730, 1.11, -0.055]),
  B('pinky_02_r',  'pinky_01_r', [-0.755, 1.09, -0.055]),
  B('pinky_03_r',  'pinky_02_r', [-0.775, 1.08, -0.055]),

  // ---------- Left leg ----------
  B('thigh_l',           'pelvis',   [ 0.100, 0.95, -0.015]),
  B('thigh_twist_01_l',  'thigh_l',  [ 0.108, 0.75,  0.000], 'twist', { twist_ratio: 0.5 }),
  B('calf_l',            'thigh_l',  [ 0.120, 0.54,  0.010]),
  B('calf_twist_01_l',   'calf_l',   [ 0.126, 0.34,  0.000], 'twist', { twist_ratio: 0.5 }),
  B('foot_l',            'calf_l',   [ 0.135, 0.12, -0.045]),
  B('ball_l',            'foot_l',   [ 0.140, 0.03,  0.080]),

  // ---------- Right leg ----------
  B('thigh_r',           'pelvis',   [-0.100, 0.95, -0.015]),
  B('thigh_twist_01_r',  'thigh_r',  [-0.108, 0.75,  0.000], 'twist', { twist_ratio: 0.5 }),
  B('calf_r',            'thigh_r',  [-0.120, 0.54,  0.010]),
  B('calf_twist_01_r',   'calf_r',   [-0.126, 0.34,  0.000], 'twist', { twist_ratio: 0.5 }),
  B('foot_r',            'calf_r',   [-0.135, 0.12, -0.045]),
  B('ball_r',            'foot_r',   [-0.140, 0.03,  0.080]),

  // ---------- IK chains (non-deform) ----------
  B('ik_foot_root', 'root',         [0.000, 0.00, 0.000], 'ik'),
  B('ik_foot_l',    'ik_foot_root', [ 0.135, 0.12, -0.045], 'ik', { derived: { source: 'foot_l', space: 'global' }}),
  B('ik_foot_r',    'ik_foot_root', [-0.135, 0.12, -0.045], 'ik', { derived: { source: 'foot_r', space: 'global' }}),
  B('ik_hand_root', 'root',         [0.000, 1.15, -0.020], 'ik'),
  B('ik_hand_gun',  'ik_hand_root', [-0.680, 1.15, -0.020], 'ik', { derived: { source: 'hand_r', space: 'global' }}),
  B('ik_hand_l',    'ik_hand_gun',  [ 0.680, 1.15, -0.020], 'ik', { derived: { source: 'hand_l', space: 'global' }}),
  B('ik_hand_r',    'ik_hand_gun',  [-0.680, 1.15, -0.020], 'ik', { derived: { source: 'hand_r', space: 'global' }}),
];

// Compute refLocal from refGlobal + parent refGlobal
function buildTemplate(bones) {
  const byName = Object.fromEntries(bones.map(b => [b.name, b]));
  for (const b of bones) {
    const pg = b.parent ? byName[b.parent]?.refGlobal : null;
    const local = pg
      ? [b.refGlobal[0] - pg[0], b.refGlobal[1] - pg[1], b.refGlobal[2] - pg[2]]
      : b.refGlobal.slice();
    b.refLocal = { pos: local, rot: [0, 0, 0, 1], scale: [1, 1, 1] };
  }
  return {
    name: 'UE5 Quinn',
    version: '1.0',
    unit: 'm',
    up_axis: 'y',
    source: 'bundled_default',
    bones,
  };
}

export const DEFAULT_QUINN_TEMPLATE = buildTemplate(rawBones);

/** Extract parent-name → children-name[] map. */
export function buildChildrenMap(template) {
  const map = {};
  for (const b of template.bones) {
    if (b.parent) {
      map[b.parent] = map[b.parent] || [];
      map[b.parent].push(b.name);
    }
  }
  return map;
}

/** Build a nested tree structure for UI display, rooted at bones with no parent. */
export function buildBoneTree(template) {
  const byName = Object.fromEntries(template.bones.map(b => [b.name, { ...b, children: [] }]));
  const roots = [];
  for (const name in byName) {
    const b = byName[name];
    if (b.parent && byName[b.parent]) {
      byName[b.parent].children.push(b);
    } else {
      roots.push(b);
    }
  }
  return roots;
}
