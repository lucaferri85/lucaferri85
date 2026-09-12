/**
 * UnrealExporter — hardened Phase D
 *
 * Key rule:
 * The fitted skeleton's GLOBAL pose is authoritative.
 *
 * Earlier builds trusted localPos/localRot produced upstream. After the
 * Y-up -> UE Z-up migration those local transforms could be internally
 * inconsistent with globalPos/globalRot. glTF/Blender then reconstructed
 * misleading/incorrect bone chains.
 *
 * This exporter rebuilds every local matrix from the authoritative global
 * matrices immediately before GLB generation:
 *
 *   local = inverse(parentGlobal) * global
 *
 * This guarantees that the hierarchy exported to glTF reproduces the exact
 * fitted global pose used by Quinn Rigger.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';
import {
  ueVectorToLegacyArray,
  ueQuaternionToLegacyArray,
  UE_COORDINATE_SYSTEM,
} from '../lib/unrealCoordinateSystem';

const POS_EPS = 1e-4;
const ROT_EPS = 1e-4;

function bytesToBase64(typed) {
  const bytes = new Uint8Array(
    typed.buffer,
    typed.byteOffset,
    typed.byteLength
  );

  const chunk = 0x8000;
  let out = '';

  for (
    let i = 0;
    i < bytes.length;
    i += chunk
  ) {
    out += String.fromCharCode(
      ...bytes.subarray(
        i,
        i + chunk
      )
    );
  }

  return btoa(out);
}

function cloneMaterial(mat) {
  if (Array.isArray(mat)) {
    return mat.map(
      (m) =>
        m?.clone
          ? m.clone()
          : m
    );
  }

  return mat?.clone
    ? mat.clone()
    : mat;
}

function finiteArray(a, len) {
  return (
    Array.isArray(a) &&
    a.length === len &&
    a.every(Number.isFinite)
  );
}

function normalizeQuatArray(a) {
  const q =
    new THREE.Quaternion(
      a[0],
      a[1],
      a[2],
      a[3]
    ).normalize();

  return [
    q.x,
    q.y,
    q.z,
    q.w,
  ];
}

function matrixFromPose(
  position,
  rotation,
  scale = [1, 1, 1]
) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(
      position[0],
      position[1],
      position[2]
    ),

    new THREE.Quaternion(
      rotation[0],
      rotation[1],
      rotation[2],
      rotation[3]
    ).normalize(),

    new THREE.Vector3(
      scale[0],
      scale[1],
      scale[2]
    )
  );
}

function positionFromMatrix(m) {
  const p = new THREE.Vector3();
  p.setFromMatrixPosition(m);
  return [p.x, p.y, p.z];
}

function quatFromMatrix(m) {
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();

  m.decompose(
    p,
    q,
    s
  );

  q.normalize();

  return [
    q.x,
    q.y,
    q.z,
    q.w,
  ];
}

function quatAngularError(a, b) {
  const qa =
    new THREE.Quaternion(
      a[0],
      a[1],
      a[2],
      a[3]
    ).normalize();

  const qb =
    new THREE.Quaternion(
      b[0],
      b[1],
      b[2],
      b[3]
    ).normalize();

  const dot =
    Math.min(
      1,
      Math.abs(
        qa.dot(qb)
      )
    );

  return (
    2 *
    Math.acos(dot)
  );
}

export class UnrealExporter {
  async export(args) {
    const {
      mesh,
      fittedSkeleton,
      weights,
      format = 'glb',
      opts = {},
    } = args || {};

    if (!mesh) {
      throw new Error(
        'No source mesh'
      );
    }

    if (
      !fittedSkeleton
        ?.bones
        ?.length
    ) {
      throw new Error(
        'No fitted skeleton'
      );
    }

    if (
      !weights?.weights ||
      !weights?.indices
    ) {
      throw new Error(
        'No skin weights'
      );
    }

    this._validateInput(
      fittedSkeleton,
      weights
    );

    if (
      format ===
      'json'
    ) {
      return this._exportSnapshot(
        mesh,
        fittedSkeleton,
        weights,
        opts
      );
    }

    if (
      format ===
      'glb'
    ) {
      return this._exportGLB(
        mesh,
        fittedSkeleton,
        weights,
        opts
      );
    }

    if (
      format ===
      'fbx'
    ) {
      throw new Error(
        'Direct FBX export requires the Blender bridge. Export GLB + .quinnrig.json, then run docs/quinn_glb_to_ue5_fbx.py.'
      );
    }

    throw new Error(
      `Unsupported export format: ${format}`
    );
  }

  _validateInput(
    fittedSkeleton,
    weights
  ) {
    const bones =
      fittedSkeleton.bones;

    const names =
      bones.map(
        (b) =>
          b.name
      );

    const unique =
      new Set(names);

    if (
      unique.size !==
      names.length
    ) {
      throw new Error(
        'Skeleton contains duplicate bone names'
      );
    }

    if (
      names.length !==
      weights.boneNames
        ?.length
    ) {
      throw new Error(
        `Skeleton/skin bone count mismatch: skeleton=${names.length}, skin=${weights.boneNames?.length || 0}`
      );
    }

    for (
      let i = 0;
      i < names.length;
      i++
    ) {
      if (
        names[i] !==
        weights.boneNames[i]
      ) {
        throw new Error(
          `Skin bone order mismatch at index ${i}: skeleton=${names[i]} skin=${weights.boneNames[i]}`
        );
      }
    }

    const byName =
      Object.fromEntries(
        bones.map(
          (b, i) => [
            b.name,
            {
              bone: b,
              index: i,
            },
          ]
        )
      );

    for (
      let i = 0;
      i < bones.length;
      i++
    ) {
      const b =
        bones[i];

      if (
        !finiteArray(
          b.globalPos,
          3
        )
      ) {
        throw new Error(
          `Bone ${b.name} has invalid globalPos`
        );
      }

      if (
        !finiteArray(
          b.globalRot,
          4
        )
      ) {
        throw new Error(
          `Bone ${b.name} has invalid globalRot`
        );
      }

      if (
        b.parent
      ) {
        const parent =
          byName[
            b.parent
          ];

        if (!parent) {
          throw new Error(
            `Bone ${b.name} references missing parent ${b.parent}`
          );
        }

        if (
          parent.index >= i
        ) {
          throw new Error(
            `Parent order invalid: ${b.parent} must precede ${b.name}`
          );
        }
      }
    }

    for (
      let i = 0;
      i <
      weights.indices.length;
      i++
    ) {
      const idx =
        weights.indices[i];

      const w =
        weights.weights[i];

      if (
        w > 0 &&
        idx >= bones.length
      ) {
        throw new Error(
          `Skin weight references invalid bone index ${idx}`
        );
      }
    }
  }

  /**
   * Convert the fitted authoritative GLOBAL pose to glTF/Three Y-up space,
   * then derive hierarchy-local transforms from those global matrices.
   */
  _buildBoneHierarchy(
    fittedSkeleton
  ) {
    const bones =
      fittedSkeleton.bones;

    const isUE =
      fittedSkeleton
        .coordinate_system ===
      UE_COORDINATE_SYSTEM;

    const globalMatrices =
      new Map();

    for (
      const b of bones
    ) {
      const p =
        isUE
          ? ueVectorToLegacyArray(
              b.globalPos
            )
          : [
              ...b.globalPos,
            ];

      const r =
        isUE
          ? ueQuaternionToLegacyArray(
              normalizeQuatArray(
                b.globalRot
              )
            )
          : normalizeQuatArray(
              b.globalRot
            );

      globalMatrices.set(
        b.name,
        matrixFromPose(
          p,
          r,
          [1, 1, 1]
        )
      );
    }

    const objects =
      bones.map(
        (b) => {
          const global =
            globalMatrices.get(
              b.name
            );

          let local =
            global.clone();

          if (b.parent) {
            const parentGlobal =
              globalMatrices.get(
                b.parent
              );

            if (!parentGlobal) {
              throw new Error(
                `Missing parent global matrix for ${b.name}`
              );
            }

            local =
              parentGlobal
                .clone()
                .invert()
                .multiply(
                  global
                );
          }

          const p =
            new THREE.Vector3();

          const q =
            new THREE.Quaternion();

          const s =
            new THREE.Vector3();

          local.decompose(
            p,
            q,
            s
          );

          q.normalize();

          const o =
            new THREE.Bone();

          o.name =
            b.name;

          o.position.copy(
            p
          );

          o.quaternion.copy(
            q
          );

          /*
           * The fitted skeleton is positional/orientational.
           * Do NOT carry arbitrary bone node scale into GLB: scale on joints
           * is a common source of Blender/FBX skinning problems.
           */
          o.scale.set(
            1,
            1,
            1
          );

          o.userData.quinnKind =
            b.kind;

          o.userData.quinnSkinned =
            b.skinned !==
            false;

          return o;
        }
      );

    const byName =
      Object.fromEntries(
        bones.map(
          (b, i) => [
            b.name,
            objects[i],
          ]
        )
      );

    const roots = [];

    bones.forEach(
      (b, i) => {
        if (
          b.parent &&
          byName[
            b.parent
          ]
        ) {
          byName[
            b.parent
          ].add(
            objects[i]
          );
        } else {
          roots.push(
            objects[i]
          );
        }
      }
    );

    /*
     * Verify that the rebuilt hierarchy reproduces the fitted GLOBAL pose.
     * This catches exactly the class of errors that previously slipped
     * through and became distorted armatures in Blender.
     */
    const verifyRoot =
      new THREE.Group();

    roots.forEach(
      (r) =>
        verifyRoot.add(r)
    );

    verifyRoot
      .updateMatrixWorld(
        true
      );

    for (
      let i = 0;
      i < bones.length;
      i++
    ) {
      const expected =
        globalMatrices.get(
          bones[i].name
        );

      const actual =
        objects[i]
          .matrixWorld;

      const ep =
        positionFromMatrix(
          expected
        );

      const ap =
        positionFromMatrix(
          actual
        );

      const posError =
        Math.hypot(
          ep[0] - ap[0],
          ep[1] - ap[1],
          ep[2] - ap[2]
        );

      const er =
        quatFromMatrix(
          expected
        );

      const ar =
        quatFromMatrix(
          actual
        );

      const rotError =
        quatAngularError(
          er,
          ar
        );

      if (
        posError >
          POS_EPS ||
        rotError >
          ROT_EPS
      ) {
        throw new Error(
          `Export hierarchy verification failed at ${bones[i].name}: pos=${posError.toExponential(2)}m rot=${rotError.toExponential(2)}rad`
        );
      }
    }

    /*
     * Detach roots from the temporary verification group before the caller
     * inserts them into the real export scene.
     */
    for (
      const r of [
        ...roots,
      ]
    ) {
      verifyRoot.remove(
        r
      );
    }

    return {
      objects,
      roots,
      globalMatrices,
    };
  }

  async _exportGLB(
    mesh,
    fittedSkeleton,
    weights,
    opts
  ) {
    mesh.updateMatrixWorld(
      true
    );

    const scene =
      new THREE.Group();

    scene.name =
      opts.sceneName ||
      'Quinn_AutoRig';

    const {
      objects: boneObjects,
      roots,
    } =
      this._buildBoneHierarchy(
        fittedSkeleton
      );

    roots.forEach(
      (r) =>
        scene.add(r)
    );

    scene.updateMatrixWorld(
      true
    );

    const skeleton =
      new THREE.Skeleton(
        boneObjects
      );

    /*
     * Inverses are calculated only AFTER the final hierarchy has been placed
     * in the actual export scene.
     */
    skeleton.calculateInverses();

    const byUuid = {};

    mesh.traverse(
      (o) => {
        if (
          o.isMesh
        ) {
          byUuid[
            o.uuid
          ] = o;
        }
      }
    );

    let exportedParts = 0;

    for (
      const part of
      weights.parts || []
    ) {
      const src =
        byUuid[
          part.uuid
        ];

      if (
        !src?.geometry
      ) {
        continue;
      }

      const geo =
        src.geometry.clone();

      /*
       * Bake source mesh world transform so the exported mesh and skeleton
       * share one identity scene frame.
       */
      geo.applyMatrix4(
        src.matrixWorld
      );

      if (
        fittedSkeleton
          .coordinate_system ===
        UE_COORDINATE_SYSTEM
      ) {
        /*
         * UE workspace:
         * X forward, Y right, Z up
         *
         * glTF/Three:
         * X right, Y up, Z forward
         *
         * x' = -Y
         * y' =  Z
         * z' =  X
         */
        const ueToGltf =
          new THREE.Matrix4().set(
             0, -1,  0, 0,
             0,  0,  1, 0,
             1,  0,  0, 0,
             0,  0,  0, 1
          );

        geo.applyMatrix4(
          ueToGltf
        );
      }

      const skinned =
        new THREE.SkinnedMesh(
          geo,
          cloneMaterial(
            src.material
          )
        );

      skinned.name =
        src.name ||
        part.name ||
        `SkinnedMesh_${exportedParts}`;

      skinned.frustumCulled =
        false;

      /*
       * The geometry has been baked into scene space; keep mesh node at
       * identity and bind against the skeleton's current rest pose.
       */
      skinned.position.set(
        0,
        0,
        0
      );

      skinned.quaternion.identity();

      skinned.scale.set(
        1,
        1,
        1
      );

      scene.add(
        skinned
      );

      scene.updateMatrixWorld(
        true
      );

      skinned.bind(
        skeleton,
        new THREE.Matrix4()
      );

      skinned.normalizeSkinWeights();

      exportedParts++;
    }

    if (
      exportedParts === 0
    ) {
      throw new Error(
        'No skinned mesh parts were matched for export'
      );
    }

    scene.updateMatrixWorld(
      true
    );

    const exporter =
      new GLTFExporter();

    const data =
      await exporter.parseAsync(
        scene,
        {
          binary: true,
          trs: true,
          onlyVisible: false,
          includeCustomExtensions:
            false,
          maxTextureSize:
            opts.maxTextureSize ||
            4096,
        }
      );

    if (
      !(
        data instanceof
        ArrayBuffer
      )
    ) {
      throw new Error(
        'GLTFExporter did not return binary GLB data'
      );
    }

    return new Blob(
      [data],
      {
        type:
          'model/gltf-binary',
      }
    );
  }

  _exportSnapshot(
    mesh,
    fittedSkeleton,
    weights,
    opts
  ) {
    const payload = {
      schema:
        'quinn-rigger-snapshot',

      schema_version:
        2,

      created_at:
        new Date()
          .toISOString(),

      source_mesh:
        opts.sourceMeshName ||
        mesh.name ||
        null,

      coordinate_system:
        fittedSkeleton
          .coordinate_system ||
        'threejs-y-up-right-handed-metres',

      export_policy: {
        global_pose_authoritative:
          true,
        local_pose_rebuilt_on_export:
          true,
        max_influences:
          4,
      },

      skeleton:
        fittedSkeleton,

      skin: {
        boneNames:
          weights.boneNames,

        parts:
          weights.parts,

        options:
          weights.options,

        report:
          weights.report,

        indices_type:
          'uint16',

        weights_type:
          'float32',

        tuple_size:
          4,

        indices_base64:
          bytesToBase64(
            weights.indices
          ),

        weights_base64:
          bytesToBase64(
            weights.weights
          ),
      },
    };

    return new Blob(
      [
        JSON.stringify(
          payload
        ),
      ],
      {
        type:
          'application/json',
      }
    );
  }
}
