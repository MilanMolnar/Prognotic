import { useBlocks, useGoals, useSearch, useSearchActions } from '@renderer/context'
import { cn, formatDateFromMs } from '@renderer/utils'
import { researchCategory } from '@shared/constants'
import { ComponentProps, JSX, KeyboardEvent } from 'react'
import { LuSearch } from 'react-icons/lu'

// Shows the current scope — category name in feed view, the open block's
// timestamp in edit view. The whole title row is one search toggle: hovering
// animates a faint underline in left-to-right; clicking opens the search
// input (full underline, full-strength icon). Escape or a second click closes.
export const FeedHeader = ({ className, ...props }: ComponentProps<'div'>): JSX.Element => {
  const { goals, selectedCategory } = useGoals()
  const { selectedBlockId, selectedBlock } = useBlocks()
  const { isSearchOpen, query } = useSearch()
  const { openSearch, closeSearch, setQuery } = useSearchActions()

  const isEditView = selectedBlockId !== null
  const categoryLabel =
    selectedCategory === null
      ? 'Quick Notes'
      : selectedCategory === researchCategory
        ? 'Research'
        : (goals?.find((goal) => goal.id === selectedCategory)?.name ?? 'Goal')
  const label = isEditView
    ? selectedBlock
      ? formatDateFromMs(selectedBlock.createdAt)
      : '...'
    : categoryLabel

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') closeSearch()
  }

  return (
    <div className={cn('relative no-drag', className)} {...props}>
      <button
        onClick={isSearchOpen ? closeSearch : openSearch}
        title={isSearchOpen ? 'Close search' : isEditView ? 'Find in block' : 'Search blocks'}
        className="group flex cursor-pointer items-center gap-1.5 text-sm"
      >
        <span
          className={cn(
            'relative text-gray-400 transition-colors duration-100',
            'after:absolute after:bottom-0 after:left-0 after:h-px after:transition-[width] after:duration-200',
            isSearchOpen
              ? 'text-zinc-200 after:w-full after:bg-zinc-300'
              : 'after:w-0 after:bg-zinc-500 group-hover:after:w-full'
          )}
        >
          {label}
        </span>
        <LuSearch
          className={cn(
            'w-3.5 h-3.5 transition-colors duration-100',
            isSearchOpen ? 'text-zinc-200' : 'text-zinc-600 group-hover:text-zinc-400'
          )}
        />
      </button>
      {isSearchOpen && (
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={isEditView ? 'Find in this block...' : `Search ${categoryLabel}...`}
          className="no-drag absolute left-1/2 top-full z-30 mt-1 w-72 max-w-[min(18rem,calc(100vw-6rem))] -translate-x-1/2 animate-[search-roll_150ms_ease-out] rounded-md border border-zinc-400/50 bg-zinc-900/95 px-2 py-1 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500 focus:border-zinc-300/50"
        />
      )}
    </div>
  )
}
