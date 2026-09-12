QUINN RIGGER — CUMULATIVE UPDATE
2026-09-12

This package is meant to be applied ONCE to the current Mannequin branch.
All included source files are complete replacements, not snippets.

INCLUDED
1) Unreal coordinate workspace
   X = Forward/Back
   Y = Right/Left
   Z = Up/Down
   Authoritative Quinn template remains non-destructively preserved.

2) Centerline structural lock
   pelvis / spine / chest / neck / head / head top landmarks stay on Y=0.
   Quinn pelvis, spine_*, neck_* and head fitted joints stay on Y=0.
   Side views can still edit X depth/curvature.

3) Mouse/camera correction after Z-up migration
   Z-up cameras are retained and orbit drag direction is corrected after the axis conversion.
   Pan/zoom remain normal.

4) Light UI refresh
   White/light-gray application shell.
   Gray controls and surfaces.
   Medium-gray Blender-like modelling viewport.
   Orange reserved for primary actions/selection.
   Green/warning/error colors remain semantic.

5) Real Phase C automatic skinning
   Anatomy-aware Quinn weights, not generic nearest-bone only.
   Max 4 normalized influences.
   Root/IK/aux excluded.
   Twist/corrective deform bones supported.
   Same-side and anatomical-region bias.
   Z-up/Y-lateral metrics updated for the new Unreal workspace.
   Weight validation + stale detection.

6) Phase 05 UE5 validation
   Phase 05 unlocks after skinning exists.
   Diagnostics show skeleton/fit/skin validity.
   Continue-to-export is enabled only when skin validation passes and weights are not stale.

7) Phase 06 export
   Skinned GLB export path.
   Lossless .quinnrig.json snapshot containing skeleton + Uint16 indices + Float32 weights.
   Blender bridge included for GLB -> FBX.
   Direct browser FBX remains intentionally blocked because a browser-only fake FBX is not acceptable for exact Quinn compatibility.

IMPORTANT WORKFLOW
01 Import Mesh
02 Landmarks
03 Fit Skeleton -> Compare -> Approve
04 Skinning -> Generate Automatic Weights -> PASS
05 UE5 Validation -> all blocking checks PASS
06 Export Rig -> Skinned GLB and/or .quinnrig.json
Then use docs/quinn_glb_to_ue5_fbx.py for final FBX conversion when required.

TESTS PERFORMED BEFORE PACKAGING
PASS coordinate conversion round-trip
PASS centerline Y=0 invariant
PASS Phase 04 -> 05 -> 06 gate logic
PASS JavaScript syntax checks on non-JSX modules
PASS Z-up / Y-lateral automatic-skinning synthetic smoke test
PASS generated skinIndex + skinWeight attributes in synthetic test
PASS left/right skinning isolation in synthetic test
PASS final .quinnrig.json export contains both skeleton and skinning data
Static inspection confirms the skinned GLB export path and Blender FBX bridge are present.

NOT CLAIMED AS TESTED HERE
A real production FBX round-trip through Blender and re-import into Unreal Engine cannot be executed in this container. That final real-asset compatibility test still has to be performed with your authoritative SKM_Quinn_Simple FBX and actual character mesh.

SUGGESTED COMMIT
Cumulative Unreal axes, light UI, skinning, validation and export pipeline
