import { useBlockDrag, useBlockDragActions } from '@renderer/context'
import { JSX } from 'react'
import { LuGripVertical } from 'react-icons/lu'
import { BlockMoveDialog } from './BlockMoveDialog'

export const BlockDragOverlay = (): JSX.Element => {
  const { activeDrag, movePrompt, isMoving } = useBlockDrag()
  const { dismissMovePrompt, moveToTarget } = useBlockDragActions()
  const badgeStyle = activeDrag ? {
    left: activeDrag.x + (activeDrag.x > window.innerWidth - 220 ? -12 : 12),
    top: activeDrag.y + (activeDrag.y > window.innerHeight - 60 ? -12 : 12),
    transform: `translate(${activeDrag.x > window.innerWidth - 220 ? '-100%' : '0'}, ${activeDrag.y > window.innerHeight - 60 ? '-100%' : '0'})`
  } : undefined

  return <>
    {activeDrag && <div
      aria-hidden
      className="pointer-events-none fixed z-[80] flex max-w-48 items-center gap-1 truncate rounded-md border border-yellow-500/60 bg-zinc-900/95 px-2 py-1 text-xs text-yellow-300 shadow-[0_0_18px_rgb(234_179_8_/_0.22)]"
      style={badgeStyle}
    >
      <LuGripVertical className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{activeDrag.label}</span>
    </div>}
    {movePrompt && <BlockMoveDialog
      targetLabel={movePrompt.targetLabel}
      wasAlreadyInTarget={movePrompt.wasAlreadyInTarget}
      isMoving={isMoving}
      onCopyOnly={dismissMovePrompt}
      onMove={() => { void moveToTarget() }}
      onClose={dismissMovePrompt}
    />}
  </>
}
