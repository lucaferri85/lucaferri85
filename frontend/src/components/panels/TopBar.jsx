import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Save, FolderOpen, Undo2, Redo2, Sparkles, Cpu } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../../lib/api';
import { runValidation } from '../../lib/templateService';
import { saveCurrentProject } from '../../lib/projectService';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export default function TopBar() {
  const projectName = useAppStore(s => s.projectName);
  const projectId = useAppStore(s => s.projectId);
  const setProjectName = useAppStore(s => s.setProjectName);
  const setProject = useAppStore(s => s.setProject);
  const saving = useAppStore(s => s.saving);
  const dirty = useAppStore(s => s.dirty);
  const lastSavedAt = useAppStore(s => s.lastSavedAt);
  const undo = useAppStore(s => s.undo);
  const redo = useAppStore(s => s.redo);
  const historyLen = useAppStore(s => s.history.length);
  const futureLen = useAppStore(s => s.future.length);

  const [projects, setProjects] = useState([]);
  const [loadOpen, setLoadOpen] = useState(false);

  const refreshList = async () => {
    try {
      const list = await api.listProjects();
      setProjects(list);
    } catch (e) {
      toast.error('Could not load projects list');
    }
  };

  useEffect(() => { refreshList(); }, []);

  const saveProject = async () => {
    try { await saveCurrentProject(); refreshList(); } catch (e) { /* toast shown by service */ }
  };

  const loadProject = async (id) => {
    try {
      const p = await api.getProject(id);
      setProject(p);
      const src = p.template?.source || p.template?.template_data?.source;
      if (src === 'user_authoritative' && p.template?.template_data?.bones) runValidation(p.template.template_data).catch(() => {});
      toast.success(`Loaded: ${p.name}`);
      setLoadOpen(false);
    } catch (e) {
      toast.error(`Load failed: ${e.message}`);
    }
  };

  return (
    <div
      data-testid="app-header"
      className="h-12 flex items-center justify-between px-4 border-b"
      style={{ background: 'var(--panel-bg-deep)', borderColor: 'var(--panel-border)' }}
    >
      {/* Left: branding */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--dcc-orange) 0%, var(--dcc-orange-hover) 100%)' }}>
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="dcc-heading text-[13px]">Quinn Rigger</span>
            <span className="dcc-label text-[9px]" style={{color:'var(--text-faint)'}}>UE5 Auto-Rig · V1</span>
          </div>
        </div>
        <div className="h-6 w-px" style={{background:'var(--panel-border)'}} />
        <Input
          data-testid="project-name-input"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="h-7 w-52 bg-transparent border-transparent hover:border-[color:var(--panel-border)] focus-visible:border-[color:var(--dcc-orange)] focus-visible:ring-0 text-sm dcc-focus"
        />
        <span className="dcc-label text-[10px]">
          {dirty
            ? <span style={{ color: 'var(--dcc-orange-glow)' }}>● UNSAVED</span>
            : lastSavedAt
              ? <span style={{ color: 'var(--dcc-emerald)' }}>● SAVED</span>
              : <span style={{ color: 'var(--text-faint)' }}>● NEW</span>
          }
        </span>
      </div>

      {/* Center: undo/redo & workflow */}
      <div className="flex items-center gap-1">
        <Button
          data-testid="undo-button"
          onClick={undo}
          disabled={historyLen === 0}
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs disabled:opacity-30"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          data-testid="redo-button"
          onClick={redo}
          disabled={futureLen === 0}
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs disabled:opacity-30"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Right: project actions */}
      <div className="flex items-center gap-2">
        <Popover open={loadOpen} onOpenChange={setLoadOpen}>
          <PopoverTrigger asChild>
            <Button
              data-testid="project-load-button"
              variant="outline"
              size="sm"
              className="h-8 text-xs border-[color:var(--panel-border)] hover:bg-[color:var(--panel-bg-raised)] gap-1.5"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              LOAD
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-72 p-0 dcc-panel-raised border-[color:var(--panel-border)]"
          >
            <div className="px-3 py-2 border-b flex items-center justify-between" style={{borderColor:'var(--panel-border)'}}>
              <span className="dcc-label">Projects · {projects.length}</span>
              <button className="dcc-label hover:text-white" onClick={refreshList}>refresh</button>
            </div>
            <div className="max-h-64 overflow-auto dcc-scroll">
              {projects.length === 0 && (
                <div className="p-4 text-xs" style={{color:'var(--text-faint)'}}>No saved projects yet. Click SAVE to create one.</div>
              )}
              {projects.map(p => (
                <button
                  key={p.id}
                  data-testid={`project-load-item-${p.id}`}
                  onClick={() => loadProject(p.id)}
                  className="w-full flex flex-col items-start gap-0.5 px-3 py-2 hover:bg-[color:var(--panel-bg-raised)] text-left border-b"
                  style={{borderColor:'var(--panel-border-subtle)'}}
                >
                  <span className="text-sm text-[color:var(--text-high)] font-medium">{p.name}</span>
                  <span className="dcc-label text-[9px]">
                    {p.stage.toUpperCase()} · {p.landmarks_placed}/{p.landmarks_total} landmarks
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          data-testid="project-save-button"
          onClick={saveProject}
          disabled={saving}
          size="sm"
          className="h-8 text-xs gap-1.5 text-white"
          style={{ background: 'var(--dcc-orange)' }}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'SAVING…' : 'SAVE'}
        </Button>
      </div>
    </div>
  );
}
