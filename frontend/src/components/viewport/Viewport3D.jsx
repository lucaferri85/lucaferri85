import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { useAppStore } from '../../store/appStore';
import { ViewportManager } from './viewportManager';
import { setViewportManager } from './viewportBridge';
import { moveFittedJoint, rotateFittedBone } from '../../lib/fitService';
import { toast } from 'sonner';
import {
  configureViewportForUnreal,
  constrainCenterlineLandmarkPosition,
  templateToUnrealCoordinates,
} from '../../lib/unrealCoordinateSystem';

/**
 * Viewport3D
 *
 * Fit edit tools:
 *   G / MOVE   -> existing joint translation
 *   R / ROTATE -> Three.js TransformControls rotation gizmo
 *
 * Rotation is applied to the selected Quinn bone while preserving the exact
 * skeleton names/order/parents. Descendants follow the rotated parent.
 */
export default function Viewport3D() {
  const containerRef = useRef(null);
  const managerRef = useRef(null);

  const transformRef = useRef(null);
  const rotateProxyRef = useRef(null);
  const fitToolRef = useRef('move');
  const rotationStartRef = useRef(null);
  const rotationBoneRef = useRef(null);

  const landmarks = useAppStore((s) => s.landmarks);
  const activeLandmarkId = useAppStore((s) => s.activeLandmarkId);
  const placingMode = useAppStore((s) => s.placingMode);
  const showLandmarks = useAppStore((s) => s.showLandmarks);
  const showSkeleton = useAppStore((s) => s.showSkeleton);
  const showWireframe = useAppStore((s) => s.showWireframe);
  const showXray = useAppStore((s) => s.showXray);
  const showGrid = useAppStore((s) => s.showGrid);
  const projection = useAppStore((s) => s.projection);
  const template = useAppStore((s) => s.template);
  const symmetry = useAppStore((s) => s.symmetry);
  const selectedBoneName = useAppStore((s) => s.selectedBoneName);
  const showBoneAxes = useAppStore((s) => s.showBoneAxes);
  const fitted = useAppStore((s) => s.fitted);
  const showFitted = useAppStore((s) => s.showFitted);
  const fitEditMode = useAppStore((s) => s.fitEditMode);
  const setSelectedBone = useAppStore((s) => s.setSelectedBone);
  const cameraCommand = useAppStore((s) => s.cameraCommand);

  const placeLandmark = useAppStore((s) => s.placeLandmark);
  const moveLandmark = useAppStore((s) => s.moveLandmark);
  const setActiveLandmark = useAppStore((s) => s.setActiveLandmark);

  const syncRotateGizmo = () => {
    const manager = managerRef.current;
    const control = transformRef.current;
    const proxy = rotateProxyRef.current;

    if (!manager || !control || !proxy) {
      return;
    }

    const state = useAppStore.getState();

    const bone =
      state.fitted?.bones?.find(
        (b) =>
          b.name ===
          state.selectedBoneName
      );

    const show =
      state.fitEditMode &&
      fitToolRef.current === 'rotate' &&
      !!bone;

    if (!show) {
      control.detach();
      control.enabled = false;
      control.visible = false;

      manager.setJointEditMode(
        state.fitEditMode &&
        fitToolRef.current === 'move'
      );

      return;
    }

    proxy.position.set(
      bone.globalPos[0],
      bone.globalPos[1],
      bone.globalPos[2]
    );

    if (
      Array.isArray(
        bone.globalRot
      )
    ) {
      proxy.quaternion
        .set(
          bone.globalRot[0],
          bone.globalRot[1],
          bone.globalRot[2],
          bone.globalRot[3]
        )
        .normalize();
    } else {
      proxy.quaternion.identity();
    }

    proxy.updateMatrixWorld(true);

    control.attach(proxy);
    control.setMode('rotate');
    control.setSpace('local');
    control.setSize(0.72);
    control.enabled = true;
    control.visible = true;

    // In ROTATE mode normal joint dragging is disabled so the gizmo owns drag.
    manager.setJointEditMode(false);
  };

  // Mount / unmount.
  useEffect(() => {
    if (!containerRef.current) return;

    const manager =
      new ViewportManager(
        containerRef.current
      );

    configureViewportForUnreal(manager);

    // Unreal convention: X forward, Y right, Z up.
    // Left/right symmetry therefore lives on the Y axis.
    const initialState = useAppStore.getState();
    if (initialState.symmetry?.axis !== 'y') {
      useAppStore.setState({
        symmetry: {
          ...initialState.symmetry,
          axis: 'y',
        },
      });
    }

    managerRef.current =
      manager;

    setViewportManager(
      manager
    );

    if (
      typeof window !==
      'undefined'
    ) {
      window.__quinnViewport =
        manager;
    }

    manager.setCallbacks({
      onLandmarkPlaced: (
        id,
        pos
      ) => {
        placeLandmark(
          id,
          constrainCenterlineLandmarkPosition(id, pos)
        );

        toast.success(
          `Placed: ${idToLabel(id)}`,
          {
            duration: 1500,
          }
        );
      },

      onLandmarkMoved: (
        id,
        pos
      ) => {
        moveLandmark(
          id,
          constrainCenterlineLandmarkPosition(id, pos)
        );
      },

      onLandmarkSelected:
        (id) =>
          setActiveLandmark(
            id
          ),

      onJointSelected:
        (name) =>
          setSelectedBone(
            name
          ),

      onJointMoved: (
        name,
        pos
      ) =>
        moveFittedJoint(
          name,
          pos
        ),
    });

    // Rotation proxy + gizmo.
    const proxy =
      new THREE.Object3D();

    proxy.name =
      'QuinnBoneRotateProxy';

    manager.scene.add(
      proxy
    );

    rotateProxyRef.current =
      proxy;

    const transform =
      new TransformControls(
        manager.camera,
        manager.renderer.domElement
      );

    transform.enabled =
      false;

    transform.visible =
      false;

    manager.scene.add(
      transform
    );

    transformRef.current =
      transform;

    const onDraggingChanged =
      (event) => {
        manager.controls.enabled =
          !event.value;
      };

    const onMouseDown = () => {
      const state =
        useAppStore.getState();

      if (
        !state.fitEditMode ||
        fitToolRef.current !==
          'rotate' ||
        !state.selectedBoneName
      ) {
        return;
      }

      rotationBoneRef.current =
        state.selectedBoneName;

      rotationStartRef.current =
        proxy.quaternion.clone();
    };

    const onMouseUp = () => {
      const boneName =
        rotationBoneRef.current;

      const start =
        rotationStartRef.current;

      rotationBoneRef.current =
        null;

      rotationStartRef.current =
        null;

      if (
        !boneName ||
        !start
      ) {
        return;
      }

      const end =
        proxy.quaternion
          .clone()
          .normalize();

      // GLOBAL delta: q_new = delta * q_old.
      const delta =
        end
          .clone()
          .multiply(
            start
              .clone()
              .invert()
          )
          .normalize();

      const angle =
        2 *
        Math.acos(
          Math.min(
            1,
            Math.abs(
              delta.w
            )
          )
        );

      if (
        angle <
        0.0001
      ) {
        syncRotateGizmo();
        return;
      }

      rotateFittedBone(
        boneName,
        [
          delta.x,
          delta.y,
          delta.z,
          delta.w,
        ]
      );

      // React will rerender the fitted skeleton; snap the gizmo to the edited bone.
      requestAnimationFrame(
        () =>
          syncRotateGizmo()
      );
    };

    transform.addEventListener(
      'dragging-changed',
      onDraggingChanged
    );

    transform.addEventListener(
      'mouseDown',
      onMouseDown
    );

    transform.addEventListener(
      'mouseUp',
      onMouseUp
    );

    const onFitTool =
      (event) => {
        const tool =
          event.detail?.tool ===
          'rotate'
            ? 'rotate'
            : 'move';

        fitToolRef.current =
          tool;

        syncRotateGizmo();
      };

    const onKeyDown =
      (event) => {
        const state =
          useAppStore.getState();

        if (
          !state.fitEditMode
        ) {
          return;
        }

        const target =
          event.target;

        const tag =
          target?.tagName?.toLowerCase();

        if (
          tag === 'input' ||
          tag === 'textarea' ||
          target?.isContentEditable
        ) {
          return;
        }

        const key =
          event.key.toLowerCase();

        if (key === 'g') {
          fitToolRef.current =
            'move';

          window.dispatchEvent(
            new CustomEvent(
              'quinn-fit-tool-state',
              {
                detail: {
                  tool: 'move',
                },
              }
            )
          );

          syncRotateGizmo();
        }

        if (key === 'r') {
          fitToolRef.current =
            'rotate';

          window.dispatchEvent(
            new CustomEvent(
              'quinn-fit-tool-state',
              {
                detail: {
                  tool: 'rotate',
                },
              }
            )
          );

          syncRotateGizmo();
        }
      };

    window.addEventListener(
      'quinn-fit-tool',
      onFitTool
    );

    window.addEventListener(
      'keydown',
      onKeyDown
    );

    return () => {
      window.removeEventListener(
        'quinn-fit-tool',
        onFitTool
      );

      window.removeEventListener(
        'keydown',
        onKeyDown
      );

      transform.removeEventListener(
        'dragging-changed',
        onDraggingChanged
      );

      transform.removeEventListener(
        'mouseDown',
        onMouseDown
      );

      transform.removeEventListener(
        'mouseUp',
        onMouseUp
      );

      transform.detach();

      manager.scene.remove(
        transform
      );

      manager.scene.remove(
        proxy
      );

      transform.dispose?.();

      setViewportManager(
        null
      );

      manager.dispose();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync landmarks.
  useEffect(() => {
    managerRef.current?.syncLandmarks(
      landmarks
    );
  }, [landmarks]);

  // Placing mode.
  useEffect(() => {
    managerRef.current?.setPlacingMode(
      placingMode,
      activeLandmarkId
    );
  }, [
    placingMode,
    activeLandmarkId,
  ]);

  // Toggles.
  useEffect(() => {
    managerRef.current?.setLandmarksVisible(
      showLandmarks
    );
  }, [showLandmarks]);

  useEffect(() => {
    managerRef.current?.setSkeletonVisible(
      showSkeleton
    );
  }, [showSkeleton]);

  useEffect(() => {
    managerRef.current?.setWireframe(
      showWireframe
    );
  }, [showWireframe]);

  useEffect(() => {
    managerRef.current?.setXray(
      showXray
    );
  }, [showXray]);

  useEffect(() => {
    managerRef.current?.setGridVisible(
      showGrid
    );
  }, [showGrid]);

  useEffect(() => {
    managerRef.current?.setProjection(
      projection
    );

    if (
      transformRef.current &&
      managerRef.current
    ) {
      transformRef.current.camera =
        managerRef.current.camera;
    }

    syncRotateGizmo();
  }, [projection]);

  // Symmetry visualization.
  useEffect(() => {
    managerRef.current?.setSymmetryPlaneVisible(
      symmetry.enabled &&
        placingMode,
      symmetry.axis
    );
  }, [
    symmetry,
    placingMode,
  ]);

  // Skeleton overlay.
  useEffect(() => {
    managerRef.current?.renderSkeleton(
      templateToUnrealCoordinates(template)
    );
  }, [template]);

  useEffect(() => {
    managerRef.current?.setBoneAxesVisible(
      showBoneAxes
    );
  }, [
    showBoneAxes,
    template,
  ]);

  // Fitted skeleton.
  useEffect(() => {
    managerRef.current?.renderFittedSkeleton(
      fitted
    );

    requestAnimationFrame(
      () =>
        syncRotateGizmo()
    );
  }, [fitted]);

  useEffect(() => {
    managerRef.current?.setFittedVisible(
      showFitted
    );

    syncRotateGizmo();
  }, [
    showFitted,
    fitted,
  ]);

  useEffect(() => {
    if (
      fitToolRef.current ===
      'move'
    ) {
      managerRef.current?.setJointEditMode(
        fitEditMode
      );
    }

    syncRotateGizmo();
  }, [fitEditMode]);

  useEffect(() => {
    managerRef.current?.highlightJoint(
      selectedBoneName
    );

    syncRotateGizmo();
  }, [
    selectedBoneName,
    fitted,
  ]);

  useEffect(() => {
    managerRef.current?.highlightBone(
      selectedBoneName
    );
  }, [
    selectedBoneName,
    template,
  ]);

  // Camera commands.
  useEffect(() => {
    if (
      cameraCommand?.verb
    ) {
      managerRef.current?.setCameraView(
        cameraCommand.verb
      );
    }
  }, [cameraCommand]);

  return (
    <div
      ref={containerRef}
      data-testid="viewport-3d-container"
      className="absolute inset-0"
      style={{
        background:
          'var(--viewport-bg)',
      }}
    />
  );
}

function idToLabel(id) {
  return id
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      (c) =>
        c.toUpperCase()
    );
}

// Kept for compatibility with existing imports.
export function useViewportManager() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ref =
    useRef(null);

  return ref;
}
