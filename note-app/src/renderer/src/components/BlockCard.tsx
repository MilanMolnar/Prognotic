import { blockLabel, cn, formatDateFromMs } from '@renderer/utils'
import { BlockMeta } from '@shared/models'
import { JSX } from 'react'
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

  return (
    // A fieldset so the legend timestamp sits in a real gap of the border
    // line — no background masking needed over the translucent theme.
    <fieldset
      onClick={onSelect}
      className={cn(
        'group relative min-w-0 cursor-pointer rounded-md border px-3 pb-2 transition-colors duration-100',
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
      <p className="whitespace-pre-wrap text-sm text-zinc-200">{content ?? 'Loading...'}</p>
    </fieldset>
  )
}
