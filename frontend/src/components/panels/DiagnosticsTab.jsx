import { useAppStore } from '../../store/appStore';

export default function DiagnosticsTab() {
  const meshLoaded = useAppStore(s => s.meshLoaded);
  const mesh = useAppStore(s => s.mesh);
  const landmarks = useAppStore(s => s.landmarks);
  const template = useAppStore(s => s.template);
  const templateValidation = useAppStore(s => s.templateValidation);

  const placed = landmarks.filter(l => l.placed).length;
  const total = landmarks.length;
  const coreLandmarksReady = landmarks.filter(l => l.group !== 'fingers').every(l => l.placed);

  const meshFile = mesh.filename || '';
  const meshVerts = mesh.vertices ? mesh.vertices.toLocaleString() : '0';
  const meshHeight = mesh.height_m ? mesh.height_m.toFixed(2) + ' m' : '—';

  const meshHeightStatus = !meshLoaded ? 'pending' : (mesh.height_m > 0.5 && mesh.height_m < 3.5) ? 'pass' : 'warn';

  const templateStatus = template.bones && template.bones.length > 0 ? 'pass' : 'fail';

  let validationStatus = 'pending';
  let validationDetail = 'Not run (bundled template OK)';
  if (templateValidation) {
    validationStatus = templateValidation.valid ? 'pass' : 'fail';
    validationDetail = templateValidation.valid ? 'Structure valid' : templateValidation.errors.join('; ');
  }

  const readyStatus = (meshLoaded && coreLandmarksReady && template.bones && template.bones.length > 0) ? 'pass' : 'pending';

  const checks = [
    { label: 'Mesh loaded',           status: meshLoaded ? 'pass' : 'pending', detail: meshLoaded ? (meshFile + ' · ' + meshVerts + ' verts') : 'Import a humanoid mesh' },
    { label: 'Mesh height sane',      status: meshHeightStatus, detail: meshLoaded ? meshHeight : '—' },
    { label: 'Skeleton template',     status: templateStatus,   detail: (template.bones?.length || 0) + ' bones · ' + template.name },
    { label: 'Template validation',   status: validationStatus, detail: validationDetail },
    { label: 'Core landmarks placed', status: coreLandmarksReady ? 'pass' : 'pending', detail: placed + ' / ' + total + ' placed' },
    { label: 'Ready for auto-fit',    status: readyStatus,      detail: 'Phase 2 module' },
  ];

  return (
    <div className="p-3 space-y-2 overflow-auto h-full dcc-scroll">
      {checks.map((c, i) => (
        <div key={i} className="dcc-panel-surface rounded p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{c.label}</span>
            <StatusPill status={c.status} />
          </div>
          <div className="dcc-label text-[10px] mt-1">{c.detail}</div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status }) {
  const configs = {
    pass:    { label: 'PASS',    color: 'var(--dcc-emerald)' },
    warn:    { label: 'WARN',    color: 'var(--dcc-gold)' },
    fail:    { label: 'FAIL',    color: 'var(--destructive)' },
    pending: { label: 'PENDING', color: 'var(--text-faint)' },
  };
  const config = configs[status] || { label: '—', color: 'var(--text-faint)' };
  const style = {
    background: 'var(--panel-bg-raised)',
    color: config.color,
    border: '1px solid ' + config.color,
  };
  return (
    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider" style={style}>
      {config.label}
    </span>
  );
}
