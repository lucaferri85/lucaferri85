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
    useAppStore.setState({ templateImportError: null });
    // the parsed skeleton is authoritative from here on; validation / library persistence failures are reported, never a fallback
    let validation = null;
    try { validation = await runValidation(template); }
    catch (e) { toast.warning(`Imported ${template.bones.length} bones, but VALIDATE TEMPLATE STRUCTURE could not reach the server (${e.message}) — run it again from the Template tab`, { duration: 12000 }); }
    let savedId = null;
    for (let attempt = 0; attempt < 2 && !savedId; attempt++) {
      try {
        const saved = await api.saveTemplate(template, validation);
        savedId = saved.id;
        store.setTemplateSavedId(savedId);
        rememberActiveTemplate(savedId);
      } catch (e) {
        if (attempt === 1) {
          useAppStore.setState({ templateImportError: { file: file.name, message: `Parsed ${template.bones.length} bones but the template could not be saved to the server library (${e.message}). It is active now but will NOT survive a page reload — save the project or import again.`, at: new Date().toISOString() } });
          toast.error('Template could not be saved to the library — it will not survive a reload', { duration: 15000 });
        }
      }
    }
    if (!diag.errors.length) {
      toast.success(`Imported ${template.bones.length} bones from FBX · validation: ${validation ? validation.status.toUpperCase() : 'PENDING'}`, { id: t });
    }
    return { template, validation, savedId };
  } catch (e) {
    console.error(e);
    const msg = `IMPORT QUINN FBX failed: ${e.message}. Nothing was replaced — the previously active template stays as it was. Fix the export and import again.`;
    useAppStore.setState({ templateImportError: { file: file.name, message: e.message, at: new Date().toISOString() } });
    toast.error(msg, { id: t, duration: 15000 });
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
let restoreStarted = false;
export async function restoreActiveTemplate() {
  if (restoreStarted) return null; restoreStarted = true;
  let id = null;
  try { id = localStorage.getItem(ACTIVE_KEY); } catch { /* storage unavailable */ }
  const s = useAppStore.getState();
  if (s.templateSource !== 'sample_dev') return null;
  try {
    if (!id) {
      // no local hint (new browser / origin): the server library is the persistent source — most recent authoritative import wins
      const lib = await api.listTemplates();
      const auth = (lib || []).filter(t => t.source === 'user_authoritative').sort((a, b) => String(b.imported_at || b.created_at).localeCompare(String(a.imported_at || a.created_at)))[0];
      if (!auth) return null;
      id = auth.id;
    }
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
