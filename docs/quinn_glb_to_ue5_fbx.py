"""Quinn Rigger GLB -> UE5 FBX bridge — hardened.

Usage:
  blender --background --python quinn_glb_to_ue5_fbx.py -- input.glb output.fbx

Important:
- glTF joints do not store a Blender "bone shape" or display length.
- Blender reconstructs edit-bone tails for display, which can make a perfectly
  valid joint hierarchy look enormous in Envelope/Octahedral mode.
- This bridge therefore uses STICK display for inspection, but DOES NOT change
  the imported rest matrices before FBX export.

The script validates hierarchy, armature modifiers, vertex groups and a set of
critical Quinn bones before writing FBX.
"""

import bpy
import os
import sys
import math


CRITICAL = (
    "root",
    "pelvis",
    "spine_01",
    "spine_02",
    "spine_03",
    "neck_01",
    "head",
    "clavicle_l",
    "upperarm_l",
    "lowerarm_l",
    "hand_l",
    "clavicle_r",
    "upperarm_r",
    "lowerarm_r",
    "hand_r",
    "thigh_l",
    "calf_l",
    "foot_l",
    "thigh_r",
    "calf_r",
    "foot_r",
)


def args_after_double_dash():
    if "--" not in sys.argv:
        raise SystemExit(
            "Usage: blender --background --python quinn_glb_to_ue5_fbx.py -- input.glb output.fbx"
        )

    args = sys.argv[
        sys.argv.index("--") + 1:
    ]

    if len(args) != 2:
        raise SystemExit(
            "Expected input.glb and output.fbx"
        )

    return (
        os.path.abspath(args[0]),
        os.path.abspath(args[1]),
    )


def finite(v):
    return all(
        math.isfinite(float(x))
        for x in v
    )


def world_head(arm, bone):
    return (
        arm.matrix_world
        @ bone.head_local
    )


def main():
    src, dst = (
        args_after_double_dash()
    )

    if not os.path.isfile(src):
        raise SystemExit(
            f"Input not found: {src}"
        )

    bpy.ops.wm.read_factory_settings(
        use_empty=True
    )

    scene = bpy.context.scene
    scene.unit_settings.system = (
        "METRIC"
    )
    scene.unit_settings.scale_length = (
        1.0
    )

    bpy.ops.import_scene.gltf(
        filepath=src,
        import_pack_images=False,
    )

    arms = [
        o
        for o in scene.objects
        if o.type == "ARMATURE"
    ]

    meshes = [
        o
        for o in scene.objects
        if o.type == "MESH"
    ]

    if len(arms) != 1:
        raise SystemExit(
            f"Expected exactly one armature, found {len(arms)}"
        )

    if not meshes:
        raise SystemExit(
            "No mesh objects found after GLB import"
        )

    arm = arms[0]
    arm.name = "Armature"
    arm.data.name = (
        "Quinn_Skeleton"
    )

    # Display-only: does not modify bind/rest transforms.
    arm.data.display_type = (
        "STICK"
    )
    arm.show_in_front = True

    names = [
        b.name
        for b in arm.data.bones
    ]

    missing = [
        n
        for n in CRITICAL
        if n not in names
    ]

    if len(names) < 80:
        raise SystemExit(
            f"Skeleton integrity failed: only {len(names)} bones"
        )

    if missing:
        raise SystemExit(
            "Critical Quinn bones missing: "
            + ", ".join(missing)
        )

    # Parent cycle / finite rest data checks.
    for b in arm.data.bones:
        if not finite(b.head_local):
            raise SystemExit(
                f"Non-finite head: {b.name}"
            )

        if not finite(b.tail_local):
            raise SystemExit(
                f"Non-finite tail: {b.name}"
            )

        seen = set()
        p = b

        while p.parent:
            if p.name in seen:
                raise SystemExit(
                    f"Parent cycle detected at {b.name}"
                )

            seen.add(p.name)
            p = p.parent

    # Every mesh that has skin groups must point to this armature.
    skinned_meshes = []

    for mesh in meshes:
        modifiers = [
            m
            for m in mesh.modifiers
            if m.type == "ARMATURE"
        ]

        if not modifiers:
            continue

        for mod in modifiers:
            if mod.object is not arm:
                raise SystemExit(
                    f"{mesh.name}: armature modifier targets the wrong object"
                )

        skinned_meshes.append(
            mesh
        )

    if not skinned_meshes:
        raise SystemExit(
            "No mesh has a valid Armature modifier"
        )

    # Check that meaningful Quinn vertex groups survived glTF import.
    group_names = set()

    for mesh in skinned_meshes:
        group_names.update(
            g.name
            for g in mesh.vertex_groups
        )

    deform_probe = {
        "pelvis",
        "spine_03",
        "upperarm_l",
        "upperarm_r",
        "thigh_l",
        "thigh_r",
    }

    missing_groups = sorted(
        deform_probe
        - group_names
    )

    if missing_groups:
        raise SystemExit(
            "Expected skin vertex groups missing: "
            + ", ".join(
                missing_groups
            )
        )

    # Print useful positions to diagnose coordinate mistakes.
    print(
        "[Quinn Rigger] bones:",
        len(names),
        "skinned meshes:",
        len(skinned_meshes),
    )

    for name in (
        "root",
        "pelvis",
        "spine_03",
        "head",
        "hand_l",
        "hand_r",
        "foot_l",
        "foot_r",
    ):
        b = arm.data.bones.get(
            name
        )

        if b:
            p = world_head(
                arm,
                b
            )

            print(
                f"[Quinn Rigger] {name}: "
                f"({p.x:.5f}, {p.y:.5f}, {p.z:.5f})"
            )

    # Keep GLB-imported bind/rest matrices untouched.
    bpy.ops.object.select_all(
        action="DESELECT"
    )

    arm.select_set(True)

    for mesh in skinned_meshes:
        mesh.select_set(True)

    bpy.context.view_layer.objects.active = (
        arm
    )

    os.makedirs(
        os.path.dirname(dst)
        or ".",
        exist_ok=True,
    )

    bpy.ops.export_scene.fbx(
        filepath=dst,
        use_selection=True,
        object_types={
            "ARMATURE",
            "MESH",
        },
        global_scale=1.0,
        apply_unit_scale=True,
        apply_scale_options=(
            "FBX_SCALE_UNITS"
        ),
        use_space_transform=True,
        bake_space_transform=False,
        axis_forward="-Y",
        axis_up="Z",
        add_leaf_bones=False,
        primary_bone_axis="Y",
        secondary_bone_axis="X",
        use_armature_deform_only=False,
        armature_nodetype="NULL",
        use_mesh_modifiers=True,
        bake_anim=False,
        path_mode="AUTO",
        embed_textures=False,
    )

    print(
        "[Quinn Rigger] FBX exported:",
        dst,
    )


if __name__ == "__main__":
    main()
