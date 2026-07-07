import { ActionButton, SettingsButton } from '@/components'
import { usePanelActions } from '@renderer/context'
import { JSX } from 'react'
import { LuPanelLeftOpen } from 'react-icons/lu'

// Narrow strip shown while the goals sidebar is collapsed: settings and the
// expand control stacked at the bottom, mirroring the expanded layout.
export const CollapsedSidebar = (): JSX.Element => {
  const { toggleLeftPanel } = usePanelActions()

  return (
    <div className="flex h-full flex-col items-center justify-end gap-2 pb-1">
      <SettingsButton />
      <ActionButton onClick={toggleLeftPanel} title="Expand sidebar">
        <LuPanelLeftOpen className="h-4 w-4 text-zinc-300" />
      </ActionButton>
    </div>
  )
}
