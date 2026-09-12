import * as THREE from 'three';

export const UE_COORDINATE_SYSTEM = 'UE_LH_X_FORWARD_Y_RIGHT_Z_UP_M';

export const CENTERLINE_LANDMARK_IDS = new Set([
  'pelvis',
  'spine_mid',
  'chest',
  'neck_base',
  'head_center',
  'head_top',
]);

export function isCenterlineLandmark(id) {
  return CENTERLINE_LANDMARK_IDS.has(id);
}

export function isCenterlineBone(name) {
  if (!name) return false;
  return (
    name === 'pelvis' ||
    name === 'head' ||
    /^spine_\d+$/i.test(name) ||
    /^neck_\d+$/i.test(name)
  );
}

/**
 * Legacy Quinn Rigger world space -> Unreal-style world space.
 *
 * Legacy public coordinates:
 *   X = character left/right (+X = character left)
 *   Y = up
 *   Z = depth / character forward
 *
 * New project coordinates (matching Unreal semantics):
 *   X = forward
 *   Y = right
 *   Z = up
 *
 * Mapping:
 *   UE.X = legacy.Z
 *   UE.Y = -legacy.X
 *   UE.Z = legacy.Y
 */
export function legacyPointToUE(point) {
  if (Array.isArray(point)) {
    return [point[2], -point[0], point[1]];
  }

  return {
    x: point.z,
    y: -point.x,
    z: point.y,
  };
}

export function uePointToLegacy(point) {
  if (Array.isArray(point)) {
    return [-point[1], point[2], point[0]];
  }

  return {
    x: -point.y,
    y: point.z,
    z: point.x,
  };
}

export function legacyVectorToUEArray(v) {
  return [v[2], -v[0], v[1]];
}

export function ueVectorToLegacyArray(v) {
  return [-v[1], v[2], v[0]];
}

export function legacyToUEBasisMatrix() {
  return new THREE.Matrix4().set(
    0,  0, 1, 0,
   -1,  0, 0, 0,
    0,  1, 0, 0,
    0,  0, 0, 1
  );
}

function matrixFromTRS(pos, rot, scale = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]).normalize(),
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

function convertMatrixLegacyToUE(matrix) {
  const basis = legacyToUEBasisMatrix();
  const inverse = basis.clone().invert();
  return basis.clone().multiply(matrix).multiply(inverse);
}

export function legacyQuaternionToUEArray(rot) {
  if (!Array.isArray(rot) || rot.length !== 4) {
    return rot;
  }

  const rotation = new THREE.Matrix4().makeRotationFromQuaternion(
    new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]).normalize()
  );

  const converted = convertMatrixLegacyToUE(rotation);
  const q = new THREE.Quaternion().setFromRotationMatrix(converted).normalize();
  return [q.x, q.y, q.z, q.w];
}

export function convertLegacyTRSToUE(refLocal) {
  if (!refLocal?.pos || !refLocal?.rot) {
    return refLocal;
  }

  const matrix = matrixFromTRS(
    refLocal.pos,
    refLocal.rot,
    refLocal.scale || [1, 1, 1]
  );

  const converted = convertMatrixLegacyToUE(matrix);
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  converted.decompose(pos, rot, scale);

  return {
    ...refLocal,
    pos: [pos.x, pos.y, pos.z],
    rot: [rot.x, rot.y, rot.z, rot.w],
    scale: [scale.x, scale.y, scale.z],
  };
}

const templateCache = new WeakMap();

/**
 * Creates a UE-coordinate VIEW of a template without mutating the
 * authoritative FBX-derived template stored in the local library.
 * Names/order/parents/provenance are unchanged.
 */
export function templateToUnrealCoordinates(template) {
  if (!template?.bones) return template;

  if (template.coordinate_system === UE_COORDINATE_SYSTEM) {
    return template;
  }

  const cached = templateCache.get(template);
  if (cached) return cached;

  const converted = {
    ...template,
    coordinate_system: UE_COORDINATE_SYSTEM,
    bones: template.bones.map((bone) => ({
      ...bone,
      refLocal: convertLegacyTRSToUE(bone.refLocal),
      refGlobal: Array.isArray(bone.refGlobal)
        ? legacyVectorToUEArray(bone.refGlobal)
        : bone.refGlobal,
      refGlobalRot: Array.isArray(bone.refGlobalRot)
        ? legacyQuaternionToUEArray(bone.refGlobalRot)
        : bone.refGlobalRot,
      bind_pose_global_pos: Array.isArray(bone.bind_pose_global_pos)
        ? legacyVectorToUEArray(bone.bind_pose_global_pos)
        : bone.bind_pose_global_pos,
    })),
  };

  templateCache.set(template, converted);
  return converted;
}

