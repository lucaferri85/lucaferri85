import { useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { quatToEulerDeg } from '../../lib/fbx/fbxSkeletonImporter';

const f = (n, d = 4) => (typeof n === 'number' && isFinite(n) ? n.toFixed(d) : '—');
const vec = (a, d = 4) => (Array.isArray(a) ? a.map(x => f(x, d)).join('  ') : '—');

export default function BoneInspector() {
  const template = useAppStore(s => s.template);
  const name = useAppStore(s => s.selectedBoneName);
  const setSelectedBone = useAppStore(s => s.setSelectedBone);

  const { bone, children, depth } = useMemo(() => {
    const byName = Object.fromEntries((template.bones || []).map(b => [b.name, b]));
    const bone = name ? byName[name] : null;
    if (!bone) return { bone: null, children: [], depth: 0 };
    const children = template.bones.filter(b => b.parent === name).map(b => b.name);
    let depth = 0; let p = bone.parent;
    while (p && byName[p]) { depth++; p = byName[p].parent; }
    return { bone, children, depth };
  }, [template, name]);

  if (!bone) {
    return (
      <div className="px-3 py-2 text-[10px] border-t" style={{ borderColor: 'var(--panel-border)', color: 'var(--text-faint)' }} data-testid="bone-inspector-empty">
        Select a bone to inspect its parent, local and reference transforms.
      </div>
    );
  }

  const localEuler = quatToEulerDeg(bone.refLocal.rot);
  const globalEuler = bone.refGlobalRot ? quatToEulerDeg(bone.refGlobalRot) : null;
  const raw = bone.fbx_raw;

  return (
    <div className="border-t overflow-auto dcc-scroll" style={{ borderColor: 'var(--panel-border)', maxHeight: 300 }} data-testid="bone-inspector">
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[12px]" style={{ color: 'var(--dcc-orange-glow)' }} data-testid="bone-inspector-name">{bone.name}</span>
          <span className="dcc-label text-[9px]">{bone.kind}{bone.kind_inferred !== false ? ' (inferred)' : ''}</span>
        </div>
        <KV k="Parent" v={bone.parent ? <button className="font-mono underline" onClick={() => setSelectedBone(bone.parent)} data-testid="bone-inspector-parent">{bone.parent}</button> : <span className="font-mono">— (root)</span>} />
        <KV k="Children" v={children.length ? children.join(', ') : 'none'} mono />
        <KV k="Depth" v={String(depth)} mono />
        <KV k="Skinned" v={bone.skinned ? `yes${bone.skin_vertex_count ? ` · ${bone.skin_vertex_count} verts` : ''}` : 'no'} mono />
        {bone.fbx_attr_type && <KV k="FBX node type" v={`${bone.fbx_attr_type} · id ${bone.fbx_node_id}`} mono />}

        <Group title="Local (internal · m · Y-up)">
          <KV k="pos" v={vec(bone.refLocal.pos)} mono />
          <KV k="rot quat" v={vec(bone.refLocal.rot)} mono />
          <KV k="rot euler°" v={vec(localEuler, 2)} mono />
          <KV k="scale" v={vec(bone.refLocal.scale, 3)} mono />
        </Group>
        <Group title="Reference / global (internal)">
          <KV k="pos" v={vec(bone.refGlobal)} mono />
          {globalEuler && <KV k="rot euler°" v={vec(globalEuler, 2)} mono />}
          {bone.bind_pose_global_pos && <KV k="bind pose pos" v={vec(bone.bind_pose_global_pos)} mono />}
          {typeof bone.bind_pose_deviation_m === 'number' && <KV k="bind Δ" v={`${(bone.bind_pose_deviation_m * 1000).toFixed(3)} mm`} mono />}
        </Group>
        {raw && (
          <Group title="Verbatim FBX node values (file units)">
            <KV k="Lcl Translation" v={vec(raw.lcl_translation, 3)} mono />
            <KV k="Lcl Rotation°" v={vec(raw.lcl_rotation_deg, 3)} mono />
            <KV k="PreRotation°" v={raw.pre_rotation_deg ? vec(raw.pre_rotation_deg, 3) : 'none'} mono />
            <KV k="PostRotation°" v={raw.post_rotation_deg ? vec(raw.post_rotation_deg, 3) : 'none'} mono />
            <KV k="Lcl Scaling" v={vec(raw.lcl_scaling, 3)} mono />
            <KV k="Rotation order" v={raw.rotation_order} mono />
          </Group>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div className="rounded p-2 space-y-1" style={{ background: 'var(--panel-bg-raised)' }}>
      <div className="dcc-label text-[9px]">{title}</div>
      {children}
    </div>
  );
}

function KV({ k, v, mono }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="dcc-label shrink-0">{k}</span>
      <span className={`text-[10px] text-right break-all ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-high)' }}>{v}</span>
    </div>
  );
}
