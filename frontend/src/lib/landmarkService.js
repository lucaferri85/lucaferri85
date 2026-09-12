import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { getViewportManager } from '../components/viewport/viewportBridge';
import { detectLandmarks } from './landmarkDetector';

/** Detect landmarks from the current viewport mesh and apply them. Never triggers Auto Fit. */
export function runAutoDetect({ overwrite = true } = {}) {
  const mgr = getViewportManager();
  const s = useAppStore.getState();
  if (!mgr || !s.meshLoaded) { toast.error('Import a mesh first'); return null; }
  const t = toast.loading('Analysing mesh cross-sections…');
  try {
    const pts = mgr.getMeshPointCloud();
    const res = detectLandmarks(pts, { symmetryAxis: s.symmetry.enabled ? s.symmetry.axis : null });
    if (!res) { toast.error('Mesh too small or not humanoid enough to detect landmarks', { id: t }); return null; }
    s.applyDetectedLandmarks(res.landmarks, { overwrite });
    const c = { high: 0, medium: 0, low: 0, not_found: 0 };
    for (const v of Object.values(res.landmarks)) c[v.confidence]++;
    toast.success(`Detected landmarks · HIGH ${c.high} · MEDIUM ${c.medium} · LOW ${c.low} · NOT FOUND ${c.not_found}. Review LOW / NOT FOUND, then run Auto Fit.`, { id: t, duration: 6000 });
    if (Math.abs(res.midlineX) > 0.01 * res.height) toast.warning(`Mesh midline is ${(res.midlineX * 100).toFixed(1)} cm off X=0 (weapon/cape shifts the bounding box). Symmetry mirror tools assume X=0.`, { duration: 8000 });
    useAppStore.setState({ rightTab: 'landmarks', stage: 'landmarks', showLandmarks: true });
    return res;
  } catch (e) {
    console.error(e);
    toast.error(`Detection failed: ${e.message}`, { id: t });
    return null;
  }
}

if (typeof window !== 'undefined') window.__quinnDetect = { runAutoDetect, detectLandmarks };
