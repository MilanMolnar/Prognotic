import { CaptureModeToggle, FeedHeader, Prognotic } from '@/components'
import { usePanels } from '@renderer/context'
import { JSX } from 'react'

// Windows title-bar overlay buttons sit ~138px from the window's right edge.
// When the assistant panel is narrow, they bleed into the content column —
// offset the toggle left by that overlap so it stays clickable.
const WIN_TITLE_BAR_CONTROLS_WIDTH = 138

export const DraggableTopBar = (): JSX.Element => {
  const { isLeftPanelOpen, isRightPanelOpen, rightPanelWidth } = usePanels()

  const leftWidth = isLeftPanelOpen ? 250 : 48
  const rightWidth = isRightPanelOpen ? rightPanelWidth : 48
  const toggleRight = Math.max(8, WIN_TITLE_BAR_CONTROLS_WIDTH - rightWidth + 8)

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-8 items-stretch overflow-visible bg-transparent">
      <div
        className="flex shrink-0 items-center justify-center mt-0.5 transition-[width] duration-200"
        style={{ width: leftWidth }}
      >
        <Prognotic />
      </div>
      <div className="relative flex min-w-0 flex-1 items-center justify-center border-l border-l-white/10 bg-zinc-800/50">
        <FeedHeader />
        <div
          className="absolute top-1/2 -translate-y-1/2 transition-[right] duration-200"
          style={{ right: toggleRight }}
        >
          <CaptureModeToggle />
        </div>
      </div>
      <div
        className="shrink-0 transition-[width] duration-200"
        style={{ width: rightWidth }}
      />
    </header>
  )
}
