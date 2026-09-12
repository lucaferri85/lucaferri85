QUINN RIGGER — HOTFIX 02
Mouse Z-up + softer light UI + Blender/UE export sanity

This hotfix is meant to be applied AFTER the cumulative Unreal/Skinning/Export package.
It does NOT revert skinning, phase 05 or phase 06.

CHANGES
1) Mouse / camera
   - removes the accidental negative OrbitControls rotateSpeed introduced during Y-up -> Z-up migration
   - keeps camera.up = (0,0,1)
   - orbit direction is screen-intuitive again
   - screen-space pan remains enabled

2) UI
   - shell becomes light neutral grey instead of white
   - cards/panels are slightly darker than pure white
   - viewport becomes lighter Blender-like neutral grey
   - orange remains action/selection accent

3) Blender bridge
   - validates exactly one armature and >=80 Quinn bones
   - forces Z-up scene units
   - applies no destructive armature transforms
   - sets armature display to STICK only for readable inspection (visual only; does not alter bone transforms)
   - exports FBX with -Y Forward / Z Up, no leaf bones, all Quinn auxiliary/IK bones retained
   - prints root/pelvis/head positions and mesh/armature counts before export

IMPORTANT ABOUT THE 'GIANT BONES' SEEN IN BLENDER
The huge octahedral shapes can be a Blender display artifact when a joint hierarchy contains
IK/auxiliary nodes far from their parent. Switching the armature display to STICK makes inspection
readable, but this hotfix does NOT pretend that display mode proves the bind pose is correct.
The bridge therefore performs structural checks and prints joint diagnostics before FBX export.

APPLY
Run from repository root:
  python apply_hotfix.py

Then rebuild the desktop app.

TEST
A) App: orbit left/right/up/down and pan in ISO, Front, Left.
B) Export SKINNED GLB.
C) Open GLB in Blender and run docs/quinn_glb_to_ue5_fbx.py for FBX conversion.
D) In Blender Pose Mode rotate upperarm_l ~20 degrees: the mesh must deform with it.
E) Import FBX into Unreal and verify skeleton tree, bind pose and deformation.
