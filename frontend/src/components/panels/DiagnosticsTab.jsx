import { useAppStore } from '../../store/appStore';
import { isFitAuthorized } from '../../lib/templateService';
import { sourceInfo } from '../../lib/quinnTemplate';

export default function DiagnosticsTab() {
  const meshLoaded = useAppStore(s => s.meshLoaded);
  const mesh = useAppStore(s => s.mesh);
  const landmarks = useAppStore(s => s.landmarks);
  const template = useAppStore(s => s.template);
  const templateSource = useAppStore(s => s.templateSource);
  const templateValidation = useAppStore(s => s.templateValidation);

  const placed = landmarks.filter(l => l.placed).length;
  const total = landmarks.length;
  const coreLandmarksReady = landmarks.filter(l => l.group !== 'fingers').every(l => l.placed);

  const meshFile = mesh.filename || '';
  const meshVerts = mesh.vertices ? mesh.vertices.toLocaleString() : '0';
  const meshHeight = mesh.height_m ? mesh.height_m.toFixed(2) + ' m' : '—';

  const meshHeightStatus = !meshLoaded ? 'pending' : (mesh.height_m > 0.5 && mesh.height_m < 3.5) ? 'pass' : 'warn';

  const templateStatus = template.bones && template.bones.length > 0 ? 'pass' : 'fail';
  const authoritative = templateSource === 'user_authoritative';

  let validationStatus = 'pending';
  let validationDetail = 'Not run — click VALIDATE TEMPLATE STRUCTURE';
  if (templateValidation) {
    validationStatus = templateValidation.status === 'invalid' ? 'fail' : templateValidation.status === 'warning' ? 'warn' : 'pass';
    validationDetail = templateValidation.status === 'invalid'
      ? templateValidation.errors.join('; ')
      : `${templateValidation.checks.filter(c => c.status === 'pass').length}/${templateValidation.checks.length} checks pass · ${templateValidation.warnings.length} warning(s)`;
  }

  const fitAuthorized = isFitAuthorized(templateSource, templateValidation);
  const readyStatus = (meshLoaded && coreLandmarksReady && fitAuthorized) ? 'pass' : (fitAuthorized ? 'pending' : 'warn');
  const readyDetail = !authoritative
    ? 'Blocked: template is ' + sourceInfo(templateSource).short + ' — import the authoritative Quinn FBX'
    : !templateValidation
      ? 'Blocked: run VALIDATE TEMPLATE STRUCTURE'
      : templateValidation.status === 'invalid'
        ? 'Blocked: template structure INVALID'
        : 'Phase B (Auto Fit) awaiting authorization';

  const checks = [
    { label: 'Mesh loaded',           status: meshLoaded ? 'pass' : 'pending', detail: meshLoaded ? (meshFile + ' · ' + meshVerts + ' verts') : 'Import a humanoid mesh' },
    { label: 'Mesh height sane',      status: meshHeightStatus, detail: meshLoaded ? meshHeight : '—' },
    { label: 'Skeleton template',     status: templateStatus,   detail: (template.bones?.length || 0) + ' bones · ' + template.name },
    { label: 'Template authority',    status: authoritative ? 'pass' : 'warn', detail: sourceInfo(templateSource).badge },
    { label: 'Template validation',   status: validationStatus, detail: validationDetail },
    { label: 'Core landmarks placed', status: coreLandmarksReady ? 'pass' : 'pending', detail: placed + ' / ' + total + ' placed' },
    { label: 'Ready for auto-fit',    status: readyStatus,      detail: readyDetail },
  ];

  return (
    <div className="p-3 space-y-2 overflow-auto h-full dcc-scroll">
      {checks.map((c, i) => (
        <div key={i} className="dcc-panel-surface rounded p-2.5" data-status={c.status} data-testid={'diag-check-' + c.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}>
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
