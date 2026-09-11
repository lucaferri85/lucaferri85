/**
 * ViewportHUD - floating overlay controls layered on top of the 3D
 * viewport (camera views, projection, shading toggles, help chip).
 */
import { useAppStore } from '../../store/appStore';
import { Camera, Box, Grid3x3, Eye, EyeOff, FlipHorizontal2 } from 'lucide-react';

export default function ViewportHUD() {
  const setCameraView = useAppStore(s => s.setCameraView);
  const projection = useAppStore(s => s.projection);
  const toggleProjection = useAppStore(s => s.toggleProjection);
  const showWireframe = useAppStore(s => s.showWireframe);
  const toggleWireframe = useAppStore(s => s.toggleWireframe);
  const showXray = useAppStore(s => s.showXray);
  const toggleXray = useAppStore(s => s.toggleXray);
  const showGrid = useAppStore(s => s.showGrid);
  const toggleGrid = useAppStore(s => s.toggleGrid);
  const showLandmarks = useAppStore(s => s.showLandmarks);
  const toggleLandmarks = useAppStore(s => s.toggleLandmarks);
  const showSkeleton = useAppStore(s => s.showSkeleton);
  const toggleSkeleton = useAppStore(s => s.toggleSkeleton);
  const symmetry = useAppStore(s => s.symmetry);

  return (
    <>
      {/* Top-left: camera views */}
      <div className="absolute top-3 left-3 flex items-center gap-1 dcc-panel-raised rounded px-1 py-1">
        <HUDBtn testid="viewport-view-front-btn" onClick={() => setCameraView('front')} label="F" title="Front view [1]" />
        <HUDBtn testid="viewport-view-back-btn"  onClick={() => setCameraView('back')}  label="B" title="Back view" />
        <HUDBtn testid="viewport-view-left-btn"  onClick={() => setCameraView('left')}  label="L" title="Left view" />
        <HUDBtn testid="viewport-view-right-btn" onClick={() => setCameraView('right')} label="R" title="Right view [3]" />
        <HUDBtn testid="viewport-view-top-btn"   onClick={() => setCameraView('top')}   label="T" title="Top view [7]" />
        <HUDBtn testid="viewport-view-iso-btn"   onClick={() => setCameraView('iso')}   label="ISO" title="Isometric" />
        <div className="w-px h-5 mx-1" style={{ background: 'var(--panel-border)' }} />
        <HUDBtn
          testid="viewport-projection-toggle"
          onClick={toggleProjection}
          label={projection === 'perspective' ? 'PERSP' : 'ORTHO'}
          title="Toggle Perspective / Orthographic"
          active={projection === 'orthographic'}
        />
      </div>

      {/* Top-right: shading & visibility */}
      <div className="absolute top-3 right-3 flex items-center gap-1 dcc-panel-raised rounded px-1 py-1">
        <HUDIcon testid="viewport-wireframe-toggle" onClick={toggleWireframe} active={showWireframe} title="Wireframe">
          <Box className="w-3.5 h-3.5" />
        </HUDIcon>
        <HUDIcon testid="viewport-xray-toggle" onClick={toggleXray} active={showXray} title="X-Ray">
          {showXray ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </HUDIcon>
        <HUDIcon testid="viewport-grid-toggle" onClick={toggleGrid} active={showGrid} title="Grid">
          <Grid3x3 className="w-3.5 h-3.5" />
        </HUDIcon>
        <div className="w-px h-5 mx-0.5" style={{ background: 'var(--panel-border)' }} />
        <HUDBtn testid="viewport-landmarks-toggle" onClick={toggleLandmarks} active={showLandmarks} label="LMK" title="Show landmarks" />
        <HUDBtn testid="viewport-skeleton-hud-toggle" onClick={toggleSkeleton} active={showSkeleton} label="SKEL" title="Show skeleton" />
        {symmetry.enabled && (
          <div className="ml-1 px-1.5 h-6 flex items-center gap-1 rounded font-mono text-[10px] uppercase"
               style={{ background: 'var(--panel-bg-surface)', color: 'var(--dcc-orange-glow)' }}>
            <FlipHorizontal2 className="w-3 h-3" />
            SYM · {symmetry.axis.toUpperCase()}
          </div>
        )}
      </div>

      {/* Bottom-left: help chip */}
      <div className="absolute bottom-3 left-3 font-mono text-[10px] flex items-center gap-2 px-2 py-1 rounded"
           style={{ background: 'rgba(22, 23, 27, 0.85)', color: 'var(--text-mid)', backdropFilter: 'blur(6px)' }}>
        <span className="kbd">LMB</span> Select / Place
        <span className="kbd">DRAG</span> Move landmark
        <span className="kbd">RMB</span> Orbit
        <span className="kbd">MMB</span> Pan
        <span className="kbd">WHEEL</span> Zoom
      </div>
    </>
  );
}

function HUDBtn({ testid, onClick, label, title, active }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      title={title}
      className="h-6 min-w-[26px] px-1.5 rounded font-mono text-[10px] uppercase tracking-wider transition-colors"
      style={{
        background: active ? 'var(--dcc-orange)' : 'transparent',
        color: active ? '#fff' : 'var(--text-mid)',
      }}
      onMouseOver={(e) => { if (!active) e.currentTarget.style.background = 'var(--panel-bg-surface)'; }}
      onMouseOut={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >{label}</button>
  );
}

function HUDIcon({ testid, onClick, title, active, children }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      title={title}
      className="h-6 w-7 rounded flex items-center justify-center transition-colors"
      style={{
        background: active ? 'var(--dcc-orange)' : 'transparent',
        color: active ? '#fff' : 'var(--text-mid)',
      }}
      onMouseOver={(e) => { if (!active) e.currentTarget.style.background = 'var(--panel-bg-surface)'; }}
      onMouseOut={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >{children}</button>
  );
}
