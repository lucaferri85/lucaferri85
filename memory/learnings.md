# Learnings / gotchas (Quinn Rigger)

- FBX parsing: use vendored `src/lib/fbx/FBXLoaderRaw.js` (three 0.160 FBXLoader + `parseTreeOnly()` that exposes raw tree/connections). Never rely on the FBXLoader scene graph for skeleton data (it sanitises names, duplicates shared bones, crashes on Mesh nodes without geometry).
- Both ASCII and binary parsers normalise `Lcl Translation` → `Lcl_Translation` keys; `attrName` is the exact bone name (binary strings truncated at NUL).
- OO connections have `relationship === undefined`; OP connections carry a property-name string.
- FBX UnitScaleFactor: 1.0 = cm (Unreal default). metres = value × factor / 100.
- Axis fix for non-Y-up files is applied to ROOT bones only (children keep verbatim local transforms).
- Babel/visual-edits plugin: avoid recursive JSX components in `components/panels/` (max call stack). Use iterative flatten.
- Test fixtures: `/app/tests/fixtures/*.fbx` (+ `make_binary_fbx.py` generator). Upload in Playwright via `set_input_files('[data-testid="template-fbx-input"]', path)`.
- Template sources: `sample_dev` (bundled 71-bone hand-authored approximation), `user_authoritative` (FBX or FBX-derived JSON with sha256), `user_json` (unverified). Fit is authorised only for `user_authoritative` + validation != invalid (`isFitAuthorized`).
