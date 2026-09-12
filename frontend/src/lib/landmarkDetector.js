/**
 * Automatic anatomical landmark detection from mesh geometry (Three.js Y-up, metres).
 *
 * Principles (user acceptance criteria):
 *  - joints come from cross-section CENTROIDS / torso widths, never from silhouette extremes,
 *    so pauldrons, gauntlets, boots, spikes and weapons do not pull joints outward;
 *  - anatomical correctness beats completion: no proportional guesses for structural
 *    joints — when geometric evidence is missing or implausible the landmark is NOT FOUND;
 *  - chain continuity (segment-length plausibility), L/R consistency and inside-body
 *    checks downgrade confidence and explain why in `note`.
 *
 * Returns { landmarks: { id → { position|null, confidence:'high'|'medium'|'low'|'not_found', note } }, … }.
 */
const SLICES = 140;

// anthropometric segment lengths as fraction of total height (nominal, plausible range)
const SEG = {
  thigh:    { nom: 0.245, min: 0.17, max: 0.32 },
  shin:     { nom: 0.220, min: 0.15, max: 0.30 },
  upperarm: { nom: 0.186, min: 0.12, max: 0.25 },
  forearm:  { nom: 0.146, min: 0.09, max: 0.21 },
  hand:     { nom: 0.108, min: 0.05, max: 0.16 },
};
const RANK = { high: 3, medium: 2, low: 1, not_found: 0 };

