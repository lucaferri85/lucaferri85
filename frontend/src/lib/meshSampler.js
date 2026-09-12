/**
 * Area-uniform surface sampling of triangle soups → point cloud for landmark detection.
 * Independent of tessellation density (low-poly rings and dense scans give the same cloud).
 * tris: iterable of [ax,ay,az, bx,by,bz, cx,cy,cz] world-space triangles.
 */
export function sampleTriangles(tris, target = 80000) {
  let totalArea = 0;
  const areas = tris.map(t => { const a = triArea(t); totalArea += a; return a; });
  if (!totalArea) return tris.map(t => [t[0], t[1], t[2]]);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const density = target / totalArea;
  const out = [];
  tris.forEach((t, k) => {
    const n = Math.floor(areas[k] * density + rnd());
    out.push([t[0], t[1], t[2]]);
    for (let i = 0; i < n; i++) {
      let u = rnd(), v = rnd();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const w = 1 - u - v;
      out.push([w * t[0] + u * t[3] + v * t[6], w * t[1] + u * t[4] + v * t[7], w * t[2] + u * t[5] + v * t[8]]);
    }
  });
  return out;
}

function triArea(t) {
  const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2];
  const vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
}
