import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';

/**
 * Quinn Rigger — local/offline project persistence.
 *
 * Projects are stored locally in Electron/Chromium localStorage.
 * No backend, MongoDB, Emergent server or internet connection is required.
 */

const PROJECTS_KEY = 'quinn.projects.library.v1';
const ACTIVE_PROJECT_KEY = 'quinn.projects.activeId';

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function deepClone(value) {
  if (value == null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

function readProjectsRaw() {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch (error) {
    console.error(
      'Could not read local project library:',
      error
    );

    return [];
  }
}

function writeProjectsRaw(projects) {
  try {
    localStorage.setItem(
      PROJECTS_KEY,
      JSON.stringify(projects)
    );
  } catch (error) {
    console.error(
      'Could not write local project library:',
      error
    );

    throw new Error(
      'Local project storage failed. Storage may be full or unavailable.'
    );
  }
}

function rememberActiveProject(id) {
  try {
    if (id) {
      localStorage.setItem(
        ACTIVE_PROJECT_KEY,
        id
      );
    } else {
      localStorage.removeItem(
        ACTIVE_PROJECT_KEY
      );
    }
  } catch (error) {
    console.warn(
      'Could not remember active project:',
      error
    );
  }
}

function projectSummary(project) {
  const landmarks =
    Array.isArray(project.landmarks)
      ? project.landmarks
      : [];

  return {
    id: project.id,

    name:
      project.name ||
      'Untitled Rig',

    stage:
      project.stage ||
      'import',

    landmarks_placed:
      landmarks.filter(
        (landmark) =>
          landmark?.placed
      ).length,

    landmarks_total:
      landmarks.length,

    updated_at:
      project.updated_at,
  };
}

function makeProjectPayload(
  state,
  existing = null
) {
  const now =
    new Date().toISOString();

  const template =
    state.template || {};

  return {
    id:
      existing?.id ||
      state.projectId ||
      createId(),

    name:
      state.projectName ||
      'Untitled Rig',

    stage:
      state.stage ||
      'import',

    mesh:
      deepClone(
        state.mesh
      ),

    landmarks:
      deepClone(
        state.landmarks
      ),

    symmetry:
      deepClone(
        state.symmetry
      ),

    template: {
      name:
        template.name ||
        'Skeleton Template',

      version:
        String(
          template.version ||
          ''
        ),

      source:
        state.templateSource ||
        template.source ||
        'sample_dev',

      bones_count:
        template.bones?.length ||
        0,

      saved_template_id:
        state.templateSavedId ||
        null,

      template_data:
        deepClone(
          template
        ),

      validation:
        deepClone(
          state.templateValidation
        ),
    },

    fitted:
      deepClone(
        state.fitted
      ),

    fit_approved:
      !!state.fitApproved,

    fit_approval:
      deepClone(
        state.fitApproval
      ),

    created_at:
      existing?.created_at ||
      now,

    updated_at:
      now,
  };
}

/**
 * Lightweight project list for the LOAD menu.
 */
export async function listLocalProjects() {
  return readProjectsRaw()
    .map(
      projectSummary
    )
    .sort(
      (a, b) =>
        String(
          b.updated_at || ''
        ).localeCompare(
          String(
            a.updated_at || ''
          )
        )
    );
}

/**
 * Get the complete stored project.
 */
export async function getLocalProject(id) {
  const project =
    readProjectsRaw().find(
      (item) =>
        item.id === id
    );

  if (!project) {
    throw new Error(
      'Project not found in local library'
    );
  }

  return deepClone(
    project
  );
}

/**
 * Save the current Zustand project state locally.
 */
export async function saveCurrentProject(
  nameOverride
) {
  const initial =
    useAppStore.getState();

  if (
    nameOverride &&
    nameOverride !==
      initial.projectName
  ) {
    initial.setProjectName(
      nameOverride
    );
  }

  const state =
    useAppStore.getState();

  state.setSaving(true);

  try {
    const projects =
      readProjectsRaw();

    const existing =
      state.projectId
        ? projects.find(
            (item) =>
              item.id ===
              state.projectId
          ) || null
        : null;

    const project =
      makeProjectPayload(
        state,
        existing
      );

    const nextProjects =
      existing
        ? projects.map(
            (item) =>
              item.id ===
              existing.id
                ? project
                : item
          )
        : [
            ...projects,
            project,
          ];

    writeProjectsRaw(
      nextProjects
    );

    rememberActiveProject(
      project.id
    );

    useAppStore
      .getState()
      .markSaved(project);

    toast.success(
      'Project saved locally'
    );

    return deepClone(
      project
    );
  } catch (error) {
    toast.error(
      `Save failed: ${error.message}`
    );

    throw error;
  } finally {
    useAppStore
      .getState()
      .setSaving(false);
  }
}

/**
 * Load a local project directly into the app store.
 */
export async function loadLocalProject(id) {
  const project =
    await getLocalProject(
      id
    );

  useAppStore
    .getState()
    .setProject(project);

  rememberActiveProject(
    project.id
  );

  return project;
}

/**
 * Delete a stored local project.
 */
export async function deleteLocalProject(id) {
  const projects =
    readProjectsRaw();

  const nextProjects =
    projects.filter(
      (item) =>
        item.id !== id
    );

  if (
    nextProjects.length ===
    projects.length
  ) {
    throw new Error(
      'Project not found in local library'
    );
  }

  writeProjectsRaw(
    nextProjects
  );

  try {
    const activeId =
      localStorage.getItem(
        ACTIVE_PROJECT_KEY
      );

    if (activeId === id) {
      rememberActiveProject(
        null
      );
    }
  } catch {
    // Non-fatal.
  }

  return {
    ok: true,
  };
}

/**
 * Returns the last-used project without automatically loading it.
 */
export async function getLastActiveProject() {
  let id = null;

  try {
    id =
      localStorage.getItem(
        ACTIVE_PROJECT_KEY
      );
  } catch {
    return null;
  }

  if (!id) {
    return null;
  }

  try {
    return await getLocalProject(
      id
    );
  } catch {
    rememberActiveProject(
      null
    );

    return null;
  }
}
