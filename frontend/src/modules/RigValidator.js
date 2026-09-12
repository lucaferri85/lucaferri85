/**
 * RigValidator — COMPARE WITH SOURCE TEMPLATE.
 * Bone-for-bone parity check between a fitted skeleton and the authoritative
 * template: count, name set, order, parent map, kind, root, depth, plus
 * transform sanity. Pure function, never mutates inputs.
 */
export class RigValidator {
  compareWithSource(fitted, template) {
    const checks = [];
    const add = (id, label, status, detail, items = []) => checks.push({ id, label, status, detail, items: items.slice(0, 300) });
    const tBones = template.bones, fBones = fitted?.bones || [];
    const tNames = tBones.map(b => b.name), fNames = fBones.map(b => b.name);
    const tSet = new Set(tNames), fSet = new Set(fNames);

    add('count', 'Bone count', fBones.length === tBones.length ? 'pass' : 'fail', `${fBones.length} fitted vs ${tBones.length} template`);

    const missing = tNames.filter(n => !fSet.has(n)), extra = fNames.filter(n => !tSet.has(n));
    add('names_missing', 'Missing bones (in template, not in fitted)', missing.length ? 'fail' : 'pass', missing.length ? `${missing.length} bone(s) missing from fitted rig` : 'None — all template bone names present', missing);
    add('names_extra', 'Extra bones (in fitted, not in template)', extra.length ? 'fail' : 'pass', extra.length ? `${extra.length} bone(s) not in template` : 'None — no invented bones', extra);
    const renamed = [];
    if (tNames.length === fNames.length) tNames.forEach((n, i) => { if (fNames[i] !== n && !tSet.has(fNames[i]) && !fSet.has(n)) renamed.push(`index ${i}: '${n}' → '${fNames[i]}'`); });
    add('names_renamed', 'Renamed bones (same slot, different name)', renamed.length ? 'fail' : 'pass', renamed.length ? `${renamed.length} bone(s) appear renamed` : 'None', renamed);
    const dupes = fNames.filter((n, i) => fNames.indexOf(n) !== i);
    add('names_unique', 'Fitted bone names unique', dupes.length ? 'fail' : 'pass', dupes.length ? `${dupes.length} duplicate(s)` : 'No duplicates', dupes);

    const orderOk = tNames.length === fNames.length && tNames.every((n, i) => fNames[i] === n);
    add('order', 'Bone order preserved', orderOk ? 'pass' : 'warn', orderOk ? 'Identical order' : 'Order differs from template (names/parents may still match)');

    const fBy = Object.fromEntries(fBones.map(b => [b.name, b]));
    const parentMismatch = tBones.filter(b => fBy[b.name] && (fBy[b.name].parent || null) !== (b.parent || null))
      .map(b => `${b.name}: template parent ${b.parent || '—'} ≠ fitted ${fBy[b.name].parent || '—'}`);
    add('parents', 'Parent mismatches', parentMismatch.length ? 'fail' : 'pass', parentMismatch.length ? `${parentMismatch.length} re-parented bone(s)` : 'None — every bone keeps its template parent', parentMismatch);

    const childSet = (bones) => { const m = {}; for (const b of bones) { if (b.parent) (m[b.parent] = m[b.parent] || []).push(b.name); } return m; };
    const tc = childSet(tBones), fc = childSet(fBones);
    const hierMismatch = tNames.filter(n => (tc[n] || []).slice().sort().join(',') !== (fc[n] || []).slice().sort().join(','))
      .map(n => `${n}: template children [${(tc[n] || []).join(', ')}] ≠ fitted [${(fc[n] || []).join(', ')}]`);
    add('hierarchy', 'Hierarchy mismatches (children sets)', hierMismatch.length ? 'fail' : 'pass', hierMismatch.length ? `${hierMismatch.length} bone(s) with different child sets` : 'None — identical sub-hierarchies', hierMismatch);

    const kindMismatch = tBones.filter(b => fBy[b.name] && fBy[b.name].kind !== b.kind).map(b => `${b.name}: ${b.kind} → ${fBy[b.name].kind}`);
    add('kinds', 'Bone classification preserved', kindMismatch.length ? 'warn' : 'pass', kindMismatch.length ? `${kindMismatch.length} changed` : 'Unchanged', kindMismatch);

    const tRoots = tBones.filter(b => !b.parent).map(b => b.name), fRoots = fBones.filter(b => !b.parent).map(b => b.name);
    add('root', 'Root bone identical', tRoots.join() === fRoots.join() ? 'pass' : 'fail', `template ${tRoots.join(',') || '—'} · fitted ${fRoots.join(',') || '—'}`);

    const depth = (bones) => { const d = {}; let m = 0; for (const b of bones) { d[b.name] = b.parent ? (d[b.parent] || 0) + 1 : 0; m = Math.max(m, d[b.name]); } return { d, m }; };
    const td = depth(tBones), fd = depth(fBones);
    const depthMismatch = tNames.filter(n => fBy[n] && td.d[n] !== fd.d[n]);
    add('depth', 'Hierarchy depth per bone identical', depthMismatch.length ? 'fail' : 'pass', `max depth ${td.m} vs ${fd.m}`, depthMismatch);

    const nonFinite = fBones.filter(b => !b.globalPos?.every(Number.isFinite) || !b.localRot?.every(Number.isFinite)).map(b => b.name);
    add('finite', 'All fitted transforms finite', nonFinite.length ? 'fail' : 'pass', nonFinite.length ? `${nonFinite.length} bone(s) invalid` : 'OK', nonFinite);

    const collapsed = fBones.filter(b => b.lengthRatio !== null && b.lengthRatio !== undefined && b.lengthRatio < 0.05).map(b => `${b.name} (${(b.lengthRatio * 100).toFixed(1)}% of template length)`);
    add('collapsed', 'No collapsed bones', collapsed.length ? 'warn' : 'pass', collapsed.length ? `${collapsed.length} bone(s) nearly zero length` : 'None', collapsed);

    const outliers = fBones.filter(b => b.lengthRatio && (b.lengthRatio > 3 || b.lengthRatio < 0.33)).map(b => `${b.name} ${b.lengthRatio.toFixed(2)}×`);
    add('length_ratio', 'Bone lengths within 0.33–3× of template', outliers.length ? 'warn' : 'pass', outliers.length ? `${outliers.length} outlier(s)` : 'All within range', outliers);

    const unreliable = fBones.filter(b => b.status === 'warn' || b.status === 'error').map(b => `${b.name}: ${b.message}`);
    add('fit_diagnostics', 'No unresolved fit diagnostics', fBones.some(b => b.status === 'error') ? 'fail' : unreliable.length ? 'warn' : 'pass',
      unreliable.length ? `${unreliable.length} bone(s) flagged by the fitter` : 'All bones fitted without warnings', unreliable);

    const shaMatch = !fitted?.report?.template_sha256 || !template.provenance?.sha256 || fitted.report.template_sha256 === template.provenance.sha256;
    add('provenance', 'Fitted against the currently loaded template', shaMatch ? 'pass' : 'fail', shaMatch ? 'Template SHA-256 matches' : 'Fit was produced from a different template — re-run Auto Fit');

    const statuses = checks.map(c => c.status);
    const overall = statuses.includes('fail') ? 'fail' : statuses.includes('warn') ? 'warning' : 'pass';
    return { overall, checks, compared_at: new Date().toISOString(), bone_count: fBones.length, template_bone_count: tBones.length };
  }
}
