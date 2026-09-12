"""Validate a Quinn Rigger GLB inside Blender without exporting FBX.

Usage:
  blender --background --python quinn_validate_glb.py -- input.glb

This does structural checks only. It intentionally does not edit the armature.
"""

import bpy
import os
import sys
import math


def arg():
    if "--" not in sys.argv:
        raise SystemExit(
            "Usage: blender --background --python quinn_validate_glb.py -- input.glb"
        )

    args = sys.argv[
        sys.argv.index("--") + 1:
    ]

    if len(args) != 1:
        raise SystemExit(
            "Expected one input.glb"
        )

    return os.path.abspath(
        args[0]
    )


src = arg()

if not os.path.isfile(src):
    raise SystemExit(
        f"Input not found: {src}"
    )

bpy.ops.wm.read_factory_settings(
    use_empty=True
)

bpy.ops.import_scene.gltf(
    filepath=src,
    import_pack_images=False,
)

arms = [
    o
    for o in bpy.context.scene.objects
    if o.type == "ARMATURE"
]

meshes = [
    o
    for o in bpy.context.scene.objects
    if o.type == "MESH"
]

if len(arms) != 1:
    raise SystemExit(
        f"FAIL: expected 1 armature, got {len(arms)}"
    )

arm = arms[0]
names = [
    b.name
    for b in arm.data.bones
]

required = {
    "root",
    "pelvis",
    "spine_01",
    "spine_03",
    "neck_01",
    "head",
    "upperarm_l",
    "lowerarm_l",
    "hand_l",
    "upperarm_r",
    "lowerarm_r",
    "hand_r",
    "thigh_l",
    "calf_l",
    "foot_l",
    "thigh_r",
    "calf_r",
    "foot_r",
}

missing = sorted(
    required
    - set(names)
)

if missing:
    raise SystemExit(
        "FAIL missing bones: "
        + ", ".join(missing)
    )

skinned = []

for m in meshes:
    amods = [
        mod
        for mod in m.modifiers
        if mod.type == "ARMATURE"
    ]

    if amods:
        skinned.append(m)

if not skinned:
    raise SystemExit(
        "FAIL: no skinned mesh with Armature modifier"
    )

print(
    f"PASS: {len(names)} bones, {len(skinned)} skinned mesh object(s)"
)
