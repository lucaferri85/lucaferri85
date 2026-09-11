# UE5 Quinn Auto-Rigger Pro — PRD

## Original problem statement (verbatim summary)
Build a desktop-oriented 3D humanoid auto-rigging application for **Unreal Engine 5** that produces a rig based on the *exact* UE5 Quinn mannequin skeleton (never a Mixamo/Rigify/HumanIK-style generic humanoid).

Workflow: `IMPORT MESH → LOAD/SELECT SKELETON TEMPLATE → PLACE LANDMARKS → FIT SKELETON → PREVIEW & CORRECT → APPROVE RIG → GENERATE SKIN WEIGHTS → VALIDATE AGAINST TEMPLATE → EXPORT`.

V1 scope requested by user: mesh import + interactive landmark placement + skeleton template load & visualize. **No skinning/FBX export yet.**

## User choices (locked)
- Mesh formats: **GLB, GLTF, FBX, OBJ**
- Skeleton template: **JSON schema file** (user-uploadable; bundled default provided)
- Project persistence: **MongoDB backend** (named projects)
- Visual style: **Blender-inspired charcoal + Blender orange accents**
- Symmetry axis: **Configurable in UI (X / Y / Z; default X)**

## Personas
- **Technical artist** preparing custom humanoid meshes for UE5 assigned to `SKM_Quinn`
- **Indie game dev** wanting Mixamo-style speed but exact Quinn compatibility
- **Rigging TD** auditing bone parity before shipping a character

## Architecture (modular per user requirement)
| Module | Status | File |
|---|---|---|
| MeshImporter          | ✅ V1 | `viewportManager.js` (loadMeshFromFile) |
| Viewport3D            | ✅ V1 | `components/viewport/Viewport3D.jsx`, `viewportManager.js` |
| LandmarkManager       | ✅ V1 | `store/appStore.js`, `panels/LandmarksTab.jsx` |
| SkeletonTemplateManager | ✅ V1 | `lib/quinnTemplate.js`, `panels/BonesTab.jsx`, `POST /api/templates/validate` |
| ProjectManager        | ✅ V1 | `panels/TopBar.jsx`, `POST/GET/PATCH/DELETE /api/projects` |
| SkeletonFitter        | 🟡 Interface only | `modules/SkeletonFitter.js` |
| SkinWeightGenerator   | 🟡 Interface only | `modules/SkinWeightGenerator.js` |
| RigValidator          | 🟡 Interface only | `modules/RigValidator.js` |
| UnrealExporter        | 🟡 Interface only | `modules/UnrealExporter.js` |

## What's implemented (V1 — Feb 2026)
- **3D viewport** (Three.js, WebGL2). Orbit / pan / zoom, perspective + orthographic, front/back/left/right/top/iso presets, dual-frequency grid, DCC studio lighting, X-axis symmetry plane HUD.
- **Mesh import**: drag-drop or click for GLB / GLTF / FBX / OBJ. Auto-scaled to 1.75 m height, feet grounded at Y=0, centered. Wireframe & X-ray toggles.
- **Placeholder procedural mannequin** so the viewport is never empty on first launch.
- **Interactive landmark system**: 30 landmarks (6 center, 10 left, 10 right, 4 fingers). Draggable, snap-to-surface via raycasting, editable X/Y/Z inputs, clear/reset, group-collapsible list with progress bar. Placed-vs-pending-vs-active tri-state.
- **Symmetry mirror mode**: toggle + axis picker (X/Y/Z). Auto-mirrors left→right during placement, one-click bulk mirror button. Mirrored markers marked "MIR" and remain independently editable.
- **Skeleton template**: bundled default UE5 Quinn JSON with **71 bones** including *exact* names — `root`, `pelvis`, `spine_01..05`, `neck_01..02`, `head`, `clavicle_l/r`, `upperarm_l/r`, **`upperarm_twist_01_l/r`**, `lowerarm_l/r`, **`lowerarm_twist_01_l/r`**, `hand_l/r`, all 5 finger chains × 3 phalanges per hand, `thigh_l/r`, **`thigh_twist_01_l/r`**, `calf_l/r`, **`calf_twist_01_l/r`**, `foot_l/r`, `ball_l/r`, and IK chain (`ik_foot_root`, `ik_foot_l/r`, `ik_hand_root`, `ik_hand_gun`, `ik_hand_l/r`). User-uploadable JSON with server-side validation (duplicate names, orphan parents).
- **Skeleton visualization**: bone-line overlay (color-coded: green deform, purple twist, cyan IK) + joint spheres, selectable, highlightable, hierarchical searchable tree.
- **Project persistence**: MongoDB via FastAPI. Named projects storing landmarks, symmetry, mesh metadata, template snapshot.
- **Undo/redo** on landmark edits (Ctrl+Z / Ctrl+Y), 50-step history.
- **Workflow stage bar** (6 stages: IMPORT / LANDMARKS / SKELETON / SKINNING / VALIDATION / EXPORT) — first 3 unlocked, remaining shown as "planned Phase X".
- **Diagnostics tab** with PASS/WARN/FAIL/PENDING gating checks.
- **Dark DCC theme** — charcoal `#16171b/#1e2025`, Blender orange `#ea580c` accents, Chivo display / IBM Plex Sans UI / JetBrains Mono for bone names & coords.
- **Backend endpoints tested**: 11/11 pytest cases passing (health, project CRUD, landmark persistence, template validation for valid/duplicate/orphan/missing cases).

## Prioritized backlog

### P0 — Rig fitting core (Phase 2)
- **SkeletonFitter.fit()**: Solve template bones onto landmarks. Preserve exact names/parents. Adapt only position, orientation, length. Report warnings for unfittable bones instead of dropping them.
- Live fitted-skeleton preview inside mesh (before skinning).
- "Regenerate fit" button when landmarks change.

### P1 — Skinning (Phase 3)
- Python worker with heat-diffusion (Pinocchio) or bone-glow weight solver.
- Twist bone weight blending from parent+child.
- Non-deform flagging for IK bones (excluded from skin cluster).
- Manual finger placement mode (auto-detect fallback).
- Weight regeneration invalidation flags (`landmarksDirty → skeletonDirty → skinningDirty`).

### P1 — Validation (Phase 3)
- Full RigValidator diff: bone count, name set equality, parent map, roll delta, vertices without weights, invalid bone influences.
- PASS/WARN/FAIL summary with per-check drill-down.

### P2 — Export (Phase 4)
- FBX via headless Blender subprocess (`bpy.ops.export_scene.fbx`).
- GLB via `THREE.GLTFExporter`.
- JSON rig snapshot.
- UE5 coordinate conversion (Y-up m → Z-up cm), root transform, axis flip.

### P2 — Nice-to-have
- Object storage integration to save the actual mesh binary (not just metadata).
- Modular character support (body/hair/clothing sharing skeleton).
- Manual weight-paint tool.
- UE5 Manny + additional Unreal-compatible skeleton templates.

## Deferred technical answers (for reference)
Full answers to user's 20 pre-development questions are in the initial conversation. Key commitments:
- Exact Quinn preservation via template-driven fitter (never hard-coded).
- FBX pipeline = headless Blender (rejected pure-JS FBX writers due to skin-cluster fidelity risk).
- Coordinate conversion centralized in UnrealExporter.
- Non-destructive dependency chain via dirty flags.
- Local-first: everything runs in browser except MongoDB project sync.
