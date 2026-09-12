import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { FileCode2, Boxes, RotateCcw, Download, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../lib/api';
import TemplateBadge, { ValidationPill } from './TemplateBadge';
import { importTemplateFBX, importTemplateJSON, runValidation, exportTemplateJSON, loadTemplateFromLibrary, restoreActiveTemplate, rememberActiveTemplate } from '../../lib/templateService';

export default function TemplateSection() {
  const template = useAppStore(s => s.template);
  const templateSource = useAppStore(s => s.templateSource);
  const templateValidation = useAppStore(s => s.templateValidation);
  const templateSavedId = useAppStore(s => s.templateSavedId);
  const templateImporting = useAppStore(s => s.templateImporting);
  const resetTemplateToDefault = useAppStore(s => s.resetTemplateToDefault);

  const fbxRef = useRef(null);
  const jsonRef = useRef(null);
  const [library, setLibrary] = useState([]);
  const [validating, setValidating] = useState(false);

  const refreshLibrary = async () => {
    try { setLibrary(await api.listTemplates()); } catch (e) { /* offline library is non-fatal */ }
  };
  useEffect(() => { refreshLibrary(); }, [templateSavedId]);
  useEffect(() => { restoreActiveTemplate(); }, []);

  const onFbx = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.fbx')) { toast.error('Authoritative template must be an .fbx exported from Unreal'); return; }
    try { await importTemplateFBX(file); refreshLibrary(); } catch (e) { /* toasted in service */ }
  };
  const onJson = async (file) => {
    if (!file) return;
    try { await importTemplateJSON(file); refreshLibrary(); } catch (e) { toast.error(`JSON import failed: ${e.message}`); }
  };
  const validate = async () => {
    setValidating(true);
    try {
      const v = await runValidation(template);
      const msg = { valid: 'Template structure VALID', warning: `VALID with ${v.warnings.length} warning(s)`, invalid: `INVALID · ${v.errors.length} error(s)` }[v.status];
      (v.status === 'invalid' ? toast.error : v.status === 'warning' ? toast.warning : toast.success)(msg);
    } catch (e) { toast.error(`Validation failed: ${e.message}`); }
    finally { setValidating(false); }
  };

  const imported = template.provenance?.imported_at;

  return (
    <div className="space-y-2.5">
      <TemplateBadge source={templateSource} />

      <div className="dcc-panel-surface rounded p-2.5 space-y-1.5" data-testid="template-metadata-card">
        <Row label="NAME"      value={template.name || '—'} testId="template-meta-name" />
        <Row label="SOURCE"    value={sourceLabel(templateSource, template)} testId="template-meta-source" />
        <Row label="BONES"     value={String(template.bones?.length || 0)} testId="template-meta-bones" />
        <Row label="VERSION"   value={template.version || '—'} testId="template-meta-version" />
        <Row label="IMPORTED"  value={imported ? new Date(imported).toLocaleString() : 'n/a (bundled)'} testId="template-meta-imported" />
        <div className="flex items-center justify-between">
          <span className="dcc-label">VALIDATION</span>
          <ValidationPill validation={templateValidation} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button data-testid="template-import-fbx-btn" size="sm" disabled={templateImporting}
          className="h-8 text-[11px] text-white col-span-2" style={{ background: 'var(--dcc-orange)' }}
          onClick={() => fbxRef.current?.click()}>
          <Boxes className="w-3.5 h-3.5 mr-1.5" />
          {templateImporting ? 'PARSING FBX…' : 'IMPORT QUINN FBX (UE5 EXPORT)'}
        </Button>
        <Button data-testid="template-validate-btn" variant="outline" size="sm" disabled={validating}
          className="h-8 text-[11px] border-[color:var(--panel-border)] col-span-2" onClick={validate}>
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
          {validating ? 'VALIDATING…' : 'VALIDATE TEMPLATE STRUCTURE'}
        </Button>
        <Button data-testid="template-import-json-btn" variant="outline" size="sm"
          className="h-8 text-[11px] border-[color:var(--panel-border)]" onClick={() => jsonRef.current?.click()}>
          <FileCode2 className="w-3.5 h-3.5 mr-1.5" /> JSON
        </Button>
        <Button data-testid="template-export-json-btn" variant="outline" size="sm"
          className="h-8 text-[11px] border-[color:var(--panel-border)]"
          onClick={() => { exportTemplateJSON(template, templateValidation); toast.success('Template JSON exported'); }}>
          <Download className="w-3.5 h-3.5 mr-1.5" /> EXPORT
        </Button>
        <Button data-testid="skeleton-reset-btn" variant="ghost" size="sm"
          className="h-7 text-[10px] col-span-2" style={{ color: 'var(--text-mid)' }}
          onClick={() => { resetTemplateToDefault(); rememberActiveTemplate(null); toast.warning('Switched to DEVELOPMENT / SAMPLE template'); }}>
          <RotateCcw className="w-3 h-3 mr-1.5" /> RESET TO SAMPLE (DEV) TEMPLATE
        </Button>
        <input ref={fbxRef} type="file" accept=".fbx" className="hidden" data-testid="template-fbx-input" onChange={(e) => { onFbx(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={jsonRef} type="file" accept=".json" className="hidden" data-testid="template-json-input" onChange={(e) => { onJson(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="dcc-label shrink-0">LIBRARY</span>
        <Select value={templateSavedId || ''} onValueChange={(id) => id && loadTemplateFromLibrary(id).catch(e => toast.error(e.message))}>
          <SelectTrigger data-testid="template-library-select" className="h-7 flex-1 text-[11px] bg-[color:var(--panel-bg-surface)] border-[color:var(--panel-border)]">
            <SelectValue placeholder={library.length ? `${library.length} saved template(s)` : 'No saved templates'} />
          </SelectTrigger>
          <SelectContent className="dcc-panel-raised">
            {library.map(t => (
              <SelectItem key={t.id} value={t.id} data-testid={`template-library-item-${t.id}`}>
                <span className="font-mono text-[11px]">{t.name}</span>
                <span className="dcc-label text-[9px] ml-2">{t.bone_count}b · {t.source === 'user_authoritative' ? 'FBX' : t.source === 'sample_dev' ? 'DEV' : 'JSON'}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function sourceLabel(source, template) {
  if (source === 'sample_dev') return 'SAMPLE (DEV) · hand-authored';
  if (source === 'user_authoritative') return `FBX · ${template.provenance?.origin_filename || 'user file'}`;
  return `JSON · ${template.provenance?.origin_filename || 'user file'}`;
}

function Row({ label, value, testId }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="dcc-label shrink-0">{label}</span>
      <span className="dcc-metric truncate max-w-[190px]" title={value} data-testid={testId}>{value}</span>
    </div>
  );
}
