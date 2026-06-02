import { Content, RootLayout, Sidebar, DraggableTopBar, ActionButtonsRow, NotePreviewList } from "@/components"


const App: React.FC = () => {

  return (
  
  <>
  <DraggableTopBar />
    <RootLayout>
      <Sidebar className="p-2" >
        <ActionButtonsRow className="flex justify-between mt-1" />
        <NotePreviewList className="mt-3 space-y-2" />
      </Sidebar>
      <Content className="p-2 border-l bg-zinc-800/50 border-l-white/10">
        Content
      </Content>
    </RootLayout>
  </>
  )
}

export default App