export function constrainCenterlineLandmarkPosition(id, position) {
  if (!position) return position;
  if (!isCenterlineLandmark(id)) return { ...position };

  // Unreal Y is left/right. Central anatomical anchors live on Y = 0.
  return {
    ...position,
    y: 0,
  };
}

export function constrainCenterlineBonePosition(name, position) {
  if (!position) return position;
  if (!isCenterlineBone(name)) return { ...position };

  return {
    ...position,
    y: 0,
  };
}

export function constrainCenterlineFittedBones(bones) {
  return bones.map((bone) =>
    isCenterlineBone(bone.name)
      ? {
          ...bone,
          globalPos: [bone.globalPos[0], 0, bone.globalPos[2]],
        }
      : bone
  );
}

export function convertDetectedLandmarksLegacyToUE(detected) {
  const converted = {};

  for (const [id, entry] of Object.entries(detected || {})) {
    if (!entry?.position) {
      converted[id] = entry;
      continue;
    }

    converted[id] = {
      ...entry,
      position: constrainCenterlineLandmarkPosition(
        id,
        legacyPointToUE(entry.position)
      ),
    };
  }

  return converted;
}

export function convertFittedLegacyToUE(fitted) {
  if (!fitted?.bones) return fitted;

  return {
    ...fitted,
    coordinate_system: UE_COORDINATE_SYSTEM,
    bones: fitted.bones.map((bone) => ({
      ...bone,
      globalPos: legacyVectorToUEArray(bone.globalPos),
      localPos: legacyVectorToUEArray(bone.localPos),
      globalRot: legacyQuaternionToUEArray(bone.globalRot),
      localRot: legacyQuaternionToUEArray(bone.localRot),
    })),
  };
}

export function migrateLegacyProjectToUE(project) {
  if (!project) return project;

  if (project.mesh?.coordinate_system === UE_COORDINATE_SYSTEM) {
    return project;
  }

  const convertedLandmarks = (project.landmarks || []).map((landmark) => {
    if (!landmark?.placed || !landmark.position) return landmark;

    return {
      ...landmark,
      position: constrainCenterlineLandmarkPosition(
        landmark.id,
        legacyPointToUE(landmark.position)
      ),
    };
  });

  const oldAlignment = project.mesh?.alignment;
  const convertedAlignment = oldAlignment?.delta
    ? {
        ...oldAlignment,
        delta: legacyPointToUE(oldAlignment.delta),
        measured_origin: oldAlignment.measured_origin
          ? legacyPointToUE(oldAlignment.measured_origin)
          : oldAlignment.measured_origin,
        coordinate_system: UE_COORDINATE_SYSTEM,
      }
    : oldAlignment;

  return {
    ...project,
    mesh: project.mesh
      ? {
          ...project.mesh,
          coordinate_system: UE_COORDINATE_SYSTEM,
          alignment: convertedAlignment,
        }
      : project.mesh,
    landmarks: convertedLandmarks,
    symmetry: {
      ...(project.symmetry || {}),
      axis: project.symmetry?.axis === 'x' ? 'y' : (project.symmetry?.axis || 'y'),
    },
    fitted: project.fitted
      ? convertFittedLegacyToUE(project.fitted)
      : project.fitted,
  };
}

/**
 * Upgrades the existing Three.js Y-up viewport to a UE-style Z-up viewport
 * without rewriting the whole renderer. The original loader may stay Y-up;
 * every loaded mesh is converted once immediately after installation.
 */
