import { usePanels } from '@renderer/context'
import { JSX } from 'react'

// App branding shown in the draggable top bar: full wordmark while the left
// panel is open, just the initial when it is collapsed.
export const Prognotic = (): JSX.Element => {
  const { isLeftPanelOpen } = usePanels()

  return (
    <span className="text-base font-bold tracking-wide">
      {isLeftPanelOpen ? (
        <>
          <span className="text-yellow-500">P</span>
          rognotic
        </>
      ) : (
        <span className="text-yellow-500">P</span>
      )}
    </span>
  )
}
