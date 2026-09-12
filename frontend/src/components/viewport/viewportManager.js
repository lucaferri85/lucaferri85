/**
 * ViewportManager
 * ---------------
 * Encapsulates the entire Three.js scene: renderer, cameras (perspective +
 * orthographic), orbit controls, lighting, ground grid, mesh, landmark
 * spheres, drag interactions, skeleton overlay.
 *
 * The React <Viewport3D/> component just mounts a container and pushes
 * state changes into this manager via imperative setter methods.
 *
 * All coordinates here are Y-up, right-handed, metres (matches Three.js).
 * Conversion to UE5 Z-up cm happens later in the UnrealExporter module.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader }   from 'three/examples/jsm/loaders/GLTFLoader';
import { OBJLoader }    from 'three/examples/jsm/loaders/OBJLoader';
import { FBXLoader }    from 'three/examples/jsm/loaders/FBXLoader';
import { LANDMARKS_BY_ID } from '../../lib/landmarks';
import { createSurfaceSampler, triArea } from '../../lib/meshSampler';

const VIEWPORT_BG = 0x121316;
const GRID_MAJOR  = 0x2e323b;
const GRID_MINOR  = 0x1c1d22;

export class ViewportManager {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(VIEWPORT_BG);

    // Cameras
    this.perspectiveCamera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.01, 100);
    this.perspectiveCamera.position.set(1.6, 1.5, 2.6);

    const aspect = this.width / this.height;
    const size = 2.2;
    this.orthoCamera = new THREE.OrthographicCamera(-size*aspect, size*aspect, size, -size, 0.01, 100);
    this.orthoCamera.position.set(0, 1.2, 3);

    this.camera = this.perspectiveCamera;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.outline = 'none';

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1.0, 0);
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 15;

    // Lighting - DCC studio 3-point
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 3, 2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xea580c, 0.35);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.2);
    fill.position.set(0, 1, -3);
    this.scene.add(fill);

    // Grid (major + minor)
    this.gridMajor = new THREE.GridHelper(10, 10, GRID_MAJOR, GRID_MAJOR);
    this.gridMajor.material.opacity = 0.55; this.gridMajor.material.transparent = true;
    this.scene.add(this.gridMajor);
    this.gridMinor = new THREE.GridHelper(10, 100, GRID_MINOR, GRID_MINOR);
    this.gridMinor.material.opacity = 0.25; this.gridMinor.material.transparent = true;
    this.scene.add(this.gridMinor);

    // Axis indicator at origin
    const axis = new THREE.AxesHelper(0.25);
    axis.position.set(0, 0.002, 0);
    this.scene.add(axis);

    // Mesh group
    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);
    this.currentMesh = null;

    // Landmark group
    this.landmarkGroup = new THREE.Group();
    this.scene.add(this.landmarkGroup);
    this.landmarkMeshes = new Map(); // id -> mesh

    // Skeleton overlay group
    this.skeletonGroup = new THREE.Group();
    this.skeletonGroup.visible = false;
    this.scene.add(this.skeletonGroup);

    // Symmetry plane (hidden by default)
    this.symmetryPlane = this._buildSymmetryPlane();
    this.symmetryPlane.visible = false;
    this.scene.add(this.symmetryPlane);

    // Interaction
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hoverMeshPoint = null;

    // State callbacks
    this.callbacks = {
      onLandmarkPlaced: null,   // (id, {x,y,z})
      onLandmarkMoved: null,    // (id, {x,y,z})
      onLandmarkSelected: null, // (id)
    };

    // Drag state
    this._dragging = null; // { id, offset }
    this._draggedMoved = false;

    // Placement mode
    this.placingMode = false;
    this.activeLandmarkId = null;
    this.showLandmarks = true;
    this.showSkeleton = false;
    this.showGrid = true;

    // Preview marker while placing
    this.previewMarker = this._buildPreviewMarker();
    this.previewMarker.visible = false;
    this.scene.add(this.previewMarker);

    // Event listeners
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp   = this._onPointerUp.bind(this);
    this.renderer.domElement.addEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this._onPointerUp);

    this._resizeObs = new ResizeObserver(() => this._onResize());
    this._resizeObs.observe(container);

    this.running = true;
    this._animate();

    // Load a default placeholder humanoid so the viewport is never empty
    this._loadDummyCharacter();
  }

  // ---------- Public API ----------

  dispose() {
    this.running = false;
    this._resizeObs.disconnect();
    this.renderer.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
  }

  setCallbacks(cb) { this.callbacks = { ...this.callbacks, ...cb }; }

  setProjection(mode) {
    const targetIsPerspective = mode === 'perspective';
    const current = this.camera;
    const target = targetIsPerspective ? this.perspectiveCamera : this.orthoCamera;
    target.position.copy(current.position);
    this.camera = target;
    this.controls.object = this.camera;
    this.controls.update();
  }

  setCameraView(verb) {
    const t = this.controls.target;
    const d = 2.4;
    const cam = this.camera;
    switch (verb) {
      case 'front':  cam.position.set(t.x, t.y, t.z + d); break;
      case 'back':   cam.position.set(t.x, t.y, t.z - d); break;
      case 'right':  cam.position.set(t.x + d, t.y, t.z); break;
      case 'left':   cam.position.set(t.x - d, t.y, t.z); break;
      case 'top':    cam.position.set(t.x, t.y + d, t.z + 0.001); break;
      case 'iso':
      default:       cam.position.set(t.x + 1.6, t.y + 1.3, t.z + 2.4); break;
    }
    this.controls.update();
  }

  setGridVisible(v) { this.gridMajor.visible = v; this.gridMinor.visible = v; this.showGrid = v; }

  setWireframe(v) {
    this.currentMesh?.traverse(o => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { if (m) m.wireframe = v; });
      }
    });
  }

  setXray(v) {
    this.currentMesh?.traverse(o => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => { if (!m) return; m.transparent = v; m.opacity = v ? 0.35 : 1.0; m.depthWrite = !v; });
      }
    });
  }

  setLandmarksVisible(v) { this.landmarkGroup.visible = v; this.showLandmarks = v; }
  setSkeletonVisible(v)  { this.skeletonGroup.visible = v; this.showSkeleton = v; }
  setSymmetryPlaneVisible(v, axis = 'x') {
    this.symmetryPlane.visible = v;
    this.symmetryPlane.rotation.set(0, 0, 0);
    if (axis === 'x') this.symmetryPlane.rotation.y = Math.PI / 2; // face along X
    if (axis === 'y') this.symmetryPlane.rotation.x = Math.PI / 2;
    if (axis === 'z') {/* default plane orientation */}
  }

  setPlacingMode(active, landmarkId) {
    this.placingMode = active;
    this.activeLandmarkId = landmarkId || null;
    this.previewMarker.visible = false;
    this.renderer.domElement.style.cursor = active ? 'crosshair' : 'default';
    // Highlight active landmark
    for (const [id, mesh] of this.landmarkMeshes) {
      const isActive = id === landmarkId;
      mesh.userData.ring.visible = isActive || mesh.userData.hovered === true;
      mesh.userData.ring.scale.setScalar(isActive ? 1.4 : 1.0);
    }
  }

  /** Sync landmark positions from state array */
  syncLandmarks(landmarks) {
    // Remove stale
    const seen = new Set(landmarks.map(l => l.id));
    for (const [id, mesh] of this.landmarkMeshes) {
      if (!seen.has(id)) {
        this.landmarkGroup.remove(mesh);
        this.landmarkMeshes.delete(id);
      }
    }
    for (const lm of landmarks) {
      let m = this.landmarkMeshes.get(lm.id);
      if (!m) {
        const def = LANDMARKS_BY_ID[lm.id];
        m = this._buildLandmarkMarker(lm.id, def?.color || '#ffffff');
        this.landmarkGroup.add(m);
        this.landmarkMeshes.set(lm.id, m);
      }
      m.visible = lm.placed;
      if (lm.placed) m.position.set(lm.position.x, lm.position.y, lm.position.z);
      m.userData.mirrored = lm.mirrored;
      // Show ring dim if mirrored
      const mat = m.material;
      if (lm.mirrored) mat.emissiveIntensity = 0.4;
      else             mat.emissiveIntensity = 0.9;
      // auto-detected confidence: lower confidence = bigger, dimmer marker so it stands out for review
      const conf = lm.confidence;
      m.scale.setScalar(conf === 'low' ? 1.45 : conf === 'medium' ? 1.2 : 1);
      if (conf === 'low') mat.emissiveIntensity = 0.35;
    }
  }

  /** Render skeleton bones from the loaded template. */
  renderSkeleton(template) {
    // Clear existing
    while (this.skeletonGroup.children.length) {
      const c = this.skeletonGroup.children[0];
      this.skeletonGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose && c.material.dispose();
    }
    this._lastSkeletonTemplate = template;
    if (!template || !template.bones) return;

    const byName = Object.fromEntries(template.bones.map(b => [b.name, b]));

    // Draw bone lines
    const positions = [];
    const colors = [];
    const kindColors = {
      deform: new THREE.Color(0x10b981),
      twist: new THREE.Color(0xa855f7),
      ik: new THREE.Color(0x06b6d4),
      corrective: new THREE.Color(0xeab308),
      aux: new THREE.Color(0x94a3b8),
      root: new THREE.Color(0xf97316),
    };

    for (const b of template.bones) {
      if (!b.parent) continue;
      const p = byName[b.parent];
      if (!p) continue;
      positions.push(p.refGlobal[0], p.refGlobal[1], p.refGlobal[2]);
      positions.push(b.refGlobal[0], b.refGlobal[1], b.refGlobal[2]);
      const c = kindColors[b.kind] || kindColors.deform;
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false });
    const lines = new THREE.LineSegments(geo, mat);
    lines.renderOrder = 2;
    this.skeletonGroup.add(lines);

    // Joint dots
    const jointGeo = new THREE.SphereGeometry(0.008, 8, 8);
    const jointMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, depthTest: false });
    for (const b of template.bones) {
      const s = new THREE.Mesh(jointGeo, jointMat);
      s.position.set(b.refGlobal[0], b.refGlobal[1], b.refGlobal[2]);
      s.renderOrder = 3;
      s.userData.boneName = b.name;
      this.skeletonGroup.add(s);
    }

    // Per-bone orientation tripods (from refGlobalRot) — toggled separately
    const axisPos = [], axisCol = [];
    const len = 0.025;
    const q = new THREE.Quaternion();
    const o = new THREE.Vector3();
    const axes = [[1, 0, 0, 0xef4444], [0, 1, 0, 0x22c55e], [0, 0, 1, 0x3b82f6]];
    for (const b of template.bones) {
      if (!b.refGlobalRot) continue;
      q.set(b.refGlobalRot[0], b.refGlobalRot[1], b.refGlobalRot[2], b.refGlobalRot[3]);
      o.set(b.refGlobal[0], b.refGlobal[1], b.refGlobal[2]);
      for (const [x, y, z, hex] of axes) {
        const d = new THREE.Vector3(x, y, z).applyQuaternion(q).multiplyScalar(len);
        axisPos.push(o.x, o.y, o.z, o.x + d.x, o.y + d.y, o.z + d.z);
        const c = new THREE.Color(hex);
        axisCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const axGeo = new THREE.BufferGeometry();
    axGeo.setAttribute('position', new THREE.Float32BufferAttribute(axisPos, 3));
    axGeo.setAttribute('color', new THREE.Float32BufferAttribute(axisCol, 3));
    this.boneAxes = new THREE.LineSegments(axGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    this.boneAxes.renderOrder = 4;
    this.boneAxes.visible = !!this.showBoneAxes;
    this.skeletonGroup.add(this.boneAxes);
  }

  setBoneAxesVisible(v) { this.showBoneAxes = v; if (this.boneAxes) this.boneAxes.visible = v; }

  // ---------- Fitted skeleton (Phase B) ----------

  /** Render the fitted skeleton (orange) with draggable joint spheres. */
  renderFittedSkeleton(fitted) {
    if (!this.fittedGroup) {
      this.fittedGroup = new THREE.Group();
      this.scene.add(this.fittedGroup);
      this.jointMeshes = new Map();
    }
    while (this.fittedGroup.children.length) {
      const c = this.fittedGroup.children[0];
      this.fittedGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material && c.material.dispose) c.material.dispose();
    }
    this.jointMeshes.clear();
    if (!fitted || !fitted.bones) return;
    const by = Object.fromEntries(fitted.bones.map(b => [b.name, b]));
    const pos = [], col = [];
    const cOk = new THREE.Color(0xf97316), cWarn = new THREE.Color(0xeab308), cErr = new THREE.Color(0xef4444), cIk = new THREE.Color(0x06b6d4), cTwist = new THREE.Color(0xc084fc);
    for (const b of fitted.bones) {
      if (!b.parent || !by[b.parent]) continue;
      const p = by[b.parent].globalPos, g = b.globalPos;
      pos.push(p[0], p[1], p[2], g[0], g[1], g[2]);
      const c = b.status === 'error' ? cErr : b.status === 'warn' ? cWarn : b.kind === 'ik' ? cIk : b.kind === 'twist' ? cTwist : cOk;
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.95 }));
    lines.renderOrder = 7;
    this.fittedGroup.add(lines);

    const jGeo = new THREE.SphereGeometry(0.011, 10, 10);
    for (const b of fitted.bones) {
      const color = b.status === 'error' ? 0xef4444 : b.status === 'warn' ? 0xeab308 : b.manual ? 0x38bdf8 : 0xffffff;
      const m = new THREE.Mesh(jGeo, new THREE.MeshBasicMaterial({ color, depthTest: false }));
      m.position.set(b.globalPos[0], b.globalPos[1], b.globalPos[2]);
      m.renderOrder = 8;
      m.userData.jointName = b.name;
      this.fittedGroup.add(m);
      this.jointMeshes.set(b.name, m);
    }
    this.highlightJoint(this._highlightedJoint);
  }

  setFittedVisible(v) { if (this.fittedGroup) this.fittedGroup.visible = v; }

  setJointEditMode(v) {
    this.jointEditMode = v;
    this.renderer.domElement.style.cursor = v ? 'move' : 'default';
  }

  highlightJoint(name) {
    this._highlightedJoint = name;
    if (!this.jointMeshes) return;
    for (const [n, m] of this.jointMeshes) {
      const on = n === name;
      m.scale.setScalar(on ? 2.4 : 1);
      if (on) m.material.color.set(0xf97316);
    }
  }

  _pickJoint() {
    if (!this.fittedGroup || !this.fittedGroup.visible) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.params.Points = { threshold: 0.02 };
    const hits = this.raycaster.intersectObjects([...this.jointMeshes.values()], false);
    return hits[0] || null;
  }

  /** Highlight a bone in the skeleton overlay. */
  highlightBone(name) {
    this.skeletonGroup.traverse(o => {
      if (o.isMesh && o.userData.boneName) {
        const active = o.userData.boneName === name;
        o.scale.setScalar(active ? 2.2 : 1);
        o.material = new THREE.MeshBasicMaterial({ color: active ? 0xf97316 : 0xf8fafc, depthTest: false });
      }
    });
  }

  /** Load a mesh from a File (GLB/GLTF/OBJ/FBX). Returns { vertices, faces, height_m, bounds }. */
  async loadMeshFromFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    let obj;
    if (ext === 'glb' || ext === 'gltf') {
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(arrayBuffer, '');
      obj = gltf.scene;
    } else if (ext === 'obj') {
      const text = new TextDecoder().decode(arrayBuffer);
      const loader = new OBJLoader();
      obj = loader.parse(text);
    } else if (ext === 'fbx') {
      const loader = new FBXLoader();
      obj = loader.parse(arrayBuffer, '');
    } else {
      throw new Error(`Unsupported mesh format: ${ext}`);
    }
    return this._installMesh(obj, ext, file.name);
  }

  /** World-space, area-uniform surface sample of the current mesh (≈ maxPoints, independent of vertex count). */
  getMeshPointCloud(maxPoints = 80000) {
    if (!this.currentMesh) return [];
    this.currentMesh.updateMatrixWorld(true);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const forEachTri = (fn) => this.currentMesh.traverse(o => {
      if (!o.isMesh || !o.geometry?.attributes.position) return;
      const pos = o.geometry.attributes.position, index = o.geometry.index;
      const n = index ? index.count : pos.count;
      const at = (k) => index ? index.getX(k) : k;
      for (let i = 0; i + 2 < n; i += 3) {
        a.fromBufferAttribute(pos, at(i)).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, at(i + 1)).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, at(i + 2)).applyMatrix4(o.matrixWorld);
        fn(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    });
    let total = 0, count = 0;
    forEachTri((...t) => { total += triArea(...t); count++; });
    const sampler = createSurfaceSampler(total, count, maxPoints);
    forEachTri(sampler.add);
    return sampler.points;
  }

  removeMesh() {
    if (this.currentMesh) {
      this.meshGroup.remove(this.currentMesh);
      this._disposeObject(this.currentMesh);
      this.currentMesh = null;
    }
  }

  // ---------- Internal ----------

  _installMesh(obj, ext, filename) {
    this.removeMesh();

    // Give every mesh a clay material if it has none
    obj.traverse(o => {
      if (o.isMesh) {
        o.frustumCulled = false;
        if (!o.material || Array.isArray(o.material) === false && !o.material.map) {
          o.material = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, roughness: 0.55, metalness: 0.05 });
        }
      }
    });

    // Compute bounds
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3(); bbox.getSize(size);
    const center = new THREE.Vector3(); bbox.getCenter(center);

    // Auto-scale so height is roughly 1.75m
    const targetHeight = 1.75;
    let scale = 1;
    if (size.y > 0.01) scale = targetHeight / size.y;
    obj.scale.setScalar(scale);

    // Recompute bounds after scale
    obj.updateMatrixWorld(true);
    const bbox2 = new THREE.Box3().setFromObject(obj);
    const size2 = new THREE.Vector3(); bbox2.getSize(size2);
    const center2 = new THREE.Vector3(); bbox2.getCenter(center2);

    // Move so feet are on Y=0 and centered on X/Z
    obj.position.x -= center2.x;
    obj.position.z -= center2.z;
    obj.position.y -= bbox2.min.y;
    obj.updateMatrixWorld(true);

    this.meshGroup.add(obj);
    this.currentMesh = obj;

    // Aim camera at chest
    this.controls.target.set(0, size2.y * 0.55, 0);
    this.controls.update();

    // Count polys & verts
    let vertices = 0, faces = 0;
    obj.traverse(o => {
      if (o.isMesh && o.geometry) {
        const pos = o.geometry.attributes.position;
        if (pos) vertices += pos.count;
        if (o.geometry.index) faces += o.geometry.index.count / 3;
        else if (pos) faces += pos.count / 3;
      }
    });

    return {
      filename,
      format: ext,
      vertices: Math.round(vertices),
      faces: Math.round(faces),
      height_m: size2.y,
      bounds_min: { x: bbox2.min.x, y: bbox2.min.y, z: bbox2.min.z },
      bounds_max: { x: bbox2.max.x, y: bbox2.max.y, z: bbox2.max.z },
    };
  }

  _loadDummyCharacter() {
    // Procedural mannequin so the viewport is always populated for testing
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, roughness: 0.7, metalness: 0.05 });

    const add = (geo, x, y, z, rx=0, ry=0, rz=0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      group.add(m);
    };
    // Head
    add(new THREE.SphereGeometry(0.11, 24, 24), 0, 1.72, 0);
    // Neck
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 12), 0, 1.60, 0);
    // Torso
    add(new THREE.CylinderGeometry(0.16, 0.14, 0.55, 16), 0, 1.30, 0);
    // Pelvis
    add(new THREE.SphereGeometry(0.14, 16, 12), 0, 1.00, 0);
    // Arms L
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 12), 0.32, 1.36, 0, 0, 0, Math.PI/2 - 0.35);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 12), 0.55, 1.22, 0, 0, 0, Math.PI/2 - 0.55);
    add(new THREE.SphereGeometry(0.05, 12, 12), 0.72, 1.15, 0);
    // Arms R
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 12), -0.32, 1.36, 0, 0, 0, -Math.PI/2 + 0.35);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 12), -0.55, 1.22, 0, 0, 0, -Math.PI/2 + 0.55);
    add(new THREE.SphereGeometry(0.05, 12, 12), -0.72, 1.15, 0);
    // Legs L
    add(new THREE.CylinderGeometry(0.07, 0.06, 0.42, 12), 0.11, 0.75, 0);
    add(new THREE.CylinderGeometry(0.055, 0.05, 0.42, 12), 0.12, 0.33, 0);
    add(new THREE.BoxGeometry(0.09, 0.06, 0.22), 0.12, 0.06, 0.04);
    // Legs R
    add(new THREE.CylinderGeometry(0.07, 0.06, 0.42, 12), -0.11, 0.75, 0);
    add(new THREE.CylinderGeometry(0.055, 0.05, 0.42, 12), -0.12, 0.33, 0);
    add(new THREE.BoxGeometry(0.09, 0.06, 0.22), -0.12, 0.06, 0.04);

    this.meshGroup.add(group);
    this.currentMesh = group;
    return {
      filename: 'placeholder_humanoid',
      format: 'proc',
      vertices: 0,
      faces: 0,
      height_m: 1.75,
      bounds_min: { x: -0.72, y: 0, z: -0.11 },
      bounds_max: { x:  0.72, y: 1.83, z:  0.15 },
    };
  }

  _buildLandmarkMarker(id, hex) {
    const color = new THREE.Color(hex);
    const geo = new THREE.SphereGeometry(0.022, 16, 12);
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.9,
      roughness: 0.4, metalness: 0.0,
      depthTest: false, transparent: true, opacity: 0.95,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 4;
    mesh.userData.landmarkId = id;
    // Ring accent
    const ringGeo = new THREE.RingGeometry(0.03, 0.038, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.userData.parentLandmarkId = id;
    ring.visible = false;
    ring.renderOrder = 5;
    mesh.add(ring);
    mesh.userData.ring = ring;
    return mesh;
  }

  _buildPreviewMarker() {
    const geo = new THREE.SphereGeometry(0.018, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.75, depthTest: false });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 6;
    return m;
  }

  _buildSymmetryPlane() {
    const geo = new THREE.PlaneGeometry(3, 2.4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xea580c, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
    const plane = new THREE.Mesh(geo, mat);
    plane.position.y = 1.0;
    // Grid outline
    const g = new THREE.GridHelper(2.4, 12, 0xea580c, 0xea580c);
    g.material.opacity = 0.35; g.material.transparent = true; g.rotation.x = Math.PI / 2;
    plane.add(g);
    return plane;
  }

  _updatePointer(evt) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _pickLandmark() {
    if (!this.landmarkGroup.visible) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [];
    for (const [, m] of this.landmarkMeshes) if (m.visible) targets.push(m);
    const hits = this.raycaster.intersectObjects(targets, false);
    return hits[0] || null;
  }

  _pickMeshSurface() {
    if (!this.currentMesh) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.currentMesh, true);
    return hits[0] || null;
  }

  _onPointerMove(evt) {
    this._updatePointer(evt);

    // Dragging a fitted joint on a camera-facing plane
    if (this._jointDrag) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this._jointDrag.plane, hit)) {
        this._jointDrag.moved = true;
        const m = this.jointMeshes.get(this._jointDrag.name);
        if (m) m.position.copy(hit);
      }
      return;
    }

    // Dragging a landmark
    if (this._dragging) {
      const surface = this._pickMeshSurface();
      if (surface) {
        this._draggedMoved = true;
        const m = this.landmarkMeshes.get(this._dragging.id);
        if (m) m.position.copy(surface.point);
      }
      return;
    }

    // Preview when in placing mode
    if (this.placingMode) {
      const surface = this._pickMeshSurface();
      if (surface) {
        this.previewMarker.position.copy(surface.point);
        this.previewMarker.visible = true;
      } else {
        this.previewMarker.visible = false;
      }
      return;
    }

    // Hover highlight
    const hit = this._pickLandmark();
    for (const [, m] of this.landmarkMeshes) {
      const hovered = hit && hit.object === m;
      m.userData.hovered = hovered;
      if (m.userData.ring && !this.placingMode) {
        m.userData.ring.visible = hovered || m.userData.landmarkId === this.activeLandmarkId;
      }
    }
    this.renderer.domElement.style.cursor = hit ? 'grab' : 'default';
  }

  _onPointerDown(evt) {
    if (evt.button !== 0) return;
    this._updatePointer(evt);

    // Fitted joint editing has priority when enabled
    if (this.jointEditMode && this.jointMeshes) {
      const hit = this._pickJoint();
      if (hit) {
        const name = hit.object.userData.jointName;
        const normal = new THREE.Vector3();
        this.camera.getWorldDirection(normal);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.object.position.clone());
        this._jointDrag = { name, plane, moved: false };
        this.controls.enabled = false;
        this.callbacks.onJointSelected && this.callbacks.onJointSelected(name);
        return;
      }
    }

    // Placement mode has priority
    if (this.placingMode && this.activeLandmarkId) {
      const surface = this._pickMeshSurface();
      if (surface) {
        const p = surface.point;
        this.callbacks.onLandmarkPlaced && this.callbacks.onLandmarkPlaced(this.activeLandmarkId, { x: p.x, y: p.y, z: p.z });
      }
      return;
    }

    // Pick existing landmark
    const hit = this._pickLandmark();
    if (hit) {
      this._dragging = { id: hit.object.userData.landmarkId };
      this._draggedMoved = false;
      this.controls.enabled = false;
      this.renderer.domElement.style.cursor = 'grabbing';
      this.callbacks.onLandmarkSelected && this.callbacks.onLandmarkSelected(hit.object.userData.landmarkId);
    }
  }

  _onPointerUp() {
    if (this._jointDrag) {
      const { name, moved } = this._jointDrag;
      this._jointDrag = null;
      this.controls.enabled = true;
      if (moved) {
        const m = this.jointMeshes.get(name);
        if (m) this.callbacks.onJointMoved && this.callbacks.onJointMoved(name, { x: m.position.x, y: m.position.y, z: m.position.z });
      }
      return;
    }
    if (this._dragging) {
      if (this._draggedMoved) {
        const m = this.landmarkMeshes.get(this._dragging.id);
        if (m) {
          const p = m.position;
          this.callbacks.onLandmarkMoved && this.callbacks.onLandmarkMoved(this._dragging.id, { x: p.x, y: p.y, z: p.z });
        }
      }
      this._dragging = null;
      this.controls.enabled = true;
      this.renderer.domElement.style.cursor = 'default';
    }
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h);
    this.perspectiveCamera.aspect = w / h;
    this.perspectiveCamera.updateProjectionMatrix();
    const aspect = w / h;
    const size = 2.2;
    this.orthoCamera.left = -size*aspect;
    this.orthoCamera.right =  size*aspect;
    this.orthoCamera.top  =  size;
    this.orthoCamera.bottom = -size;
    this.orthoCamera.updateProjectionMatrix();
  }

  _animate() {
    if (!this.running) return;
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    // Rotate rings slightly for the active landmark
    if (this.activeLandmarkId) {
      const m = this.landmarkMeshes.get(this.activeLandmarkId);
      if (m && m.userData.ring) m.userData.ring.rotation.z += 0.02;
    }
    this.renderer.render(this.scene, this.camera);
  }

  _disposeObject(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => m && m.dispose && m.dispose());
      }
    });
  }
}
