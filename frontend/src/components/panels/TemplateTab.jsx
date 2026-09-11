import { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import TemplateBadge, { ValidationPill } from './TemplateBadge';
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';

export default function TemplateTab() {
  const template = useAppStore(s => s.template);
  const templateSource = useAppStore(s => s.templateSource);
  const validation = useAppStore(s => s.templateValidation);
  const prov = template.provenance || {};
  const diag = template.diagnostics || null;

  return (
    <div className="h-full overflow-auto dcc-scroll p-3 space-y-3" data-testid="template-tab">
      <TemplateBadge source={templateSource} />

      <Block title="Provenance" testId="template-provenance-block">
        <KV k="Template name" v={template.name} />
        <KV k="Source" v={templateSource} />
        <KV k="Origin format" v={prov.origin_format || '—'} />
        <KV k="Origin file" v={prov.origin_filename || '—'} />
        <KV k="FBX version" v={prov.fbx_version ? String(prov.fbx_version) : '—'} />
        <KV k="Creator" v={prov.creator || '—'} />
        <KV k="File created" v={prov.creation_timestamp || '—'} />
        <KV k="Imported" v={prov.imported_at ? new Date(prov.imported_at).toLocaleString() : '—'} />
        <KV k="SHA-256" v={prov.sha256 ? prov.sha256.slice(0, 16) + '…' : '—'} title={prov.sha256} />
        {prov.note && <div className="text-[10px] mt-1" style={{ color: 'var(--dcc-gold)' }}>{prov.note}</div>}
      </Block>

      <Block title="Units & Orientation" testId="template-units-block">
        <KV k="File units" v={prov.file_units ? `${prov.file_units} (UnitScaleFactor ${prov.unit_scale_factor})` : 'n/a (authored in metres)'} />
        <KV k="File up axis" v={prov.up_axis || '+Y (authored)'} />
        <KV k="File front axis" v={prov.front_axis || '—'} />
        <KV k="File coord axis" v={prov.coord_axis || '—'} />
        <KV k="Handedness" v={prov.handedness || 'right-handed'} />
        <KV k="Conversion applied" v={prov.conversion_applied || 'none'} />
        <KV k="Internal storage" v="metres · Y-up · right-handed (Three.js)" />
        <KV k="UE5 target" v="centimetres · Z-up · left-handed (converted at export only)" />
      </Block>

      <Block title="Skeleton Summary" testId="template-summary-block">
        <KV k="Bone count" v={String(template.bones?.length || 0)} testId="template-diag-bone-count" />
        <KV k="Root bone(s)" v={(diag?.root_bones || template.bones?.filter(b => !b.parent).map(b => b.name) || []).join(', ') || '—'} testId="template-diag-root" />
        <KV k="Max depth" v={diag ? String(diag.max_depth) : String(maxDepth(template.bones))} />
        <KV k="Skinned bones" v={diag ? `${diag.skinned_bone_count} skinned · ${diag.non_skinned_bone_count} non-skinned` : countSkinned(template.bones)} />
        <KV k="Kinds (inferred)" v={Object.entries(diag?.kind_counts || countKinds(template.bones)).map(([k, v]) => `${k}:${v}`).join('  ')} />
        <KV k="Skeleton height" v={diag ? `${diag.skeleton_height_m.toFixed(3)} m` : `${height(template.bones).toFixed(3)} m`} />
        {diag && <KV k="Bind-pose Δ max" v={`${diag.bind_pose_max_deviation_mm.toFixed(3)} mm`} />}
        {diag?.mesh_nodes?.length > 0 && <KV k="Mesh nodes in FBX" v={diag.mesh_nodes.join(', ')} />}
      </Block>

      {diag && (
        <Block title={`Parser Report · ${diag.errors.length} errors · ${diag.warnings.length} warnings`} testId="template-parser-report">
          {diag.errors.map((e, i) => <Line key={'e' + i} icon={XCircle} color="var(--destructive)" text={e} />)}
          {diag.warnings.map((w, i) => <Line key={'w' + i} icon={AlertTriangle} color="var(--dcc-gold)" text={w} />)}
          {diag.info.map((n, i) => <Line key={'i' + i} icon={Info} color="var(--dcc-cyan)" text={n} />)}
          {!diag.errors.length && !diag.warnings.length && <Line icon={CheckCircle2} color="var(--dcc-emerald)" text="No parser errors or warnings. All nodes read verbatim." />}
        </Block>
      )}

      <Block title="Validate Template Structure" right={<ValidationPill validation={validation} />} testId="template-validation-block">
        {!validation && <div className="text-[11px]" style={{ color: 'var(--text-mid)' }}>Not run yet. Click VALIDATE TEMPLATE STRUCTURE in the left panel.</div>}
        {validation?.checks?.map(c => <CheckRow key={c.id} check={c} />)}
        {validation && <div className="dcc-label text-[9px] mt-1">Checked {new Date(validation.checked_at).toLocaleString()}</div>}
      </Block>

      <Block title="How to export the authoritative Quinn FBX" collapsed testId="template-export-guide">
        <ol className="text-[11px] space-y-1.5 list-decimal pl-4" style={{ color: 'var(--text-mid)' }}>
          <li>In UE5 open <span className="font-mono">Content/Characters/Mannequins/Meshes/</span> and select <span className="font-mono text-[color:var(--text-high)]">SKM_Quinn</span> (the full skeletal mesh, not SKM_Quinn_Simple unless you target the simple skeleton).</li>
          <li>Right-click → <b>Asset Actions → Export…</b> → choose <span className="font-mono">.fbx</span>.</li>
          <li>Export options: FBX 2020 (binary), Level of Detail OFF, Collision OFF, Morph Targets OFF, Vertex Color OFF, Preview Mesh OFF, Force Front X Axis OFF, Map Skeletal Motion to Root OFF.</li>
          <li>Drop the resulting FBX on <b>IMPORT QUINN FBX</b>. Bones, hierarchy and reference transforms are read verbatim — nothing is reconstructed.</li>
          <li>Run <b>VALIDATE TEMPLATE STRUCTURE</b>, inspect bones in the Quinn Bones tab, then <b>EXPORT</b> the JSON cache for reuse.</li>
        </ol>
        <div className="text-[10px] mt-2" style={{ color: 'var(--text-faint)' }}>A repeatable UE5 Python export script is provided in <span className="font-mono">docs/ue5_export_quinn_skeleton.py</span>.</div>
      </Block>
    </div>
  );
}

function Block({ title, right, children, collapsed = false, testId }) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <div className="dcc-panel-surface rounded" data-testid={testId}>
      <button className="w-full flex items-center justify-between px-2.5 py-2" onClick={() => setOpen(o => !o)}>
        <span className="flex items-center gap-1.5 dcc-heading text-[11px]">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{title}
        </span>
        {right}
      </button>
      {open && <div className="px-2.5 pb-2.5 space-y-1">{children}</div>}
    </div>
  );
}

