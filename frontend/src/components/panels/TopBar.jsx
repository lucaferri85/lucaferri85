import {
  useEffect,
  useState,
} from 'react';

import {
  useAppStore,
} from '../../store/appStore';

import {
  Button,
} from '../ui/button';

import {
  Input,
} from '../ui/input';

import {
  Save,
  FolderOpen,
  Undo2,
  Redo2,
  Cpu,
  HardDrive,
} from 'lucide-react';

import {
  toast,
} from 'sonner';

import {
  runValidation,
} from '../../lib/templateService';

import {
  saveCurrentProject,
  listLocalProjects,
  loadLocalProject,
} from '../../lib/projectService';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';

export default function TopBar() {
  const projectName =
    useAppStore(
      (state) =>
        state.projectName
    );

  const setProjectName =
    useAppStore(
      (state) =>
        state.setProjectName
    );

  const saving =
    useAppStore(
      (state) =>
        state.saving
    );

  const dirty =
    useAppStore(
      (state) =>
        state.dirty
    );

  const lastSavedAt =
    useAppStore(
      (state) =>
        state.lastSavedAt
    );

  const undo =
    useAppStore(
      (state) =>
        state.undo
    );

  const redo =
    useAppStore(
      (state) =>
        state.redo
    );

  const historyLen =
    useAppStore(
      (state) =>
        state.history.length
    );

  const futureLen =
    useAppStore(
      (state) =>
        state.future.length
    );

  const [
    projects,
    setProjects,
  ] = useState([]);

  const [
    loadOpen,
    setLoadOpen,
  ] = useState(false);

  const refreshList =
    async () => {
      try {
        const list =
          await listLocalProjects();

        setProjects(
          list
        );
      } catch (error) {
        console.error(
          error
        );

        toast.error(
          'Could not load local projects'
        );
      }
    };

  useEffect(() => {
    refreshList();
  }, []);

  const saveProject =
    async () => {
      try {
        await saveCurrentProject();

        await refreshList();
      } catch {
        // Toast already shown by projectService.
      }
    };

  const loadProject =
    async (id) => {
      try {
        const project =
          await loadLocalProject(
            id
          );

        const templateData =
          project.template
            ?.template_data;

        const source =
          project.template
            ?.source ||
          templateData
            ?.source;

        if (
          source ===
            'user_authoritative' &&
          templateData
            ?.bones
        ) {
          try {
            await runValidation(
              templateData
            );
          } catch (
            validationError
          ) {
            console.warn(
              'Loaded project but template validation failed:',
              validationError
            );
          }
        }

        toast.success(
          `Loaded locally: ${project.name}`
        );

        setLoadOpen(
          false
        );
      } catch (error) {
        toast.error(
          `Load failed: ${error.message}`
        );
      }
    };

  return (
    <div
      data-testid="app-header"
      className="h-12 flex items-center justify-between px-4 border-b"
      style={{
        background:
          'var(--panel-bg-deep)',

        borderColor:
          'var(--panel-border)',
      }}
    >
      {/* LEFT */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded flex items-center justify-center"
            style={{
              background:
                'linear-gradient(135deg, var(--dcc-orange) 0%, var(--dcc-orange-hover) 100%)',
            }}
          >
            <Cpu className="w-4 h-4 text-white" />
          </div>

          <div className="flex flex-col leading-tight">
            <span className="dcc-heading text-[13px]">
              Quinn Rigger
            </span>

            <span
              className="dcc-label text-[9px]"
              style={{
                color:
                  'var(--text-faint)',
              }}
            >
              UE5 Auto-Rig · V1
            </span>
          </div>
        </div>

        <div
          className="h-6 w-px"
          style={{
            background:
              'var(--panel-border)',
          }}
        />

        <Input
          data-testid="project-name-input"
          value={
            projectName
          }
          onChange={(
            event
          ) =>
            setProjectName(
              event.target.value
            )
          }
          className="h-7 w-52 bg-transparent border-transparent hover:border-[color:var(--panel-border)] focus-visible:border-[color:var(--dcc-orange)] focus-visible:ring-0 text-sm dcc-focus"
        />

        <span className="dcc-label text-[10px]">
          {dirty ? (
            <span
              style={{
                color:
                  'var(--dcc-orange-glow)',
              }}
            >
              ● UNSAVED
            </span>
          ) : lastSavedAt ? (
            <span
              style={{
                color:
                  'var(--dcc-emerald)',
              }}
            >
              ● SAVED
            </span>
          ) : (
            <span
              style={{
                color:
                  'var(--text-faint)',
              }}
            >
              ● NEW
            </span>
          )}
        </span>

        <span
          className="flex items-center gap-1 font-mono text-[9px]"
          style={{
            color:
              'var(--dcc-emerald)',
          }}
          title="Projects are stored locally on this computer"
        >
          <HardDrive className="w-3 h-3" />
          LOCAL
        </span>
      </div>

      {/* CENTER */}
      <div className="flex items-center gap-1">
        <Button
          data-testid="undo-button"
          onClick={
            undo
          }
          disabled={
            historyLen ===
            0
          }
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs disabled:opacity-30"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </Button>

        <Button
          data-testid="redo-button"
          onClick={
            redo
          }
          disabled={
            futureLen ===
            0
          }
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs disabled:opacity-30"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2">
        <Popover
          open={
            loadOpen
          }
          onOpenChange={
            setLoadOpen
          }
        >
          <PopoverTrigger
            asChild
          >
            <Button
              data-testid="project-load-button"
              variant="outline"
              size="sm"
              className="h-8 text-xs border-[color:var(--panel-border)] hover:bg-[color:var(--panel-bg-raised)] gap-1.5"
              onClick={() => {
                refreshList();
              }}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              LOAD
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            className="w-72 p-0 dcc-panel-raised border-[color:var(--panel-border)]"
          >
            <div
              className="px-3 py-2 border-b flex items-center justify-between"
              style={{
                borderColor:
                  'var(--panel-border)',
              }}
            >
              <span className="dcc-label flex items-center gap-1.5">
                <HardDrive className="w-3 h-3" />
                LOCAL PROJECTS ·{' '}
                {
                  projects.length
                }
              </span>

              <button
                className="dcc-label hover:text-white"
                onClick={
                  refreshList
                }
              >
                refresh
              </button>
            </div>

            <div className="max-h-64 overflow-auto dcc-scroll">
              {projects.length ===
                0 && (
                <div
                  className="p-4 text-xs"
                  style={{
                    color:
                      'var(--text-faint)',
                  }}
                >
                  No saved local projects yet. Click SAVE to create one.
                </div>
              )}

              {projects.map(
                (project) => (
                  <button
                    key={
                      project.id
                    }
                    data-testid={`project-load-item-${project.id}`}
                    onClick={() =>
                      loadProject(
                        project.id
                      )
                    }
                    className="w-full flex flex-col items-start gap-0.5 px-3 py-2 hover:bg-[color:var(--panel-bg-raised)] text-left border-b"
                    style={{
                      borderColor:
                        'var(--panel-border-subtle)',
                    }}
                  >
                    <span className="text-sm text-[color:var(--text-high)] font-medium">
                      {
                        project.name
                      }
                    </span>

                    <span className="dcc-label text-[9px]">
                      {(
                        project.stage ||
                        'import'
                      ).toUpperCase()}
                      {' · '}
                      {
                        project.landmarks_placed
                      }
                      /
                      {
                        project.landmarks_total
                      }
                      {' landmarks'}
                    </span>

                    {project.updated_at && (
                      <span
                        className="font-mono text-[8px]"
                        style={{
                          color:
                            'var(--text-faint)',
                        }}
                      >
                        {new Date(
                          project.updated_at
                        ).toLocaleString()}
                      </span>
                    )}
                  </button>
                )
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          data-testid="project-save-button"
          onClick={
            saveProject
          }
          disabled={
            saving
          }
          size="sm"
          className="h-8 text-xs gap-1.5 text-white"
          style={{
            background:
              'var(--dcc-orange)',
          }}
        >
          <Save className="w-3.5 h-3.5" />

          {saving
            ? 'SAVING…'
            : 'SAVE'}
        </Button>
      </div>
    </div>
  );
}
