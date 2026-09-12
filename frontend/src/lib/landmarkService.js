import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { getViewportManager } from '../components/viewport/viewportBridge';
import { detectLandmarks } from './landmarkDetector';
import {
  convertDetectedLandmarksLegacyToUE,
  ueVectorToLegacyArray,
} from './unrealCoordinateSystem';

/**
 * Detect landmarks from the current viewport mesh and apply them.
 *
 * Public project coordinates are Unreal-style:
 *   X forward, Y right, Z up.
 *
 * The existing detector is intentionally kept in its proven legacy Y-up
 * mathematical space. We convert the sampled points at the boundary, run the
 * detector unchanged, then convert its result back to UE coordinates.
 */
export function runAutoDetect({ overwrite = true } = {}) {
  const mgr = getViewportManager();
  const s = useAppStore.getState();

  if (!mgr || !s.meshLoaded) {
    toast.error('Import a mesh first');
    return null;
  }

  const t = toast.loading('Analysing mesh cross-sections…');

  try {
    const uePoints = mgr.getMeshPointCloud();
    const legacyPoints = uePoints.map(ueVectorToLegacyArray);

    const legacyResult = detectLandmarks(legacyPoints, {
      // The detector's proven L/R axis is its legacy X axis.
      symmetryAxis: 'x',
    });

    if (!legacyResult) {
      toast.error(
        'Mesh too small or not humanoid enough to detect landmarks',
        { id: t }
      );
      return null;
    }

    const landmarks = convertDetectedLandmarksLegacyToUE(
      legacyResult.landmarks
    );

    const result = {
      ...legacyResult,
      landmarks,
      // Legacy detector midlineX corresponds to -UE.Y.
      midlineY: -(legacyResult.midlineX || 0),
      coordinate_system: 'UE_LH_X_FORWARD_Y_RIGHT_Z_UP_M',
    };

    s.applyDetectedLandmarks(result.landmarks, { overwrite });

    const c = {
      high: 0,
      medium: 0,
      low: 0,
      not_found: 0,
    };

    for (const v of Object.values(result.landmarks)) {
      c[v.confidence]++;
    }

    toast.success(
      `Detected landmarks · HIGH ${c.high} · MEDIUM ${c.medium} · LOW ${c.low} · NOT FOUND ${c.not_found}. Review LOW / NOT FOUND, then run Auto Fit.`,
      { id: t, duration: 6000 }
    );

    if (Math.abs(result.midlineY) > 0.01 * result.height) {
      toast.warning(
        `Mesh centerline is ${(result.midlineY * 100).toFixed(1)} cm off UE Y=0. Central landmarks are locked back to the sagittal plane.`,
        { duration: 8000 }
      );
    }

    useAppStore.setState({
      rightTab: 'landmarks',
      stage: 'landmarks',
      showLandmarks: true,
      // Unreal left/right symmetry is Y.
      symmetry: {
        ...useAppStore.getState().symmetry,
        axis: 'y',
      },
    });

    return result;
  } catch (e) {
    console.error(e);
    toast.error(`Detection failed: ${e.message}`, { id: t });
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.__quinnDetect = {
    runAutoDetect,
    detectLandmarks,
  };
}
