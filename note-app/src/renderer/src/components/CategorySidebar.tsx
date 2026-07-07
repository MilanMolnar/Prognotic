import { ActionButton, NewGoalButton, SettingsButton } from '@/components'
import {
  CategoryKey,
  useBlockActions,
  useGoalActions,
  useGoals,
  usePanelActions,
  usePanels,
  useSearchActions,
  useSettings,
  useSettingsActions
} from '@renderer/context'
import { cn } from '@renderer/utils'
import { maxPinnedGoals, researchCategory } from '@shared/constants'
import { Goal } from '@shared/models'
import {
  ComponentProps,
  JSX,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { LuPanelLeftClose, LuPin, LuSearch } from 'react-icons/lu'

const categoryId = (key: CategoryKey): string => key ?? 'quick-notes'
const goalSearchId = '__goal-search__'

const goalRowClass =
  'flex h-9 items-center rounded-md border border-transparent px-2.5 text-sm transition-colors duration-75'

type SelectableItemProps = {
  label: string
  onClick: () => void
  itemRef: (element: HTMLElement | null) => void
  // Stable DOM hook (data-category-row) so transient effects outside this
  // component — e.g. the "send to research" flight — can find the row.
  categoryRowId: string
  leading?: ReactNode
  trailing?: ReactNode
}

const SelectableItem = ({
  label,
  onClick,
  itemRef,
  categoryRowId,
  leading,
  trailing
}: SelectableItemProps): JSX.Element => (
  <li
    ref={itemRef}
    data-category-row={categoryRowId}
    onClick={onClick}
    className={cn(
      goalRowClass,
      'relative z-10 cursor-pointer gap-2 hover:bg-zinc-600/50'
    )}
  >
    {leading}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {trailing}
  </li>
)

type SystemButtonProps = {
  label: string
  onClick: () => void
  itemRef: (element: HTMLElement | null) => void
  categoryRowId: string
}

const SystemItem = ({ label, onClick, itemRef, categoryRowId }: SystemButtonProps): JSX.Element => (
  <SelectableItem label={label} onClick={onClick} itemRef={itemRef} categoryRowId={categoryRowId} />
)

const SectionLabel = ({ children }: { children: string }): JSX.Element => (
  <div className="relative z-10 mb-1 mt-3 px-2.5 text-xs uppercase tracking-wide text-zinc-500">{children}</div>
)

export const CategorySidebar = ({ className, ...props }: ComponentProps<'div'>): JSX.Element => {
  const { goals, selectedCategory } = useGoals()
  const { selectCategory } = useGoalActions()
  const { selectBlock } = useBlockActions()
  const { closeSearch } = useSearchActions()
  const { toggleLeftPanel } = usePanelActions()
  const { isLeftPanelOpen } = usePanels()
  const { settings } = useSettings()
  const { togglePinGoal } = useSettingsActions()
  const [search, setSearch] = useState('')
  const [isGoalSearchOpen, setIsGoalSearchOpen] = useState(false)

  const listContainerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [indicator, setIndicator] = useState({ top: 0, left: 0, width: 0, height: 0, visible: false })

  const registerItemRef = useCallback(
    (key: CategoryKey) => (element: HTMLElement | null) => {
      const id = categoryId(key)
      if (element) itemRefs.current.set(id, element)
      else itemRefs.current.delete(id)
    },
    []
  )

  const registerSearchRowRef = useCallback((element: HTMLElement | null) => {
    if (element) itemRefs.current.set(goalSearchId, element)
    else itemRefs.current.delete(goalSearchId)
  }, [])

  const updateIndicator = useCallback((): void => {
    const container = listContainerRef.current
    const activeId = isGoalSearchOpen ? goalSearchId : categoryId(selectedCategory)
    const activeItem = itemRefs.current.get(activeId)
    if (!container || !activeItem) {
      setIndicator((prev) => ({ ...prev, visible: false }))
      return
    }

    const containerRect = container.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()

    setIndicator({
      top: itemRect.top - containerRect.top + container.scrollTop,
      left: itemRect.left - containerRect.left + container.scrollLeft,
      width: itemRect.width,
      height: itemRect.height,
      visible: true
    })
  }, [isGoalSearchOpen, selectedCategory])

  const pinnedIds = settings.pinnedGoalIds
  const canPinMore = pinnedIds.length < maxPinnedGoals

  const { pinnedGoals, unpinnedGoals } = useMemo(() => {
    if (!goals) return { pinnedGoals: [] as Goal[], unpinnedGoals: [] as Goal[] }

    const goalById = new Map(goals.map((goal) => [goal.id, goal]))
    const pinned = pinnedIds
      .map((id) => goalById.get(id))
      .filter((goal): goal is Goal => goal !== undefined)
    const unpinned = goals.filter((goal) => !pinnedIds.includes(goal.id))

    return { pinnedGoals: pinned, unpinnedGoals: unpinned }
  }, [goals, pinnedIds])

  const trimmedSearch = search.trim().toLowerCase()
  const matchesGoalName = (name: string): boolean =>
    trimmedSearch.length === 0 || name.toLowerCase().includes(trimmedSearch)

  const visibleUnpinnedGoals = unpinnedGoals.filter((goal) => matchesGoalName(goal.name))

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(updateIndicator)
    return () => cancelAnimationFrame(frame)
  }, [updateIndicator, pinnedGoals.length, visibleUnpinnedGoals.length, goals?.length, isGoalSearchOpen, isLeftPanelOpen])

  // Sidebar width animates over 200ms on open/close — remeasure after it settles.
  useLayoutEffect(() => {
    if (!isLeftPanelOpen) return
    const frame = requestAnimationFrame(() => updateIndicator())
    const timer = window.setTimeout(updateIndicator, 220)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [isLeftPanelOpen, updateIndicator])

  useLayoutEffect(() => {
    const container = listContainerRef.current
    if (!container) return

    const onScroll = (): void => updateIndicator()
    const resizeObserver = new ResizeObserver(() => updateIndicator())
    resizeObserver.observe(container)

    container.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)

    return () => {
      resizeObserver.disconnect()
      container.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [updateIndicator])

  useLayoutEffect(() => {
    if (isGoalSearchOpen) searchInputRef.current?.focus()
  }, [isGoalSearchOpen])

  const closeGoalSearch = useCallback((): void => {
    setIsGoalSearchOpen(false)
    setSearch('')
  }, [])

  const toggleGoalSearch = (): void => {
    if (isGoalSearchOpen) closeGoalSearch()
    else setIsGoalSearchOpen(true)
  }

  const handleCategorySelect = (key: CategoryKey) => (): void => {
    selectCategory(key)
    selectBlock(null)
    closeSearch()
    closeGoalSearch()
  }

  const handlePinClick = (goalId: string) => (event: MouseEvent): void => {
    event.stopPropagation()
    void togglePinGoal(goalId)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') closeGoalSearch()
  }

  return (
    <div className={cn('flex flex-col h-full', className)} {...props}>
      <div ref={listContainerRef} className="relative mt-1 min-h-0 flex-1 overflow-auto">
        {indicator.visible && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-0 rounded-md border border-yellow-500/60 transition-[top,left,width,height] duration-200 ease-out"
            style={{
              top: indicator.top,
              left: indicator.left,
              width: indicator.width,
              height: indicator.height
            }}
          />
        )}

        <div className="relative z-10 mb-2.5 flex w-full items-center gap-1">
          {isGoalSearchOpen ? (
            <div
              ref={registerSearchRowRef}
              className={cn(goalRowClass, 'min-w-0 flex-1 gap-0 px-0')}
            >
              <button
                type="button"
                title="Close search"
                onClick={toggleGoalSearch}
                className="flex h-full shrink-0 items-center justify-center px-2.5 hover:bg-zinc-600/50"
              >
                <LuSearch className="h-4 w-4 text-yellow-500" />
              </button>
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search goals..."
                className="min-w-0 flex-1 bg-transparent pr-2.5 text-sm outline-none caret-yellow-500 placeholder:text-zinc-500"
              />
            </div>
          ) : (
            <button
              type="button"
              title="Search goals"
              onClick={toggleGoalSearch}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-400/50 hover:bg-zinc-600/50"
            >
              <LuSearch className="h-4 w-4 text-zinc-400" />
            </button>
          )}
          <NewGoalButton className="ml-auto" />
        </div>

        <ul className="space-y-1">
          <SystemItem
            label="Quick Note"
            itemRef={registerItemRef(null)}
            categoryRowId={categoryId(null)}
            onClick={handleCategorySelect(null)}
          />
          <SystemItem
            label="Research"
            itemRef={registerItemRef(researchCategory)}
            categoryRowId={categoryId(researchCategory)}
            onClick={handleCategorySelect(researchCategory)}
          />
        </ul>

        {pinnedGoals.length > 0 && (
          <>
            <SectionLabel>Pinned</SectionLabel>
            <ul className="space-y-1">
              {pinnedGoals.map((goal) => (
                <SelectableItem
                  key={goal.id}
                  label={goal.name}
                  itemRef={registerItemRef(goal.id)}
                  categoryRowId={categoryId(goal.id)}
                  onClick={handleCategorySelect(goal.id)}
                  leading={
                    <button
                      type="button"
                      title="Unpin goal"
                      onClick={handlePinClick(goal.id)}
                      className="shrink-0 rounded p-0.5 hover:bg-zinc-600/50"
                    >
                      <LuPin className="h-3 w-3 text-yellow-500" />
                    </button>
                  }
                />
              ))}
            </ul>
          </>
        )}

        <SectionLabel>Goals</SectionLabel>
        <ul className="space-y-1">
          {visibleUnpinnedGoals.map((goal) => (
            <SelectableItem
              key={goal.id}
              label={goal.name}
              itemRef={registerItemRef(goal.id)}
              categoryRowId={categoryId(goal.id)}
              onClick={handleCategorySelect(goal.id)}
              trailing={
                canPinMore ? (
                  <button
                    type="button"
                    title="Pin goal"
                    onClick={handlePinClick(goal.id)}
                    className="shrink-0 rounded p-0.5 hover:bg-zinc-600/50"
                  >
                    <LuPin className="h-3 w-3 text-zinc-600 hover:text-zinc-400" />
                  </button>
                ) : undefined
              }
            />
          ))}
          {goals && visibleUnpinnedGoals.length === 0 && (
            <li className="px-2.5 text-sm text-zinc-500">
              {trimmedSearch ? 'No matching goals' : unpinnedGoals.length === 0 && pinnedGoals.length > 0
                ? 'All goals are pinned'
                : 'No goals yet — add one with +'}
            </li>
          )}
        </ul>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
        <SettingsButton />
        <ActionButton
          onClick={toggleLeftPanel}
          title="Collapse sidebar"
          className="border-yellow-500/50 hover:bg-yellow-500/10"
        >
          <LuPanelLeftClose className="h-4 w-4 text-yellow-500" />
        </ActionButton>
      </div>
    </div>
  )
}
