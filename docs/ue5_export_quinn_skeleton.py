"""
Export the authoritative UE5 Quinn skeletal mesh (and therefore its reference
skeleton) to FBX from inside the Unreal Editor, repeatably.

HOW TO RUN (Unreal Editor 5.x, Python Editor Script Plugin enabled):
  1. Edit ASSET_PATH / OUTPUT_FBX below.
  2. Window > Output Log > switch the command line from "Cmd" to "Python",
     then:   py "C:/path/to/ue5_export_quinn_skeleton.py"
     (or Tools > Execute Python Script...)

WHAT IT DOES
  * Loads SKM_Quinn (full mannequin skeletal mesh, i.e. the SK_Mannequin skeleton).
  * Exports it as binary FBX 2020 with LOD/collision/morph/vertex-colour OFF,
    so the file contains exactly the reference skeleton + LOD0 mesh.
  * Optionally writes a sidecar JSON with the bone list read from the engine
    (bone name + parent) as an independent cross-check for the app's
    COMPARE / VALIDATE steps. The FBX remains the authoritative source.

NOTE: Unreal's Python API differs slightly between 5.0 … 5.5. Every optional
step is wrapped so the FBX export itself always runs.
"""
import json
import os

import unreal

# ---------------------------------------------------------------------------
ASSET_PATH = "/Game/Characters/Mannequins/Meshes/SKM_Quinn"      # full Quinn
# ASSET_PATH = "/Game/Characters/Mannequins/Meshes/SKM_Quinn_Simple"  # simplified variant
OUTPUT_FBX = "C:/QuinnExport/SKM_Quinn_ReferenceSkeleton.fbx"
WRITE_SIDECAR_JSON = True
# ---------------------------------------------------------------------------


def export_fbx(asset, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    opts = unreal.FbxExportOption()
    # Binary FBX 2020 – widest reader support, keeps full precision.
    opts.set_editor_property("fbx_export_compatibility", unreal.FbxExportCompatibility.FBX_2020)
    opts.set_editor_property("ascii", False)
    opts.set_editor_property("level_of_detail", False)      # LOD0 only
    opts.set_editor_property("collision", False)
    opts.set_editor_property("vertex_color", False)
    opts.set_editor_property("export_morph_targets", False)
    opts.set_editor_property("export_preview_mesh", False)
    opts.set_editor_property("map_skeletal_motion_to_root", False)
    opts.set_editor_property("force_front_x_axis", False)    # keep UE default axis handling
    for name, value in (("export_local_time", True), ("bake_camera_and_light_animation", 0)):
        try:
            opts.set_editor_property(name, value)
        except Exception:
            pass

    task = unreal.AssetExportTask()
    task.set_editor_property("object", asset)
    task.set_editor_property("filename", out_path)
    task.set_editor_property("automated", True)
    task.set_editor_property("replace_identical", True)
    task.set_editor_property("prompt", False)
    task.set_editor_property("options", opts)
    task.set_editor_property("exporter", unreal.SkeletalMeshExporterFBX())

    ok = unreal.Exporter.run_asset_export_task(task)
    if not ok:
        raise RuntimeError("FBX export failed: %s" % task.get_editor_property("errors"))
    unreal.log("Exported %s -> %s" % (asset.get_path_name(), out_path))


def dump_bone_sidecar(asset, out_path):
    """Best-effort: read bone names/parents from the engine for cross-checking."""
    bones = []
    try:
        actor = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.Actor, unreal.Vector(0, 0, 0))
        comp = actor.add_component_by_class(unreal.SkeletalMeshComponent, False, unreal.Transform(), False)
        comp.set_skeletal_mesh_asset(asset) if hasattr(comp, "set_skeletal_mesh_asset") else comp.set_skeletal_mesh(asset)
        n = comp.get_num_bones()
        for i in range(n):
            name = comp.get_bone_name(i)
            parent = comp.get_parent_bone(name)
            xf = comp.get_socket_transform(name, unreal.RelativeTransformSpace.RTS_PARENT_BONE_SPACE)
            t, r, s = xf.translation, xf.rotation, xf.scale3d
            bones.append({
                "index": i,
                "name": str(name),
                "parent": None if str(parent) == "None" else str(parent),
                "ref_local_translation_cm": [t.x, t.y, t.z],
                "ref_local_rotation_quat": [r.x, r.y, r.z, r.w],
                "ref_local_scale": [s.x, s.y, s.z],
            })
        actor.destroy_actor()
    except Exception as exc:  # API differences between engine versions
        unreal.log_warning("Sidecar bone dump skipped: %s" % exc)
        return

    sidecar = {
        "asset": asset.get_path_name(),
        "engine_version": unreal.SystemLibrary.get_engine_version(),
        "bone_count": len(bones),
        "units": "cm", "up_axis": "Z", "handedness": "left",
        "bones": bones,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(sidecar, fh, indent=2)
    unreal.log("Wrote bone sidecar (%d bones) -> %s" % (len(bones), out_path))


def main():
    asset = unreal.EditorAssetLibrary.load_asset(ASSET_PATH)
    if asset is None:
        raise RuntimeError("Asset not found: %s" % ASSET_PATH)
    if not isinstance(asset, unreal.SkeletalMesh):
        raise RuntimeError("Asset is not a SkeletalMesh: %s" % ASSET_PATH)

    export_fbx(asset, OUTPUT_FBX)
    if WRITE_SIDECAR_JSON:
        dump_bone_sidecar(asset, os.path.splitext(OUTPUT_FBX)[0] + ".bones.json")


main()
