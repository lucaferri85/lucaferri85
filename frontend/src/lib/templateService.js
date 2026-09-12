/**
 * Quinn template service.
 *
 * Desktop/offline architecture:
 * - FBX parsing happens locally.
 * - Template validation happens locally.
 * - Template library is stored in localStorage.
 * - Last authoritative Quinn template is restored locally on startup.
 *
 * No backend/server is required for template import, validation or persistence.
 */

import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { parseSkeletonFromFBX } from './fbx/fbxSkeletonImporter';
import { LANDMARKS } from './landmarks';
import { TEMPLATE_SCHEMA_VERSION } from './quinnTemplate';

const LIBRARY_KEY = 'quinn.template.library.v2';
const ACTIVE_KEY = 'quinn.template.activeSavedId';

const requiredBones = () =>
  Array.from(
    new Set(
      LANDMARKS
        .map((l) => l.bone_target)
        .filter(Boolean)
    )
  );

// -----------------------------------------------------------------------------
// LOCAL TEMPLATE LIBRARY
// -----------------------------------------------------------------------------

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `template-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readLibraryRaw() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Could not read local template library:', error);
    return [];
  }
}

function writeLibraryRaw(items) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Could not write local template library:', error);

    throw new Error(
      'Local template storage failed. The browser/Electron storage may be full or unavailable.'
    );
  }
}

function makeSummary(saved) {
  return {
    id: saved.id,
    name: saved.name,
    source: saved.source,
    version: saved.version,
    bone_count: saved.bone_count,
    imported_at: saved.imported_at,
    origin_filename: saved.origin_filename,
    origin_format: saved.origin_format,
    validation_status: saved.validation?.status || null,
    created_at: saved.created_at,
  };
}

export async function listLocalTemplates() {
  return readLibraryRaw()
    .map(makeSummary)
    .sort((a, b) =>
      String(b.imported_at || b.created_at || '').localeCompare(
        String(a.imported_at || a.created_at || '')
      )
    );
}

async function saveTemplateLocally(template, validation) {
  const library = readLibraryRaw();

  const provenance = template.provenance || {};
  const sha = provenance.sha256 || null;

  let existing = null;

  if (sha) {
    existing = library.find(
      (item) => item.template_data?.provenance?.sha256 === sha
    );
  }

  if (!existing) {
    existing = library.find(
      (item) =>
        item.name === template.name &&
        item.source === template.source &&
        item.origin_filename === provenance.origin_filename
    );
  }

  const saved = {
    id: existing?.id || createId(),

    name: template.name || 'Unnamed Skeleton',
    source: template.source || 'user_json',
    version: template.version || '',

    bone_count: Array.isArray(template.bones)
      ? template.bones.length
      : 0,

    imported_at:
      provenance.imported_at ||
      existing?.imported_at ||
      new Date().toISOString(),

    origin_filename: provenance.origin_filename || null,
    origin_format: provenance.origin_format || null,
    sha256: provenance.sha256 || null,

    validation: validation || null,

    template_data: template,

    created_at:
      existing?.created_at ||
      new Date().toISOString(),

    updated_at: new Date().toISOString(),
  };

  const nextLibrary = existing
    ? library.map((item) =>
        item.id === existing.id ? saved : item
      )
    : [...library, saved];

  writeLibraryRaw(nextLibrary);

  return saved;
}

function getTemplateLocally(id) {
  const saved = readLibraryRaw().find((item) => item.id === id);

  if (!saved) {
    throw new Error('Template not found in local library');
  }

  return saved;
}

// -----------------------------------------------------------------------------
// LOCAL VALIDATION
// -----------------------------------------------------------------------------

function finiteArray(value, length) {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(
      (v) => typeof v === 'number' && Number.isFinite(v)
    )
  );
}

function length3(v) {
  if (!finiteArray(v, 3)) {
    return 0;
  }

  return Math.sqrt(
    v[0] * v[0] +
    v[1] * v[1] +
    v[2] * v[2]
  );
}

function distance3(a, b) {
  if (!finiteArray(a, 3) || !finiteArray(b, 3)) {
    return 0;
  }

  const x = a[0] - b[0];
  const y = a[1] - b[1];
  const z = a[2] - b[2];

  return Math.sqrt(x * x + y * y + z * z);
}

function validateTemplateLocal(template, required = []) {
  const checks = [];

  const add = (
    id,
    label,
    status,
    detail,
    items = []
  ) => {
    checks.push({
      id,
      label,
      status,
      detail,
      items: items.slice(0, 200),
    });
  };

  if (
    !template ||
    !Array.isArray(template.bones) ||
    template.bones.length === 0
  ) {
    add(
      'bones_present',
      'Bone list present',
      'fail',
      'Template has no bones array'
    );

    return finalizeValidation(checks, template);
  }

  const bones = template.bones.filter(
    (bone) => bone && typeof bone === 'object'
  );

  add(
    'bones_present',
    'Bone list present',
    bones.length ? 'pass' : 'fail',
    `${bones.length} bones`
  );

  // ---------------------------------------------------------------------------
  // Names
  // ---------------------------------------------------------------------------

  const names = bones.map((bone) => bone.name);

  const unnamed = bones
    .map((bone, index) => ({
      bone,
      index,
    }))
    .filter(
      ({ bone }) =>
        typeof bone.name !== 'string' ||
        bone.name.length === 0
    )
    .map(({ index }) => `index ${index}`);

  add(
    'names_present',
    'Every bone has a name',
    unnamed.length ? 'fail' : 'pass',
    unnamed.length
      ? `${unnamed.length} unnamed bones`
      : 'All bones named',
    unnamed
  );

  const seen = new Set();
  const duplicates = [];

  for (const name of names) {
    if (seen.has(name) && !duplicates.includes(name)) {
      duplicates.push(name);
    }

    seen.add(name);
  }

  add(
    'names_unique',
    'Bone names unique',
    duplicates.length ? 'fail' : 'pass',
    duplicates.length
      ? `${duplicates.length} duplicate bone names`
      : 'No duplicate bone names',
    duplicates
  );

  const byName = new Map();

  for (const bone of bones) {
    if (bone.name) {
      byName.set(bone.name, bone);
    }
  }

  // ---------------------------------------------------------------------------
  // Parents / root
  // ---------------------------------------------------------------------------

  const orphans = bones
    .filter(
      (bone) =>
        bone.parent &&
        !byName.has(bone.parent)
    )
    .map(
      (bone) =>
        `${bone.name} → ${bone.parent}`
    );

  add(
    'parents_resolve',
    'All parent references resolve',
    orphans.length ? 'fail' : 'pass',
    orphans.length
      ? `${orphans.length} orphan parent reference(s)`
      : 'Every parent exists',
    orphans
  );

  const selfParents = bones
    .filter(
      (bone) =>
        bone.parent &&
        bone.parent === bone.name
    )
    .map((bone) => bone.name);

  add(
    'self_parent',
    'No bone is its own parent',
    selfParents.length ? 'fail' : 'pass',
    selfParents.length
      ? `${selfParents.length} self-parented bone(s)`
      : 'No self-parenting',
    selfParents
  );

  const roots = bones
    .filter((bone) => !bone.parent)
    .map((bone) => bone.name);

  add(
    'single_root',
    'Exactly one root bone',
    roots.length === 1 ? 'pass' : 'fail',
    roots.length === 1
      ? `Root: ${roots[0]}`
      : `${roots.length} roots found`,
    roots
  );

  // ---------------------------------------------------------------------------
  // Hierarchy reachability / cycles
  // ---------------------------------------------------------------------------

  const children = new Map();

  for (const bone of bones) {
    if (!bone.parent) {
      continue;
    }

    if (!children.has(bone.parent)) {
      children.set(bone.parent, []);
    }

    children.get(bone.parent).push(bone.name);
  }

  const reachable = new Set();
  const stack = [...roots];
  const depths = new Map(
    roots.map((root) => [root, 0])
  );

  while (stack.length) {
    const current = stack.pop();

    if (reachable.has(current)) {
      continue;
    }

    reachable.add(current);

    for (const child of children.get(current) || []) {
      depths.set(
        child,
        (depths.get(current) || 0) + 1
      );

      stack.push(child);
    }
  }

  const unreachable = names.filter(
    (name) =>
      name &&
      !reachable.has(name)
  );

  add(
    'no_cycles',
    'Hierarchy is acyclic / fully reachable',
    unreachable.length ? 'fail' : 'pass',
    unreachable.length
      ? `${unreachable.length} bone(s) unreachable from root`
      : 'All bones reachable from root',
    unreachable
  );

  const maxDepth = Math.max(
    0,
    ...Array.from(depths.values())
  );

  add(
    'depth',
    'Hierarchy depth',
    maxDepth <= 64 ? 'pass' : 'warn',
    `Max depth ${maxDepth}`
  );

  // ---------------------------------------------------------------------------
  // Transforms
  // ---------------------------------------------------------------------------

  const badLocal = [];
  const badGlobal = [];
  const badQuaternion = [];
  const badScale = [];

  for (const bone of bones) {
    const refLocal = bone.refLocal || {};

    if (
      !finiteArray(refLocal.pos, 3) ||
      !finiteArray(refLocal.rot, 4) ||
      !finiteArray(refLocal.scale, 3)
    ) {
      badLocal.push(bone.name);
    } else {
      const q = refLocal.rot;

      const qLength = Math.sqrt(
        q.reduce(
          (sum, value) =>
            sum + value * value,
          0
        )
      );

      if (
        Number.isFinite(qLength) &&
        Math.abs(qLength - 1) > 0.001
      ) {
        badQuaternion.push(
          `${bone.name} (|q|=${qLength.toFixed(4)})`
        );
      }

      if (
        refLocal.scale.some(
          (s) =>
            !Number.isFinite(s) ||
            Math.abs(s) < 0.000001 ||
            s < 0
        )
      ) {
        badScale.push(
          `${bone.name} ${JSON.stringify(
            refLocal.scale
          )}`
        );
      }
    }

    if (!finiteArray(bone.refGlobal, 3)) {
      badGlobal.push(bone.name);
    }
  }

  add(
    'local_transforms',
    'Local reference transforms complete & finite',
    badLocal.length ? 'fail' : 'pass',
    badLocal.length
      ? `${badLocal.length} bone(s) missing/invalid refLocal`
      : 'pos[3] rot[4] scale[3] present for all bones',
    badLocal
  );

  add(
    'global_positions',
    'Global reference positions finite',
    badGlobal.length ? 'fail' : 'pass',
    badGlobal.length
      ? `${badGlobal.length} invalid refGlobal`
      : 'All global positions finite',
    badGlobal
  );

  add(
    'quaternions_unit',
    'Rotation quaternions normalised',
    badQuaternion.length ? 'warn' : 'pass',
    badQuaternion.length
      ? `${badQuaternion.length} non-unit quaternion(s)`
      : 'All |q| ≈ 1',
    badQuaternion
  );

  add(
    'scale_sane',
    'Bone scales positive & non-zero',
    badScale.length ? 'fail' : 'pass',
    badScale.length
      ? `${badScale.length} bone(s) with invalid scale`
      : 'All scales valid',
    badScale
  );

  // ---------------------------------------------------------------------------
  // Local/global consistency
  // ---------------------------------------------------------------------------

  const inconsistent = [];

  for (const bone of bones) {
    if (!bone.parent) {
      continue;
    }

    const parent = byName.get(bone.parent);

    if (!parent) {
      continue;
    }

    if (
      !finiteArray(bone.refGlobal, 3) ||
      !finiteArray(parent.refGlobal, 3) ||
      !finiteArray(
        bone.refLocal?.pos,
        3
      )
    ) {
      continue;
    }

    const globalSpan = distance3(
      bone.refGlobal,
      parent.refGlobal
    );

    const localLength = length3(
      bone.refLocal.pos
    );

    if (
      Math.abs(
        globalSpan - localLength
      ) >
      0.001 + 0.01 * localLength
    ) {
      inconsistent.push(
        `${bone.name} (global ${globalSpan.toFixed(
          4
        )} m vs local ${localLength.toFixed(4)} m)`
      );
    }
  }

  add(
    'local_global_consistent',
    'Local offsets consistent with global positions',
    inconsistent.length ? 'warn' : 'pass',
    inconsistent.length
      ? `${inconsistent.length} transform consistency warning(s)`
      : 'Chained transforms match',
    inconsistent
  );

  // ---------------------------------------------------------------------------
  // Height / scale
  // ---------------------------------------------------------------------------

  const ys = bones
    .filter((bone) =>
      finiteArray(bone.refGlobal, 3)
    )
    .map((bone) => bone.refGlobal[1]);

  const skeletonHeight =
    ys.length > 0
      ? Math.max(...ys) - Math.min(...ys)
      : 0;

  add(
    'scale_units',
    'Skeleton height plausible for metres',
    skeletonHeight >= 0.5 &&
      skeletonHeight <= 3
      ? 'pass'
      : 'warn',
    `${skeletonHeight.toFixed(3)} m`
  );

  // ---------------------------------------------------------------------------
  // UE5 family
  // ---------------------------------------------------------------------------

  const core = [
    'root',
    'pelvis',
    'spine_01',
    'head',
    'clavicle_l',
    'clavicle_r',
    'hand_l',
    'hand_r',
    'thigh_l',
    'thigh_r',
    'foot_l',
    'foot_r',
  ];

  const missingCore = core.filter(
    (name) => !byName.has(name)
  );

  add(
    'ue5_family',
    'UE5 Mannequin-family core bones present',
    missingCore.length ? 'warn' : 'pass',
    missingCore.length
      ? `${missingCore.length} core bone(s) missing`
      : 'UE5 mannequin core bones found',
    missingCore
  );

  // ---------------------------------------------------------------------------
  // Required landmark target bones
  // ---------------------------------------------------------------------------

  const missingTargets = required.filter(
    (name) => !byName.has(name)
  );

  add(
    'landmark_targets',
    'Landmark target bones exist',
    missingTargets.length ? 'fail' : 'pass',
    missingTargets.length
      ? `${missingTargets.length} required target bone(s) missing`
      : `All ${required.length} landmark target bones present`,
    missingTargets
  );

  // ---------------------------------------------------------------------------
  // Provenance
  // ---------------------------------------------------------------------------

  const provenance =
    template.provenance || {};

  if (
    template.source === 'user_authoritative' &&
    provenance.origin_format === 'fbx'
  ) {
    add(
      'provenance',
      'Provenance',
      'pass',
      `FBX ${
        provenance.fbx_version || ''
      } · ${
        provenance.origin_filename || 'unknown file'
      }`
    );
  } else if (
    template.source === 'sample_dev'
  ) {
    add(
      'provenance',
      'Provenance',
      'warn',
      'DEVELOPMENT / SAMPLE template'
    );
  } else {
    add(
      'provenance',
      'Provenance',
      'warn',
      'No authoritative FBX provenance recorded'
    );
  }

  return finalizeValidation(
    checks,
    template
  );
}

function finalizeValidation(checks, template) {
  const statuses = checks.map(
    (check) => check.status
  );

  let status = 'valid';

  if (statuses.includes('fail')) {
    status = 'invalid';
  } else if (statuses.includes('warn')) {
    status = 'warning';
  }

  return {
    status,
    valid: status !== 'invalid',
    checks,

    errors: checks
      .filter(
        (check) =>
          check.status === 'fail'
      )
      .map((check) => check.detail),

    warnings: checks
      .filter(
        (check) =>
          check.status === 'warn'
      )
      .map((check) => check.detail),

    checked_at: new Date().toISOString(),

    bone_count:
      Array.isArray(template?.bones)
        ? template.bones.length
        : 0,
  };
}

// -----------------------------------------------------------------------------
// PUBLIC VALIDATION
// -----------------------------------------------------------------------------

export async function runValidation(template) {
  const validation =
    validateTemplateLocal(
      template,
      requiredBones()
    );

  useAppStore
    .getState()
    .setTemplateValidation(validation);

  return validation;
}

// -----------------------------------------------------------------------------
// FBX IMPORT
// -----------------------------------------------------------------------------

export async function importTemplateFBX(file) {
  const store = useAppStore.getState();

  store.setTemplateImporting(true);

  const loadingToast = toast.loading(
    `Parsing ${file.name}…`
  );

  try {
    const buffer =
      await file.arrayBuffer();

    const template =
      await parseSkeletonFromFBX(
        buffer,
        file.name
      );

    const diagnostics =
      template.diagnostics || {
        errors: [],
        warnings: [],
      };

    // The parsed FBX becomes authoritative immediately.
    store.setTemplate(
      template,
      'user_authoritative',
      null,
      null
    );

    useAppStore.setState({
      templateImportError: null,
    });

    const validation =
      await runValidation(template);

    const saved =
      await saveTemplateLocally(
        template,
        validation
      );

    store.setTemplateSavedId(saved.id);

    rememberActiveTemplate(saved.id);

    if (diagnostics.errors?.length) {
      toast.error(
        `FBX parsed with ${diagnostics.errors.length} parser error(s). Inspect the Template tab.`,
        {
          id: loadingToast,
          duration: 12000,
        }
      );
    } else {
      toast.success(
        `Imported ${template.bones.length} bones from FBX · ${validation.status.toUpperCase()} · saved locally`,
        {
          id: loadingToast,
        }
      );
    }

    return {
      template,
      validation,
      savedId: saved.id,
    };
  } catch (error) {
    console.error(error);

    useAppStore.setState({
      templateImportError: {
        file: file.name,
        message: error.message,
        at: new Date().toISOString(),
      },
    });

    toast.error(
      `IMPORT QUINN FBX failed: ${error.message}`,
      {
        id: loadingToast,
        duration: 15000,
      }
    );

    throw error;
  } finally {
    store.setTemplateImporting(false);
  }
}

// -----------------------------------------------------------------------------
// JSON IMPORT
// -----------------------------------------------------------------------------

export async function importTemplateJSON(file) {
  const store = useAppStore.getState();

  const text = await file.text();

  const data = JSON.parse(text);

  if (!Array.isArray(data.bones)) {
    throw new Error(
      'JSON has no "bones" array'
    );
  }

  const derivedFromFbx =
    data.source ===
      'user_authoritative' &&
    data.provenance?.origin_format ===
      'fbx' &&
    !!data.provenance?.sha256;

  const source = derivedFromFbx
    ? 'user_authoritative'
    : 'user_json';

  if (!data.schema_version) {
    data.schema_version =
      TEMPLATE_SCHEMA_VERSION;
  }

  if (!derivedFromFbx) {
    data.source = 'user_json';

    data.provenance = {
      ...(data.provenance || {}),
      origin_format:
        data.provenance
          ?.origin_format || 'json',
      origin_filename: file.name,
      imported_at:
        new Date().toISOString(),
    };
  }

  store.setTemplate(
    data,
    source,
    null,
    null
  );

  useAppStore.setState({
    templateImportError: null,
  });

  const validation =
    await runValidation(data);

  const saved =
    await saveTemplateLocally(
      data,
      validation
    );

  store.setTemplateSavedId(saved.id);

  rememberActiveTemplate(saved.id);

  toast.success(
    `Loaded JSON template · ${data.bones.length} bones · saved locally`
  );

  return {
    template: data,
    validation,
    savedId: saved.id,
  };
}

// -----------------------------------------------------------------------------
// LOAD / RESTORE
// -----------------------------------------------------------------------------

export async function loadTemplateFromLibrary(
  id,
  { quiet = false } = {}
) {
  const saved =
    getTemplateLocally(id);

  const data =
    saved.template_data;

  let validation =
    saved.validation || null;

  if (!validation) {
    validation =
      validateTemplateLocal(
        data,
        requiredBones()
      );
  }

  useAppStore
    .getState()
    .setTemplate(
      data,
      saved.source,
      validation,
      saved.id
    );

  rememberActiveTemplate(saved.id);

  if (!quiet) {
    toast.success(
      `Loaded local template: ${saved.name}`
    );
  }

  return saved;
}

export function rememberActiveTemplate(id) {
  try {
    if (id) {
      localStorage.setItem(
        ACTIVE_KEY,
        id
      );
    } else {
      localStorage.removeItem(
        ACTIVE_KEY
      );
    }
  } catch (error) {
    console.warn(
      'Could not remember active template:',
      error
    );
  }
}

let restoreStarted = false;

export async function restoreActiveTemplate() {
  if (restoreStarted) {
    return null;
  }

  restoreStarted = true;

  const state =
    useAppStore.getState();

  if (
    state.templateSource !==
    'sample_dev'
  ) {
    return null;
  }

  try {
    let id = null;

    try {
      id =
        localStorage.getItem(
          ACTIVE_KEY
        );
    } catch {
      id = null;
    }

    const library =
      readLibraryRaw();

    if (!id) {
      const latestAuthoritative =
        library
          .filter(
            (item) =>
              item.source ===
              'user_authoritative'
          )
          .sort((a, b) =>
            String(
              b.imported_at ||
                b.created_at ||
                ''
            ).localeCompare(
              String(
                a.imported_at ||
                  a.created_at ||
                  ''
              )
            )
          )[0];

      id =
        latestAuthoritative?.id ||
        null;
    }

    if (!id) {
      return null;
    }

    const saved =
      await loadTemplateFromLibrary(
        id,
        {
          quiet: true,
        }
      );

    toast.success(
      `Restored authoritative template: ${saved.name} · ${saved.bone_count} bones`
    );

    return saved;
  } catch (error) {
    console.warn(
      'Could not restore local template:',
      error
    );

    rememberActiveTemplate(null);

    return null;
  }
}

// -----------------------------------------------------------------------------
// EXPORT
// -----------------------------------------------------------------------------

export function exportTemplateJSON(
  template,
  validation
) {
  const payload = {
    ...template,

    exported_at:
      new Date().toISOString(),

    export_note:
      'Derived cache of the validated FBX import. The original FBX remains the authoritative source.',

    validation_snapshot:
      validation
        ? {
            status:
              validation.status,
            checked_at:
              validation.checked_at,
          }
        : null,
  };

  const blob = new Blob(
    [
      JSON.stringify(
        payload,
        null,
        2
      ),
    ],
    {
      type: 'application/json',
    }
  );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement('a');

  anchor.href = url;

  anchor.download =
    `${(
      template.name ||
      'skeleton_template'
    ).replace(
      /[^\w.-]+/g,
      '_'
    )}.template.json`;

  document.body.appendChild(
    anchor
  );

  anchor.click();
  anchor.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(url),
    2000
  );
}

// -----------------------------------------------------------------------------
// FIT AUTHORIZATION
// -----------------------------------------------------------------------------

export function isFitAuthorized(
  source,
  validation
) {
  return (
    source ===
      'user_authoritative' &&
    !!validation &&
    validation.status !== 'invalid'
  );
}
