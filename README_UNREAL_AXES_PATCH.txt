QUINN RIGGER — UNREAL AXES + CENTERLINE LOCK

Coordinate convention after this patch:
- X = Forward / Back
- Y = Right / Left
- Z = Up / Down
- metres internally

Central landmark chain locked to sagittal centerline Y=0:
- pelvis
- spine_mid
- chest
- neck_base
- head_center
- head_top

Central fitted Quinn bones locked to Y=0:
- pelvis
- spine_*
- neck_*
- head

Behavior:
- Front / Back: center chain cannot drift sideways.
- Left / Right: X depth remains editable, so spine curvature can be corrected.
- Perspective / ISO: the center chain still stays on Y=0.
- Camera presets and ground grid are remapped to Unreal-style axes.
- Existing landmark detector is preserved and receives/returns converted coordinates at its boundary.
- The authoritative 89-bone Quinn template is NOT rewritten in storage; a converted non-destructive clone is used for viewport/fitting.
- Legacy saved projects are migrated to UE coordinates when loaded.
- Mesh centering uses Unreal semantics: X depth centered, Y centerline centered, feet on Z=0.

Files:
- frontend/src/lib/unrealCoordinateSystem.js                     NEW
- frontend/src/lib/landmarkService.js                            REPLACE
- frontend/src/lib/meshAlignmentService.js                       REPLACE
- frontend/src/lib/fitService.js                                 REPLACE
- frontend/src/components/viewport/Viewport3D.jsx                REPLACE
- frontend/src/components/panels/LandmarksTab.jsx                REPLACE
- frontend/src/components/panels/LeftPanel.jsx                   REPLACE
- frontend/src/components/panels/TopBar.jsx                      REPLACE

Suggested commit:
Migrate rig workspace to Unreal axes and lock centerline

After building, verify:
1. Character upright.
2. Front is looking along Unreal X.
3. Left/right sides are not swapped.
4. Z values increase with height.
5. Center landmarks show Y=0.
6. In side view, central landmarks can still move in X depth.
7. Auto Fit still returns 89/89 and Compare With Source passes.
