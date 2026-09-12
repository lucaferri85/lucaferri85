"""Tool catalogue for the agentic Rig Assistant. Tools execute in the browser against live app state;
the backend only owns the schema, the confirmation policy and the system prompt."""

VEC3 = {"type": "object", "properties": {"x": {"type": "number"}, "y": {"type": "number"}, "z": {"type": "number"}},
        "required": ["x", "y", "z"]}

# tools that mutate substantial work or approve / replace things — the UI shows an Approve/Deny card first
CONFIRM_TOOLS = {"reset_all_landmarks", "reset_fit", "approve_fit", "save_project"}
# tools that change state (a revert snapshot is taken before they run)
MUTATING_TOOLS = {"move_landmark", "offset_landmark", "clear_landmark", "run_auto_detect", "mirror_landmarks_left_to_right",
                  "reset_all_landmarks", "set_symmetry", "run_auto_fit", "move_fitted_joint", "reset_fitted_bone", "reset_fit",
                  "approve_fit", "undo_last_change"}


def _t(name, description, properties=None, required=None):
    return {"type": "function", "function": {"name": name, "description": description,
            "parameters": {"type": "object", "properties": properties or {}, "required": required or []}}}


TOOL_SCHEMAS = [
    _t("get_project_state", "Compact snapshot of the whole rigging project: mesh, template, landmarks (id, placed, confidence, position), fit summary, approval, stage. Call this first when unsure."),
    _t("inspect_landmarks", "Detailed landmark records incl. detection notes. Use filter or ids to narrow.",
       {"ids": {"type": "array", "items": {"type": "string"}},
        "filter": {"type": "string", "enum": ["all", "placed", "unplaced", "not_found", "low", "medium", "high", "manual", "left", "right", "center"]}}),
    _t("move_landmark", "Set a landmark to an absolute position (metres, Y-up, X = character left). Symmetry mirroring applies if enabled. Reversible.",
       {"id": {"type": "string"}, "position": VEC3, "reason": {"type": "string"}}, ["id", "position"]),
    _t("offset_landmark", "Translate a placed landmark by a delta in metres. Reversible.",
       {"id": {"type": "string"}, "delta": VEC3, "reason": {"type": "string"}}, ["id", "delta"]),
    _t("clear_landmark", "Unplace a landmark so it becomes pending. Reversible.", {"id": {"type": "string"}}, ["id"]),
    _t("run_auto_detect", "Run automatic landmark detection on the imported mesh (overwrites auto landmarks, keeps manual ones unless overwrite=true). Never runs Auto Fit. Returns per-landmark confidence + notes.",
       {"overwrite": {"type": "boolean", "description": "true = also replace manually placed landmarks"}}),
    _t("mirror_landmarks_left_to_right", "Copy all placed LEFT landmarks to their RIGHT counterparts across the symmetry axis. Reversible."),
    _t("reset_all_landmarks", "Clear ALL landmarks (destructive — requires user confirmation)."),
    _t("set_symmetry", "Enable/disable auto-mirroring or change its axis.",
       {"enabled": {"type": "boolean"}, "axis": {"type": "string", "enum": ["x", "y", "z"]}}),
    _t("get_template_summary", "Authoritative skeleton template metadata: name, source/provenance, bone count, validation status and failing checks, whether Auto Fit is authorised."),
    _t("validate_template", "Run VALIDATE TEMPLATE STRUCTURE on the current template."),
    _t("run_auto_fit", "Fit the exact imported Quinn skeleton to the landmarks (requires authoritative validated template and ≥6 core landmarks). Returns counts, warnings, errors. Reversible."),
    _t("inspect_fitted_bones", "Per-bone fit diagnostics (method, anchor, status, message, global position).",
       {"names": {"type": "array", "items": {"type": "string"}},
        "status": {"type": "string", "enum": ["all", "ok", "warn", "error", "manual"]},
        "limit": {"type": "integer"}}),
    _t("move_fitted_joint", "Move a fitted joint (and its subtree) to an absolute global position in metres. Mirrors to the _l/_r twin when symmetry is on. Structure is never changed. Reversible.",
       {"name": {"type": "string"}, "position": VEC3, "reason": {"type": "string"}}, ["name", "position"]),
    _t("reset_fitted_bone", "Reset one fitted bone (+descendants) back to the auto-fit result.", {"name": {"type": "string"}}, ["name"]),
    _t("reset_fit", "Discard all manual joint edits and return to the last auto-fit (requires user confirmation)."),
    _t("run_compare_validation", "Compare the fitted skeleton with the source template (count, names, order, parents, kinds, transforms). Returns overall PASS/WARNING/FAIL with checks."),
    _t("get_diagnostics", "Aggregated diagnostics: landmark issues (NOT FOUND/LOW), fit warnings/errors, compare result, approval gate blockers, template validation."),
    _t("approve_fit", "Mark the fitted skeleton approved (requires user confirmation). Set acknowledge_warnings=true only after the user agreed to accept remaining warnings.",
       {"acknowledge_warnings": {"type": "boolean"}}),
    _t("undo_last_change", "Undo the last landmark edit (app-level undo history)."),
    _t("revert_assistant_action", "Revert a previous assistant action by its action_id (restores landmarks/fit/approval snapshot taken before that action). Without action_id reverts the most recent one.",
       {"action_id": {"type": "string"}}),
    _t("set_camera_view", "Point the 3D viewport camera at a preset view.",
       {"view": {"type": "string", "enum": ["front", "back", "left", "right", "top", "iso"]}}, ["view"]),
    _t("focus_landmark", "Highlight a landmark row/marker in the UI (opens Landmarks tab).", {"id": {"type": "string"}}, ["id"]),
    _t("select_bone", "Select a bone in the Bones inspector / viewport.", {"name": {"type": "string"}}, ["name"]),
    _t("save_project", "Save the project to the database (requires user confirmation).", {"name": {"type": "string"}}),
]

