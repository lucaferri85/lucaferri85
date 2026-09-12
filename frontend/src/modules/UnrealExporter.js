/**
 * UnrealExporter — Phase D (GLB + reproducible rig snapshot)
 *
 * GLB is generated in standard glTF Y-up metres. Unreal's glTF importer
 * performs the coordinate-system/unit conversion on import. Bone names,
 * hierarchy and fitted local transforms are preserved verbatim.
 *
 * FBX remains intentionally blocked until the Blender bridge is used: a
 * browser cannot write a trustworthy UE-compatible FBX without an FBX SDK.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import { ueVectorToLegacyArray, ueQuaternionToLegacyArray, UE_COORDINATE_SYSTEM } from '../lib/unrealCoordinateSystem';

function bytesToBase64(typed) {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const chunk = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(out);
}

function cloneMaterial(mat) {
  if (Array.isArray(mat)) return mat.map(m => m?.clone ? m.clone() : m);
  return mat?.clone ? mat.clone() : mat;
}

export class UnrealExporter {
  async export(args) {
    const { mesh, fittedSkeleton, weights, format = 'glb', opts = {} } = args || {};
    if (!mesh) throw new Error('No source mesh');
    if (!fittedSkeleton?.bones?.length) throw new Error('No fitted skeleton');
    if (!weights?.weights || !weights?.indices) throw new Error('No skin weights');

    if (format === 'json') return this._exportSnapshot(mesh, fittedSkeleton, weights, opts);
    if (format === 'glb') return this._exportGLB(mesh, fittedSkeleton, weights, opts);
    if (format === 'fbx') throw new Error('Direct FBX export requires the Blender bridge. Export GLB + snapshot, then run docs/quinn_glb_to_ue5_fbx.py in Blender.');
    throw new Error(`Unsupported export format: ${format}`);
  }

  _buildBoneHierarchy(fittedSkeleton) {
    const bones = fittedSkeleton.bones;
    const objects = bones.map(b => {
      const o = new THREE.Bone();
      o.name = b.name;
      const pUE = b.localPos || b.globalPos || [0, 0, 0];
      const rUE = b.localRot || [0, 0, 0, 1];
      const p = fittedSkeleton.coordinate_system === UE_COORDINATE_SYSTEM ? ueVectorToLegacyArray(pUE) : pUE;
      const r = fittedSkeleton.coordinate_system === UE_COORDINATE_SYSTEM ? ueQuaternionToLegacyArray(rUE) : rUE;
      o.position.set(p[0], p[1], p[2]);
      o.quaternion.set(r[0], r[1], r[2], r[3]);
      const s = b.scale || [1, 1, 1];
      o.scale.set(s[0], s[1], s[2]);
      o.userData.quinnKind = b.kind;
      return o;
    });
    const byName = Object.fromEntries(bones.map((b, i) => [b.name, objects[i]]));
    const roots = [];
    bones.forEach((b, i) => {
      if (b.parent && byName[b.parent]) byName[b.parent].add(objects[i]);
      else roots.push(objects[i]);
    });
    return { objects, roots };
  }

  async _exportGLB(mesh, fittedSkeleton, weights, opts) {
    mesh.updateMatrixWorld(true);
    const scene = new THREE.Group();
    scene.name = opts.sceneName || 'Quinn_AutoRig';
    const { objects: boneObjects, roots } = this._buildBoneHierarchy(fittedSkeleton);
    roots.forEach(r => scene.add(r));
    scene.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(boneObjects);
    skeleton.calculateInverses();

    const byUuid = {};
    mesh.traverse(o => { if (o.isMesh) byUuid[o.uuid] = o; });
    for (const part of weights.parts || []) {
      const src = byUuid[part.uuid];
      if (!src?.geometry) continue;
      const geo = src.geometry.clone();
      // Bake the normalized source object's world transform so the geometry
      // and fitted skeleton share the same coordinate frame at bind time.
      geo.applyMatrix4(src.matrixWorld);
      if (fittedSkeleton.coordinate_system === UE_COORDINATE_SYSTEM) {
        const ueToGltf = new THREE.Matrix4().set(
          0, -1, 0, 0,
          0,  0, 1, 0,
          1,  0, 0, 0,
          0,  0, 0, 1
        );
        geo.applyMatrix4(ueToGltf);
      }
      const skinned = new THREE.SkinnedMesh(geo, cloneMaterial(src.material));
      skinned.name = src.name || part.name || 'SkinnedMesh';
      skinned.frustumCulled = false;
      scene.add(skinned);
      scene.updateMatrixWorld(true);
      skinned.bind(skeleton, new THREE.Matrix4());
    }
    scene.updateMatrixWorld(true);

    const exporter = new GLTFExporter();
    const data = await exporter.parseAsync(scene, {
      binary: true,
      trs: true,
      onlyVisible: false,
      includeCustomExtensions: false,
      maxTextureSize: opts.maxTextureSize || 4096,
    });
    if (!(data instanceof ArrayBuffer)) throw new Error('GLTFExporter did not return binary GLB data');
    return new Blob([data], { type: 'model/gltf-binary' });
  }

  _exportSnapshot(mesh, fittedSkeleton, weights, opts) {
    const payload = {
      schema: 'quinn-rigger-snapshot',
      schema_version: 1,
      created_at: new Date().toISOString(),
      source_mesh: opts.sourceMeshName || mesh.name || null,
      coordinate_system: fittedSkeleton.coordinate_system || 'threejs-y-up-right-handed-metres',
      skeleton: fittedSkeleton,
      skin: {
        boneNames: weights.boneNames,
        parts: weights.parts,
        options: weights.options,
        report: weights.report,
        indices_type: 'uint16',
        weights_type: 'float32',
        tuple_size: 4,
        indices_base64: bytesToBase64(weights.indices),
        weights_base64: bytesToBase64(weights.weights),
      },
    };
    return new Blob([JSON.stringify(payload)], { type: 'application/json' });
  }
}
