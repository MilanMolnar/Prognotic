import { NewGoalButton, SettingsButton } from '@/components'
import { CategoryKey, useBlockActions, useGoalActions, useGoals, usePanelActions, useSearchActions } from '@renderer/context'
import { cn } from '@renderer/utils'
import { researchCategory } from '@shared/constants'
import { ComponentProps, JSX, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { LuPanelLeftClose, LuPin } from 'react-icons/lu'

const systemCategories: { key: CategoryKey; label: string }[] = [
  { key: null, label: 'Quick Notes' },
  { key: researchCategory, label: 'Research' }
]

const categoryId = (key: CategoryKey): string => key ?? 'quick-notes'

type CategoryItemProps = {
  label: string
  isPinned?: boolean
  onClick: () => void
  itemRef: (element: HTMLLIElement | null) => void
}

const CategoryItem = ({ label, isPinned = false, onClick, itemRef }: CategoryItemProps): JSX.Element => (
  <li
    ref={itemRef}
    onClick={onClick}
    className="relative z-10 flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2.5 py-2 text-sm transition-colors duration-75 hover:bg-zinc-600/50"
  >
    {isPinned && <LuPin className="w-3 h-3 shrink-0 text-zinc-400" />}
    <span className="truncate">{label}</span>
  </li>
)

export const CategorySidebar = ({ className, ...props }: ComponentProps<'div'>): JSX.Element => {
  const { goals, selectedCategory } = useGoals()
  const { selectCategory } = useGoalActions()
  const { selectBlock } = useBlockActions()
  const { closeSearch } = useSearchActions()
  const { toggleLeftPanel } = usePanelActions()
  const [search, setSearch] = useState('')

  const listContainerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map())
  const [indicator, setIndicator] = useState({ top: 0, height: 0, visible: false })

  const registerItemRef = useCallback(
    (key: CategoryKey) => (element: HTMLLIElement | null) => {
      const id = categoryId(key)
      if (element) itemRefs.current.set(id, element)
      else itemRefs.current.delete(id)
    },
    []
  )

  const updateIndicator = useCallback((): void => {
    const container = listContainerRef.current
    const activeItem = itemRefs.current.get(categoryId(selectedCategory))
    if (!container || !activeItem) {
      setIndicator((prev) => ({ ...prev, visible: false }))
      return
    }

    const containerRect = container.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()

    setIndicator({
      top: itemRect.top - containerRect.top + container.scrollTop,
      height: itemRect.height,
      visible: true
    })
  }, [selectedCategory])

  const matches = (name: string): boolean => name.toLowerCase().includes(search.trim().toLowerCase())
  const visibleSystem = systemCategories.filter((category) => matches(category.label))
  const visibleGoals = goals?.filter((goal) => matches(goal.name))

  useLayoutEffect(() => {
    updateIndicator()
  }, [updateIndicator, visibleSystem.length, visibleGoals?.length, goals?.length])

  useLayoutEffect(() => {
    const container = listContainerRef.current
    if (!container) return

    const onScroll = (): void => updateIndicator()
    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [updateIndicator])

  // Switching category always lands on that category's feed: leave any open
  // block's edit view and reset the (now out-of-scope) header search.
  const handleCategorySelect = (key: CategoryKey) => (): void => {
    selectCategory(key)
    selectBlock(null)
    closeSearch()
  }

  return (
    <div className={cn('flex flex-col h-full', className)} {...props}>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search categories..."
          className="flex-1 min-w-0 rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500 focus:border-zinc-300/50"
        />
        <NewGoalButton />
      </div>

      <div ref={listContainerRef} className="relative mt-3 min-h-0 flex-1 overflow-auto">
        {indicator.visible && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-0 rounded-md border border-yellow-500/60 transition-[top,height] duration-200 ease-out"
            style={{ top: indicator.top, height: indicator.height }}
          />
        )}

        <ul className="space-y-1">
          {visibleSystem.map((category) => (
            <CategoryItem
              key={categoryId(category.key)}
              label={category.label}
              isPinned
              itemRef={registerItemRef(category.key)}
              onClick={handleCategorySelect(category.key)}
            />
          ))}
        </ul>

        <div className="relative z-10 mt-3 mb-1 px-2.5 text-xs uppercase tracking-wide text-zinc-500">
          Goals
        </div>
        <ul className="space-y-1">
          {visibleGoals?.map((goal) => (
            <CategoryItem
              key={goal.id}
              label={goal.name}
              itemRef={registerItemRef(goal.id)}
              onClick={handleCategorySelect(goal.id)}
            />
          ))}
          {visibleGoals && visibleGoals.length === 0 && (
            <li className="px-2.5 text-sm text-zinc-500">
              {search.trim() ? 'No matching goals' : 'No goals yet — add one with +'}
            </li>
          )}
        </ul>
      </div>

      <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
        <SettingsButton />
        <button
          onClick={toggleLeftPanel}
          title="Collapse sidebar"
          className="px-2 py-1 rounded-md border border-yellow-500/50 hover:bg-yellow-500/10 transition-colors duration-100"
        >
          <LuPanelLeftClose className="w-4 h-4 text-yellow-500" />
        </button>
      </div>
    </div>
  )
}
