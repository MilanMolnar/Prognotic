import { flyLabelToCategoryRow } from '@renderer/components/categoryFlight'
import { showBlockToast } from '@renderer/components/blockToast'
import { researchCategory } from '@shared/constants'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAssistantActions } from './AssistantContext'
import {
  ActiveBlockDrag,
  BeginBlockPress,
  BlockDragActions,
  BlockDragActionsContext,
  BlockDragState,
  BlockDragStateContext,
  BlockDropTarget,
  BlockMovePrompt
} from './BlockDragContext'
import { useBlockActions, useBlocks } from './BlocksContext'
import { useGoals } from './GoalsContext'

const longPressMs = 250
const movementSlop = 8
const quickNotesRowId = 'quick-notes'

type PressSession = BeginBlockPress & {
  currentX: number
  currentY: number
  timerId: number
}

const categoryRowId = (categoryId: string | null): string => categoryId ?? quickNotesRowId

const targetAtPoint = (
  x: number,
  y: number,
  validGoalIds: ReadonlySet<string>
): BlockDropTarget | null => {
  const element = document.elementFromPoint(x, y)
  const categoryRow = element?.closest<HTMLElement>('[data-category-row]')
  const rowId = categoryRow?.dataset.categoryRow
  if (rowId === quickNotesRowId) return { type: 'category', categoryId: null }
  if (rowId === researchCategory || (rowId !== undefined && validGoalIds.has(rowId))) {
    return { type: 'category', categoryId: rowId }
  }
  if (element?.closest('[data-chat-drop-target]')) return { type: 'chat' }
  return null
}