export function configureViewportForUnreal(manager) {
  if (!manager || manager.__ueCoordinatesConfigured) return manager;
  manager.__ueCoordinatesConfigured = true;

  // Blender-like neutral viewport. Keep the application shell light while the
  // modelling canvas stays medium gray for mesh/skeleton contrast.
  manager.scene.background = new THREE.Color(0x3b3c3f);
  if (manager.gridMajor?.material) manager.gridMajor.material.color.setHex(0x67696e);
  if (manager.gridMinor?.material) manager.gridMinor.material.color.setHex(0x4b4d51);

  const convertObjectOnce = (object) => {
    if (!object || object.userData?.quinnCoordinateSystem === UE_COORDINATE_SYSTEM) {
      return;
    }

    object.applyMatrix4(legacyToUEBasisMatrix());
    object.userData.quinnCoordinateSystem = UE_COORDINATE_SYSTEM;
    object.updateMatrixWorld(true);
  };

  const refreshUEBounds = (filename, format, fallback = {}) => {
    const bounds = new THREE.Box3().setFromObject(manager.currentMesh);
    const size = new THREE.Vector3();
    bounds.getSize(size);

    manager.controls.target.set(0, 0, size.z * 0.55);
    manager.controls.update();

    return {
      ...fallback,
      filename,
      format,
      height_m: size.z,
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
      coordinate_system: UE_COORDINATE_SYSTEM,
    };
  };

  manager.perspectiveCamera.up.set(0, 0, 1);
  manager.orthoCamera.up.set(0, 0, 1);
  manager.camera.up.set(0, 0, 1);

  manager.gridMajor.rotation.x = Math.PI / 2;
  manager.gridMinor.rotation.x = Math.PI / 2;

  manager.scene.traverse((object) => {
    if (object.type === 'AxesHelper') {
      object.position.set(0, 0, 0.002);
    }
  });

  // Convert the placeholder loaded by the manager constructor.
  if (manager.currentMesh) {
    convertObjectOnce(manager.currentMesh);
  }

  // OrbitControls was created while the viewport was Y-up. After changing the
  // camera to Z-up, invert orbit drag once so mouse movement keeps the same
  // screen-space direction the user had before the axis migration.
  manager.controls.rotateSpeed = -1.0;
  manager.controls.panSpeed = 1.0;
  manager.controls.zoomSpeed = 1.0;
  manager.controls.screenSpacePanning = true;

  manager.controls.target.set(0, 0, 1.0);
  manager.perspectiveCamera.position.set(2.6, -1.6, 1.5);
  manager.orthoCamera.position.set(3, 0, 1.2);
  manager.controls.update();

  const originalLoadMeshFromFile = manager.loadMeshFromFile.bind(manager);

  manager.loadMeshFromFile = async (file) => {
    const info = await originalLoadMeshFromFile(file);
    convertObjectOnce(manager.currentMesh);
    return refreshUEBounds(info.filename, info.format, info);
  };

  const originalSetProjection = manager.setProjection.bind(manager);
  manager.setProjection = (mode) => {
    originalSetProjection(mode);
    manager.camera.up.set(0, 0, 1);
    manager.controls.object = manager.camera;
    manager.controls.update();
  };

  manager.setCameraView = (verb) => {
    const t = manager.controls.target;
    const d = 2.4;
    const cam = manager.camera;
    cam.up.set(0, 0, 1);

    switch (verb) {
      case 'front':
        cam.position.set(t.x + d, t.y, t.z);
        break;
      case 'back':
        cam.position.set(t.x - d, t.y, t.z);
        break;
      case 'right':
        cam.position.set(t.x, t.y + d, t.z);
        break;
      case 'left':
        cam.position.set(t.x, t.y - d, t.z);
        break;
      case 'top':
        cam.position.set(t.x + 0.001, t.y, t.z + d);
        break;
      case 'iso':
      default:
        cam.position.set(t.x + 2.0, t.y - 1.6, t.z + 1.4);
        break;
    }

    cam.lookAt(t);
    manager.controls.update();
  };

  manager.setSymmetryPlaneVisible = (visible, axis = 'y') => {
    manager.symmetryPlane.visible = visible;
    manager.symmetryPlane.rotation.set(0, 0, 0);

    if (axis === 'x') {
      // X=0 -> YZ plane.
      manager.symmetryPlane.rotation.y = Math.PI / 2;
    } else if (axis === 'y') {
      // Y=0 -> XZ plane, Unreal character center plane.
      manager.symmetryPlane.rotation.x = Math.PI / 2;
    }
  };

  return manager;
}

/** Unreal-workspace quaternion -> standard Three.js/legacy Y-up quaternion. */
export function ueQuaternionToLegacyArray(rot) {
  if (!Array.isArray(rot) || rot.length !== 4) return rot;
  const q = new THREE.Quaternion(rot[0], rot[1], rot[2], rot[3]).normalize();
  const r = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const basis = legacyToUEBasisMatrix();
  const inv = basis.clone().invert();
  const converted = inv.clone().multiply(r).multiply(basis);
  const out = new THREE.Quaternion().setFromRotationMatrix(converted).normalize();
  return [out.x, out.y, out.z, out.w];
}
