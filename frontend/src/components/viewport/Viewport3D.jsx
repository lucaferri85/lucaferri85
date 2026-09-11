import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { ViewportManager } from './viewportManager';
import { setViewportManager } from './viewportBridge';
import { toast } from 'sonner';

export default function Viewport3D() {
  const containerRef = useRef(null);
  const managerRef = useRef(null);

  const landmarks = useAppStore(s => s.landmarks);
  const activeLandmarkId = useAppStore(s => s.activeLandmarkId);
  const placingMode = useAppStore(s => s.placingMode);
  const showLandmarks = useAppStore(s => s.showLandmarks);
  const showSkeleton = useAppStore(s => s.showSkeleton);
  const showWireframe = useAppStore(s => s.showWireframe);
  const showXray = useAppStore(s => s.showXray);
  const showGrid = useAppStore(s => s.showGrid);
  const projection = useAppStore(s => s.projection);
  const template = useAppStore(s => s.template);
  const symmetry = useAppStore(s => s.symmetry);
  const selectedBoneName = useAppStore(s => s.selectedBoneName);
  const cameraCommand = useAppStore(s => s.cameraCommand);

  const placeLandmark = useAppStore(s => s.placeLandmark);
  const moveLandmark = useAppStore(s => s.moveLandmark);
  const setActiveLandmark = useAppStore(s => s.setActiveLandmark);

  // Mount / unmount
  useEffect(() => {
    if (!containerRef.current) return;
    const m = new ViewportManager(containerRef.current);
    managerRef.current = m;
    setViewportManager(m);
    m.setCallbacks({
      onLandmarkPlaced: (id, pos) => {
        placeLandmark(id, pos);
        toast.success(`Placed: ${idToLabel(id)}`, { duration: 1500 });
      },
      onLandmarkMoved: (id, pos) => {
        moveLandmark(id, pos);
      },
      onLandmarkSelected: (id) => setActiveLandmark(id),
    });
    return () => { setViewportManager(null); m.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync landmarks
  useEffect(() => { managerRef.current?.syncLandmarks(landmarks); }, [landmarks]);

  // Placing mode
  useEffect(() => { managerRef.current?.setPlacingMode(placingMode, activeLandmarkId); }, [placingMode, activeLandmarkId]);

  // Toggles
  useEffect(() => { managerRef.current?.setLandmarksVisible(showLandmarks); }, [showLandmarks]);
  useEffect(() => { managerRef.current?.setSkeletonVisible(showSkeleton); }, [showSkeleton]);
  useEffect(() => { managerRef.current?.setWireframe(showWireframe); }, [showWireframe]);
  useEffect(() => { managerRef.current?.setXray(showXray); }, [showXray]);
  useEffect(() => { managerRef.current?.setGridVisible(showGrid); }, [showGrid]);
  useEffect(() => { managerRef.current?.setProjection(projection); }, [projection]);

  // Symmetry visualization
  useEffect(() => {
    managerRef.current?.setSymmetryPlaneVisible(symmetry.enabled && placingMode, symmetry.axis);
  }, [symmetry, placingMode]);

  // Skeleton overlay content
  useEffect(() => { managerRef.current?.renderSkeleton(template); }, [template]);
  useEffect(() => { managerRef.current?.highlightBone(selectedBoneName); }, [selectedBoneName, template]);

  // Camera commands
  useEffect(() => {
    if (cameraCommand?.verb) managerRef.current?.setCameraView(cameraCommand.verb);
  }, [cameraCommand]);

  return (
    <div
      ref={containerRef}
      data-testid="viewport-3d-container"
      className="absolute inset-0"
      style={{ background: 'var(--viewport-bg)' }}
    />
  );
}

function idToLabel(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Expose the manager for imperative operations (mesh load, etc.)
export function useViewportManager() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ref = useRef(null);
  // no-op: kept for future use; direct access via document if needed
  return ref;
}
