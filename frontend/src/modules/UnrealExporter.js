/**
 * ==============================================================
 *  Placeholder Module: UnrealExporter
 * ==============================================================
 *  Converts the fitted rig (skeleton + skin weights) from the
 *  application's internal coordinate space to Unreal Engine 5
 *  space and writes it out in the requested format.
 *
 *  Coordinate conversion (internal Y-up meters -> UE Z-up cm):
 *    1. Rotate +90° about X to swap Y and Z
 *    2. Flip X sign to convert handedness
 *    3. Scale ×100 for cm
 *    4. Apply mesh's saved origin/pivot
 *
 *  Supported formats (Phase 4):
 *    - .fbx  (headless Blender subprocess / pyfbx-i42)
 *    - .glb  (THREE.GLTFExporter with SkinnedMesh + inverse bind mats)
 *    - .json (rig snapshot for reproducible re-import)
 *
 *  Status: STUB — Phase 4.
 * ==============================================================
 */

export class UnrealExporter {
  /**
   * @param {object} args
   * @param {THREE.Object3D} args.mesh
   * @param {object} args.fittedSkeleton
   * @param {object} args.weights
   * @param {'fbx'|'glb'|'json'} args.format
   * @param {object} [args.opts]  // {units, applyRootMotion, ...}
   * @returns {Promise<Blob>}
   */
  async export(args) {
    throw new Error('UnrealExporter.export() not implemented yet — Phase 4');
  }
}
