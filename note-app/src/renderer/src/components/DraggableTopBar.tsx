import { FeedHeader, Prognotic } from '@/components'
import { usePanels } from '@renderer/context'
import { JSX } from 'react'

export const DraggableTopBar = (): JSX.Element => {
  const { isLeftPanelOpen, isRightPanelOpen, rightPanelWidth } = usePanels()

  const leftWidth = isLeftPanelOpen ? 250 : 48
  const rightWidth = isRightPanelOpen ? rightPanelWidth : 48

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-8 items-stretch overflow-visible bg-transparent">
      <div
        className="flex shrink-0 items-center justify-center mt-0.5 transition-[width] duration-200"
        style={{ width: leftWidth }}
      >
        <Prognotic />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center border-l border-l-white/10 bg-zinc-800/50">
        <FeedHeader />
      </div>
      <div
        className="shrink-0 transition-[width] duration-200"
        style={{ width: rightWidth }}
      />
    </header>
  )
}
