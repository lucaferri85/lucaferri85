/**
 * Anatomical Landmark definitions for the UE5 Quinn Auto-Rigger.
 *
 * These are the manually-placed anchor points that the SkeletonFitter
 * (Phase 2) will use to solve the Quinn skeleton template onto the
 * user's imported mesh.
 *
 * Each landmark stores:
 *   - id            : stable string id used across UI + persistence
 *   - label         : human-facing label
 *   - group         : "center" | "left" | "right" | "fingers"
 *   - color         : viewport marker color
 *   - bone_target   : the UE5 Quinn bone this landmark drives during fitting
 *   - default_pos   : Three.js Y-up meters, used only as a first placement hint
 *   - mirror_of     : (optional) id of the counterpart landmark on the other side
 *
 * Order matters — the LEFT panel walks the user through them top-to-bottom.
 */

export const LANDMARK_GROUPS = {
  center: { label: 'Center', color: '#ffffff' },
  left:   { label: 'Left Side',  color: '#38bdf8' },
  right:  { label: 'Right Side', color: '#ef4444' },
  fingers:{ label: 'Fingers',    color: '#eab308' },
};

export const LANDMARKS = [
  // ---------- Center chain ----------
  { id: 'head_top',    label: 'Head Top',    group: 'center', color: '#ffffff', bone_target: 'head',     default_pos: [ 0.00, 1.82,  0.00] },
  { id: 'head_center', label: 'Head Center', group: 'center', color: '#ffffff', bone_target: 'head',     default_pos: [ 0.00, 1.70,  0.03] },
  { id: 'neck_base',   label: 'Neck Base',   group: 'center', color: '#ffffff', bone_target: 'neck_01',  default_pos: [ 0.00, 1.55, -0.01] },
  { id: 'chest',       label: 'Chest',       group: 'center', color: '#ffffff', bone_target: 'spine_04', default_pos: [ 0.00, 1.38,  0.02] },
  { id: 'spine_mid',   label: 'Spine Mid',   group: 'center', color: '#ffffff', bone_target: 'spine_02', default_pos: [ 0.00, 1.20, -0.01] },
  { id: 'pelvis',      label: 'Pelvis',      group: 'center', color: '#ffffff', bone_target: 'pelvis',   default_pos: [ 0.00, 1.02, -0.02] },

  // ---------- Left arm ----------
  { id: 'clavicle_l', label: 'Left Clavicle', group: 'left', color: '#38bdf8', bone_target: 'clavicle_l', default_pos: [ 0.08, 1.48,  0.01] },
  { id: 'shoulder_l', label: 'Left Shoulder', group: 'left', color: '#38bdf8', bone_target: 'upperarm_l', default_pos: [ 0.22, 1.45, -0.01] },
  { id: 'elbow_l',    label: 'Left Elbow',    group: 'left', color: '#38bdf8', bone_target: 'lowerarm_l', default_pos: [ 0.46, 1.28, -0.05] },
  { id: 'wrist_l',    label: 'Left Wrist',    group: 'left', color: '#38bdf8', bone_target: 'hand_l',     default_pos: [ 0.68, 1.15, -0.02] },
  { id: 'hand_l',     label: 'Left Hand Tip', group: 'left', color: '#38bdf8', bone_target: 'middle_02_l',default_pos: [ 0.80, 1.08, -0.01] },

  // ---------- Right arm ----------
  { id: 'clavicle_r', label: 'Right Clavicle', group: 'right', color: '#ef4444', bone_target: 'clavicle_r', default_pos: [-0.08, 1.48,  0.01], mirror_of: 'clavicle_l' },
  { id: 'shoulder_r', label: 'Right Shoulder', group: 'right', color: '#ef4444', bone_target: 'upperarm_r', default_pos: [-0.22, 1.45, -0.01], mirror_of: 'shoulder_l' },
  { id: 'elbow_r',    label: 'Right Elbow',    group: 'right', color: '#ef4444', bone_target: 'lowerarm_r', default_pos: [-0.46, 1.28, -0.05], mirror_of: 'elbow_l' },
  { id: 'wrist_r',    label: 'Right Wrist',    group: 'right', color: '#ef4444', bone_target: 'hand_r',     default_pos: [-0.68, 1.15, -0.02], mirror_of: 'wrist_l' },
  { id: 'hand_r',     label: 'Right Hand Tip', group: 'right', color: '#ef4444', bone_target: 'middle_02_r',default_pos: [-0.80, 1.08, -0.01], mirror_of: 'hand_l' },

  // ---------- Left leg ----------
  { id: 'hip_l',   label: 'Left Hip',        group: 'left', color: '#38bdf8', bone_target: 'thigh_l', default_pos: [ 0.12, 0.98, -0.02] },
  { id: 'knee_l',  label: 'Left Knee',       group: 'left', color: '#38bdf8', bone_target: 'calf_l',  default_pos: [ 0.13, 0.54,  0.02] },
  { id: 'ankle_l', label: 'Left Ankle',      group: 'left', color: '#38bdf8', bone_target: 'foot_l',  default_pos: [ 0.14, 0.12, -0.04] },
  { id: 'heel_l',  label: 'Left Heel',       group: 'left', color: '#38bdf8', bone_target: 'foot_l',  default_pos: [ 0.14, 0.08, -0.12] },
  { id: 'toe_l',   label: 'Left Toe / Ball', group: 'left', color: '#38bdf8', bone_target: 'ball_l',  default_pos: [ 0.14, 0.04,  0.12] },

  // ---------- Right leg ----------
  { id: 'hip_r',   label: 'Right Hip',        group: 'right', color: '#ef4444', bone_target: 'thigh_r', default_pos: [-0.12, 0.98, -0.02], mirror_of: 'hip_l' },
  { id: 'knee_r',  label: 'Right Knee',       group: 'right', color: '#ef4444', bone_target: 'calf_r',  default_pos: [-0.13, 0.54,  0.02], mirror_of: 'knee_l' },
  { id: 'ankle_r', label: 'Right Ankle',      group: 'right', color: '#ef4444', bone_target: 'foot_r',  default_pos: [-0.14, 0.12, -0.04], mirror_of: 'ankle_l' },
  { id: 'heel_r',  label: 'Right Heel',       group: 'right', color: '#ef4444', bone_target: 'foot_r',  default_pos: [-0.14, 0.08, -0.12], mirror_of: 'heel_l' },
  { id: 'toe_r',   label: 'Right Toe / Ball', group: 'right', color: '#ef4444', bone_target: 'ball_r',  default_pos: [-0.14, 0.04,  0.12], mirror_of: 'toe_l' },

  // ---------- Optional finger tips (V1: user-optional) ----------
  { id: 'thumb_tip_l', label: 'Left Thumb Tip',  group: 'fingers', color: '#eab308', bone_target: 'thumb_03_l', default_pos: [ 0.73, 1.12, 0.04] },
  { id: 'index_tip_l', label: 'Left Index Tip',  group: 'fingers', color: '#eab308', bone_target: 'index_03_l', default_pos: [ 0.79, 1.10, 0.02] },
  { id: 'thumb_tip_r', label: 'Right Thumb Tip', group: 'fingers', color: '#eab308', bone_target: 'thumb_03_r', default_pos: [-0.73, 1.12, 0.04], mirror_of: 'thumb_tip_l' },
  { id: 'index_tip_r', label: 'Right Index Tip', group: 'fingers', color: '#eab308', bone_target: 'index_03_r', default_pos: [-0.79, 1.10, 0.02], mirror_of: 'index_tip_l' },
];

export const LANDMARKS_BY_ID = Object.fromEntries(LANDMARKS.map(l => [l.id, l]));

export function initialLandmarkState() {
  // Returns array of {id, label, group, placed:false, position:{x,y,z}, mirrored:false}
  return LANDMARKS.map(l => ({
    id: l.id,
    label: l.label,
    group: l.group,
    placed: false,
    position: { x: 0, y: 0, z: 0 },
    mirrored: false,
  }));
}

export const CORE_LANDMARK_IDS = LANDMARKS
  .filter(l => l.group !== 'fingers')
  .map(l => l.id);
