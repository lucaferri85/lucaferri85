import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import * as api from './api';

/** Persist the current project (create on first save). Shared by TopBar and the assistant. */
export async function saveCurrentProject(nameOverride) {
  const s = useAppStore.getState();
  if (nameOverride && nameOverride !== s.projectName) s.setProjectName(nameOverride);
  const st = useAppStore.getState();
  st.setSaving(true);
  try {
    const payload = {
      name: st.projectName,
      stage: st.stage,
      landmarks: st.landmarks,
      symmetry: st.symmetry,
      mesh: st.mesh,
      template: {
        name: st.template.name || 'Skeleton Template',
        version: String(st.template.version || ''),
        source: st.templateSource,
        bones_count: st.template.bones?.length || 0,
        saved_template_id: st.templateSavedId,
        template_data: st.template,
      },
      fitted: st.fitted || null,
      fit_approved: st.fitApproved,
      fit_approval: st.fitApproval,
    };
    let proj;
    if (st.projectId) proj = await api.updateProject(st.projectId, payload);
    else { const created = await api.createProject(st.projectName); proj = await api.updateProject(created.id, payload); }
    st.markSaved(proj);
    toast.success('Project saved');
    return proj;
  } catch (e) {
    toast.error(`Save failed: ${e.message}`);
    throw e;
  } finally {
    useAppStore.getState().setSaving(false);
  }
}