function KV({ k, v, title, testId }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="dcc-label shrink-0">{k}</span>
      <span className="dcc-metric text-right break-all" title={title || v} data-testid={testId}>{v}</span>
    </div>
  );
}

function Line({ icon: Icon, color, text }) {
  return (
    <div className="flex items-start gap-1.5 text-[11px] leading-snug">
      <Icon className="w-3 h-3 shrink-0 mt-0.5" style={{ color }} />
      <span style={{ color: 'var(--text-mid)' }}>{text}</span>
    </div>
  );
}

function CheckRow({ check }) {
  const [open, setOpen] = useState(false);
  const cfg = {
    pass: [CheckCircle2, 'var(--dcc-emerald)', 'PASS'],
    warn: [AlertTriangle, 'var(--dcc-gold)', 'WARN'],
    fail: [XCircle, 'var(--destructive)', 'FAIL'],
    info: [Info, 'var(--dcc-cyan)', 'INFO'],
  }[check.status] || [Info, 'var(--text-faint)', '—'];
  const [Icon, color, label] = cfg;
  const hasItems = check.items && check.items.length > 0;
  return (
    <div className="rounded px-2 py-1.5" style={{ background: 'var(--panel-bg-raised)' }} data-testid={`validation-check-${check.id}`} data-status={check.status}>
      <button className="w-full flex items-center gap-2 text-left" onClick={() => hasItems && setOpen(o => !o)}>
        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
        <span className="text-[11px] flex-1 font-medium">{check.label}</span>
        <span className="font-mono text-[9px]" style={{ color }}>{label}</span>
      </button>
      <div className="text-[10px] mt-0.5 pl-5" style={{ color: 'var(--text-mid)' }}>{check.detail}{hasItems && <span className="ml-1 underline cursor-pointer" onClick={() => setOpen(o => !o)}>{open ? 'hide' : `show ${check.items.length}`}</span>}</div>
      {open && hasItems && (
        <ul className="mt-1 pl-5 font-mono text-[10px] space-y-0.5 max-h-40 overflow-auto dcc-scroll" style={{ color: 'var(--text-high)' }}>
          {check.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
    </div>
  );
}

function maxDepth(bones = []) {
  const d = new Map(); let m = 0;
  for (const b of bones) { const v = b.parent ? (d.get(b.parent) || 0) + 1 : 0; d.set(b.name, v); if (v > m) m = v; }
  return m;
}
function countSkinned(bones = []) { const s = bones.filter(b => b.skinned).length; return `${s} skinned · ${bones.length - s} non-skinned (inferred)`; }
function countKinds(bones = []) { const o = {}; for (const b of bones) o[b.kind || 'deform'] = (o[b.kind || 'deform'] || 0) + 1; return o; }
function height(bones = []) { let lo = Infinity, hi = -Infinity; for (const b of bones) { lo = Math.min(lo, b.refGlobal[1]); hi = Math.max(hi, b.refGlobal[1]); } return bones.length ? hi - lo : 0; }
