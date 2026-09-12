// node tests/run_detector.mjs tests/fixtures/armored_humanoid.obj  — runs the browser detector on an OBJ vertex cloud
import fs from 'fs';
import { detectLandmarks } from '../frontend/src/lib/landmarkDetector.js';
import { sampleTriangles } from '../frontend/src/lib/meshSampler.js';

const file = process.argv[2];
const verts = [], tris = [];
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  const t = line.trim().split(/\s+/);
  if (t[0] === 'v') verts.push([+t[1], +t[2], +t[3]]);
  else if (t[0] === 'f') { const f = t.slice(1).map(k => verts[parseInt(k.split('/')[0], 10) - 1]); for (let i = 1; i + 1 < f.length; i++) tris.push([...f[0], ...f[i], ...f[i + 1]]); }
}
const subArg = process.argv.indexOf('--subdivide');
let T = tris;
for (let n = subArg >= 0 ? +process.argv[subArg + 1] : 0; n > 0; n--) {
  const next = [];
  for (const t of T) {
    const A = t.slice(0, 3), B = t.slice(3, 6), C = t.slice(6, 9), m = (p, q) => p.map((v, i) => (v + q[i]) / 2);
    const AB = m(A, B), BC = m(B, C), CA = m(C, A);
    next.push([...A, ...AB, ...CA], [...AB, ...B, ...BC], [...CA, ...BC, ...C], [...AB, ...BC, ...CA]);
  }
  T = next;
}
console.log('triangles', T.length);
const pts = sampleTriangles(T, 80000);
// mimic viewport normalisation: height 1.75 m, feet at y=0, centred in x/z
let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (const p of pts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
const s = 1.75 / (mx[1] - mn[1]);
const norm = pts.map(p => [(p[0] - (mn[0] + mx[0]) / 2) * s, (p[1] - mn[1]) * s, (p[2] - (mn[2] + mx[2]) / 2) * s]);

const res = detectLandmarks(norm, { symmetryAxis: process.argv.includes('--nosym') ? null : 'x' });
if (!res) { console.log('detector returned null'); process.exit(1); }
const c = { high: 0, medium: 0, low: 0, not_found: 0 };
for (const [id, l] of Object.entries(res.landmarks)) {
  c[l.confidence]++;
  const p = l.position ? `${l.position.x.toFixed(3)}, ${l.position.y.toFixed(3)}, ${l.position.z.toFixed(3)}` : '—';
  console.log(id.padEnd(12), l.confidence.padEnd(10), p.padEnd(24), l.note);
}
console.log('\nSCALE', s.toFixed(4), 'H', res.height.toFixed(3), 'crotchY', res.crotchY?.toFixed(3), 'torsoHalf', res.torsoHalf?.toFixed(3), 'tPose', res.tPose);
console.log(c);
