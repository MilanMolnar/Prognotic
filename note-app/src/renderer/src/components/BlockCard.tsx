import { AiActionDialog, BlockContextMenu } from '@/components'
import { useAssistant, useAssistantActions, useBlockActions, useBlockDragActions, useBlocks, useGoals, useSettings } from '@renderer/context'
import { blockLabel, cn, formatDateFromMs } from '@renderer/utils'
import { dispatchOnboardingEvent, onboardingEvents } from '@renderer/onboarding/events'
import { researchCategory } from '@shared/constants'
import { isBlockUnvisitedInGoal } from '@shared/goalPresence'
import { BlockMeta, GoalPresenceSource } from '@shared/models'
import { JSX, MouseEvent, PointerEvent, useState } from 'react'
import { FaRegTrashAlt } from 'react-icons/fa'
import { LuGripVertical } from 'react-icons/lu'
import { showBlockToast } from './blockToast'
import { flyLabelToCategoryRow } from './categoryFlight'

const originLabels: Record<GoalPresenceSource, string> = {
  user: 'User',
  routed: 'AI-routing',
  assistant: 'AI-chat',
  research: 'Research',
  plugin: 'Plugin'
}

export type BlockCardProps = {
  block: BlockMeta
  content: string | undefined
  isOpen: boolean
  isMatch?: boolean
  isRouted?: boolean
  onSelect: () => void
  onDelete: () => Promise<void>
}

