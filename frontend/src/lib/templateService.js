/**
 * Template workflow orchestration shared by LeftPanel / TemplateTab.
 * FBX is the source of truth; JSON is a derived cache of a parsed FBX.
 */
import { toast } from 'sonner';
import * as api from './api';
import { useAppStore } from '../store/appStore';
import { parseSkeletonFromFBX } from './fbx/fbxSkeletonImporter';
import { LANDMARKS } from './landmarks';
import { TEMPLATE_SCHEMA_VERSION } from './quinnTemplate';

const requiredBones = () => Array.from(new Set(LANDMARKS.map(l => l.bone_target)));

export async function runValidation(template) {
  const validation = await api.validateTemplate(template, requiredBones());
  useAppStore.getState().setTemplateValidation(validation);
  return validation;
}

export async function importTemplateFBX(file) {
  const store = useAppStore.getState();
  store.setTemplateImporting(true);
  const t = toast.loading(`Parsing ${file.name}…`);
  try {
    const buffer = await file.arrayBuffer();
    const template = await parseSkeletonFromFBX(buffer, file.name);
    const diag = template.diagnostics;
    if (diag.errors.length) {
      toast.error(`FBX skeleton has ${diag.errors.length} error(s) — see Template tab`, { id: t });
    }
    store.setTemplate(template, 'user_authoritative', null, null);
    const validation = await runValidation(template);
    let savedId = null;
    try {
      const saved = await api.saveTemplate(template, validation);
      savedId = saved.id;
      store.setTemplateSavedId(savedId);
      rememberActiveTemplate(savedId);
    } catch (e) {
      toast.warning('Template parsed but could not be saved to library');
    }
    if (!diag.errors.length) {
      toast.success(`Imported ${template.bones.length} bones from FBX · validation: ${validation.status.toUpperCase()}`, { id: t });
    }
    return { template, validation, savedId };
  } catch (e) {
    console.error(e);
    toast.error(`FBX parse failed: ${e.message}`, { id: t });
    throw e;
  } finally {
    store.setTemplateImporting(false);
  }
}

export async function importTemplateJSON(file) {
  const store = useAppStore.getState();
  const text = await file.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data.bones)) throw new Error('JSON has no "bones" array');
  const derivedFromFbx = data.source === 'user_authoritative' && data.provenance?.origin_format === 'fbx' && data.provenance?.sha256;
  const source = derivedFromFbx ? 'user_authoritative' : 'user_json';
  if (!data.schema_version) data.schema_version = TEMPLATE_SCHEMA_VERSION;
  if (!derivedFromFbx) {
    data.source = 'user_json';
    data.provenance = { ...(data.provenance || {}), origin_format: data.provenance?.origin_format || 'json', origin_filename: file.name, imported_at: new Date().toISOString() };
  }
  store.setTemplate(data, source, null, null);
  const validation = await runValidation(data);
  let savedId = null;
  try {
    const saved = await api.saveTemplate(data, validation);
    savedId = saved.id;
    store.setTemplateSavedId(savedId);
  } catch (e) { /* library save is best-effort */ }
  toast.success(`Loaded JSON template · ${data.bones.length} bones · ${derivedFromFbx ? 'FBX-derived' : 'unverified provenance'}`);
  return { template: data, validation, savedId };
}

export async function loadTemplateFromLibrary(id, { quiet = false } = {}) {
  const saved = await api.getTemplate(id);
  const data = saved.template_data;
  useAppStore.getState().setTemplate(data, saved.source, saved.validation || null, saved.id);
  rememberActiveTemplate(saved.id);
  if (!saved.validation) await runValidation(data);
  if (!quiet) toast.success(`Loaded template: ${saved.name}`);
  return saved;
}

const ACTIVE_KEY = 'quinn.template.activeSavedId';
export function rememberActiveTemplate(id) { try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch { /* storage unavailable */ } }

/** On startup: restore the last imported authoritative template from the server library instead of silently
 *  falling back to the DEVELOPMENT / SAMPLE skeleton after a page reload. */
export async function restoreActiveTemplate() {
  let id = null;
  try { id = localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  const s = useAppStore.getState();
  if (!id || s.templateSource !== 'sample_dev') return null;
  try {
    const saved = await loadTemplateFromLibrary(id, { quiet: true });
    toast.success(`Restored authoritative template: ${saved.name} · ${saved.bone_count || saved.template_data?.bones?.length} bones`);
    return saved;
  } catch (e) {
    rememberActiveTemplate(null);
    toast.warning('Your authoritative template could not be restored from the library — re-import the Quinn FBX. The DEV sample is active meanwhile.', { duration: 10000 });
    return null;
  }
}

export function exportTemplateJSON(template, validation) {
  const payload = {
    ...template,
    exported_at: new Date().toISOString(),
    export_note: 'Derived cache of the validated FBX import. The original FBX remains the authoritative source.',
    validation_snapshot: validation ? { status: validation.status, checked_at: validation.checked_at } : null,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(template.name || 'skeleton_template').replace(/[^\w.-]+/g, '_')}.template.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** True only when the loaded template may be used for rig fitting. */
export function isFitAuthorized(source, validation) {
  return source === 'user_authoritative' && !!validation && validation.status !== 'invalid';
}