SYSTEM_PROMPT = """You are the Rig Assistant inside "UE5 Quinn Auto-Rigger", a desktop-style web app that rigs humanoid meshes to the EXACT UE5 Quinn skeleton (SKM_Quinn_Simple, 89 bones, imported from the user's own Unreal FBX export).
You operate the application through tools. Prefer calling tools over telling the user which buttons to click. After every tool call read its structured result ({ok, ...}) and verify success before continuing; if ok=false, explain why and propose the next step.

WORKFLOW (stages): Import Mesh → Auto Detect Landmarks → correct only problematic landmarks → Auto Fit exact Quinn skeleton → Compare With Source / diagnostics → Approve fit → (Phase C, NOT YET AVAILABLE: automatic skinning + weights → weight validation → UE5 export).
COORDINATES: Three.js Y-up, right-handed, metres. +X is the character's LEFT side (suffix _l), −X is RIGHT (_r). Feet at Y≈0; the mesh is normalised to ~1.75 m height. UE conversion happens only at export.
LANDMARKS (30): center head_top, head_center, neck_base, chest, spine_mid, pelvis; per side (_l/_r): clavicle, shoulder, elbow, wrist, hand (tip), hip, knee, ankle, heel, toe; fingers thumb_tip_*, index_tip_* (optional, never auto-detected). Confidence: high | medium | low | not_found | manual. The detector deliberately reports NOT FOUND instead of guessing; LOW structural joints (hips, shoulders, elbows, wrists, knees, ankles) must be reviewed before fitting.
POLICIES:
- Anatomical correctness beats completion. Never fabricate a landmark position without geometric justification: derive it from neighbouring landmarks / mesh proportions (e.g. mirror the other side, interpolate along a chain, use the detector's notes) and say what you based it on.
- Every modification you make must be reported in a short "Changes" list (tool, target, before → after when relevant). All your edits are reversible via revert_assistant_action / undo; mention that.
- Destructive or critical operations (reset_all_landmarks, reset_fit, approve_fit, save_project) show the user an Approve/Deny card automatically; do not try to bypass it. If the result says denied, stop and ask.
- Never rename, remove, re-parent, merge or invent bones. The fitted skeleton must keep 89/89 bones identical to the source template — structure problems are errors, not something to work around.
- Skinning, weight generation and export are Phase C/D and are not available yet; say so plainly if asked, do not pretend.
- Keep answers concise and technical (technical-artist tone). Use bullet lists for diagnostics. Ask a clarifying question only when a request is genuinely ambiguous.
Each user message is prefixed with an [APP STATE] JSON snapshot — trust it as the current state (it is refreshed every turn), and call get_project_state / inspect tools for more detail."""
