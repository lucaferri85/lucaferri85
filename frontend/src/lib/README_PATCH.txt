Quinn Rigger guided workflow patch

Files included:
- frontend/src/lib/meshAlignmentService.js
- frontend/src/components/panels/LeftPanel.jsx
- frontend/src/components/panels/LandmarksTab.jsx
- frontend/src/components/panels/BottomStageBar.jsx
- frontend/src/components/panels/TopBar.jsx

What it adds:
- Robust automatic mesh centering to X=0 / Z=0 with feet on Y=0.
- Manual CENTER MESH TO ORIGIN button.
- Existing landmarks and fitted skeleton move together when manually recentering.
- Centering correction persists through project SAVE/LOAD.
- Binary mesh persistence remains integrated through IndexedDB.
- Guided Landmarks -> Fit Skeleton continuation card.
- Required body landmarks block continuation; optional finger misses do not.
- Clearer six-step bottom workflow.

Suggested commit message:
Add robust mesh centering and guided rig workflow
