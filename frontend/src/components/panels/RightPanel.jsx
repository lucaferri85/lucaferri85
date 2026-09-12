import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { useAppStore } from '../../store/appStore';
import LandmarksTab from './LandmarksTab';
import BonesTab from './BonesTab';
import DiagnosticsTab from './DiagnosticsTab';
import TemplateTab from './TemplateTab';
import FitTab from './FitTab';

const TAB_CLS = 'h-7 px-2 text-[11px] font-mono uppercase tracking-wider data-[state=active]:bg-[color:var(--panel-bg-raised)] data-[state=active]:text-[color:var(--dcc-orange-glow)]';

export default function RightPanel() {
  const rightTab = useAppStore(s => s.rightTab);
  const setRightTab = useAppStore(s => s.setRightTab);
  return (
    <aside
      className="flex flex-col border-l overflow-hidden"
      style={{ background: 'var(--panel-bg-deep)', borderColor: 'var(--panel-border)', width: 380 }}
    >
      <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-col h-full">
        <TabsList
          className="h-10 px-2 rounded-none border-b bg-transparent w-full justify-start gap-1"
          style={{ borderColor: 'var(--panel-border)' }}
        >
          <TabsTrigger value="landmarks" data-testid="tab-landmarks" className={TAB_CLS}>Landmarks</TabsTrigger>
          <TabsTrigger value="fit" data-testid="tab-fit" className={TAB_CLS}>Fit</TabsTrigger>
          <TabsTrigger value="bones" data-testid="tab-bones" className={TAB_CLS}>Bones</TabsTrigger>
          <TabsTrigger value="template" data-testid="tab-template" className={TAB_CLS}>Template</TabsTrigger>
          <TabsTrigger value="diag" data-testid="tab-diag" className={TAB_CLS}>Diag</TabsTrigger>
        </TabsList>

        <TabsContent value="landmarks" className="flex-1 m-0 overflow-hidden">
          <LandmarksTab />
        </TabsContent>
        <TabsContent value="fit" className="flex-1 m-0 overflow-hidden">
          <FitTab />
        </TabsContent>
        <TabsContent value="bones" className="flex-1 m-0 overflow-hidden">
          <BonesTab />
        </TabsContent>
        <TabsContent value="template" className="flex-1 m-0 overflow-hidden">
          <TemplateTab />
        </TabsContent>
        <TabsContent value="diag" className="flex-1 m-0 overflow-hidden">
          <DiagnosticsTab />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
