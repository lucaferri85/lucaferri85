/**
 * Fit workflow orchestration: auto fit, compare, manual joint edits with
 * symmetry mirroring, per-bone reset and explicit bone rotation.
 *
 * Structural invariants are always preserved:
 * - same bone count
 * - same names
 * - same order
 * - same parents
 */
import { Vector3, Quaternion, Matrix4 } from 'three';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { SkeletonFitter, rebuildFromPositions, assertStructure } from '../modules/SkeletonFitter';
import { RigValidator } from '../modules/RigValidator';
import { isFitAuthorized } from './templateService';
import { mirrorBoneName } from './fitRules';
import {
  templateToUnrealCoordinates,
  constrainCenterlineBonePosition,
  constrainCenterlineFittedBones,
} from './unrealCoordinateSystem';

const arr3 = (v) => [v.x, v.y, v.z];
const arr4 = (q) => [q.x, q.y, q.z, q.w];
const qFrom = (a) => new Quaternion(a[0], a[1], a[2], a[3]).normalize();

export function canAutoFit(state) {
  const reasons = [];

  if (!isFitAuthorized(state.templateSource, state.templateValidation)) {
    reasons.push('Authoritative template must be imported and validated');
  }

  const core = state.landmarks.filter((l) => l.group !== 'fingers');
  const placed = core.filter((l) => l.placed).length;

  if (placed < 6) {
    reasons.push(`Place core landmarks (${placed}/${core.length})`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    placed,
    total: core.length,
  };
}

export function runAutoFit() {
  const s = useAppStore.getState();
  const gate = canAutoFit(s);

  if (!gate.ok) {
    toast.error(gate.reasons[0]);
    return null;
  }

  let fitted;

  try {
    fitted = new SkeletonFitter().fit(
      templateToUnrealCoordinates(s.template),
      s.landmarks
    );
  } catch (e) {
    toast.error(`Auto Fit aborted — ${e.message}`);
    return null;
  }

  const comparison = new RigValidator().compareWithSource(fitted, s.template);

  s.setFitted(fitted, comparison);

  useAppStore.setState({
    showFitted: true,
    showSkeleton: false,
    rightTab: 'fit',
  });

  const r = fitted.report;

  const msg =
    `Fitted ${r.bone_count} bones · ` +
    `${r.counts.warn} warning(s) · ` +
    `${r.counts.error} error(s)`;

  (
    r.counts.error
      ? toast.error
      : r.counts.warn
      ? toast.warning
      : toast.success
  )(msg);

  return fitted;
}

export function runCompare() {
  const s = useAppStore.getState();

  if (!s.fitted) {
    toast.error('Run Auto Fit first');
    return null;
  }

  const comparison =
    new RigValidator().compareWithSource(
      s.fitted,
      s.template
    );

  s.setComparison(comparison);

  (
    comparison.overall === 'fail'
      ? toast.error
      : comparison.overall === 'warning'
      ? toast.warning
      : toast.success
  )(
    `Compare with source: ${comparison.overall.toUpperCase()}`
  );

  return comparison;
}

/**
 * Translate a joint and its whole subtree to a new global position.
 * This keeps the existing position-edit workflow unchanged.
 */
export function moveFittedJoint(
  name,
  pos,
  { mirror = true } = {}
) {
  const s = useAppStore.getState();

  if (!s.fitted) return;

  const by = Object.fromEntries(
    s.fitted.bones.map((b) => [b.name, b])
  );

  const target = by[name];

  if (!target) return;

  const constrainedPos =
    constrainCenterlineBonePosition(
      name,
      pos
    );

  const delta = new Vector3(
    constrainedPos.x,
    constrainedPos.y,
    constrainedPos.z
  ).sub(
    new Vector3(...target.globalPos)
  );

  const moves = [
    {
      root: name,
      delta,
    },
  ];

  if (
    mirror &&
    s.symmetry.enabled
  ) {
    const twin =
      mirrorBoneName(name);

    if (
      twin &&
      by[twin]
    ) {
      const mirroredDelta =
        delta.clone();

      if (
        s.symmetry.axis === 'x'
      ) {
        mirroredDelta.x =
          -mirroredDelta.x;
      } else if (
        s.symmetry.axis === 'y'
      ) {
        mirroredDelta.y =
          -mirroredDelta.y;
      } else {
        mirroredDelta.z =
          -mirroredDelta.z;
      }

      moves.push({
        root: twin,
        delta: mirroredDelta,
      });
    }
  }

  const children = {};

  for (const b of s.fitted.bones) {
    if (b.parent) {
      (
        children[b.parent] =
          children[b.parent] || []
      ).push(b.name);
    }
  }

  const updated =
    Object.fromEntries(
      s.fitted.bones.map(
        (b) => [
          b.name,
          {
            ...b,
            globalPos:
              b.globalPos.slice(),
          },
        ]
      )
    );

  for (
    const {
      root,
      delta: d,
    } of moves
  ) {
    const stack = [root];

    while (stack.length) {
      const n = stack.pop();
      const g =
        updated[n].globalPos;

      updated[n].globalPos = [
        g[0] + d.x,
        g[1] + d.y,
        g[2] + d.z,
      ];

      updated[n].manual = true;

      for (
        const c
        of children[n] || []
      ) {
        stack.push(c);
      }
    }
  }

  const rebuilt =
    rebuildFromPositions(
      templateToUnrealCoordinates(s.template),
      s.fitted.bones.map(
        (b) =>
          updated[b.name]
      )
    );

  commitEdit(rebuilt);
}

/**
 * Rotate one fitted bone in GLOBAL space.
 *
 * The selected joint stays fixed.
 * Every descendant moves around that joint and inherits the rotation,
 * matching normal armature hierarchy behaviour.
 *
 * This works for terminal bones too because globalRot/localRot are updated
 * explicitly rather than inferred only from joint positions.
 */
export function rotateFittedBone(
  name,
  deltaQuaternion,
  { mirror = true } = {}
) {
  const s = useAppStore.getState();

  if (
    !s.fitted ||
    !Array.isArray(
      s.fitted.bones
    )
  ) {
    return false;
  }

  const delta =
    Array.isArray(
      deltaQuaternion
    )
      ? qFrom(
          deltaQuaternion
        )
      : deltaQuaternion
          .clone()
          .normalize();

  if (
    Math.abs(delta.w) >
      0.999999 &&
    Math.abs(delta.x) <
      0.000001 &&
    Math.abs(delta.y) <
      0.000001 &&
    Math.abs(delta.z) <
      0.000001
  ) {
    return true;
  }

  const bones =
    s.fitted.bones.map(
      (b) => ({
        ...b,
        globalPos:
          b.globalPos.slice(),
        globalRot:
          b.globalRot.slice(),
        localPos:
          b.localPos.slice(),
        localRot:
          b.localRot.slice(),
      })
    );

  const by =
    Object.fromEntries(
      bones.map(
        (b) => [
          b.name,
          b,
        ]
      )
    );

  if (!by[name]) {
    toast.error(
      `Bone not found: ${name}`
    );

    return false;
  }

  const children = {};

  for (const b of bones) {
    if (b.parent) {
      (
        children[b.parent] =
          children[b.parent] || []
      ).push(b.name);
    }
  }

  const operations = [
    {
      root: name,
      delta,
    },
  ];

  if (
    mirror &&
    s.symmetry.enabled
  ) {
    const twin =
      mirrorBoneName(name);

    if (
      twin &&
      by[twin] &&
      twin !== name
    ) {
      operations.push({
        root: twin,
        delta:
          mirrorRotationDelta(
            delta,
            s.symmetry.axis
          ),
      });
    }
  }

  const alreadyRotated =
    new Set();

  for (
    const operation
    of operations
  ) {
    const root =
      operation.root;

    if (
      alreadyRotated.has(
        root
      )
    ) {
      continue;
    }

    const pivot =
      new Vector3(
        ...by[root]
          .globalPos
      );

    const subtree = [];
    const stack = [root];

    while (
      stack.length
    ) {
      const current =
        stack.pop();

      if (
        alreadyRotated.has(
          current
        )
      ) {
        continue;
      }

      subtree.push(
        current
      );

      for (
        const child
        of children[
          current
        ] || []
      ) {
        stack.push(
          child
        );
      }
    }

    for (
      const boneName
      of subtree
    ) {
      const bone =
        by[boneName];

      const oldGlobalRot =
        qFrom(
          bone.globalRot
        );

      bone.globalRot =
        arr4(
          operation.delta
            .clone()
            .multiply(
              oldGlobalRot
            )
            .normalize()
        );

      if (
        boneName !== root
      ) {
        const oldPos =
          new Vector3(
            ...bone.globalPos
          );

        const newPos =
          oldPos
            .sub(pivot)
            .applyQuaternion(
              operation.delta
            )
            .add(pivot);

        bone.globalPos =
          arr3(newPos);
      }

      // The root is the user-edited bone. Descendants are moved by hierarchy.
      if (
        boneName === root
      ) {
        bone.manual = true;
        bone.method =
          'manual-rotate';
        bone.message =
          'Manual bone rotation';
      }

      alreadyRotated.add(
        boneName
      );
    }
  }

  // Central Quinn chain must remain on Unreal Y=0 even after rotations.
  // This preserves a straight sagittal centerline in Front/Back while still
  // allowing profile depth edits along X.
  const centeredBones =
    constrainCenterlineFittedBones(bones);

  const centeredBy =
    Object.fromEntries(
      centeredBones.map(
        (bone) => [
          bone.name,
          bone,
        ]
      )
    );

  // Recompute LOCAL transforms from the edited GLOBAL transforms.
  for (const bone of centeredBones) {
    const gPos =
      new Vector3(
        ...bone.globalPos
      );

    const gRot =
      qFrom(
        bone.globalRot
      );

    if (!bone.parent) {
      bone.localPos =
        arr3(gPos);

      bone.localRot =
        arr4(gRot);

      continue;
    }

    const parent =
      centeredBy[bone.parent];

    const parentPos =
      new Vector3(
        ...parent.globalPos
      );

    const parentRot =
      qFrom(
        parent.globalRot
      );

    const parentInv =
      parentRot
        .clone()
        .invert();

    bone.localPos =
      arr3(
        gPos
          .clone()
          .sub(
            parentPos
          )
          .applyQuaternion(
            parentInv
          )
      );

    bone.localRot =
      arr4(
        parentInv
          .clone()
          .multiply(
            gRot
          )
          .normalize()
      );
  }

  const ok =
    commitEdit(centeredBones);

  if (ok) {
    toast.success(
      `Rotated ${name}`
    );
  }

  return ok;
}

/**
 * Mirror a GLOBAL rotation delta through the chosen symmetry plane.
 * R_mirror = S * R * S, with S being the reflection matrix.
 */
function mirrorRotationDelta(
  quaternion,
  axis
) {
  const rotation =
    new Matrix4()
      .makeRotationFromQuaternion(
        quaternion
      );

  const sx =
    axis === 'x'
      ? -1
      : 1;

  const sy =
    axis === 'y'
      ? -1
      : 1;

  const sz =
    axis === 'z'
      ? -1
      : 1;

  const reflection =
    new Matrix4()
      .makeScale(
        sx,
        sy,
        sz
      );

  const mirrored =
    reflection
      .clone()
      .multiply(
        rotation
      )
      .multiply(
        reflection
      );

  return new Quaternion()
    .setFromRotationMatrix(
      mirrored
    )
    .normalize();
}

/**
 * Every manual edit passes the structural invariant before being committed.
 */
function commitEdit(bones) {
  const s =
    useAppStore.getState();

  const inv =
    assertStructure(
      s.template,
      bones
    );

  if (!inv.ok) {
    toast.error(
      'Edit rejected — it would alter the skeleton structure: ' +
        inv.problems[0]
    );

    return false;
  }

  s.updateFittedBones(
    bones
  );

  return true;
}

/**
 * Approval gate: errors block; warnings require explicit acknowledgement.
 */
export function approvalGate() {
  const s =
    useAppStore.getState();

  if (!s.fitted) {
    return {
      allowed: false,
      reason:
        'No fit to approve',
    };
  }

  const errors =
    s.fitted.bones.filter(
      (b) =>
        b.status ===
        'error'
    ).length;

  const warns =
    s.fitted.bones.filter(
      (b) =>
        b.status ===
        'warn'
    ).length;

  const cmp =
    s.comparison ||
    new RigValidator()
      .compareWithSource(
        s.fitted,
        s.template
      );

  if (errors) {
    return {
      allowed: false,
      reason:
        `${errors} bone(s) have fit ERRORS — fix landmarks or joints first`,
      errors,
      warns,
    };
  }

  if (
    cmp.overall === 'fail'
  ) {
    return {
      allowed: false,
      reason:
        'Compare With Source reports FAIL — structure does not match the template',
      errors,
      warns,
    };
  }

  if (s.fitStale) {
    return {
      allowed: false,
      reason:
        'Landmarks changed since the last fit — re-run Auto Fit first',
      errors,
      warns,
    };
  }

  return {
    allowed: true,
    needsAck:
      warns > 0 ||
      cmp.overall ===
        'warning',
    warns,
    errors,
    comparison: cmp,
  };
}

export function approveFit(
  { acknowledged = false } = {}
) {
  const s =
    useAppStore.getState();

  const gate =
    approvalGate();

  if (!gate.allowed) {
    toast.error(
      gate.reason
    );

    return false;
  }

  if (
    gate.needsAck &&
    !acknowledged
  ) {
    toast.warning(
      `${gate.warns} unresolved warning(s) must be acknowledged before approval`
    );

    return false;
  }

  if (!s.comparison) {
    s.setComparison(
      gate.comparison
    );
  }

  s.setFitApproved(
    true,
    {
      acknowledged_warnings:
        gate.warns,

      acknowledged_by_user:
        gate.needsAck,

      comparison_overall:
        gate.comparison
          .overall,

      bone_count:
        s.fitted.bones
          .length,
    }
  );

  toast.success(
    `Fitted skeleton approved${
      gate.warns
        ? ` with ${gate.warns} acknowledged warning(s)`
        : ''
    } — skinning stays locked until Phase C is authorised`
  );

  return true;
}

export function resetFittedBone(
  name
) {
  const s =
    useAppStore.getState();

  if (
    !s.fitted ||
    !s.fittedAuto
  ) {
    return;
  }

  const auto =
    Object.fromEntries(
      s.fittedAuto.bones.map(
        (b) => [
          b.name,
          b,
        ]
      )
    );

  const children = {};

  for (
    const b
    of s.fitted.bones
  ) {
    if (b.parent) {
      (
        children[b.parent] =
          children[b.parent] || []
      ).push(
        b.name
      );
    }
  }

  const subtree =
    new Set();

  const stack = [name];

  while (
    stack.length
  ) {
    const n =
      stack.pop();

    subtree.add(n);

    for (
      const c
      of children[n] || []
    ) {
      stack.push(c);
    }
  }

  const bones =
    s.fitted.bones.map(
      (b) =>
        subtree.has(
          b.name
        )
          ? JSON.parse(
              JSON.stringify(
                auto[b.name]
              )
            )
          : b
    );

  if (
    commitEdit(bones)
  ) {
    toast.success(
      `Reset ${name} (+${subtree.size - 1} descendants) to auto-fit`
    );
  }
}

export function resetFit() {
  const s =
    useAppStore.getState();

  if (!s.fittedAuto) {
    return;
  }

  s.setFitted(
    JSON.parse(
      JSON.stringify(
        s.fittedAuto
      )
    ),
    new RigValidator()
      .compareWithSource(
        s.fittedAuto,
        s.template
      )
  );

  toast.success(
    'Fit reset to last auto-fit result'
  );
}

export function backToLandmarks() {
  const s =
    useAppStore.getState();

  s.setFitEditMode(false);
  s.setStage('landmarks');
  s.setRightTab('landmarks');
}

// Test/debug hook.
if (
  typeof window !==
  'undefined'
) {
  window.__quinnFit = {
    moveFittedJoint,
    rotateFittedBone,
    resetFittedBone,
    runAutoFit,
    runCompare,
    approveFit,
    approvalGate,
  };
}
