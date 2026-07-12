import { createContext, useContext } from 'react'

export type BlockDropTarget =
  | { type: 'category'; categoryId: string | null }
  | { type: 'chat' }

export type ActiveBlockDrag = {
  blockId: string
  label: string
  x: number
  y: number
  target: BlockDropTarget | null
}

export type BlockMovePrompt = {
  blockId: string
  targetCategoryId: string | null
  targetLabel: string
  wasAlreadyInTarget: boolean
}

export type BlockDragState = {
  activeDrag: ActiveBlockDrag | null
  movePrompt: BlockMovePrompt | null
  isMoving: boolean
}

export type BeginBlockPress = {
  blockId: string
  label: string
  pointerId: number
  clientX: number
  clientY: number
}

export type BlockDragActions = {
  beginPress: (press: BeginBlockPress) => void
  dismissMovePrompt: () => void
  moveToTarget: () => Promise<void>
}

export const BlockDragStateContext = createContext<BlockDragState | null>(null)
export const BlockDragActionsContext = createContext<BlockDragActions | null>(null)

export const useBlockDrag = (): BlockDragState => {
  const state = useContext(BlockDragStateContext)
  if (!state) throw new Error('useBlockDrag must be used within a BlockDragProvider')
  return state
}

export const useBlockDragActions = (): BlockDragActions => {
  const actions = useContext(BlockDragActionsContext)
  if (!actions) throw new Error('useBlockDragActions must be used within a BlockDragProvider')
  return actions
}
