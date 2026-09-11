import { useEffect } from 'react';
import TopBar from '../components/panels/TopBar';
import LeftPanel from '../components/panels/LeftPanel';
import RightPanel from '../components/panels/RightPanel';
import BottomStageBar from '../components/panels/BottomStageBar';
import Viewport3D from '../components/viewport/Viewport3D';
import ViewportHUD from '../components/viewport/ViewportHUD';
import { Toaster } from 'sonner';
import { useAppStore } from '../store/appStore';

export default function Workspace() {
  const undo = useAppStore(s => s.undo);
  const redo = useAppStore(s => s.redo);
  const cancelPlacing = useAppStore(s => s.cancelPlacing);
  const placingMode = useAppStore(s => s.placingMode);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const isTyping = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;
      if (isTyping) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
      else if (e.key === 'Escape' && placingMode) { cancelPlacing(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, cancelPlacing, placingMode]);

  return (
    <div className="App flex flex-col h-screen w-screen" data-testid="workspace-root">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <LeftPanel />
        <main className="flex-1 relative overflow-hidden">
          <Viewport3D />
          <ViewportHUD />
        </main>
        <RightPanel />
      </div>
      <BottomStageBar />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--panel-bg-raised)',
            border: '1px solid var(--panel-border)',
            color: 'var(--text-high)',
            fontFamily: 'IBM Plex Sans, sans-serif',
          },
        }}
      />
    </div>
  );
}
