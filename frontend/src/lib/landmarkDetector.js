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
  const clustersOf = (pts) => {
    if (!pts.length) return [];
    const s = pts.slice().sort((a, b) => a[0] - b[0]);
    // adaptive split distance: low-poly rings have coarse x spacing, never split a ring into slivers
    const diffs = []; for (let i = 1; i < s.length; i++) diffs.push(s[i][0] - s[i - 1][0]);
    const g = Math.max(gap, 3 * (median(diffs) || 0));
    const cl = []; let cur = [s[0]];
    for (let i = 1; i < s.length; i++) { if (s[i][0] - s[i - 1][0] > g) { cl.push(cur); cur = []; } cur.push(s[i]); }
    cl.push(cur);
    return cl.filter(c => c.length >= 3).map(c => {
      let sx = 0, sz = 0, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
      for (const p of c) { sx += p[0]; sz += p[2]; minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); minz = Math.min(minz, p[2]); maxz = Math.max(maxz, p[2]); }
      return { n: c.length, cx: sx / c.length, cz: sz / c.length, minx, maxx, minz, maxz, w: maxx - minx, d: maxz - minz, pts: c };
    });
  };
  const S = slices.map(clustersOf);
  const central = (i) => { let best = null; for (const c of S[i] || []) if (!best || Math.abs(c.cx) < Math.abs(best.cx)) best = c; return best; };
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

  // ---------------- crotch: lowest run of slices (30–60 %) where the centre splits into two leg clusters ----------------
  let crotchI = -1, run = 0;
  for (let i = idx(0.30); i <= idx(0.60); i++) {
    const legs = S[i].filter(c => Math.abs(c.cx) < 0.15 * H);
    const twoSides = legs.some(c => c.cx < -0.02 * H) && legs.some(c => c.cx > 0.02 * H) && !legs.some(c => Math.abs(c.cx) < 0.02 * H);
    if (twoSides) { run++; if (run >= 3) crotchI = i; } else if (crotchI >= 0) break; else run = 0;
  }
  const crotchY = crotchI >= 0 ? sliceY(crotchI) : null;
  let pelvisY = null;
  if (crotchY !== null) {
    pelvisY = crotchY + 0.055 * H;
    const pc = central(idx(frac(pelvisY)));
    const lowSplit = frac(crotchY) < 0.42;
    if (pc) put('pelvis', [pc.cx, pelvisY, pc.cz], lowSplit ? 'low' : 'high', lowSplit ? 'Leg split found unusually low (thighs touching / armour skirt?) — pelvis height may be underestimated, verify' : 'Torso centroid 5.5 % height above detected crotch split');
    else nf('pelvis', 'No torso cross-section above crotch');
  } else nf('pelvis', 'No leg split found between 30–60 % height (skirt / robe / merged legs?) — place manually');

  // ---------------- spine ----------------
  if (pelvisY !== null && neckY !== null && neckY > pelvisY + 0.15 * H) {
    for (const [id, f] of [['spine_mid', 0.35], ['chest', 0.68]]) {
      const y = pelvisY + (neckY - pelvisY) * f;
      const c = central(idx(frac(y)));
      if (c) put(id, [c.cx, y, c.cz], 'medium', 'Torso centroid at proportional height between pelvis and neck base');
      else nf(id, 'No torso cross-section at estimated height');
    }
  } else { nf('spine_mid', 'Requires pelvis and neck base'); nf('chest', 'Requires pelvis and neck base'); }

  // ---------------- legs: follow each leg cluster downward from the crotch (chain continuity) ----------------
  const legSign = { l: 1, r: -1 }; // +x = character left
  for (const side of ['l', 'r']) {
    const sgn = legSign[side];
    if (crotchI < 0) { for (const id of ['hip', 'knee', 'ankle', 'heel', 'toe']) nf(`${id}_${side}`, 'Legs not separated — no crotch split'); continue; }
    // hip: leg cluster just below crotch on this side
    let hipC = null;
    for (let i = crotchI - 1; i >= crotchI - 4 && i >= 0; i--) {
      const c = S[i].filter(k => sgn * k.cx > 0.02 * H && sgn * k.cx < 0.15 * H).sort((a, b) => b.n - a.n)[0];
      if (c) { hipC = c; break; }
    }
    if (!hipC) { for (const id of ['hip', 'knee', 'ankle', 'heel', 'toe']) nf(`${id}_${side}`, 'No leg cluster below the crotch on this side'); continue; }
    const hipConf = frac(crotchY) < 0.42 ? 'low' : 'high';
    const hipNote = hipConf === 'low' ? 'Leg split found unusually low (thighs touching / armour skirt?) — hip height may be underestimated · ' : '';
    put(`hip_${side}`, [hipC.cx, pelvisY - 0.015 * H, hipC.cz], hipConf, hipNote + 'Thigh cross-section centroid just below the crotch, raised to hip-joint height');

    // walk down the leg tracking x (rejects hanging hands / weapons beside the leg). When the two legs merge
    // (touching boots / greaves) use only this side's half of the merged cluster and flag it.
    const track = []; let x = hipC.cx; const legW = hipC.w;
    for (let i = crotchI - 1; i >= 0; i--) {
      const c = nearestCluster(i, x, 0.06 * H);
      if (!c) { track.push(null); continue; }
      if (c.w > 1.8 * legW && c.minx < -0.005 * H && c.maxx > 0.005 * H) {
        const half = c.pts.filter(p => sgn * p[0] > 0.005 * H);
        const hc = centroid(half);
        if (!hc) { track.push(null); continue; }
        x = hc[0]; track.push({ i, cx: hc[0], cz: hc[2], w: legW, merged: true });
        continue;
      }
      x = c.cx; track.push({ ...c, i });
    }
    const at = (i) => track[crotchI - 1 - i] || null;
    const mergedNote = (c) => c.merged ? 'Legs merged at this height (boots/greaves touching) — side-half centroid, verify · ' : '';
    const mergedConf = (c, base) => c.merged ? 'low' : base;
    // knee: narrowest tracked cross-section in 22–36 % if it is a clear minimum, else proportional along the tracked leg
    let knee = null, widths = [];
    for (let i = idx(0.22); i <= idx(0.36); i++) { const c = at(i); if (c && !c.merged) { widths.push(c.w); if (!knee || c.w < knee.w) knee = c; } }
    const medW = median(widths);
    if (knee && medW && knee.w < 0.92 * medW) put(`knee_${side}`, [knee.cx, sliceY(knee.i), knee.cz], 'medium', 'Narrowest tracked leg cross-section (22–36 % height)');
    else {
      const c = at(idx(0.285));
      if (c) put(`knee_${side}`, [c.cx, sliceY(c.i), c.cz], mergedConf(c, 'medium'), mergedNote(c) + 'Tracked leg centroid at 28.5 % height (no clear narrowing — knee armour?)');
      else nf(`knee_${side}`, 'Leg cluster lost above the knee (geometry gap or leg merged with accessory)');
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
        const zs = footPts.map(p => p[2]).sort((a, b) => a - b);
        const zBack = zs[Math.floor(zs.length * 0.02)], zFront = zs[Math.floor(zs.length * 0.98)];
        const footLen = zFront - zBack;
        const ok = footLen > 0.08 * H && footLen < 0.22 * H;
        put(`heel_${side}`, [ankle.x, rel(0.03), zBack + 0.01 * H], ok ? 'medium' : 'low', ok ? 'Rear of foot silhouette' : `Foot length ${(footLen * 100).toFixed(0)} cm implausible (boot/armour?)`);
        put(`toe_${side}`, [ankle.x, rel(0.02), zFront - 0.04 * H], ok ? 'medium' : 'low', ok ? 'Ball ≈ 4 % height behind toe tip' : `Foot length ${(footLen * 100).toFixed(0)} cm implausible (boot/armour?)`);
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
    const adj = (c) => (c.minx > t.maxx && c.minx - t.maxx < 0.12 * H) || (c.maxx < t.minx && t.minx - c.maxx < 0.12 * H);
    const hasL = S[i].some(c => c.minx > t.maxx && adj(c)), hasR = S[i].some(c => c.maxx < t.minx && adj(c));
    if (!hasL || !hasR) continue;
    const below = []; for (let j = i - 1; j >= Math.max(0, i - idx(0.12)); j--) { const c = central(j); if (c) below.push(c.w); }
    const mb = median(below), maxb = below.length ? Math.max(...below) : 0;
    if (mb && t.w > 1.15 * mb) continue; // still inside the shoulder / pauldron bulge
    if (maxb && t.w < 0.75 * maxb) continue; // detached pauldron / collar beside the neck, not an arm leaving the chest
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
    const ws = []; for (let i = armpitI; i >= Math.max(0, armpitI - idx(0.06)); i--) { const c = central(i); if (c) ws.push(c.w / 2); }
    torsoHalf = median(ws);
    if (torsoHalf !== null && (torsoHalf < 0.05 * H || torsoHalf > 0.18 * H)) torsoHalf = null; // armour merged with torso, or not a torso
    if (torsoHalf !== null) {
      shoulderY = tPose ? sliceY(armpitI) + 0.04 * H : sliceY(armpitI) + 0.06 * H;
      if (neckY !== null) shoulderY = Math.min(shoulderY, neckY - 0.01 * H);
    }
  }

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
    const armPts = points.filter(p => sgn * p[0] > torsoHalf + 0.01 * H && p[1] > yLo && p[1] < (out.head_top.position?.y ?? maxY));
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
  return { landmarks: out, height: H, slices: SLICES, crotchY, armpitI, torsoHalf, tPose, midlineX: x0, sections: debug ? S.map((cl, i) => ({ y: sliceY(i), clusters: cl.map(({ pts, ...c }) => c) })) : undefined };
}

function centroid(pts) {
  if (!pts.length) return null;
  let x = 0, y = 0, z = 0; for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; }
  return [x / pts.length, y / pts.length, z / pts.length];
}
function median(arr) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function percentile(arr, q) { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }
