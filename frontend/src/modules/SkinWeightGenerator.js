/**
 * ==============================================================
 *  Placeholder Module: SkinWeightGenerator
 * ==============================================================
 *  Computes per-vertex bone weights for the imported mesh given
 *  a fitted skeleton.  Twist and auxiliary bones must be
 *  weightable; IK bones are marked non-deform and skipped.
 *
 *  Recommended algorithm: heat-diffusion (Pinocchio-style) on a
 *  Python worker, or bone-glow with distance falloff for a
 *  faster first pass.
 *
 *  Status: STUB — Phase 3.
 * ==============================================================
 */

export class SkinWeightGenerator {
  /**
   * @param {THREE.Object3D} mesh
   * @param {object} fittedSkeleton  // output of SkeletonFitter.fit()
   * @param {object} [opts]          // e.g. { maxInfluences: 4 }
   * @returns {Promise<{
   *   weights: Float32Array,        // per-vertex weight blob
   *   indices: Uint16Array,         // per-vertex bone-index blob
   *   report: { verticesWeighted, unweighted, avgInfluences, warnings: string[] }
   * }>}
   */
  async generate(mesh, fittedSkeleton, opts) {
    throw new Error('SkinWeightGenerator.generate() not implemented yet — Phase 3');
  }
}
