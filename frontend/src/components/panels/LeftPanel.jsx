import { useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { getViewportManager } from '../viewport/viewportBridge';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { UploadCloud, Trash2, FileCode2, ShieldCheck, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../lib/api';
import { DEFAULT_QUINN_TEMPLATE } from '../../lib/quinnTemplate';

export default function LeftPanel() {
  const setMesh = useAppStore(s => s.setMesh);
  const clearMesh = useAppStore(s => s.clearMesh);
  const mesh = useAppStore(s => s.mesh);
  const meshLoaded = useAppStore(s => s.meshLoaded);
  const symmetry = useAppStore(s => s.symmetry);
  const setSymmetry = useAppStore(s => s.setSymmetry);
  const template = useAppStore(s => s.template);
  const templateSource = useAppStore(s => s.templateSource);
  const templateValidation = useAppStore(s => s.templateValidation);
  const setTemplate = useAppStore(s => s.setTemplate);
  const resetTemplateToDefault = useAppStore(s => s.resetTemplateToDefault);

  const fileInputRef = useRef(null);
  const templateInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const onFilePicked = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['glb', 'gltf', 'obj', 'fbx'].includes(ext)) {
      toast.error(`Unsupported format: .${ext} (use glb, gltf, obj, or fbx)`);
      return;
    }
    const mgr = getViewportManager();
    if (!mgr) { toast.error('Viewport not ready yet'); return; }
    const t = toast.loading(`Loading ${file.name}…`);
    try {
      const meshInfo = await mgr.loadMeshFromFile(file);
      setMesh(meshInfo);
      toast.success(`Loaded ${file.name} · ${meshInfo.vertices.toLocaleString()} verts`, { id: t });
    } catch (e) {
      console.error(e);
      toast.error(`Load failed: ${e.message}`, { id: t });
    }
  };

  const onTemplateFile = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      toast.error('Skeleton template must be a .json file');
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const validation = await api.validateTemplate(data);
      if (!validation.valid) {
        toast.error(`Template invalid: ${validation.errors.join('; ')}`);
        return;
      }
      setTemplate(data, 'user_upload', validation);
      toast.success(`Loaded template · ${validation.bones_count} bones`);
    } catch (e) {
      toast.error(`Template parse error: ${e.message}`);
    }
  };

  const removeMesh = () => {
    const mgr = getViewportManager();
    if (mgr) mgr.removeMesh();
    clearMesh();
    toast.success('Mesh removed');
  };

  return (
    <aside
      className="flex flex-col border-r overflow-hidden"
      style={{ background: 'var(--panel-bg-deep)', borderColor: 'var(--panel-border)', width: 320 }}
    >
      {/* Section 1: Mesh import */}
      <Section title="Mesh & Assets" step="01">
        <div
          data-testid="mesh-upload-dropzone"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragOver(false);
            onFilePicked(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded border-2 border-dashed p-4 flex flex-col items-center justify-center gap-2 transition-colors"
          style={{
            borderColor: dragOver ? 'var(--dcc-orange)' : 'var(--panel-border)',
            background: dragOver ? 'rgba(234, 88, 12, 0.06)' : 'transparent',
          }}
        >
          <UploadCloud className="w-6 h-6" style={{ color: 'var(--dcc-orange-glow)' }} />
          <div className="text-xs text-center leading-tight">
            <div className="font-medium">Drop mesh or click to browse</div>
            <div className="dcc-label mt-1 text-[9px]">GLB · GLTF · FBX · OBJ</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,.obj,.fbx"
            className="hidden"
            data-testid="mesh-file-input"
            onChange={(e) => onFilePicked(e.target.files?.[0])}
          />
        </div>

        {meshLoaded && (
          <div className="mt-3 dcc-panel-surface rounded p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="dcc-label">Mesh Info</span>
              <button
                data-testid="mesh-remove-btn"
                onClick={removeMesh}
                className="text-[color:var(--text-faint)] hover:text-[color:var(--dcc-orange)]"
                title="Remove mesh"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <MetricRow label="FILE"     value={mesh.filename || '—'} />
            <MetricRow label="FORMAT"   value={(mesh.format || '—').toUpperCase()} />
            <MetricRow label="VERTS"    value={mesh.vertices?.toLocaleString() || '0'} />
            <MetricRow label="FACES"    value={mesh.faces?.toLocaleString() || '0'} />
            <MetricRow label="HEIGHT"   value={`${mesh.height_m?.toFixed(2)} m`} />
          </div>
        )}
      </Section>

      {/* Section 2: Symmetry */}
      <Section title="Symmetry" step="02">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs">Auto-mirror Left → Right</span>
            <span className="dcc-label text-[9px]">Placed left markers mirror to right</span>
          </div>
          <Switch
            data-testid="symmetry-toggle"
            checked={symmetry.enabled}
            onCheckedChange={(v) => setSymmetry({ enabled: v })}
            className="data-[state=checked]:bg-[color:var(--dcc-orange)]"
          />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="dcc-label">Mirror Axis</span>
          <Select
            value={symmetry.axis}
            onValueChange={(v) => setSymmetry({ axis: v })}
          >
            <SelectTrigger
              data-testid="symmetry-axis-select"
              className="h-7 w-24 text-xs bg-[color:var(--panel-bg-surface)] border-[color:var(--panel-border)]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dcc-panel-raised">
              <SelectItem value="x">X (default)</SelectItem>
              <SelectItem value="y">Y</SelectItem>
              <SelectItem value="z">Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      {/* Section 3: Skeleton Template */}
      <Section title="Skeleton Template" step="03">
        <div className="dcc-panel-surface rounded p-2.5 space-y-1.5">
          <MetricRow label="NAME"   value={template.name || 'UE5 Quinn'} />
          <MetricRow label="VER"    value={template.version || '1.0'} />
          <MetricRow label="BONES"  value={template.bones?.length || 0} />
          <MetricRow label="SOURCE" value={templateSource === 'bundled_default' ? 'BUNDLED' : 'USER UPLOAD'} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            data-testid="skeleton-json-upload-btn"
            variant="outline"
            size="sm"
            className="h-8 text-[11px] border-[color:var(--panel-border)]"
            onClick={() => templateInputRef.current?.click()}
          >
            <FileCode2 className="w-3.5 h-3.5 mr-1.5" />
            UPLOAD JSON
          </Button>
          <Button
            data-testid="skeleton-reset-btn"
            variant="outline"
            size="sm"
            className="h-8 text-[11px] border-[color:var(--panel-border)]"
            onClick={() => { resetTemplateToDefault(); toast.success('Restored bundled Quinn template'); }}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            RESET
          </Button>
          <input
            ref={templateInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => onTemplateFile(e.target.files?.[0])}
          />
        </div>
        {templateValidation && (
          <div className="mt-2 dcc-panel-surface rounded p-2 text-[11px] flex items-start gap-2"
               style={{ borderColor: templateValidation.valid ? 'var(--dcc-emerald)' : 'var(--destructive)' }}>
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: templateValidation.valid ? 'var(--dcc-emerald)' : 'var(--destructive)' }} />
            <div className="flex-1">
              <div className="dcc-label" style={{ color: templateValidation.valid ? 'var(--dcc-emerald)' : 'var(--destructive)' }}>
                {templateValidation.valid ? 'PASS · ' : 'FAIL · '}{templateValidation.bones_count} bones
              </div>
              {templateValidation.warnings?.length > 0 && (
                <div className="mt-1 text-[10px]" style={{color:'var(--text-mid)'}}>
                  {templateValidation.warnings.length} warning{templateValidation.warnings.length !== 1 && 's'}
                </div>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* Fill remainder */}
      <div className="flex-1" />
    </aside>
  );
}

function Section({ title, step, children }) {
  return (
    <div className="border-b p-3.5 space-y-2.5" style={{ borderColor: 'var(--panel-border)' }}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--panel-bg-raised)', color: 'var(--dcc-orange-glow)' }}>
          {step}
        </span>
        <span className="dcc-heading text-[11px]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function MetricRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="dcc-label">{label}</span>
      <span className="dcc-metric truncate max-w-[180px]" title={value}>{value}</span>
    </div>
  );
}