export const BlockCard = ({
  block,
  content,
  isOpen,
  isMatch = false,
  isRouted = false,
  onSelect,
  onDelete
}: BlockCardProps): JSX.Element => {
  const date = formatDateFromMs(block.createdAt)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [aiResult, setAiResult] = useState<{ action: 'translate' | 'explain'; text: string } | null>(null)
  const [aiFailure, setAiFailure] = useState<{ action: 'translate' | 'explain'; message: string } | null>(null)
  const [isAiRunning, setIsAiRunning] = useState(false)
  const [applyingGoalId, setApplyingGoalId] = useState<string | null>(null)
  const [isApplyingNewGoal, setIsApplyingNewGoal] = useState(false)
  const [isAcknowledging, setIsAcknowledging] = useState(false)
  const {
    updateBlockContent,
    applyBlockRouting,
    applyNewGoalRouting,
    acknowledgeBlockInGoal,
    classifyBlock
  } = useBlockActions()
  const { routingErrors, routingInProgressIds } = useBlocks()
  const { settings } = useSettings()
  const { attachedBlockIds } = useAssistant()
  const { continueWithText } = useAssistantActions()
  const { beginPress } = useBlockDragActions()
  const { goals, selectedCategory } = useGoals()
  const displayLabel = blockLabel(block, settings.llm.aiBlockNameSummary)
  const isAttached = attachedBlockIds.includes(block.id)

  const runAiAction = async (action: 'translate' | 'explain'): Promise<void> => {
    setAiFailure(null)
    setIsAiRunning(true)
    try {
      const source = content ?? (await window.context.readBlock(block.id)).content
      const result = await window.context.runInlineAction(action, source, block.id)
      if ('error' in result) {
        setAiFailure({ action, message: result.error ?? 'AI action failed.' })
        return
      }
      setAiResult({ action, text: result.text })
    } catch (error) {
      setAiFailure({ action, message: error instanceof Error ? error.message : 'AI action failed.' })
    } finally {
      setIsAiRunning(false)
    }
  }

  const handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    setMenuPosition({ x: event.clientX, y: event.clientY })
    dispatchOnboardingEvent(onboardingEvents.blockContextMenuOpened, { blockId: block.id })
  }

  const applySuggestedGoal = async (goalId: string, goalName: string, event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.stopPropagation()
    if (applyingGoalId !== null || isApplyingNewGoal) return
    const alreadyInGoal = block.categories.includes(goalId)
    setApplyingGoalId(goalId)
    let applied = false
    try {
      applied = await applyBlockRouting(block.id, goalId)
    } catch {
      showBlockToast('Could not apply this routing suggestion.')
    } finally {
      setApplyingGoalId(null)
    }
    if (!applied) return
    if (alreadyInGoal) showBlockToast(`This note block has already been routed to ${goalName}.`)
    else flyLabelToCategoryRow(goalName, { x: event.clientX, y: event.clientY }, goalId)
  }

  const applySuggestedNewGoal = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.stopPropagation()
    if (applyingGoalId !== null || isApplyingNewGoal) return
    const from = { x: event.clientX, y: event.clientY }
    setIsApplyingNewGoal(true)
    try {
      const goal = await applyNewGoalRouting(block.id)
      if (!goal) {
        showBlockToast('Could not create and route to the suggested goal.')
        return
      }
      requestAnimationFrame(() => {
        flyLabelToCategoryRow(goal.name, from, goal.id)
      })
    } catch {
      showBlockToast('Could not create and route to the suggested goal.')
    } finally {
      setIsApplyingNewGoal(false)
    }
  }

  const routingError = routingErrors[block.id]
  const isRouting = routingInProgressIds.has(block.id)
  const pendingRouting = block.routing?.status === 'pending' ? block.routing : null
  const existingRoutingAssignments = pendingRouting?.assignments.filter(
    (assignment): assignment is { goalId: string; confidence: number } =>
      typeof assignment.goalId === 'string'
  ) ?? []
  const suggestedNewGoal = pendingRouting?.hasConfidentMatch === false
    ? pendingRouting.suggestedNewGoal
    : undefined
  const isApplyingRouting = applyingGoalId !== null || isApplyingNewGoal
  const viewedGoalId = selectedCategory !== null &&
    selectedCategory !== researchCategory &&
    goals?.some((goal) => goal.id === selectedCategory)
      ? selectedCategory
      : null
  const viewedGoalPresence = viewedGoalId ? block.goalPresence?.[viewedGoalId] : undefined
  const isUnvisited = viewedGoalId !== null && isBlockUnvisitedInGoal(block, viewedGoalId)
  const originLabel = viewedGoalPresence && viewedGoalPresence.source !== 'user'
    ? originLabels[viewedGoalPresence.source]
    : null

  const acknowledge = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.stopPropagation()
    if (!viewedGoalId || isAcknowledging) return
    setIsAcknowledging(true)
    try {
      const acknowledged = await acknowledgeBlockInGoal(block.id, viewedGoalId)
      if (!acknowledged) showBlockToast('Could not mark this note as seen.')
    } catch {
      showBlockToast('Could not mark this note as seen.')
    } finally {
      setIsAcknowledging(false)
    }
  }

  return (
    // The context menu is a sibling (not a child) of the card: portal events
    // bubble through the React tree, so nesting it would make menu clicks
    // trigger the card's onSelect.
    <>
    {/* A regular wrapper keeps the drag handle centered independently of
        the fieldset's special legend layout. */}
    <div data-block-id={block.id} className="group relative min-w-0">
    {/* A fieldset so the legend timestamp sits in a real gap of the border
        line — no background masking needed over the translucent theme. */}
    <fieldset
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      style={isRouted && !isOpen && !isAttached ? { opacity: 0.5 } : undefined}
      className={cn(
        'relative min-w-0 cursor-pointer rounded-md border px-3 pb-2 transition-[border-color,box-shadow,opacity] duration-100',
        // While its context menu is open the card shares the menu's darker
        // background, marking which block the actions target.
        menuPosition !== null && 'bg-zinc-900/95',
        isAttached
          ? 'border-yellow-300/80 shadow-[0_0_0_1px_rgb(250_204_21_/_0.25),0_0_16px_rgb(234_179_8_/_0.3)]'
          : isOpen
            ? 'border-yellow-500/50'
            : isMatch
              ? 'border-yellow-500/30'
              : 'border-white/10 hover:border-white/25',
        isRouted && !isOpen && !isAttached && 'opacity-50 hover:opacity-70'
      )}
    >
      {/* Full-width legend: short name in the left border gap, date in the
          right one, with the border line re-drawn between them. border-inherit
          chains the fieldset's (possibly yellow) border color through. */}
      <legend className="ml-1.5 flex w-[calc(100%-12px)] items-center gap-1.5 border-inherit px-0 text-xs font-light text-zinc-500">
        <span className="min-w-0 truncate">{displayLabel}</span>
        <span className="min-w-3 flex-1 border-t border-inherit" />
        <span className="shrink-0">{date}</span>
        {isUnvisited && <button
          type="button"
          title="Mark as seen"
          aria-label="Mark this note as seen"
          disabled={isAcknowledging}
          onClick={(event) => { void acknowledge(event) }}
          className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-yellow-500/60 bg-yellow-500/15 px-1 text-[10px] font-bold leading-none text-yellow-400 transition-colors hover:bg-yellow-500/25 disabled:opacity-50"
        >
          !
        </button>}
        {isOpen && (
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500 animate-pulse" />
        )}
      </legend>
      <button
        onClick={(event) => {
          event.stopPropagation()
          void onDelete()
        }}
        title="Delete block"
        className="absolute right-1.5 top-0 rounded p-1 text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400 hover:bg-zinc-600/50"
      >
        <FaRegTrashAlt className="w-3.5 h-3.5" />
      </button>
      {/* Paragraphs (blank-line separated) render with a small margin
          instead of pre-wrap's full-height empty lines, keeping the card
          compact; single line breaks inside a paragraph are preserved. */}
      <div className="text-sm leading-snug text-zinc-200">
        {content !== undefined
          ? content.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index} className="my-1 whitespace-pre-wrap first:mt-0 last:mb-0">
                {paragraph}
              </p>
            ))
          : 'Loading...'}
      </div>
      {pendingRouting && (
        <div className="mt-2 flex flex-wrap gap-1">
          {existingRoutingAssignments.map((assignment) => {
            const goalName = goals?.find((goal) => goal.id === assignment.goalId)?.name ?? 'Goal'
            return <button
              type="button"
              key={assignment.goalId}
              disabled={isApplyingRouting}
              onClick={(event) => { void applySuggestedGoal(assignment.goalId, goalName, event) }}
              className="rounded border border-yellow-500/30 px-1 py-0.5 text-xs text-yellow-500 transition-colors hover:bg-yellow-500/10 disabled:opacity-50"
            >
              Suggested: {goalName} ({Math.round(assignment.confidence * 100)}%)
            </button>
          })}
          {suggestedNewGoal && <button
            type="button"
            title="Create this goal and route the note"
            disabled={isApplyingRouting}
            onClick={(event) => { void applySuggestedNewGoal(event) }}
            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1 py-0.5 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
          >
            New goal: {suggestedNewGoal.name} ({Math.round(suggestedNewGoal.confidence * 100)}%)
          </button>}
          {existingRoutingAssignments.length === 0 && !suggestedNewGoal && (
            <span className="text-xs text-zinc-500">AI found no matching goal</span>
          )}
        </div>
      )}
      {(routingError || isRouting) && <div className="mt-2 flex items-center gap-2 text-xs" role={routingError ? 'alert' : 'status'}>
        <span className={routingError ? 'text-red-400' : 'text-zinc-500'}>{routingError ?? 'Checking goal suggestions...'}</span>
        {routingError && <button type="button" disabled={isRouting} onClick={(event) => { event.stopPropagation(); void classifyBlock(block.id) }} className="rounded border border-red-400/40 px-1.5 py-0.5 text-red-300 hover:bg-red-500/10 disabled:opacity-50">Retry</button>}
      </div>}
      {(aiFailure || isAiRunning) && <div className="mt-2 flex items-center gap-2 text-xs" role={aiFailure ? 'alert' : 'status'}>
        <span className={aiFailure ? 'text-red-400' : 'text-zinc-500'}>{aiFailure?.message ?? 'Running AI action...'}</span>
        {aiFailure && <button type="button" disabled={isAiRunning} onClick={(event) => { event.stopPropagation(); void runAiAction(aiFailure.action) }} className="rounded border border-red-400/40 px-1.5 py-0.5 text-red-300 hover:bg-red-500/10 disabled:opacity-50">Retry</button>}
      </div>}
      {originLabel && <span className={cn(
        'pointer-events-none absolute bottom-0 right-3 translate-y-1/2 rounded-full border bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium leading-none shadow-sm transition-colors',
        isUnvisited ? 'border-yellow-500/40 text-yellow-400' : 'border-white/10 text-zinc-500'
      )}>
        {originLabel}
      </span>}
    </fieldset>
    <button
      data-tour="block-drag-handle"
      type="button"
      draggable={false}
      title="Hold and drag note"
      aria-label={`Hold and drag ${displayLabel}`}
      onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        beginPress({
          blockId: block.id,
          label: displayLabel,
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY
        })
      }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      className="no-drag absolute -left-2 top-1/2 z-20 flex h-6 w-3.5 -translate-y-[calc(50%-4px)] touch-none cursor-grab items-center justify-center rounded border border-white/10 bg-zinc-900/95 text-zinc-400 shadow-sm transition-[color,border-color] hover:border-yellow-500/50 hover:text-yellow-400 active:cursor-grabbing"
    >
      <LuGripVertical className="h-3.5 w-3.5" />
    </button>
    </div>
    {menuPosition && (
      <BlockContextMenu
        block={block}
        position={menuPosition}
        onClose={() => setMenuPosition(null)}
        onAiAction={(action) => { void runAiAction(action) }}
      />
    )}
    {aiResult && <AiActionDialog title={aiResult.action === 'translate' ? 'Translation' : 'Explanation'} result={aiResult.text} onClose={() => setAiResult(null)} onReplace={() => { void updateBlockContent(block.id, { content: aiResult.text }); setAiResult(null) }} onContinue={() => { continueWithText(aiResult.text); setAiResult(null) }} />}
    </>
  )
}
