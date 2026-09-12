QUINN RIGGER — HOTFIX 04: EXPORT RIG / BLENDER

What this corrects
==================
1. GLB skeleton export no longer trusts possibly stale localPos/localRot values
   after the Y-up -> Unreal Z-up migration.

2. The fitted GLOBAL Quinn pose is now authoritative.
   Immediately before export every local transform is rebuilt as:

       local = inverse(parentGlobal) * global

   This is the key fix.

3. Before GLB creation the rebuilt hierarchy is numerically verified against
   the fitted global pose. If even one joint does not reproduce its intended
   position/rotation, export is blocked instead of producing a bad GLB.

4. Joint node scale is forced to 1,1,1. This avoids scale propagation problems
   when glTF is imported into Blender and later converted to FBX.

5. Skin bone count and exact bone index order are checked before export.

6. Blender bridge keeps the imported GLB rest/bind matrices untouched,
   validates hierarchy, armature modifiers and vertex groups, and uses STICK
   display only for readable visual inspection.

7. Added docs/quinn_validate_glb.py for a headless structural GLB test.

Files to replace
================
frontend/src/modules/UnrealExporter.js
docs/quinn_glb_to_ue5_fbx.py

New file
========
docs/quinn_validate_glb.py

Important
=========
The large spheres seen in raw Blender GLB import can partly be Blender's
Envelope bone DISPLAY, because glTF joints do not carry Blender edit-bone
display length/radius. The real bug we can and should prevent is an incorrect
rest hierarchy. This hotfix validates and rebuilds that hierarchy from the
global fitted pose before export.

Test sequence
=============
1. Rebuild Quinn Rigger.
2. Regenerate AUTOMATIC SKINNING (do not reuse an old export).
3. Export a NEW Skinned GLB.
4. Validate:
   blender --background --python docs/quinn_validate_glb.py -- NEW.glb
5. Convert:
   blender --background --python docs/quinn_glb_to_ue5_fbx.py -- NEW.glb NEW.fbx
6. Open NEW.fbx in Blender / Unreal and test upperarm_l, thigh_l and spine_03.

Suggested commit
================
Harden GLB bind hierarchy and Blender FBX bridge
