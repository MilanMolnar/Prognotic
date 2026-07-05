import { Content, RootLayout, Sidebar, DraggableTopBar, CategorySidebar, CollapsedSidebar, ChatPanel, BlockPanel, CaptureBar } from "@/components"
import { usePanels } from "@renderer/context";
import { cn } from "@renderer/utils";


const App: React.FC = () => {
  const { isLeftPanelOpen } = usePanels();

  return (
  <>
    <DraggableTopBar />
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
        <BlockPanel className="flex-1 px-2" />
        <CaptureBar className="mt-2" />
      </Content>
      <ChatPanel />
    </RootLayout>
  </>
  )
}

export default App
