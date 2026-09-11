/**
 * ==============================================================
 *  Placeholder Module: SkeletonFitter
 * ==============================================================
 *  Solves the loaded skeleton template's bones onto the placed
 *  landmarks WITHOUT renaming, removing or restructuring any
 *  bone.  The output preserves the exact hierarchy from
 *  SkeletonTemplateManager and only modifies per-bone position,
 *  orientation and length.
 *
 *  Status: STUB — Phase 2. The interface below is the target
 *  API. Any real implementation must obey the guarantees stated
 *  in `fit()`.
 * ==============================================================
 */

export class SkeletonFitter {
  /**
   * @param {object} template - authoritative skeleton template (JSON)
   * @param {object[]} landmarks - placed landmark array from store
   * @returns {Promise<{
   *   bones: Array<{ name, parent, kind, localPos, localRot, globalPos, roll }>,
   *   report: { fitted: number, derived: number, warnings: string[] }
   * }>}
   *
   * Guarantees:
   *   - Returned bones[].name === template.bones[i].name (identical set)
   *   - Returned bones[].parent === template.bones[i].parent
   *   - No renaming, no removal, no simplification
   *   - Twist bones parametrically positioned from parent chain
   *   - IK / auxiliary bones derived via template `derived` rules
   *   - If a required landmark is missing, the bone keeps its
   *     template refLocal transform AND a warning is emitted
   */
  async fit(template, landmarks) {
    throw new Error('SkeletonFitter.fit() not implemented yet — Phase 2');
  }
}
