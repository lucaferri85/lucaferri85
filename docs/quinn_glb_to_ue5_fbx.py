"""Quinn Rigger GLB -> UE5 FBX bridge — inspection-safe hotfix.
Usage:
  blender --background --python quinn_glb_to_ue5_fbx.py -- input.glb output.fbx
Or run in Blender after adapting src/dst paths if desired.
"""
import bpy, os, sys
from mathutils import Vector


def args_after_double_dash():
    if "--" not in sys.argv:
        raise SystemExit("Usage: blender --background --python quinn_glb_to_ue5_fbx.py -- input.glb output.fbx")
    args = sys.argv[sys.argv.index("--") + 1:]
    if len(args) != 2:
        raise SystemExit("Expected input.glb and output.fbx")
    return os.path.abspath(args[0]), os.path.abspath(args[1])


def world_pos(obj, bone_name):
    b = obj.data.bones.get(bone_name)
    if not b: return None
    p = obj.matrix_world @ b.head_local
    return tuple(round(v, 5) for v in p)


def main():
    src, dst = args_after_double_dash()
    if not os.path.isfile(src): raise SystemExit(f"Input not found: {src}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    bpy.ops.import_scene.gltf(filepath=src, import_pack_images=False)

    arms = [o for o in scene.objects if o.type == 'ARMATURE']
    meshes = [o for o in scene.objects if o.type == 'MESH']
    if len(arms) != 1: raise SystemExit(f"Expected exactly one armature, found {len(arms)}")
    if not meshes: raise SystemExit('No mesh objects found after GLB import')

    arm = arms[0]
    arm.name = 'Armature'
    arm.data.name = 'Quinn_Skeleton'
    # Visual inspection only. This does not modify heads/tails, rest matrices or weights.
    arm.data.display_type = 'STICK'
    arm.show_in_front = True

    names = [b.name for b in arm.data.bones]
    required = {'root','pelvis','head'}
    missing = sorted(required - set(names))
    if len(names) < 80 or missing:
        raise SystemExit(f"Skeleton integrity failed: bones={len(names)}, missing={missing}")

    # Basic finite/rest-pose sanity.
    bad = []
    for b in arm.data.bones:
        vals = list(b.head_local) + list(b.tail_local)
        if not all(abs(float(v)) < 1e6 for v in vals): bad.append(b.name)
    if bad: raise SystemExit(f"Non-finite/extreme rest bones: {bad[:10]}")

    print('[Quinn Rigger] bones:', len(names), 'meshes:', len(meshes))
    for n in ('root','pelvis','spine_01','spine_03','neck_01','head','hand_l','hand_r','foot_l','foot_r'):
        if n in names: print(f'[Quinn Rigger] {n}: {world_pos(arm,n)}')

    # Do NOT apply transforms to the armature or meshes here: GLB import already produced
    # the glTF rest/bind transforms. Applying transforms at this stage can invalidate skinning.
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    for m in meshes: m.select_set(True)
    bpy.context.view_layer.objects.active = arm

    os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=dst,
        use_selection=True,
        object_types={'ARMATURE','MESH'},
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
    print(f'[Quinn Rigger] FBX exported -> {dst}')

if __name__ == '__main__': main()
