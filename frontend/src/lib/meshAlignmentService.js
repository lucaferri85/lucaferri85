import * as THREE from 'three';
import {
  UE_COORDINATE_SYSTEM,
  legacyPointToUE,
} from './unrealCoordinateSystem';

/**
 * Quinn Rigger — robust humanoid alignment in Unreal coordinates.
 *
 * Project/world convention:
 *   X = Forward / Back
 *   Y = Right / Left
 *   Z = Up / Down
 *
 * Goal:
 *   - character depth centered around X = 0
 *   - character sagittal centerline on Y = 0
 *   - feet resting on Z = 0
 */
function quantile(sorted, q) {
  if (!sorted.length) return 0;

  const clamped = Math.min(1, Math.max(0, q));
  const index = (sorted.length - 1) * clamped;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);

  if (lo === hi) return sorted[lo];

  const t = index - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function sampleWorldVertices(root, maxPoints = 100000) {
  if (!root) return [];

  root.updateMatrixWorld(true);

  let totalVertices = 0;

  root.traverse((obj) => {
    if (obj.isMesh && obj.geometry?.attributes?.position) {
      totalVertices += obj.geometry.attributes.position.count;
    }
  });

  if (!totalVertices) return [];

  const stride = Math.max(1, Math.ceil(totalVertices / maxPoints));
  const points = [];
  const p = new THREE.Vector3();

  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry?.attributes?.position) return;

    const position = obj.geometry.attributes.position;

    for (let i = 0; i < position.count; i += stride) {
      p.fromBufferAttribute(position, i).applyMatrix4(obj.matrixWorld);

      if (
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        Number.isFinite(p.z)
      ) {
        points.push({ x: p.x, y: p.y, z: p.z });
      }
    }
  });

  return points;
}

function computeRobustAlignment(root) {
  const points = sampleWorldVertices(root);

  if (!points.length) {
    throw new Error('Mesh has no readable vertices for centering');
  }

  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  const ys = points.map((p) => p.y).sort((a, b) => a - b);
  const zs = points.map((p) => p.z).sort((a, b) => a - b);

  // Ignore the outer 5% so hair, swords, pouches and armor protrusions do not
  // pull the body center away from the origin.
  const centerX =
    (quantile(xs, 0.05) + quantile(xs, 0.95)) * 0.5;

  const centerY =
    (quantile(ys, 0.05) + quantile(ys, 0.95)) * 0.5;

  // Ignore isolated stray vertices below the real feet.
  const floorZ = quantile(zs, 0.0025);

  return {
    delta: {
      x: -centerX,
      y: -centerY,
      z: -floorZ,
    },

    measured_origin: {
      x: centerX,
      y: centerY,
      z: floorZ,
    },

    sampled_points: points.length,
    coordinate_system: UE_COORDINATE_SYSTEM,
  };
}

function refreshBounds(manager) {
  const bounds = new THREE.Box3().setFromObject(manager.currentMesh);
  const size = new THREE.Vector3();
  bounds.getSize(size);

  if (manager.controls) {
    manager.controls.target.set(0, 0, size.z * 0.55);
    manager.controls.update();
  }

  return {
    bounds_min: {
      x: bounds.min.x,
      y: bounds.min.y,
      z: bounds.min.z,
    },

    bounds_max: {
      x: bounds.max.x,
      y: bounds.max.y,
      z: bounds.max.z,
    },

    height_m: size.z,
    coordinate_system: UE_COORDINATE_SYSTEM,
  };
}

export function centerViewportMesh(manager) {
  if (!manager?.currentMesh) {
    throw new Error('No mesh is loaded in the viewport');
  }

  const result = computeRobustAlignment(manager.currentMesh);
  const { delta } = result;

  manager.currentMesh.position.x += delta.x;
  manager.currentMesh.position.y += delta.y;
  manager.currentMesh.position.z += delta.z;
  manager.currentMesh.updateMatrixWorld(true);

  return {
    ...result,
    ...refreshBounds(manager),
    applied_at: new Date().toISOString(),
  };
}

/**
 * Re-apply a saved alignment after restoring the original binary mesh.
 * Old Y-up projects are converted automatically on first load.
 */
export function applySavedMeshAlignment(manager, alignment) {
  if (!manager?.currentMesh || !alignment?.delta) {
    return null;
  }

  const delta =
    alignment.coordinate_system === UE_COORDINATE_SYSTEM
      ? alignment.delta
      : legacyPointToUE(alignment.delta);

  manager.currentMesh.position.x += Number(delta.x) || 0;
  manager.currentMesh.position.y += Number(delta.y) || 0;
  manager.currentMesh.position.z += Number(delta.z) || 0;
  manager.currentMesh.updateMatrixWorld(true);

  return refreshBounds(manager);
}
