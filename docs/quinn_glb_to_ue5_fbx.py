"""Quinn Rigger GLB -> UE5 FBX bridge for Blender 4.x/5.x.

Usage from a shell:
  blender --background --python quinn_glb_to_ue5_fbx.py -- input.glb output.fbx

The script deliberately exports ALL armature bones (including Quinn IK/aux bones),
disables Blender leaf bones, and emits a Z-up FBX suitable for Unreal import.
"""
import bpy
import os
import sys


def args_after_double_dash():
    if "--" not in sys.argv:
        raise SystemExit("Usage: blender --background --python quinn_glb_to_ue5_fbx.py -- input.glb output.fbx")
    args = sys.argv[sys.argv.index("--") + 1:]
    if len(args) != 2:
        raise SystemExit("Expected input.glb and output.fbx")
    return os.path.abspath(args[0]), os.path.abspath(args[1])


def main():
    src, dst = args_after_double_dash()
    if not os.path.isfile(src):
        raise SystemExit(f"Input not found: {src}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src, import_pack_images=False)

    armatures = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if len(armatures) != 1:
        raise SystemExit(f"Expected exactly one armature, found {len(armatures)}")
    if not meshes:
        raise SystemExit("No mesh objects found after GLB import")

    arm = armatures[0]
    # Unreal's Blender FBX importer has historically special-cased an object
    # named Armature so it does not become an extra skeleton bone.
    arm.name = 'Armature'
    arm.data.name = 'Quinn_Skeleton'

    bone_names = [b.name for b in arm.data.bones]
    if len(bone_names) < 80 or 'root' not in bone_names or 'pelvis' not in bone_names:
        raise SystemExit(f"Skeleton integrity check failed: {len(bone_names)} bones, root={('root' in bone_names)}, pelvis={('pelvis' in bone_names)}")

    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = arm

    os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=dst,
        use_selection=True,
        object_types={'ARMATURE', 'MESH'},
        global_scale=1.0,
        apply_unit_scale=True,
        apply_scale_options='FBX_SCALE_UNITS',
        use_space_transform=True,
        bake_space_transform=False,
        axis_forward='-Y',
        axis_up='Z',
        add_leaf_bones=False,
        primary_bone_axis='Y',
        secondary_bone_axis='X',
        use_armature_deform_only=False,
        armature_nodetype='NULL',
        use_mesh_modifiers=True,
        bake_anim=False,
        path_mode='AUTO',
        embed_textures=False,
    )
    print(f"[Quinn Rigger] Exported {len(bone_names)} bones and {len(meshes)} mesh object(s) -> {dst}")


if __name__ == '__main__':
    main()
