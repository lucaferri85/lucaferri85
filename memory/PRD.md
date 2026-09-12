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
| SkeletonFitter        | ✅ Phase B | `modules/SkeletonFitter.js`, `lib/fitRules.js`, `lib/fitService.js` |
| LandmarkDetector      | ✅ Phase B.1 | `lib/landmarkDetector.js`, `lib/meshSampler.js`, `lib/landmarkService.js` |
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

## Phase A checkpoint — APPROVED by user (Jun 2026). User imported SKM_Quinn_Simple FBX (89 bones).

## What's implemented (Phase B — Auto Fit Skeleton, Jun 2026)
- **SkeletonFitter** (`modules/SkeletonFitter.js`, rules in `lib/fitRules.js`): template-driven, name-agnostic pipeline —
  1. roots kept at template origin; 2. 20 landmark-driven joints (`JOINT_LANDMARKS`); 3. head skull-base heuristic from head_center/head_top; 4. spine/neck intermediates by template arc-length (`CHAINS`); 5. IK bones `FOLLOWS` their deform source; 6. every other bone (twist_01/02, metacarpals, fingers, interaction, center_of_mass, correctives…) transferred with ONE similarity transform (rotation+uniform scale) of its nearest landmark/chain anchor segment (`SEGMENT_END`, hand tip landmark for finger sub-hierarchies); 7. orientations = template refGlobalRot swung by segment direction change (roll preserved); locals recomputed.
  Output keeps identical names/order/parents/kinds. Per-bone `method/anchor/status/message/lengthRatio`; missing landmarks → bone + everything derived through it flagged WARN (never silently placed), scale clamp / degenerate segments → WARN, non-finite → ERROR.
- **Compare With Source** (`modules/RigValidator.compareWithSource`): count, missing/extra names, uniqueness, order, parent map, kinds, root, per-bone depth, finite transforms, collapsed bones, length outliers, fit diagnostics, template SHA match → PASS/WARNING/FAIL with items.
- **Fit tab** (right panel): AUTO FIT (gated: authoritative+validated template AND ≥6 core landmarks, blockers shown), summary counts, per-bone list with filters (all/warn/error/ok/manual) + search, Compare block, EDIT FIT (drag orange joints in viewport on camera plane; subtree follows; mirrored to `_l/_r` twin when symmetry ON), RESET BONE (subtree → auto-fit), RESET FIT, BACK TO LANDMARKS, show/hide fitted, MARK FIT APPROVED (skinning still locked).
- Viewport: fitted skeleton overlay (orange; warn=gold, error=red, IK=cyan, twist=violet; manual joints blue), selected joint highlight; Bone Inspector shows FITTED transforms.
- Persistence: `Project.fitted` + `fit_approved` (backend), restored on load; validation auto-runs on load for authoritative templates. Changing/resetting template clears the fit.
- Test hooks: `window.__quinnStore`, `window.__quinnLandmarks`, `window.__quinnFit`. Fixture `/app/tests/fixtures/test_quinn_like_89.fbx` (89-bone Quinn_Simple-shaped, NOT a UE export).
- Tests: iteration_3 — 30/30 backend; all frontend flows pass after fix (partial landmarks now WARN).

## Phase B checkpoint (STOP — awaiting user approval of fitted skeleton on real SKM_Quinn_Simple)

