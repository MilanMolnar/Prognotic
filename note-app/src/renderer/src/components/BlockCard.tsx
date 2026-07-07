import { BlockContextMenu } from '@/components'
import { blockLabel, cn, formatDateFromMs } from '@renderer/utils'
import { BlockMeta } from '@shared/models'
import { JSX, MouseEvent, useState } from 'react'
import { FaRegTrashAlt } from 'react-icons/fa'

export type BlockCardProps = {
  block: BlockMeta
  content: string | undefined
  isOpen: boolean
  isMatch?: boolean
  onSelect: () => void
  onDelete: () => Promise<void>
}

export const BlockCard = ({
  block,
  content,
  isOpen,
  isMatch = false,
  onSelect,
  onDelete
}: BlockCardProps): JSX.Element => {
  const date = formatDateFromMs(block.createdAt)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    setMenuPosition({ x: event.clientX, y: event.clientY })
  }

  return (
    // The context menu is a sibling (not a child) of the card: portal events
    // bubble through the React tree, so nesting it would make menu clicks
    // trigger the card's onSelect.
    <>
    {/* A fieldset so the legend timestamp sits in a real gap of the border
        line — no background masking needed over the translucent theme. */}
    <fieldset
      onClick={onSelect}
      onContextMenu={handleContextMenu}
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
    </fieldset>
    {menuPosition && (
      <BlockContextMenu
        block={block}
        position={menuPosition}
        onClose={() => setMenuPosition(null)}
      />
    )}
    </>
  )
}
