import { useMemo, useState, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Search, ChevronRight, ChevronDown } from 'lucide-react';
import { buildBoneTree } from '../../lib/quinnTemplate';
import TemplateBadge from './TemplateBadge';
import BoneInspector from './BoneInspector';

/**
 * Flatten a bone tree into a linear list.  We render iteratively (map)
 * to avoid recursive JSX which the emergentbase visual-edits Babel
 * plugin cannot handle.
 */
function flatten(nodes, depth, expanded, out) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    out.push({ node: n, depth });
    if (n.children.length && expanded[n.name] !== false) {
      flatten(n.children, depth + 1, expanded, out);
    }
  }
  return out;
}

function collectDescendantMatches(nodes, q) {
  const set = new Set();
  const walk = (arr, ancestors) => {
    for (const n of arr) {
      const isMatch = n.name.toLowerCase().includes(q);
      if (isMatch) {
        set.add(n.name);
        for (const a of ancestors) set.add(a);
      }
      walk(n.children, isMatch ? [...ancestors, n.name] : [...ancestors, n.name]);
    }
  };
  walk(nodes, []);
  return set;
}

export default function BonesTab() {
  const template = useAppStore(s => s.template);
  const templateSource = useAppStore(s => s.templateSource);
  const showSkeleton = useAppStore(s => s.showSkeleton);
  const toggleSkeleton = useAppStore(s => s.toggleSkeleton);
  const showBoneAxes = useAppStore(s => s.showBoneAxes);
  const toggleBoneAxes = useAppStore(s => s.toggleBoneAxes);
  const setSelectedBone = useAppStore(s => s.setSelectedBone);
  const selectedBoneName = useAppStore(s => s.selectedBoneName);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({}); // name -> false (collapsed) OR true (default expanded)

  const tree = useMemo(() => buildBoneTree(template), [template]);

  const q = search.toLowerCase();
  const matchSet = useMemo(() => q ? collectDescendantMatches(tree, q) : null, [tree, q]);

  const flat = useMemo(() => {
    // When searching, force-expand nodes with descendant matches
    const eff = q ? { ...expanded } : expanded;
    if (q) for (const name of matchSet) eff[name] = true;
    return flatten(tree, 0, eff, []);
  }, [tree, expanded, q, matchSet]);

  const visibleFlat = useMemo(() => {
    if (!q) return flat;
    return flat.filter(it => matchSet.has(it.node.name));
  }, [flat, q, matchSet]);

  const toggle = useCallback((name) => {
    setExpanded(prev => ({ ...prev, [name]: prev[name] === false }));
  }, []);

  const filteredCount = q
    ? template.bones.filter(b => b.name.toLowerCase().includes(q)).length
    : template.bones.length;

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2.5 border-b space-y-2" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="dcc-label truncate" title={template.name}>{template.name || 'Skeleton'}</span>
          <span className="dcc-metric shrink-0" data-testid="bones-tab-count">{template.bones?.length || 0} bones</span>
        </div>
        <TemplateBadge source={templateSource} compact />
        <div className="grid grid-cols-2 gap-2">
          <Button
            data-testid="viewport-skeleton-toggle"
            size="sm"
            onClick={toggleSkeleton}
            className="h-7 text-[11px] text-white"
            style={{ background: showSkeleton ? 'var(--dcc-orange)' : 'var(--panel-bg-raised)' }}
          >
            {showSkeleton ? 'HIDE SKELETON' : 'SHOW SKELETON'}
          </Button>
          <Button
            data-testid="viewport-bone-axes-toggle"
            size="sm"
            onClick={toggleBoneAxes}
            className="h-7 text-[11px] text-white"
            style={{ background: showBoneAxes ? 'var(--dcc-orange)' : 'var(--panel-bg-raised)' }}
          >
            {showBoneAxes ? 'HIDE BONE AXES' : 'SHOW BONE AXES'}
          </Button>
        </div>
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
          <Input
            data-testid="skeleton-tree-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bones..."
            className="h-7 pl-7 text-xs bg-[color:var(--panel-bg-surface)] border-[color:var(--panel-border)] font-mono"
          />
        </div>
        {q && (
          <div className="dcc-label text-[9px]">{filteredCount} matches</div>
        )}
      </div>
      <div className="flex-1 overflow-auto dcc-scroll py-1" data-testid="bone-tree-list">
        {visibleFlat.map(item => (
          <BoneRow
            key={item.node.name}
            node={item.node}
            depth={item.depth}
            expanded={expanded[item.node.name] !== false}
            isSelected={selectedBoneName === item.node.name}
            isMatch={q ? item.node.name.toLowerCase().includes(q) : false}
            onSelect={setSelectedBone}
            onToggle={toggle}
          />
        ))}
      </div>
      <BoneInspector />
    </div>
  );
}

function BoneRow(props) {
  const { node, depth, expanded, isSelected, isMatch, onSelect, onToggle } = props;
  const hasChildren = node.children && node.children.length > 0;
  const kindColor = colorForKind(node.kind);
  const paddingLeft = 8 + depth * 12;

  let bg = 'transparent';
  if (isSelected) bg = 'rgba(234, 88, 12, 0.14)';
  else if (isMatch) bg = 'rgba(234,88,12,0.08)';

  const handleClick = () => {
    onSelect(node.name);
    if (hasChildren) onToggle(node.name);
  };

  const nameColor = isSelected ? 'var(--dcc-orange-glow)' : 'var(--text-high)';

  return (
    <button
      data-testid={'bone-node-' + node.name}
      onClick={handleClick}
      className="w-full flex items-center gap-1.5 py-0.5 pr-3 text-left hover:bg-[color:var(--panel-bg-surface)]"
      style={{ paddingLeft, background: bg }}
    >
      <span className="w-3 h-3 shrink-0 flex items-center justify-center">
        {hasChildren ? (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : null}
      </span>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: kindColor }} />
      <span className="font-mono text-[11px] truncate" style={{ color: nameColor }}>
        {node.name}
      </span>
      {node.kind !== 'deform' && (
        <span className="dcc-label text-[9px] ml-auto" style={{ color: kindColor }}>{node.kind}</span>
      )}
    </button>
  );
}

function colorForKind(kind) {
  if (kind === 'twist') return 'var(--dcc-purple)';
  if (kind === 'ik')    return 'var(--dcc-cyan)';
  if (kind === 'root')  return 'var(--dcc-orange-glow)';
  if (kind === 'corrective') return 'var(--dcc-gold)';
  if (kind === 'aux')   return 'var(--text-mid)';
  return 'var(--dcc-emerald)';
}