export function detectLandmarks(rawPoints, { symmetryAxis = 'x', debug = false } = {}) {
  if (!rawPoints || rawPoints.length < 300) return null;
  let minY = Infinity, maxY = -Infinity;
  for (const p of rawPoints) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const H = maxY - minY;
  if (H < 0.2) return null;
  const rel = (f) => minY + f * H;
  const frac = (y) => (y - minY) / H;
  const gap = 0.025 * H;

  // midline: centroid x of the largest x-cluster in the 55–75 % band (torso). Weapons/capes shift the bbox centre, not this.
  const torsoBand = rawPoints.filter(p => frac(p[1]) > 0.55 && frac(p[1]) < 0.75).sort((a, b) => a[0] - b[0]);
  let x0 = 0;
  if (torsoBand.length > 20) {
    let best = null, start = 0;
    for (let i = 1; i <= torsoBand.length; i++) {
      if (i === torsoBand.length || torsoBand[i][0] - torsoBand[i - 1][0] > gap) {
        if (!best || i - start > best.n) { let sx = 0; for (let k = start; k < i; k++) sx += torsoBand[k][0]; best = { n: i - start, cx: sx / (i - start) }; }
        start = i;
      }
    }
    x0 = best.cx;
  }
  const points = rawPoints.map(p => [p[0] - x0, p[1], p[2]]);

  const out = {};
  const put = (id, p, confidence, note = '') => { out[id] = { position: { x: p[0], y: p[1], z: p[2] }, confidence, note }; };
  const nf = (id, note) => { out[id] = { position: null, confidence: 'not_found', note }; };
  const downgrade = (id, to, why) => {
    const l = out[id]; if (!l || !l.position) return;
    if (to === 'not_found') { nf(id, `${why}${l.note ? ' · was: ' + l.note : ''}`); return; }
    if (RANK[to] < RANK[l.confidence]) l.confidence = to;
    l.note = `${why} · ${l.note}`;
  };

  // ---------------- cross-sections & clusters (overlapping windows so sparse low-poly rings never leave a slice empty) ----------------
  const slices = Array.from({ length: SLICES }, () => []);
  const halfWin = Math.max(0.5 / SLICES, 0.015);
  for (const p of points) {
    const f = frac(p[1]);
    const lo = Math.max(0, Math.floor((f - halfWin) * SLICES)), hi = Math.min(SLICES - 1, Math.floor((f + halfWin) * SLICES));
    for (let i = lo; i <= hi; i++) slices[i].push(p);
  }
  const sliceY = (i) => minY + ((i + 0.5) / SLICES) * H;
  const idx = (f) => Math.min(SLICES - 1, Math.max(0, Math.floor(f * SLICES)));
  // 2-D connected components in the (x,z) plane of each slice: a cape behind the legs, a shield beside the hip or a
  // weapon in front no longer merges with body parts that only overlap in x. Cell = 1.2 % of height, 8-neighbourhood (≈ 2.4 % gap tolerance).
  const cell = 0.012 * H;
  const clustersOf = (pts) => {
    if (pts.length < 3) return [];
    const cells = new Map(); // key → point indices
    const key = (ix, iz) => ix * 100003 + iz;
    for (let k = 0; k < pts.length; k++) { const p = pts[k]; const kk = key(Math.floor(p[0] / cell), Math.floor(p[2] / cell)); const arr = cells.get(kk); if (arr) arr.push(k); else cells.set(kk, [k]); }
    const seen = new Set(); const out = [];
    for (const start of cells.keys()) {
      if (seen.has(start)) continue;
      const comp = []; const stack = [start]; seen.add(start);
      while (stack.length) {
        const kk = stack.pop(); comp.push(...cells.get(kk));
        const ix = Math.floor(kk / 100003), iz = kk - ix * 100003;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { if (!dx && !dz) continue; const nk = key(ix + dx, iz + dz); if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); } }
      }
      if (comp.length < 3) continue;
      const c = comp.map(k => pts[k]);
      let sx = 0, sz = 0, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
      for (const p of c) { sx += p[0]; sz += p[2]; minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[2]); maxz = Math.max(maxz, p[2]); }
      const body = bodyExtent(c, cell);
      const w = maxx - minx, d = maxz - minz;
      // a wide, flat component (cape, banner, cloak panel) is a sheet: never a body part
      out.push({ n: c.length, cx: sx / c.length, cz: sz / c.length, minx, maxx, minz, maxz, w, d, pts: c, bminx: body.minx, bmaxx: body.maxx, bw: body.maxx - body.minx, thinAttach: body.stripped <= 4, sheet: d < 0.25 * w && d < 0.06 * H && w > 0.15 * H });
    }
    return out.sort((u, v) => v.n - u.n);
  };
  const S = slices.map(clustersOf);
  const z0 = median(torsoBand.map(p => p[2])) || 0;
  const central = (i) => { let best = null, bd = Infinity; for (const c of S[i] || []) { if (c.sheet) continue; const dd = Math.hypot(c.cx, (c.cz - z0) * 0.5); if (dd < bd) { bd = dd; best = c; } } return best; };
  // points that belong to sheets (separate cape panels) or stick out of the body extent of the central component (attached cape)
  const sheetPts = new Set();
  for (let i = 0; i < SLICES; i++) {
    const t = central(i);
    for (const c of S[i]) {
      if (c.sheet) { for (const p of c.pts) sheetPts.add(p); }
      else if (c === t && c.thinAttach) { for (const p of c.pts) if (p[0] > c.bmaxx + cell / 2 || p[0] < c.bminx - cell / 2) sheetPts.add(p); }
    }
  }
  const nearestCluster = (i, x, maxDist) => {
    let best = null;
    for (const c of S[i] || []) { if (x >= c.minx && x <= c.maxx) return c; const dd = Math.abs(c.cx - x); if (dd <= maxDist && (!best || dd < Math.abs(best.cx - x))) best = c; }
    return best;
  };

  // ---------------- head top: skip thin protrusions (spikes, horns, raised weapons) ----------------
  let headI = -1;
  for (let i = SLICES - 1; i >= idx(0.80); i--) {
    const c = central(i);
    if (c && Math.abs(c.cx) < 0.12 * H && c.w >= 0.05 * H && c.d >= 0.04 * H) { headI = i; break; }
  }
  if (headI >= 0) {
    const hc = central(headI);
    const skipped = (SLICES - 1 - headI) / SLICES * H;
    const yTop = skipped > 0.015 * H ? sliceY(headI) + 0.5 * H / SLICES : maxY;
    put('head_top', [hc.cx, yTop, hc.cz], skipped > 0.015 * H ? 'medium' : 'high',
      skipped > 0.015 * H ? `Thin protrusion of ${(skipped * 100).toFixed(0)} cm above the skull ignored (spike/horn/accessory)` : 'Top of widest central cross-section (skull)');
  } else { nf('head_top', 'No skull-sized central cross-section in the top 20 % of the mesh'); }

  // ---------------- neck: narrowest central cross-section between 78 % and head ----------------
  let neck = null;
  const neckHi = headI >= 0 ? headI - 1 : idx(0.94);
  for (let i = idx(0.78); i <= neckHi; i++) { const c = central(i); if (c && Math.abs(c.cx) < 0.08 * H && (!neck || c.w < neck.w)) neck = { ...c, i }; }
  if (neck) {
    // must be clearly narrower than the head above and the shoulders/torso below
    let headW = 0, torsoW = 0;
    for (let i = neck.i + 1; i <= neckHi; i++) { const c = central(i); if (c) headW = Math.max(headW, c.w); }
    for (let i = Math.max(0, neck.i - idx(0.10)); i < neck.i; i++) { const c = central(i); if (c) torsoW = Math.max(torsoW, c.w); }
    const narrowing = neck.w < 0.85 * headW && neck.w < 0.85 * torsoW;
    put('neck_base', [neck.cx, sliceY(neck.i) - 0.02 * H, neck.cz], narrowing ? 'high' : 'medium',
      narrowing ? `Narrowest neck cross-section (${(neck.w * 100).toFixed(1)} cm wide)` : 'Weak neck narrowing (collar/helmet/beard?) — verify height');
  } else nf('neck_base', 'No central cross-section between 78 % height and the head');
  const neckY = out.neck_base.position?.y ?? null;

  // head centre: 55 % of the way from neck base to head top
  if (out.head_top.position && neckY !== null) {
    const y = neckY + 0.55 * (out.head_top.position.y - neckY);
    const c = central(idx(frac(y)));
    if (c) put('head_center', [c.cx, y, c.cz], 'medium', 'Skull cross-section centroid between neck base and head top');
    else nf('head_center', 'No cross-section at estimated skull centre');
  } else nf('head_center', 'Requires head top and neck base');

  // ---------------- legs (bottom-up, independent of the torso) ----------------
  // Start where two legs are almost always separate (10–32 % height), pick the slice with the cleanest two-leg
  // split, then track each leg DOWN (knee, ankle, foot) and UP (thigh → crotch = where the tracks merge).
  const legSign = { l: 1, r: -1 }; // +x = character left
  const legCandidates = (i) => (S[i] || []).filter(c => Math.abs(c.cx) < 0.2 * H && c.w < 0.25 * H && c.n >= 5);
  let seedI = -1, seedScore = -Infinity;
  for (let i = idx(0.10); i <= idx(0.32); i++) {
    const cl = legCandidates(i);
    const L = cl.filter(c => c.cx > 0.015 * H), R = cl.filter(c => c.cx < -0.015 * H);
    if (!L.length || !R.length) continue;
    const l = L.sort((u, v) => v.n - u.n)[0], r = R.sort((u, v) => v.n - u.n)[0];
    const sym = 1 - Math.min(1, Math.abs(Math.abs(l.cx) - Math.abs(r.cx)) / (0.05 * H));
    const score = sym + Math.min(l.n, r.n) / Math.max(l.n, r.n) - (cl.length - 2) * 0.2;
    if (score > seedScore) { seedScore = score; seedI = i; }
  }
  const tracks = { l: null, r: null };
  let crotchI = -1;
  if (seedI >= 0) {
    const cl = legCandidates(seedI);
    const seedFor = (sgn) => cl.filter(c => sgn * c.cx > 0.015 * H).sort((u, v) => v.n - u.n)[0];
    const follow = (sgn, from, step) => {
      const seed = seedFor(sgn); const t = new Map(); let x = seed.cx, z = seed.cz; const legW = seed.w;
      t.set(seedI, { ...seed, i: seedI });
      let misses = 0;
      for (let i = from; i >= 0 && i < SLICES; i += step) {
        let c = (S[i] || []).find(k => !k.sheet && x >= k.minx && x <= k.maxx && z >= k.minz - cell && z <= k.maxz + cell);
        if (!c) { let bd = 0.06 * H; for (const k of S[i] || []) { if (k.sheet) continue; const dd = Math.hypot(k.cx - x, (k.cz - z) * 0.5); if (dd < bd) { bd = dd; c = k; } } }
        if (!c) { if (step < 0 || ++misses <= 4) continue; else break; }
        misses = 0;
        if (c.w > 1.8 * legW && c.minx < -0.005 * H && c.maxx > 0.005 * H) {
          const split = splitLegs(c, cell, H);
          const sc = split && split[sgn > 0 ? 'l' : 'r'];
          // the isolated leg core must stay on this leg's axis (a hollow belt/tasset ring between the thighs fakes a gap)
          if (sc && Math.abs(sc.cx - seed.cx) < 0.04 * H) { x = sc.cx; z = sc.cz; t.set(i, { ...sc, i, cloth: true }); continue; }
          if (step > 0) { t.set(i, { i, merged: true, cx: c.cx, cz: c.cz, w: c.w, comp: c }); break; } // legs merged above → crotch region
          const half = c.pts.filter(p => sgn * p[0] > 0.005 * H); const hc = centroid(half); if (!hc) continue;
          x = hc[0]; z = hc[2]; t.set(i, { i, cx: hc[0], cz: hc[2], w: legW, merged: true }); continue;
        }
        x = c.cx; z = c.cz; t.set(i, { ...c, i });
      }
      return t;
    };
    for (const side of ['l', 'r']) tracks[side] = { down: follow(legSign[side], seedI - 1, -1), up: follow(legSign[side], seedI + 1, +1) };
    // crotch: highest slice where BOTH legs are still separate components, provided they merge right above it
    // crotch = where a leg track merges into the shared pelvis component (lowest merge of either side)
    const mergeI = (side) => { let m = -1; for (const [i, c] of tracks[side].up) if (c.merged && (m < 0 || i < m)) m = i; return m; };
    const topSep = (side) => { let m = -1; for (const [i, c] of tracks[side].up) if (!c.merged && i > m) m = i; return m; };
    const ml = mergeI('l'), mr = mergeI('r');
    if (ml >= 0 && mr >= 0) crotchI = Math.min(ml, mr);
    else if (ml >= 0 || mr >= 0) crotchI = Math.max(ml, mr);
    else if (topSep('l') >= idx(0.45) && topSep('r') >= idx(0.45)) crotchI = -2; // legs stay separate to the top (mesh split / no torso?)
  }
  const crotchY = crotchI >= 0 ? sliceY(crotchI) : null;
  let pelvisY = null;
  if (crotchY !== null) {
    pelvisY = crotchY + 0.055 * H;
    const pc = central(idx(frac(pelvisY)));
    const lowSplit = frac(crotchY) < 0.40, highSplit = frac(crotchY) > 0.56;
    if (pc) put('pelvis', [pc.cx, pelvisY, pc.cz], lowSplit || highSplit ? 'low' : 'high',
      lowSplit ? 'Leg split found unusually low (thighs touching / armour skirt?) — pelvis height may be underestimated, verify'
        : highSplit ? 'Leg split found unusually high — verify pelvis height' : 'Torso centroid 5.5 % height above detected crotch split');
    else nf('pelvis', 'No torso cross-section above crotch');
  } else nf('pelvis', seedI < 0 ? 'Two separate legs not found between 10–32 % height (robe / merged legs / non-humanoid?) — place manually'
    : crotchI === -2 ? 'Legs never merge into a torso — mesh may be split; place pelvis manually' : 'Leg tracks could not be joined at a crotch — place pelvis manually');

  for (const side of ['l', 'r']) {
    const tr_ = tracks[side];
    if (!tr_) { for (const id of ['hip', 'knee', 'ankle', 'heel', 'toe']) nf(`${id}_${side}`, 'Two separate legs not found between 10–32 % height'); continue; }
    const at = (i) => tr_.down.get(i) || tr_.up.get(i) || null;
    const mergedNote = (c) => c.merged ? 'Legs merged at this height (boots/greaves/armour touching) — side-half centroid, verify · ' : c.cloth ? 'Cloth/armour bridging the legs ignored (leg core isolated by depth) · ' : '';
    const mergedConf = (c, base) => c.merged ? 'low' : base;
    // hip: thigh centroid at the highest separate slice, lifted to hip-joint height above the crotch
    if (crotchI >= 0) {
      let hipC = null;
      for (let i = crotchI - 1; i >= crotchI - idx(0.12) && i >= 0; i--) { const c = at(i); if (c && !c.merged && !c.cloth) { hipC = c; break; } }
      if (!hipC) for (let i = crotchI - 1; i >= crotchI - 4 && i >= 0; i--) { const c = at(i); if (c && !c.merged) { hipC = c; break; } }
      if (hipC) {
        const lowSplit = frac(crotchY) < 0.40;
        put(`hip_${side}`, [hipC.cx, pelvisY - 0.015 * H, hipC.cz], lowSplit ? 'low' : hipC.cloth ? 'medium' : 'high',
          (lowSplit ? 'Leg split found unusually low (thighs touching / armour skirt?) — hip height may be underestimated · ' : '') + (hipC.cloth ? 'Thigh isolated from bridging cloth/armour by depth — verify lateral position · ' : '') + 'Thigh cross-section centroid just below the crotch, raised to hip-joint height');
      } else nf(`hip_${side}`, 'No separate thigh cross-section just below the crotch');
    } else nf(`hip_${side}`, 'Hip height unknown without a crotch/pelvis — place pelvis or hip manually');
    // knee: narrowest tracked cross-section in 22–36 % if it is a clear minimum, else proportional along the tracked leg
    let knee = null, widths = [];
    for (let i = idx(0.22); i <= idx(0.36); i++) { const c = at(i); if (c && !c.merged) { widths.push(c.w); if (!knee || c.w < knee.w) knee = c; } }
    const medW = median(widths);
    if (knee && medW && knee.w < 0.92 * medW) put(`knee_${side}`, [knee.cx, sliceY(knee.i), knee.cz], 'medium', 'Narrowest tracked leg cross-section (22–36 % height)');
    else {
      const c = at(idx(0.285));
      if (c) put(`knee_${side}`, [c.cx, sliceY(c.i), c.cz], mergedConf(c, 'medium'), mergedNote(c) + 'Tracked leg centroid at 28.5 % height (no clear narrowing — knee armour?)');
      else nf(`knee_${side}`, 'Leg cluster lost at knee height (geometry gap or leg merged with accessory)');
    }
    // ankle: tracked lower-leg centroid at 6.5 % height (boot volume is symmetric around the leg axis)
    const aC = at(idx(0.065));
    if (aC) put(`ankle_${side}`, [aC.cx, sliceY(aC.i), aC.cz - 0.01 * H], mergedConf(aC, 'medium'), mergedNote(aC) + 'Tracked lower-leg centroid at 6.5 % height (boot silhouette ignored)');
    else nf(`ankle_${side}`, 'Leg cluster lost at ankle height');
    // foot: heel/toe legitimately use the foot silhouette, restricted to this leg's x-track
    const ankle = out[`ankle_${side}`].position;
    if (ankle) {
      const footPts = [];
      for (let i = 0; i <= idx(0.04); i++) for (const p of slices[i]) if (Math.abs(p[0] - ankle.x) < 0.07 * H) footPts.push(p);
      if (footPts.length > 10) {
        const zs = footPts.map(p => p[2]).sort((u, v) => u - v);
        const zBack = zs[Math.floor(zs.length * 0.02)], zFront = zs[Math.floor(zs.length * 0.98)];
        const footLen = zFront - zBack;
        const okF = footLen > 0.08 * H && footLen < 0.22 * H;
        put(`heel_${side}`, [ankle.x, rel(0.03), zBack + 0.01 * H], okF ? 'medium' : 'low', okF ? 'Rear of foot silhouette' : `Foot length ${(footLen * 100).toFixed(0)} cm implausible (boot/armour?)`);
        put(`toe_${side}`, [ankle.x, rel(0.02), zFront - 0.04 * H], okF ? 'medium' : 'low', okF ? 'Ball ≈ 4 % height behind toe tip' : `Foot length ${(footLen * 100).toFixed(0)} cm implausible (boot/armour?)`);
      } else { nf(`heel_${side}`, 'No foot geometry under this ankle'); nf(`toe_${side}`, 'No foot geometry under this ankle'); }
    } else { nf(`heel_${side}`, 'Requires ankle'); nf(`toe_${side}`, 'Requires ankle'); }
  }

  // ---------------- torso width & armpit ----------------
  // Scan DOWN from the neck: the armpit is the first slice where the central torso cluster has an adjacent cluster on
  // both sides AND the torso is not still the shoulder bulge (width ≤ 1.15 × torso width just below). Scanning
  // downward keeps hands hanging at hip height (A-pose) from being mistaken for arms leaving the torso.
  let armpitI = -1;
  const scanTop = neckY !== null ? idx(frac(neckY)) : idx(0.90);
  for (let i = scanTop; i >= idx(0.45); i--) {
    const t = central(i); if (!t) continue;
    const adj = (c) => (c.minx > t.bmaxx - cell && c.minx - t.bmaxx < 0.12 * H) || (c.maxx < t.bminx + cell && t.bminx - c.maxx < 0.12 * H);
    const hasL = S[i].some(c => c !== t && c.cx > t.bmaxx && adj(c)), hasR = S[i].some(c => c !== t && c.cx < t.bminx && adj(c));
    if (!hasL || !hasR) continue;
    const below = []; for (let j = i - 1; j >= Math.max(0, i - idx(0.12)); j--) { const c = central(j); if (c) below.push(c.bw); }
    const mb = median(below), maxb = below.length ? Math.max(...below) : 0;
    if (mb && t.bw > 1.15 * mb) continue; // still inside the shoulder / pauldron bulge
    if (maxb && t.bw < 0.75 * maxb) continue; // detached pauldron / collar beside the neck, not an arm leaving the chest
    armpitI = i; break;
  }
  let tPose = false;
  if (armpitI < 0) {
    let wideLo = -1;
    for (let i = idx(0.55); i <= idx(0.90); i++) { const c = central(i); if (c && c.w > 0.6 * H) { wideLo = i; break; } }
    if (wideLo > 0) { tPose = true; armpitI = wideLo - 1; }
  }
  let torsoHalf = null, shoulderY = null;
  if (armpitI >= 0) {
    // robust torso half-width: median of central widths over the 6 % below the armpit
    // torso half-width: body width (sheets stripped), cross-checked with the gap between the two arm components
    const ws = [];
    for (let i = armpitI; i >= Math.max(0, armpitI - idx(0.06)); i--) {
      const c = central(i); if (!c) continue;
      let half = c.bw / 2;
      const armL = (S[i] || []).filter(k => k !== c && k.cx > c.bmaxx - cell).sort((u, v) => u.minx - v.minx)[0];
      const armR = (S[i] || []).filter(k => k !== c && k.cx < c.bminx + cell).sort((u, v) => v.maxx - u.maxx)[0];
      if (armL && armR) half = Math.min(half, (armL.minx - armR.maxx) / 2 - cell / 2);
      ws.push(half);
    }
    torsoHalf = median(ws);
    if (torsoHalf !== null && (torsoHalf < 0.05 * H || torsoHalf > 0.18 * H)) torsoHalf = null; // armour merged with torso, or not a torso
    if (torsoHalf !== null) {
      shoulderY = tPose ? sliceY(armpitI) + 0.04 * H : sliceY(armpitI) + 0.06 * H;
      if (neckY !== null) shoulderY = Math.min(shoulderY, neckY - 0.01 * H);
    }
  }

  // ---------------- spine (independent of pelvis when the torso itself is visible) ----------------
  const armpitY = armpitI >= 0 ? sliceY(armpitI) : null;
  if (pelvisY !== null && neckY !== null && neckY > pelvisY + 0.15 * H) {
    for (const [id, f] of [['spine_mid', 0.35], ['chest', 0.68]]) {
      const y = pelvisY + (neckY - pelvisY) * f;
      const c = central(idx(frac(y)));
      if (c) put(id, [c.cx, y, c.cz], 'medium', 'Torso centroid at proportional height between pelvis and neck base');
      else nf(id, 'No torso cross-section at estimated height');
    }
  } else if (neckY !== null && armpitY !== null) {
    const cy = armpitY - 0.02 * H, cc = central(idx(frac(cy)));
    if (cc) put('chest', [cc.cx, cy, cc.cz], 'medium', 'Torso centroid just below the armpit line (pelvis unavailable)'); else nf('chest', 'No torso cross-section below the armpit');
    const sy = neckY - 0.30 * H * 0.65, sc = central(idx(frac(sy)));
    if (sc) put('spine_mid', [sc.cx, sy, sc.cz], 'low', 'Pelvis not found — height assumes a 30 %-height torso below the neck; torso centroid at that height'); else nf('spine_mid', 'No torso cross-section at estimated height');
  } else { nf('spine_mid', 'Requires neck base plus pelvis or armpit line'); nf('chest', 'Requires neck base plus pelvis or armpit line'); }

  // ---------------- arms ----------------
  for (const side of ['l', 'r']) {
    const sgn = side === 'l' ? 1 : -1;
    const ids = ['clavicle', 'shoulder', 'elbow', 'wrist', 'hand'].map(k => `${k}_${side}`);
    if (torsoHalf === null) { for (const id of ids) nf(id, armpitI >= 0 ? 'Torso width implausible at the armpit (shoulder armour merged with torso?)' : 'No armpit separation found (arms merged with torso / not humanoid pose)'); continue; }
    const sc = central(idx(frac(shoulderY)));
    const shoulder = [sgn * (torsoHalf + 0.015 * H), shoulderY, sc ? sc.cz : 0];
    put(`shoulder_${side}`, shoulder, tPose ? 'medium' : 'high', tPose ? 'T-pose: torso half-width below the arms + 1.5 % height' : 'Torso half-width at the armpit + 1.5 % height (pauldron silhouette ignored)');
    put(`clavicle_${side}`, [sgn * torsoHalf * 0.35, shoulderY + 0.015 * H, sc ? sc.cz : 0], 'medium', 'Between neck base and shoulder joint');

    // arm points: beyond the torso, above the legs
    const yLo = crotchY !== null ? crotchY + 0.05 * H : rel(0.45);
    const armPts = points.filter(p => !sheetPts.has(p) && sgn * p[0] > torsoHalf + 0.01 * H && p[1] > yLo && p[1] < (out.head_top.position?.y ?? maxY));
    if (armPts.length < 30) { for (const id of ids.slice(2)) nf(id, 'No arm geometry beyond the torso on this side'); continue; }
    const dist = armPts.map(p => Math.hypot(p[0] - shoulder[0], p[1] - shoulder[1], p[2] - shoulder[2]));
    // radial profile along the distance from the shoulder: a sustained thin section (< 1.2 % height for ≥ 5 cm) beyond 30 % height marks
    // a weapon / staff / accessory — the arm is cut there instead of at the silhouette extreme.
    const binW = 0.01 * H, nb = Math.ceil(percentile(dist, 0.995) / binW) + 1;
    const bins = Array.from({ length: nb }, () => []);
    armPts.forEach((p, k) => bins[Math.min(nb - 1, Math.floor(dist[k] / binW))].push(p));
    const radii = bins.map(b => { if (b.length < 3) return null; const c = centroid(b); return Math.sqrt(b.reduce((a, p) => a + (p[0] - c[0]) ** 2 + (p[2] - c[2]) ** 2 + (p[1] - c[1]) ** 2, 0) / b.length); });
    let cut = -1, thin = 0;
    for (let b = Math.floor(0.30 * H / binW); b < nb; b++) {
      if (radii[b] !== null && radii[b] < 0.012 * H) { thin++; if (thin >= 5 && cut < 0) cut = b - 4; } else if (radii[b] !== null) { thin = 0; cut = -1; }
    }
    const L = cut > 0 ? cut * binW : percentile(dist, 0.995);
    const armNote = cut > 0 ? ' · thin accessory beyond the hand ignored' : '';
    const lenOK = L > 0.30 * H && L < 0.58 * H;
    if (!lenOK) { for (const id of ids.slice(2)) nf(id, `Arm length ${(L * 100).toFixed(0)} cm (${(L / H * 100).toFixed(0)} % of height) implausible — weapon/cape/accessory attached?`); continue; }
    // tip = centroid of the last 4 % of the arm; then use only points near the shoulder→tip axis (rejects pauldron / cape volume)
    const tip = centroid(armPts.filter((p, k) => dist[k] >= 0.96 * L && dist[k] <= L));
    if (!tip) { for (const id of ids.slice(2)) nf(id, 'Arm end not found'); continue; }
    const ax = [tip[0] - shoulder[0], tip[1] - shoulder[1], tip[2] - shoulder[2]]; const axLen = Math.hypot(...ax) || 1; const u = ax.map(v => v / axLen);
    const onAxis = armPts.filter((p) => {
      const d = [p[0] - shoulder[0], p[1] - shoulder[1], p[2] - shoulder[2]];
      const t = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
      if (t < 0 || t > L) return false;
      const r = Math.hypot(d[0] - t * u[0], d[1] - t * u[1], d[2] - t * u[2]);
      return r < 0.07 * H;
    });
    const tOf = (p) => (p[0] - shoulder[0]) * u[0] + (p[1] - shoulder[1]) * u[1] + (p[2] - shoulder[2]) * u[2];
    const band = (f0, f1) => centroid(onAxis.filter(p => { const t = tOf(p) / L; return t >= f0 && t <= f1; }));
    const elbow = band(0.38, 0.46), wrist = band(0.72, 0.78);
    if (elbow) put(`elbow_${side}`, elbow, 'medium', 'Arm-axis centroid at 42 % of shoulder→hand length' + armNote); else nf(`elbow_${side}`, 'No arm geometry at elbow distance (gap in mesh?)');
    if (wrist) put(`wrist_${side}`, wrist, 'medium', 'Arm-axis centroid at 75 % of shoulder→hand length (gauntlet centroid)' + armNote); else nf(`wrist_${side}`, 'No arm geometry at wrist distance (gap in mesh?)');
    put(`hand_${side}`, tip, 'medium', 'Arm-axis end (hand tip)' + armNote);
  }
  for (const id of ['thumb_tip_l', 'index_tip_l', 'thumb_tip_r', 'index_tip_r']) nf(id, 'Finger tips are not auto-detected (Phase C)');

  // ---------------- chain-continuity checks: segment lengths vs. height ----------------
  const segCheck = (a, b, seg, victim) => {
    const A = out[a]?.position, B = out[b]?.position; if (!A || !B) return;
    const r = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z) / H;
    if (r >= SEG[seg].min && r <= SEG[seg].max) return;
    const why = `${seg} length ${(r * 100).toFixed(0)} % of height (expected ${(SEG[seg].min * 100).toFixed(0)}–${(SEG[seg].max * 100).toFixed(0)} %)`;
    const extreme = r < 0.5 * SEG[seg].min || r > 1.5 * SEG[seg].max;
    downgrade(victim, extreme ? 'not_found' : 'low', why);
    downgrade(a, 'low', why);
  };
  for (const s of ['l', 'r']) {
    segCheck(`hip_${s}`, `knee_${s}`, 'thigh', `knee_${s}`);
    segCheck(`knee_${s}`, `ankle_${s}`, 'shin', `ankle_${s}`);
    segCheck(`shoulder_${s}`, `elbow_${s}`, 'upperarm', `elbow_${s}`);
    segCheck(`elbow_${s}`, `wrist_${s}`, 'forearm', `wrist_${s}`);
    segCheck(`wrist_${s}`, `hand_${s}`, 'hand', `hand_${s}`);
    // lateral drift along leg chain (a leg does not step 6 % of height sideways between joints)
    for (const [a, b] of [[`hip_${s}`, `knee_${s}`], [`knee_${s}`, `ankle_${s}`]]) { const A = out[a]?.position, B = out[b]?.position; if (A && B && Math.abs(A.x - B.x) > 0.06 * H) downgrade(b, 'low', `${b} drifts ${(Math.abs(A.x - B.x) * 100).toFixed(0)} cm sideways from ${a}`); }
    // vertical order along chains
    const order = [[`shoulder_${s}`, `elbow_${s}`], [`elbow_${s}`, `wrist_${s}`], [`hip_${s}`, `knee_${s}`], [`knee_${s}`, `ankle_${s}`]];
    for (const [hi, lo] of order) { const A = out[hi]?.position, B = out[lo]?.position; if (A && B && B.y > A.y + 0.02 * H) downgrade(lo, 'low', `${lo} above ${hi}`); }
  }

  // ---------------- inside-body check: landmark must sit within a cross-section cluster at its height ----------------
  for (const id of Object.keys(out)) {
    const p = out[id].position; if (!p || /^(heel|toe|hand|shoulder|clavicle)_/.test(id)) continue;
    const i = idx(frac(p.y)); const tol = 0.015 * H;
    const inside = (S[i] || []).some(c => p.x >= c.minx - tol && p.x <= c.maxx + tol && p.z >= c.minz - tol && p.z <= c.maxz + tol);
    if (!inside) downgrade(id, 'low', 'Outside the mesh cross-section at its height');
  }

  // ---------------- L/R consistency ----------------
  for (const id of Object.keys(out)) {
    if (!id.endsWith('_l')) continue;
    const r = id.slice(0, -2) + '_r', a = out[id], b = out[r];
    if (!a?.position || !b?.position) continue;
    const dx = Math.abs(Math.abs(a.position.x) - Math.abs(b.position.x)), dy = Math.abs(a.position.y - b.position.y), dz = Math.abs(a.position.z - b.position.z);
    const mismatch = dx > 0.04 * H || dy > 0.03 * H || dz > 0.04 * H;
    if (mismatch) { downgrade(id, 'low', `L/R mismatch ${(Math.max(dx, dy, dz) * 100).toFixed(1)} cm`); downgrade(r, 'low', `L/R mismatch ${(Math.max(dx, dy, dz) * 100).toFixed(1)} cm`); }
    else if (symmetryAxis === 'x') {
      const ax = (Math.abs(a.position.x) + Math.abs(b.position.x)) / 2, y = (a.position.y + b.position.y) / 2, z = (a.position.z + b.position.z) / 2;
      a.position = { x: ax, y, z }; b.position = { x: -ax, y, z };
    }
  }
  for (const l of Object.values(out)) if (l.position) l.position.x += x0;
  return { landmarks: out, height: H, slices: SLICES, crotchY, armpitI, torsoHalf, tPose, midlineX: x0, tracks: debug ? { seedI, crotchI, l: tracks.l && [...tracks.l.up.entries()].map(([i, c]) => [i, c.merged ? 'M' : c.cloth ? 'C' : 'ok', +c.cx.toFixed(3)]) } : undefined, sections: debug ? S.map((cl, i) => ({ y: sliceY(i), clusters: cl.map(({ pts, ...c }) => c) })) : undefined };
}