## What's implemented (Phase B.1 — Automatic Landmark Detection, Jun 2026) — agent-tested (iteration_5: 31/31 backend, all frontend flows PASS); awaiting user re-detect on real armored warrior (baseline 26/30 · 4 HIGH · 19 MEDIUM · 3 LOW · 4 NOT FOUND)
- **Primary action** `AUTO DETECT LANDMARKS` (→ `RESET / RE-DETECT LANDMARKS` after a run). `EDIT LANDMARKS`, `MANUAL PLACEMENT` (sequential fallback — starts at first NOT FOUND), `MIRROR`, `RESET`. Detection never triggers Auto Fit; it marks an existing fit `fitStale`. Store: `landmarkMode idle|edit|manual`, `detectionRun`, per-landmark `confidence high|medium|low|not_found|manual`, `note`, `auto`; restored on project load.
- **Detector** `lib/landmarkDetector.js` on an **area-uniform surface sample** (`lib/meshSampler.js`, ~80k pts, tessellation-independent): midline from torso cluster (not bbox — weapons/capes shift bbox); overlapping horizontal cross-sections → x-clusters (adaptive gap); head top skips thin protrusions (spikes/horns); neck = narrowest central section with real narrowing check; crotch = lowest run of two-leg split; pelvis/hips/spine from centroids; legs tracked downward per side (hanging hands rejected; merged boots → side-half centroid flagged LOW); knee = clear narrowing else proportional along tracked leg; armpit scanned DOWN from neck with shoulder-bulge and detached-pauldron rejection; shoulder = torso half-width at armpit + 1.5 %H (pauldron ignored); arms = axis-band centroids within 7 %H of shoulder→hand axis (pauldron/cape volume excluded), thin sustained radial profile cuts weapons/staffs; arm-length plausibility; T-pose fallback.
- **Policy**: no proportional guesses for structural joints → NOT FOUND with reason. Post-checks downgrade: segment-length plausibility (thigh/shin/upperarm/forearm/hand vs height; extreme → NOT FOUND), lateral drift along leg chain, vertical joint order, inside-cross-section test, L/R mismatch (else averaged when symmetry ON). Finger tips always NOT FOUND (Phase C).
- Viewport: landmark markers render on top (depthTest off) so interior joints are visible; row notes explain each classification.
- Fixtures/harness: `tests/fixtures/make_armored_obj.py [--warrior|--tpose]` → `armored_humanoid.obj`, `armored_warrior.obj` (helmet spike, sword in right hand, pauldrons, gauntlets, touching boots), `armored_tpose.obj`; `node tests/run_detector.mjs <obj>`; `tests/debug_sections.mjs`. Results: humanoid HIGH 4 · MEDIUM 17 · LOW 5 · NOT FOUND 4; warrior HIGH 3 · MEDIUM 14 · LOW 9 · NOT FOUND 4 (sword hand LOW, shoulders at torso width not pauldron, hips/pelvis LOW because thighs touch → split found low).

## Phase B.1 checkpoint (STOP — user will Reset / Re-Detect on real armored warrior; no Phase C without approval)

## Prioritized backlog

### Phase C — Automatic Skinning + Weights (locked until user approves fit) — MANDATORY REQUIREMENT (user, Jun 2026)
- Standard workflow must be fully automatic: `Import Mesh → Auto Detect Landmarks → Auto Fit exact Quinn skeleton → Automatic Skinning + Automatic Weights → Validate Weights → UE5 Compatibility Validation → Export`. The user must NOT assign vertex groups or weight-paint manually.
- Weighting must be **anatomy-aware, based on the fitted skeleton** (not mere nearest-bone): smooth, normalised weights with correct influence transitions at shoulders, clavicles, elbows, wrists, fingers, pelvis/hips, knees, ankles, feet.
- Quinn auxiliary/twist bones handled correctly (twist blending along upperarm/lowerarm/thigh/calf); IK / interaction / center_of_mass / correctives excluded from deformation so the result stays compatible with the imported Quinn structure.
- **Weight validation** is required: unweighted vertices, invalid influences (non-deform bones), non-normalised weights, excessive influences per vertex (UE5 limit), disconnected/incorrect influences, suspicious weight leakage between unrelated body regions.
- Manual weight editing may exist only as an advanced correction tool, never required in the standard workflow.
- Also: finger landmarks for all 5 fingers, Mirror Hand Rig L→R, heel → foot roll refinement.

### Phase D — Validation + Export (headless Blender FBX, Y-up m → Z-up cm).

### Deferred (user said NOT yet): Sample Mesh Library.

## Deferred technical answers (for reference)
Full answers to user's 20 pre-development questions are in the initial conversation. Key commitments:
- Exact Quinn preservation via template-driven fitter (never hard-coded).
- FBX pipeline = headless Blender (rejected pure-JS FBX writers due to skin-cluster fidelity risk).
- Coordinate conversion centralized in UnrealExporter.
- Non-destructive dependency chain via dirty flags.
- Local-first: everything runs in browser except MongoDB project sync.
