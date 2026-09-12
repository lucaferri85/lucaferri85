import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { getViewportManager } from '../components/viewport/viewportBridge';
import { SkinWeightGenerator } from '../modules/SkinWeightGenerator';

export function canGenerateSkinning(state = useAppStore.getState()) {
  const reasons = [];
  if (!state.meshLoaded) reasons.push('Load a mesh first');
  if (!state.fitted) reasons.push('Run Auto Fit first');
  if (!state.fitApproved) reasons.push('Approve the fitted skeleton first');
  if (state.fitStale) reasons.push('Fit is stale — re-run Auto Fit');
  if (state.templateSource !== 'user_authoritative') reasons.push('Authoritative Quinn template required');
  if (state.comparison?.overall === 'fail') reasons.push('Compare With Source is FAIL');
  return { ok: reasons.length === 0, reasons };
}

export async function runAutomaticSkinning(opts = {}) {
  const s = useAppStore.getState();
  const gate = canGenerateSkinning(s);
  if (!gate.ok) { toast.error(gate.reasons[0]); return null; }
  const mgr = getViewportManager();
  if (!mgr?.currentMesh) { toast.error('Viewport mesh is not available'); return null; }

  const generator = new SkinWeightGenerator();
  s.setSkinningRunning(true);
  const t = toast.loading('Generating anatomy-aware Quinn skin weights…');
  try {
    const result = await generator.generate(mgr.currentMesh, s.fitted, {
      maxInfluences: 4,
      ...opts,
      onProgress: (p) => {
        useAppStore.getState().setSkinningProgress(p.progress);
        opts.onProgress?.(p);
      },
    });
    const validation = generator.validate(result, s.fitted);
    generator.applyToMesh(mgr.currentMesh, result);
    useAppStore.getState().setSkinning(result, validation);
    useAppStore.getState().setStage('skinning');
    useAppStore.getState().setRightTab('skinning');
    const msg = `${result.report.verticesWeighted.toLocaleString()} vertices · avg ${result.report.avgInfluences.toFixed(2)} influences · ${validation.errors.length} error(s)`;
    if (!validation.valid) toast.error(`Skinning generated but validation failed: ${msg}`, { id: t });
    else if (result.report.warnings.length || validation.warnings.length) toast.warning(`Skinning complete: ${msg}`, { id: t });
    else toast.success(`Skinning complete: ${msg}`, { id: t });
    return result;
  } catch (e) {
    console.error(e);
    useAppStore.getState().setSkinningRunning(false);
    toast.error(`Skinning failed: ${e.message}`, { id: t });
    return null;
  }
}

export function clearSkinning() {
  useAppStore.getState().clearSkinning();
  toast.info('Skin weights cleared');
}
