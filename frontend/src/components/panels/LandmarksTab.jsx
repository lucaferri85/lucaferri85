import { useMemo, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { LANDMARK_GROUPS } from '../../lib/landmarks';
import { Target, RotateCcw, FlipHorizontal2, ChevronRight, ChevronDown, X } from 'lucide-react';
import { toast } from 'sonner';

export default function LandmarksTab() {
  const landmarks = useAppStore(s => s.landmarks);
  const activeLandmarkId = useAppStore(s => s.activeLandmarkId);
  const setActiveLandmark = useAppStore(s => s.setActiveLandmark);
  const cancelPlacing = useAppStore(s => s.cancelPlacing);
  const placingMode = useAppStore(s => s.placingMode);
  const clearLandmark = useAppStore(s => s.clearLandmark);
  const resetAll = useAppStore(s => s.resetAllLandmarks);
  const mirrorAllFromLeft = useAppStore(s => s.mirrorAllFromLeft);
  const moveLandmark = useAppStore(s => s.moveLandmark);

  const total = landmarks.length;
  const placedCount = landmarks.filter(l => l.placed).length;
  const nextPending = landmarks.find(l => !l.placed);

  const groupedLandmarks = useMemo(() => {
    const g = { center: [], left: [], right: [], fingers: [] };
    for (const l of landmarks) g[l.group].push(l);
    return g;
  }, [landmarks]);

  const startPlacing = () => {
    if (placingMode) {
      cancelPlacing();
    } else if (nextPending) {
      setActiveLandmark(nextPending.id);
      toast.info('Click on the mesh to place: ' + nextPending.label);
    } else {
      toast.success('All landmarks placed');
    }
  };

  const progressPct = (placedCount / total) * 100;

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2.5 border-b space-y-2" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="flex items-center justify-between">
          <span className="dcc-label">Progress</span>
          <span className="dcc-metric">{placedCount} / {total}</span>
        </div>
        <div className="h-1 rounded overflow-hidden" style={{ background: 'var(--panel-bg-raised)' }}>
          <div
            className="h-full transition-all"
            style={{
              background: 'linear-gradient(90deg, var(--dcc-orange) 0%, var(--dcc-orange-hover) 100%)',
              width: progressPct + '%',
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            data-testid="start-placement-btn"
            size="sm"
            className="h-7 flex-1 text-[11px] text-white gap-1.5"
            style={{ background: 'var(--dcc-orange)' }}
            onClick={startPlacing}
          >
            {renderPlaceLabel(placingMode)}
          </Button>
          <Button
            data-testid="mirror-all-btn"
            size="sm"
            variant="outline"
            className="h-7 text-[11px] border-[color:var(--panel-border)] gap-1"
            onClick={() => { mirrorAllFromLeft(); toast.success('Mirrored L to R'); }}
            title="Mirror all placed LEFT landmarks to RIGHT"
          >
            <FlipHorizontal2 className="w-3 h-3" />
          </Button>
          <Button
            data-testid="reset-landmarks-btn"
            size="sm"
            variant="outline"
            className="h-7 text-[11px] border-[color:var(--panel-border)] gap-1"
            onClick={() => { resetAll(); toast.success('Landmarks reset'); }}
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto dcc-scroll">
        <GroupSection groupKey="center"  items={groupedLandmarks.center}  activeId={activeLandmarkId} onSelect={setActiveLandmark} onClear={clearLandmark} onEdit={moveLandmark} />
        <GroupSection groupKey="left"    items={groupedLandmarks.left}    activeId={activeLandmarkId} onSelect={setActiveLandmark} onClear={clearLandmark} onEdit={moveLandmark} />
        <GroupSection groupKey="right"   items={groupedLandmarks.right}   activeId={activeLandmarkId} onSelect={setActiveLandmark} onClear={clearLandmark} onEdit={moveLandmark} />
        <GroupSection groupKey="fingers" items={groupedLandmarks.fingers} activeId={activeLandmarkId} onSelect={setActiveLandmark} onClear={clearLandmark} onEdit={moveLandmark} />
      </div>

      <div className="px-3 py-2 border-t text-[10px] font-mono flex items-center gap-2" style={{ borderColor: 'var(--panel-border)', color: 'var(--text-mid)' }}>
        <span className="kbd">LMB</span> Place
        <span className="kbd">DRAG</span> Move
        <span className="kbd">RMB</span> Orbit
      </div>
    </div>
  );
}

function renderPlaceLabel(placingMode) {
  if (placingMode) {
    return (<><X className="w-3 h-3" /> STOP</>);
  }
  return (<><Target className="w-3 h-3" /> START PLACING</>);
}

function GroupSection(props) {
  const { groupKey, items, activeId, onSelect, onClear, onEdit } = props;
  const [open, setOpen] = useState(true);
  const meta = LANDMARK_GROUPS[groupKey];
  const placed = items.filter(i => i.placed).length;
  return (
    <div className="border-b" style={{ borderColor: 'var(--panel-border-subtle)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[color:var(--panel-bg-surface)]"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: '0 0 6px ' + meta.color }} />
          <span className="dcc-heading text-[11px]">{meta.label}</span>
        </div>
        <span className="dcc-label text-[10px]">{placed}/{items.length}</span>
      </button>
      {open && items.map(item => (
        <LandmarkRow
          key={item.id}
          item={item}
          active={activeId === item.id}
          color={meta.color}
          onSelect={() => onSelect(item.id)}
          onClear={() => onClear(item.id)}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

function LandmarkRow(props) {
  const { item, active, color, onSelect, onClear, onEdit } = props;
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(item.position);

  const rowStyle = {
    borderColor: 'var(--panel-border-subtle)',
    background: active ? 'rgba(234, 88, 12, 0.10)' : 'transparent',
  };
  const dotStyle = {
    background: item.placed ? color : 'transparent',
    border: item.placed ? 'none' : '1px solid ' + color,
    opacity: item.mirrored ? 0.55 : 1,
  };
  const statusColor = item.placed ? 'var(--dcc-emerald)' : 'var(--text-faint)';
  const statusLabel = active ? 'ACTIVE' : (item.placed ? 'PLACED' : 'PENDING');

  const applyEdit = (e) => {
    e.stopPropagation();
    onEdit(item.id, local);
    setEditing(false);
    toast.success('Coordinates updated');
  };

  return (
    <div
      data-testid={'landmark-row-' + item.id}
      className={'px-3 py-2 border-b flex flex-col gap-1 cursor-pointer transition-colors ' + (active ? 'dcc-pulse' : '')}
      style={rowStyle}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={dotStyle} />
        <span className="text-[12px] flex-1 font-medium">{item.label}</span>
        {item.mirrored && <span className="dcc-label text-[9px]" style={{color:'var(--dcc-orange-glow)'}}>MIR</span>}
        <span className="dcc-label text-[9px]" style={{ color: statusColor }}>{statusLabel}</span>
      </div>
      {item.placed && !editing && (
        <div className="flex items-center gap-1 pl-4">
          <span className="dcc-metric text-[10px]">
            {item.position.x.toFixed(3)}, {item.position.y.toFixed(3)}, {item.position.z.toFixed(3)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              data-testid={'landmark-edit-' + item.id}
              onClick={(e) => { e.stopPropagation(); setLocal(item.position); setEditing(true); }}
              className="dcc-label text-[9px] hover:text-[color:var(--dcc-orange-glow)]"
            >EDIT</button>
            <button
              data-testid={'landmark-clear-' + item.id}
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="dcc-label text-[9px] hover:text-[color:var(--destructive)]"
            >CLEAR</button>
          </div>
        </div>
      )}
      {item.placed && editing && (
        <div className="flex items-center gap-1 pl-4">
          <CoordInput axis="x" testId={item.id} value={local.x} onChange={(v) => setLocal({ ...local, x: v })} />
          <CoordInput axis="y" testId={item.id} value={local.y} onChange={(v) => setLocal({ ...local, y: v })} />
          <CoordInput axis="z" testId={item.id} value={local.z} onChange={(v) => setLocal({ ...local, z: v })} />
          <button
            onClick={applyEdit}
            className="dcc-label text-[9px] hover:text-white"
          >APPLY</button>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(false); }}
            className="dcc-label text-[9px] hover:text-white"
          >CANCEL</button>
        </div>
      )}
    </div>
  );
}

function CoordInput({ axis, testId, value, onChange }) {
  return (
    <Input
      data-testid={'landmark-' + testId + '-' + axis}
      type="number"
      step="0.01"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onClick={(e) => e.stopPropagation()}
      className="h-6 w-14 text-[10px] font-mono px-1.5 bg-[color:var(--panel-bg-surface)] border-[color:var(--panel-border)]"
    />
  );
}
