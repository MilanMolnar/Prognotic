import { AiActionDialog, BlockContextMenu } from '@/components'
import { useAssistantActions, useBlockActions, useGoals } from '@renderer/context'
import { blockLabel, cn, formatDateFromMs } from '@renderer/utils'
import { BlockMeta } from '@shared/models'
import { JSX, MouseEvent, useLayoutEffect, useRef, useState } from 'react'
import { FaRegTrashAlt } from 'react-icons/fa'
import { flyLabelToCategoryRow } from './categoryFlight'

export type BlockCardProps = {
  block: BlockMeta
  content: string | undefined
  isOpen: boolean
  isMatch?: boolean
  isRouted?: boolean
  routeDirection?: 'up' | 'down'
  onSelect: () => void
  onDelete: () => Promise<void>
}

export const BlockCard = ({
  block,
  content,
  isOpen,
  isMatch = false,
  isRouted = false,
  routeDirection = 'down',
  onSelect,
  onDelete
}: BlockCardProps): JSX.Element => {
  const date = formatDateFromMs(block.createdAt)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [aiResult, setAiResult] = useState<{ action: 'translate' | 'explain'; text: string } | null>(null)
  const [applyingGoalId, setApplyingGoalId] = useState<string | null>(null)
  const cardRef = useRef<HTMLFieldSetElement>(null)
  const wasRoutedRef = useRef(isRouted)
  const { updateBlockContent, applyBlockRouting } = useBlockActions()
  const { continueWithText } = useAssistantActions()
  const { goals } = useGoals()

  const runAiAction = async (action: 'translate' | 'explain'): Promise<void> => {
    const source = content ?? (await window.context.readBlock(block.id)).content
    const result = await window.context.runInlineAction(action, source, block.id)
    if ('text' in result && result.text !== undefined) setAiResult({ action, text: result.text })
  }

  const handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    setMenuPosition({ x: event.clientX, y: event.clientY })
  }

  const applySuggestedGoal = async (goalId: string, goalName: string, event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.stopPropagation()
    if (applyingGoalId !== null) return
    setApplyingGoalId(goalId)
    const applied = await applyBlockRouting(block.id, goalId)
    setApplyingGoalId(null)
    if (applied) flyLabelToCategoryRow(goalName, { x: event.clientX, y: event.clientY }, goalId)
  }

  useLayoutEffect(() => {
    if (isRouted && !wasRoutedRef.current) {
      cardRef.current?.animate(
        [
          { transform: `translateY(${routeDirection === 'up' ? '20px' : '-20px'})`, opacity: 1 },
          { transform: 'translateY(0)', opacity: 0.5 }
        ],
        { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
      )
    }
    wasRoutedRef.current = isRouted
  }, [isRouted, routeDirection])

  return (
    // The context menu is a sibling (not a child) of the card: portal events
    // bubble through the React tree, so nesting it would make menu clicks
    // trigger the card's onSelect.
    <>
    {/* A fieldset so the legend timestamp sits in a real gap of the border
        line — no background masking needed over the translucent theme. */}
    <fieldset
      ref={cardRef}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      style={isRouted && !isOpen ? { opacity: 0.5 } : undefined}
      className={cn(
        'group relative min-w-0 cursor-pointer rounded-md border px-3 pb-2 transition-colors duration-100',
        // While its context menu is open the card shares the menu's darker
        // background, marking which block the actions target.
        menuPosition !== null && 'bg-zinc-900/95',
        isOpen
          ? 'border-yellow-500/50'
          : isMatch
            ? 'border-yellow-500/30'
            : 'border-white/10 hover:border-white/25'
        , isRouted && !isOpen && 'opacity-50 hover:opacity-70'
      )}
    >
      {/* Full-width legend: short name in the left border gap, date in the
          right one, with the border line re-drawn between them. border-inherit
          chains the fieldset's (possibly yellow) border color through. */}
      <legend className="ml-1.5 flex w-[calc(100%-12px)] items-center gap-1.5 border-inherit px-0 text-xs font-light text-zinc-500">
        <span className="min-w-0 truncate">{blockLabel(block.excerpt)}</span>
        <span className="min-w-3 flex-1 border-t border-inherit" />
        <span className="shrink-0">{date}</span>
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
      {block.routing?.status === 'pending' && (
        <div className="mt-2 flex flex-wrap gap-1">{block.routing.assignments.length > 0 ? block.routing.assignments.filter((assignment): assignment is { goalId: string; confidence: number } => typeof assignment.goalId === 'string').map((assignment) => {
          const goalName = goals?.find((goal) => goal.id === assignment.goalId)?.name ?? 'Goal'
          return <button type="button" key={assignment.goalId} disabled={applyingGoalId !== null} onClick={(event) => { void applySuggestedGoal(assignment.goalId, goalName, event) }} className="rounded border border-yellow-500/30 px-1 py-0.5 text-xs text-yellow-500 transition-colors hover:bg-yellow-500/10 disabled:opacity-50">Suggested: {goalName} ({Math.round(assignment.confidence * 100)}%)</button>
        }) : <span className="text-xs text-zinc-500">AI found no matching goal</span>}</div>
      )}
    </fieldset>
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
