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

## What's implemented (Phase A — Template authority, Jun 2026)
- **Honest provenance**: bundled 71-bone template renamed `Quinn-like Sample (DEV)`, source `sample_dev`, labelled **DEVELOPMENT / SAMPLE TEMPLATE** everywhere (amber badge). It is a hand-authored approximation (subset, eyeballed positions, identity rotations) — never labelled as exact Quinn.
- **Authoritative FBX import** (`lib/fbx/fbxSkeletonImporter.js` + vendored `FBXLoaderRaw.js` with `parseTreeOnly()`): reads LimbNode/Root/Limb/Effector + skin-bound nodes verbatim — exact names, parent links from OO connections, Lcl T/R/S + Pre/PostRotation + RotationOrder via FBX transform formula, bind-pose cross-check (mm), GlobalSettings (units/axes/version/creator), SHA-256. Units cm→m (×0.01 translations only); axis fix only for non-Y-up files, applied to root bones only. Nothing renamed/dropped/re-parented; anomalies → warnings/errors in `template.diagnostics`.
- **Template sources**: `sample_dev` | `user_authoritative` (FBX or FBX-derived JSON carrying sha256) | `user_json` (unverified). Green badge **USER-SUPPLIED AUTHORITATIVE TEMPLATE** for FBX imports.
- **Metadata card** (left panel 03): name, source, bone count, version, import date, validation status. Buttons: IMPORT QUINN FBX, VALIDATE TEMPLATE STRUCTURE, JSON import, EXPORT JSON (derived cache), RESET TO SAMPLE, LIBRARY select.
- **VALIDATE TEMPLATE STRUCTURE** (`POST /api/templates/validate`, ~19 checks): bones present, names present/unique/charset, parents resolve, single root, acyclic/reachable, depth, local transforms finite, global finite, unit quaternions, positive scales, local/global consistency, zero-length info, height plausibility, L/R symmetry, UE5 core bones, landmark target bones, provenance. Returns `status valid|warning|invalid` + per-check items.
- **Template tab** (right panel): provenance, units & orientation, skeleton summary (count, roots, depth, skinned/non-skinned, kinds, height, bind Δ), parser report, validation check list with drill-down, export guide.
- **Bone Inspector** (Bones tab): parent link, children, depth, skinned, FBX node type/id, local pos/quat/euler/scale, global pos/euler, bind pose, verbatim FBX Lcl values. Bone-axes tripod toggle in viewport; corrective/aux colour coding.
- **Template library** persisted in MongoDB (`templates` collection; upsert by sha256): `POST/GET/DELETE /api/templates`, `GET /api/templates/{id}`. Project save stores `template.source` + `saved_template_id`.
- **Fit gating**: `isFitAuthorized()` = source `user_authoritative` AND validation not invalid. Diagnostics tab shows "Blocked" reasons.
- **Docs**: `/app/docs/QUINN_EXPORT_GUIDE.md`, `/app/docs/ue5_export_quinn_skeleton.py`. Fixtures: `/app/tests/fixtures/*.fbx` (+ generator).
- Tests: iteration_2 — 25/25 backend, all frontend flows pass.

## Phase A checkpoint (STOP — awaiting user)
User must import the real SKM_Quinn FBX exported from UE5 and confirm hierarchy/transforms before Phase B is authorised.

## Prioritized backlog

### Phase B — Auto Fit Skeleton (authorised only after real Quinn FBX validated)
- Landmark-driven solve; unmapped bones (correctives, twist_02, metacarpals…) keep template-relative local transforms scaled **segment-aware** (arm→arm, leg→leg, spine→torso, hand→hand); IK bones follow functional source; unfittable → WARNING, never dropped/renamed/re-parented.
- COMPARE WITH SOURCE TEMPLATE: bone-for-bone names + parents + count diff.
- Live fitted-skeleton preview; regenerate on landmark change.

### Phase C — Manual Finger Rig + Rig Preview Correction
- Finger landmarks for all 5 fingers (knuckle + tip), intermediate/metacarpal joints derived proportionally from template.
- Direct joint drag in viewport (children follow), Mirror Hand Rig L→R, independent final correction, re-validate.

### Phase D — Skinning (Python worker, heat diffusion; twist blending; IK excluded), Validation, Export (headless Blender FBX, Y-up m → Z-up cm).

### Deferred (user said NOT yet): Sample Mesh Library.

## Deferred technical answers (for reference)
Full answers to user's 20 pre-development questions are in the initial conversation. Key commitments:
- Exact Quinn preservation via template-driven fitter (never hard-coded).
- FBX pipeline = headless Blender (rejected pure-JS FBX writers due to skin-cluster fidelity risk).
- Coordinate conversion centralized in UnrealExporter.
- Non-destructive dependency chain via dirty flags.
- Local-first: everything runs in browser except MongoDB project sync.