/** Body extent in x ignoring thin sheets (capes, banners) that stick out sideways at the front/back z extremes. */
function bodyExtent(pts, cell) {
  const bins = new Map();
  for (const p of pts) { const k = Math.floor(p[2] / cell); const b = bins.get(k); if (b) { b.n++; b.minx = Math.min(b.minx, p[0]); b.maxx = Math.max(b.maxx, p[0]); } else bins.set(k, { n: 1, minx: p[0], maxx: p[0] }); }
  const rows = [...bins.values()].filter(b => b.n >= 3);
  if (rows.length < 3) { let minx = Infinity, maxx = -Infinity; for (const p of pts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); } return { minx, maxx }; }
  const med = median(rows.map(b => b.maxx - b.minx));
  const kept = rows.filter(b => b.maxx - b.minx <= 1.25 * med);
  let minx = Infinity, maxx = -Infinity; for (const b of kept) { minx = Math.min(minx, b.minx); maxx = Math.max(maxx, b.maxx); }
  return { minx, maxx, stripped: rows.length - kept.length };
}
/** Two legs bridged by cloth/armour: most depth bins still show a central x gap → split into left/right sub-clusters. */
function splitLegs(c, cell, H) {
  const bins = new Map();
  for (const p of c.pts) { const k = Math.floor(p[2] / cell); (bins.get(k) || bins.set(k, []).get(k)).push(p); }
  let total = 0, splitN = 0; const L = [], R = [];
  const rows = [...bins.values()].filter(b => b.length >= 5).map(b => { const xs = b.slice().sort((u, v) => u[0] - v[0]); return { xs, width: xs[xs.length - 1][0] - xs[0][0] }; });
  const medW = median(rows.map(r => r.width)) || 0;
  for (const { xs, width } of rows) {
    if (width > 1.25 * medW) continue; // cape / banner bin behind the legs
    total++;
    // the gap nearest the midline; must be a real inter-leg gap (> 2.5 cells) but not a hollow ring interior (≤ 70 % of width)
    let gi = -1, best = Infinity;
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i][0] - xs[i - 1][0], mid = Math.abs((xs[i][0] + xs[i - 1][0]) / 2);
      if (d > 2.5 * cell && d <= 0.7 * width && mid < 0.12 * H && mid < best) { best = mid; gi = i; }
    }
    if (gi < 0) continue;
    splitN++; for (let i = 0; i < xs.length; i++) (i < gi ? R : L).push(xs[i]);
  }
  if (!total || splitN / total < 0.5 || L.length < 5 || R.length < 5) return null;
  const stats = (pts) => { let sx = 0, sz = 0, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity; for (const p of pts) { sx += p[0]; sz += p[2]; minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[2]); maxz = Math.max(maxz, p[2]); } return { n: pts.length, cx: sx / pts.length, cz: sz / pts.length, minx, maxx, minz, maxz, w: maxx - minx, d: maxz - minz, pts }; };
  return { l: stats(L), r: stats(R) };
}
function centroid(pts) {
  if (!pts.length) return null;
  let x = 0, y = 0, z = 0; for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; }
  return [x / pts.length, y / pts.length, z / pts.length];
}
function median(arr) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function percentile(arr, q) { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }
