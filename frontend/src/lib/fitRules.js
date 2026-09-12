/**
 * Declarative fitting rules. These map user landmarks onto template joints
 * and describe how non-landmark bones are derived. Bone names here are the
 * UE5 Mannequin names; every rule is applied ONLY if the bone exists in the
 * loaded authoritative template. Rules never create, rename or re-parent.
 */

// bone → landmark id that defines the bone's global position
export const JOINT_LANDMARKS = {
  pelvis: 'pelvis', spine_02: 'spine_mid', spine_04: 'chest', neck_01: 'neck_base',
  clavicle_l: 'clavicle_l', upperarm_l: 'shoulder_l', lowerarm_l: 'elbow_l', hand_l: 'wrist_l',
  clavicle_r: 'clavicle_r', upperarm_r: 'shoulder_r', lowerarm_r: 'elbow_r', hand_r: 'wrist_r',
  thigh_l: 'hip_l', calf_l: 'knee_l', foot_l: 'ankle_l', ball_l: 'toe_l',
  thigh_r: 'hip_r', calf_r: 'knee_r', foot_r: 'ankle_r', ball_r: 'toe_r',
};

// [ancestor, descendant] pairs: bones strictly between are interpolated by template arc-length
export const CHAINS = [
  ['pelvis', 'spine_02'], ['spine_02', 'spine_04'], ['spine_04', 'neck_01'], ['neck_01', 'head'],
];

// bone → preferred child that defines the bone's direction (segment end)
export const SEGMENT_END = {
  root: 'pelvis', pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'spine_04',
  spine_04: 'spine_05', spine_05: 'neck_01', neck_01: 'neck_02', neck_02: 'head',
  clavicle_l: 'upperarm_l', upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l',
  clavicle_r: 'upperarm_r', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l',
  thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r',
};

// bone → { landmark, templateBone }: landmark acts as the segment end (tip) of that bone
export const TIP_LANDMARKS = {
  hand_l: { landmark: 'hand_l', templateBone: 'middle_03_l' },
  hand_r: { landmark: 'hand_r', templateBone: 'middle_03_r' },
};

// bone → source bone whose fitted global transform it copies (IK targets)
export const FOLLOWS = {
  ik_foot_l: 'foot_l', ik_foot_r: 'foot_r', ik_hand_l: 'hand_l', ik_hand_r: 'hand_r', ik_hand_gun: 'hand_r',
};

// head joint ≈ head_center − k·(head_top − head_center)
export const HEAD_RULE = { bone: 'head', center: 'head_center', top: 'head_top', k: 0.8 };

export const SCALE_CLAMP = [0.25, 4.0];

export function mirrorBoneName(name) {
  if (name.endsWith('_l')) return name.slice(0, -2) + '_r';
  if (name.endsWith('_r')) return name.slice(0, -2) + '_l';
  return null;
}