export const BlockDragProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  const { blocks } = useBlocks()
  const { goals } = useGoals()
  const { updateBlockCategories } = useBlockActions()
  const { attachBlock } = useAssistantActions()
  const [activeDrag, setActiveDrag] = useState<ActiveBlockDrag | null>(null)
  const [movePrompt, setMovePrompt] = useState<BlockMovePrompt | null>(null)
  const [isMoving, setIsMoving] = useState(false)
  const pressRef = useRef<PressSession | null>(null)
  const activeDragRef = useRef<ActiveBlockDrag | null>(null)
  const blocksRef = useRef(blocks)
  const goalsRef = useRef(goals)
  const previousCursorRef = useRef('')
  blocksRef.current = blocks
  goalsRef.current = goals

  const setCurrentDrag = useCallback((drag: ActiveBlockDrag | null): void => {
    activeDragRef.current = drag
    setActiveDrag(drag)
  }, [])

  const restoreCursor = useCallback((): void => {
    document.body.style.cursor = previousCursorRef.current
    previousCursorRef.current = ''
  }, [])

  const clearSession = useCallback((): void => {
    const press = pressRef.current
    if (press) window.clearTimeout(press.timerId)
    pressRef.current = null
    setCurrentDrag(null)
    restoreCursor()
  }, [restoreCursor, setCurrentDrag])

  const categoryLabel = useCallback((categoryId: string | null): string => {
    if (categoryId === null) return 'Quick Notes'
    if (categoryId === researchCategory) return 'Research'
    return goalsRef.current?.find((goal) => goal.id === categoryId)?.name ?? 'Goal'
  }, [])

  const completeDrop = useCallback(async (drag: ActiveBlockDrag): Promise<void> => {
    const block = blocksRef.current?.find((candidate) => candidate.id === drag.blockId)
    if (!block || !drag.target) return

    if (drag.target.type === 'chat') {
      attachBlock(block.id)
      return
    }

    const targetCategoryId = drag.target.categoryId
    const wasAlreadyInTarget = block.categories.includes(targetCategoryId)
    try {
      const copied = wasAlreadyInTarget || await updateBlockCategories(
        block.id,
        [...block.categories, targetCategoryId]
      )
      if (!copied) {
        showBlockToast('Could not copy this note to the selected goal.')
        return
      }
      flyLabelToCategoryRow(
        drag.label,
        { x: drag.x, y: drag.y },
        categoryRowId(targetCategoryId)
      )
      setMovePrompt({
        blockId: block.id,
        targetCategoryId,
        targetLabel: categoryLabel(targetCategoryId),
        wasAlreadyInTarget
      })
    } catch {
      showBlockToast('Could not copy this note to the selected goal.')
    }
  }, [attachBlock, categoryLabel, updateBlockCategories])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent): void => {
      const press = pressRef.current
      if (!press || event.pointerId !== press.pointerId) return
      press.currentX = event.clientX
      press.currentY = event.clientY

      const drag = activeDragRef.current
      if (!drag) {
        if (Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) > movementSlop) {
          clearSession()
        }
        return
      }

      event.preventDefault()
      const validGoalIds = new Set((goalsRef.current ?? []).map((goal) => goal.id))
      setCurrentDrag({
        ...drag,
        x: event.clientX,
        y: event.clientY,
        target: targetAtPoint(event.clientX, event.clientY, validGoalIds)
      })
    }

    const onPointerUp = (event: PointerEvent): void => {
      const press = pressRef.current
      if (!press || event.pointerId !== press.pointerId) return
      const drag = activeDragRef.current
      const validGoalIds = new Set((goalsRef.current ?? []).map((goal) => goal.id))
      const dropped = drag ? {
        ...drag,
        x: event.clientX,
        y: event.clientY,
        target: targetAtPoint(event.clientX, event.clientY, validGoalIds)
      } : null
      clearSession()
      if (dropped) void completeDrop(dropped)
    }

    const onPointerCancel = (event: PointerEvent): void => {
      if (pressRef.current?.pointerId === event.pointerId) clearSession()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && pressRef.current) clearSession()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKeyDown)
      clearSession()
    }
  }, [clearSession, completeDrop, setCurrentDrag])

  const beginPress = useCallback((press: BeginBlockPress): void => {
    clearSession()
    const session: PressSession = {
      ...press,
      currentX: press.clientX,
      currentY: press.clientY,
      timerId: 0
    }
    session.timerId = window.setTimeout(() => {
      if (pressRef.current !== session) return
      const validGoalIds = new Set((goalsRef.current ?? []).map((goal) => goal.id))
      previousCursorRef.current = document.body.style.cursor
      document.body.style.cursor = 'grabbing'
      setCurrentDrag({
        blockId: session.blockId,
        label: session.label,
        x: session.currentX,
        y: session.currentY,
        target: targetAtPoint(session.currentX, session.currentY, validGoalIds)
      })
    }, longPressMs)
    pressRef.current = session
  }, [clearSession, setCurrentDrag])

  const dismissMovePrompt = useCallback((): void => setMovePrompt(null), [])

  const moveToTarget = useCallback(async (): Promise<void> => {
    if (!movePrompt || isMoving) return
    setIsMoving(true)
    try {
      const moved = await updateBlockCategories(movePrompt.blockId, [movePrompt.targetCategoryId])
      if (moved) setMovePrompt(null)
      else showBlockToast('Could not move this note.')
    } catch {
      showBlockToast('Could not move this note.')
    } finally {
      setIsMoving(false)
    }
  }, [isMoving, movePrompt, updateBlockCategories])

  const stateValue: BlockDragState = useMemo(() => ({
    activeDrag,
    movePrompt,
    isMoving
  }), [activeDrag, isMoving, movePrompt])
  const actionsValue: BlockDragActions = useMemo(() => ({
    beginPress,
    dismissMovePrompt,
    moveToTarget
  }), [beginPress, dismissMovePrompt, moveToTarget])

  return <BlockDragStateContext.Provider value={stateValue}>
    <BlockDragActionsContext.Provider value={actionsValue}>
      {children}
    </BlockDragActionsContext.Provider>
  </BlockDragStateContext.Provider>
}
