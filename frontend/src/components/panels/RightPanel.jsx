import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import LandmarksTab from './LandmarksTab';
import BonesTab from './BonesTab';
import DiagnosticsTab from './DiagnosticsTab';

export default function RightPanel() {
  return (
    <aside
      className="flex flex-col border-l overflow-hidden"
      style={{ background: 'var(--panel-bg-deep)', borderColor: 'var(--panel-border)', width: 360 }}
    >
      <Tabs defaultValue="landmarks" className="flex flex-col h-full">
        <TabsList
          className="h-10 px-2 rounded-none border-b bg-transparent w-full justify-start gap-1"
          style={{ borderColor: 'var(--panel-border)' }}
        >
          <TabsTrigger
            value="landmarks"
            data-testid="tab-landmarks"
            className="h-7 text-[11px] font-mono uppercase tracking-wider data-[state=active]:bg-[color:var(--panel-bg-raised)] data-[state=active]:text-[color:var(--dcc-orange-glow)]"
          >
            Landmarks
          </TabsTrigger>
          <TabsTrigger
            value="bones"
            data-testid="tab-bones"
            className="h-7 text-[11px] font-mono uppercase tracking-wider data-[state=active]:bg-[color:var(--panel-bg-raised)] data-[state=active]:text-[color:var(--dcc-orange-glow)]"
          >
            Quinn Bones
          </TabsTrigger>
          <TabsTrigger
            value="diag"
            data-testid="tab-diag"
            className="h-7 text-[11px] font-mono uppercase tracking-wider data-[state=active]:bg-[color:var(--panel-bg-raised)] data-[state=active]:text-[color:var(--dcc-orange-glow)]"
          >
            Diagnostics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="landmarks" className="flex-1 m-0 overflow-hidden">
          <LandmarksTab />
        </TabsContent>
        <TabsContent value="bones" className="flex-1 m-0 overflow-hidden">
          <BonesTab />
        </TabsContent>
        <TabsContent value="diag" className="flex-1 m-0 overflow-hidden">
          <DiagnosticsTab />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
