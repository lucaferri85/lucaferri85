import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { getViewportManager } from '../components/viewport/viewportBridge';
import { UnrealExporter } from '../modules/UnrealExporter';

export function canExport(state = useAppStore.getState()) {
  const reasons = [];
  if (!state.skinning) reasons.push('Generate skin weights first');
  if (!state.skinningValidation?.valid) reasons.push('Skin weight validation must PASS');
  if (state.skinningStale) reasons.push('Skin weights are stale — regenerate');
  if (!state.fitApproved) reasons.push('Fitted skeleton is not approved');
  if (state.comparison?.overall === 'fail') reasons.push('Skeleton comparison is FAIL');
  return { ok: reasons.length === 0, reasons };
}

export async function exportRig(format) {
  const s = useAppStore.getState();
  const gate = canExport(s);
  if (!gate.ok) { toast.error(gate.reasons[0]); return false; }
  const mgr = getViewportManager();
  if (!mgr?.currentMesh) { toast.error('Viewport mesh unavailable'); return false; }
  const t = toast.loading(`Building ${format.toUpperCase()} export…`);
  try {
    const blob = await new UnrealExporter().export({
      mesh: mgr.currentMesh,
      fittedSkeleton: s.fitted,
      weights: s.skinning,
      format,
      opts: { sourceMeshName: s.mesh.filename, sceneName: s.projectName || 'Quinn_AutoRig' },
    });
    const base = (s.projectName || 'Quinn_AutoRig').replace(/[^a-z0-9_-]+/gi, '_');
    const ext = format === 'json' ? 'quinnrig.json' : format;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${base}.${ext}`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`${format.toUpperCase()} export ready`, { id: t });
    return true;
  } catch (e) {
    console.error(e);
    toast.error(`Export failed: ${e.message}`, { id: t });
    return false;
  }
}
