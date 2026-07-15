import { BlockDragOverlay, Content, RootLayout, Sidebar, DraggableTopBar, CategorySidebar, CollapsedSidebar, ChatPanel, BlockPanel, CalendarResolutionDialog, CalendarView, CaptureBar, GlossaryView, LoadingSplash, PluginView } from "@/components"
import { useCalendar, useGoals, usePanels, useSettings } from "@renderer/context";
import { cn } from "@renderer/utils";
import { OnboardingOverlay } from '@renderer/onboarding'


const App: React.FC = () => {
  const { isLeftPanelOpen } = usePanels();
  const { settings } = useSettings();
  const { selectedPluginId, isCalendarSelected, isGlossarySelected } = useGoals();
  const { resolutionItemId } = useCalendar();

  return (
  <>
    <LoadingSplash>
      <DraggableTopBar />
      <BlockDragOverlay />
      <RootLayout>
        <Sidebar
          className={cn(
            'p-2 shrink-0 transition-[width] duration-200',
            isLeftPanelOpen ? 'w-[250px]' : 'w-12'
          )}
        >
          {isLeftPanelOpen ? <CategorySidebar className="mt-1" /> : <CollapsedSidebar />}
        </Sidebar>
        <Content className="mt-8 p-2 border-l bg-zinc-800/50 border-l-white/10 flex flex-col overflow-hidden">
          {isCalendarSelected
            ? <CalendarView />
            : isGlossarySelected
            ? <GlossaryView />
            : selectedPluginId
            ? <PluginView pluginId={selectedPluginId} />
            : <BlockPanel className="flex-1 px-2" />}
          {/* Hidden (not unmounted) in natural mode so an in-progress chat
              draft survives switching back and forth. */}
          {!selectedPluginId && !isCalendarSelected && !isGlossarySelected && <CaptureBar className={cn('mt-2', settings.captureMode === 'natural' && 'hidden')} />}
        </Content>
        <ChatPanel />
      </RootLayout>
      <CalendarResolutionDialog key={resolutionItemId ?? 'calendar-resolution-closed'} />
    </LoadingSplash>
    <OnboardingOverlay />
  </>
  )
}

export default App
