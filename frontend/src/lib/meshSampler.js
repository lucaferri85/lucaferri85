/**
 * Area-uniform surface sampling of triangle soups → point cloud for landmark detection.
 * The cloud size is ≈ `target` regardless of tessellation (9 M-vertex scans and 5 k-vertex game meshes give
 * statistically equivalent clouds), so mesh density does not change anatomical results.
 */
export function triArea(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  return 0.5 * Math.sqrt(x * x + y * y + z * z);
}

/** Streaming sampler: pass 1 → totalArea (and triangle count), pass 2 → add(tri) for every triangle. */
export function createSurfaceSampler(totalArea, triCount, target = 80000) {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const density = totalArea > 0 ? target / totalArea : 0;
  const keepVertices = triCount <= target / 4; // sparse meshes: keep a vertex per triangle so thin parts are never missed
  const out = [];
  const add = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    if (keepVertices) out.push([ax, ay, az]);
    const n = Math.floor(triArea(ax, ay, az, bx, by, bz, cx, cy, cz) * density + rnd());
    for (let i = 0; i < n; i++) {
      let u = rnd(), v = rnd();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const w = 1 - u - v;
      out.push([w * ax + u * bx + v * cx, w * ay + u * by + v * cy, w * az + u * bz + v * cz]);
    }
  };
  return { add, points: out };
}

/** Convenience for in-memory triangle lists: tris = [[ax,ay,az,bx,by,bz,cx,cy,cz], …]. */
export function sampleTriangles(tris, target = 80000) {
  let total = 0;
  for (const t of tris) total += triArea(...t);
  const s = createSurfaceSampler(total, tris.length, target);
  for (const t of tris) s.add(...t);
  return s.points;
}
