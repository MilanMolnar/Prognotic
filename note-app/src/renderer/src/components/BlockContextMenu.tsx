import { useBlockActions, useSettings } from '@renderer/context'
import { blockLabel } from '@renderer/utils'
import { researchCategory } from '@shared/constants'
import { BlockMeta } from '@shared/models'
import { JSX, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { showBlockToast } from './blockToast'
import { defaultQuickActions, QuickAction } from './quickActions'

export type BlockContextMenuProps = {
  block: BlockMeta
  position: { x: number; y: number }
  onClose: () => void
  onAiAction: (action: 'translate' | 'explain') => void
}

// Estimated bounds used to keep the menu on-screen near window edges.
const menuWidth = 176
const menuItemHeight = 32

// Flies a small labeled chip from the menu position to a category's sidebar
// row, then flashes the row — visual confirmation that the goal now holds
// the block. Transient DOM + WAAPI: self-cleaning, no React state involved.
// Skipped silently when the sidebar is collapsed (the row is not rendered).
const flyLabelToCategoryRow = (
  label: string,
  from: { x: number; y: number },
  categoryRowId: string
): void => {
  const row = document.querySelector(`[data-category-row="${categoryRowId}"]`)
  if (!row) return

  const rowRect = row.getBoundingClientRect()
  const ghost = document.createElement('div')
  ghost.textContent = label
  ghost.className =
    'pointer-events-none fixed z-50 max-w-[12rem] truncate rounded-md border border-yellow-500/50 bg-zinc-900/95 px-2 py-1 text-xs text-yellow-500 shadow-xl'
  ghost.style.left = `${from.x}px`
  ghost.style.top = `${from.y}px`
  document.body.appendChild(ghost)

  const dx = rowRect.left + rowRect.width / 2 - from.x
  const dy = rowRect.top + rowRect.height / 2 - from.y
  const flight = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.4)`, opacity: 0.4 }
    ],
    { duration: 550, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
  )
  flight.onfinish = (): void => {
    ghost.remove()
    row.animate(
      [
        { boxShadow: 'inset 0 0 0 1px rgb(234 179 8 / 0)', backgroundColor: 'rgb(234 179 8 / 0)' },
        {
          boxShadow: 'inset 0 0 0 1px rgb(234 179 8 / 0.7)',
          backgroundColor: 'rgb(234 179 8 / 0.15)',
          offset: 0.25
        },
        { boxShadow: 'inset 0 0 0 1px rgb(234 179 8 / 0)', backgroundColor: 'rgb(234 179 8 / 0)' }
      ],
      { duration: 900, easing: 'ease-out' }
    )
  }
}

// Right-click menu for a block card. Rendered in a portal so the fixed
// cursor position escapes the feed's scroll container. Dismissed by choosing
// an item, clicking anywhere outside, or Escape.
export const BlockContextMenu = ({ block, position, onClose, onAiAction }: BlockContextMenuProps): JSX.Element => {
  const menuRef = useRef<HTMLDivElement>(null)
  const { updateBlockCategories, classifyBlock } = useBlockActions()
  const { settings } = useSettings()

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    // Capture phase so a right-click on another card closes this menu
    // before that card opens its own.
    window.addEventListener('mousedown', handlePointerDown, true)
    window.addEventListener('contextmenu', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true)
      window.removeEventListener('contextmenu', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const handleAction = (action: QuickAction) => (): void => {
    if (action.id === 'send-to-research') {
      if (block.categories.includes(researchCategory)) {
        showBlockToast('Already in Research')
      } else {
        // Research joins the block's categories (multi-goal — the single
        // .md file is untouched), with a flight to the sidebar row showing
        // where the block now also lives.
        void updateBlockCategories(block.id, [...block.categories, researchCategory])
        flyLabelToCategoryRow(blockLabel(block, settings.llm.aiBlockNameSummary), position, researchCategory)
      }
    } else {
      onAiAction(action.id as 'translate' | 'explain')
    }
    onClose()
  }

  const left = Math.max(8, Math.min(position.x, window.innerWidth - menuWidth - 8))
  const top = Math.max(
    8,
    Math.min(position.y, window.innerHeight - defaultQuickActions.length * menuItemHeight - 16)
  )

  return createPortal(
    <div
      ref={menuRef}
      style={{ left, top }}
      className="fixed z-50 w-44 rounded-md border border-zinc-700 bg-zinc-900/95 py-1 shadow-xl"
    >
      {defaultQuickActions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={handleAction(action)}
          className="block w-full px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors duration-75 hover:bg-yellow-500/10 hover:text-yellow-500"
        >
          {action.label}
        </button>
      ))}
      {block.categories.includes(null) && (
        <button type="button" onClick={() => { void classifyBlock(block.id); onClose() }} className="block w-full px-3 py-1.5 text-left text-sm text-zinc-300 transition-colors duration-75 hover:bg-yellow-500/10 hover:text-yellow-500">{block.routing ? 'Re-run AI routing' : 'Route with AI'}</button>
      )}
    </div>,
    document.body
  )
}
