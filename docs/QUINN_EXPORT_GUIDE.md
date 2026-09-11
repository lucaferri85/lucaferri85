# Exporting the authoritative UE5 Quinn skeleton for Quinn Rigger

The application never reconstructs a Quinn skeleton. It reads bone names, parent
links and reference-pose transforms **verbatim** from an FBX you export from
Unreal Engine 5. The FBX is the source of truth; any JSON the app produces is a
derived cache of a validated FBX import.

## 1. Which asset to export

| Target | Asset (Third Person template, UE 5.1+) |
|---|---|
| Full Quinn (recommended) | `/Game/Characters/Mannequins/Meshes/SKM_Quinn` |
| Simplified Quinn | `/Game/Characters/Mannequins/Meshes/SKM_Quinn_Simple` |

Both use the shared `SK_Mannequin` skeleton asset. Export the **skeletal mesh**
(`SKM_*`), not the `SK_Mannequin` skeleton asset itself — the FBX exporter
serialises the mesh's reference skeleton with full bind-pose transforms.

## 2. Manual export procedure (Content Browser)

1. Content Browser → navigate to the asset above.
2. Right-click → **Asset Actions → Export…**
3. Choose a file name ending in `.fbx`.
4. In the FBX Export Options dialog use:

| Option | Value | Why |
|---|---|---|
| FBX Export Compatibility | **FBX 2020** (2018 also fine) | binary 7.x, full precision |
| ASCII | **off** | binary preferred (smaller, exact doubles) |
| Level Of Detail | **off** | only LOD0, avoids duplicate bone bindings |
| Collision | **off** | not needed |
| Vertex Color | **off** | not needed |
| Export Morph Targets | **off** | not needed |
| Export Preview Mesh | **off** | — |
| Map Skeletal Motion To Root | **off** | keep root bone as-is |
| Force Front X Axis | **off** | keep Unreal's default axis conversion |

5. Click **Export**.

## 3. Scripted export (repeatable)

`docs/ue5_export_quinn_skeleton.py` performs the same export from the editor's
Python console with the settings above and (best-effort) writes a
`*.bones.json` sidecar containing the engine's own bone list for cross-checking.

Enable **Edit → Plugins → Python Editor Script Plugin**, restart, then in the
Output Log switch the input line to *Python* and run:

```
py "C:/path/to/ue5_export_quinn_skeleton.py"
```

## 4. Importing into Quinn Rigger

1. Left panel → **03 Skeleton Template → IMPORT QUINN FBX (UE5 EXPORT)**.
2. The parser reads every `LimbNode`/`Root` node and every skin-bound node:
   - names exactly as stored (no sanitising), parent links from FBX connections,
   - `Lcl Translation / Lcl Rotation / PreRotation / PostRotation / Lcl Scaling /
     RotationOrder` composed with the standard FBX transform formula,
   - bind-pose matrices (Pose nodes + cluster `TransformLink`) used only as a
     consistency cross-check (reported in mm),
   - `GlobalSettings` (UnitScaleFactor, Up/Front/Coord axes, FBX version, creator).
3. Unit conversion: FBX centimetres → internal metres (uniform ×0.01 on
   translations only). Axis: Unreal writes Y-up FBX, so no rotation is applied;
   if a file is Z-up, a rotation is applied to root bones only.
4. **VALIDATE TEMPLATE STRUCTURE** runs ~18 structural checks (single root,
   unique names, acyclic hierarchy, finite transforms, unit quaternions,
   local/global consistency, L/R pair symmetry, UE5 core bone presence,
   landmark-target presence, provenance).
5. Inspect any bone in the **Bones** tab (parent, children, local & global
   transforms, verbatim FBX values). **Template** tab shows the full
   provenance/units/parser report and check details.
6. **EXPORT** writes the parsed, validated template as JSON for fast reuse.
   It carries the FBX SHA-256 so the app can label it *authoritative*.

## 5. What the app will never do

* rename, drop, re-parent, merge or "simplify" any bone,
* silently repair a broken hierarchy (issues are reported as WARN/FAIL),
* label the bundled 71-bone sample as an exact Quinn skeleton — it is tagged
  **DEVELOPMENT / SAMPLE TEMPLATE** and Auto Fit stays disabled while it is loaded.

## 6. Known limitations of the in-browser FBX reader

* Bone **names** are read up to the first NUL byte (binary FBX stores
  `name\0\1Model`) — Unreal bone names never contain NUL, so this is lossless.
* If two meshes in one FBX share a skeleton (e.g. LOD export left ON), the
  parser reads the bone nodes once; duplicate skin bindings are ignored.
* Non-skeleton container nodes (`Null`) above the root are **not** inserted as
  bones; the situation is reported as a warning so you can decide.
