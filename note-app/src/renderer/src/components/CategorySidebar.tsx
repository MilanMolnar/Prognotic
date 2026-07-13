import { ActionButton, GoalContextMenu, GoalDialog, NewGoalButton, SettingsButton } from '@/components'
import {
  CategoryKey,
  useBlockActions,
  useBlockDrag,
  useBlocks,
  useCalendar,
  useCalendarActions,
  useGoalActions,
  useGoals,
  usePanelActions,
  usePanels,
  usePlugins,
  useSearchActions,
  useSettings,
  useSettingsActions
} from '@renderer/context'
import { cn } from '@renderer/utils'
import { maxPinnedGoals, researchCategory } from '@shared/constants'
import { countUnvisitedBlocksForGoal } from '@shared/goalPresence'
import { countPendingCalendarItems, hasUncertainCalendarItems } from '@shared/calendar'
import { Goal } from '@shared/models'
import type { InstalledPlugin } from '@shared/plugins'
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
import { LuBookOpen, LuCalendarDays, LuHeartPulse, LuLeaf, LuPanelLeftClose, LuPin, LuPuzzle, LuSearch, LuSparkles, LuStickyNote, LuUtensils } from 'react-icons/lu'

const categoryId = (key: CategoryKey): string => key ?? 'quick-notes'
const pluginRowId = (pluginId: string): string => `plugin-row:${pluginId}`
const goalSearchId = '__goal-search__'
const calendarRowId = '__calendar__'

const goalRowClass =
  'flex h-9 items-center rounded-md border border-transparent px-2.5 text-sm transition-colors duration-75'

type SelectableItemProps = {
  label: string
  onClick: () => void
  itemRef: (element: HTMLElement | null) => void
  // Stable DOM hook (data-category-row) so transient effects outside this
  // component — e.g. the "send to research" flight — can find the row.
  categoryRowId: string
  tourId?: string
  leading?: ReactNode
  labelBadge?: ReactNode
  trailing?: ReactNode
  onContextMenu?: (event: MouseEvent) => void
  blockDropState?: 'available' | 'active'
}

const SelectableItem = ({
  label,
  onClick,
  itemRef,
  categoryRowId,
  tourId,
  leading,
  labelBadge,
  trailing,
  onContextMenu,
  blockDropState
}: SelectableItemProps): JSX.Element => (
  <li
    ref={itemRef}
    data-category-row={categoryRowId}
    data-tour={tourId}
    onClick={onClick}
    onContextMenu={onContextMenu}
    className={cn(
      goalRowClass,
      'relative z-10 cursor-pointer gap-2 hover:bg-zinc-600/50',
      blockDropState === 'available' && 'border-dashed border-yellow-500/30 bg-yellow-500/5',
      blockDropState === 'active' && 'border-yellow-400 bg-yellow-500/15 shadow-[inset_0_0_0_1px_rgb(250_204_21_/_0.25),0_0_12px_rgb(234_179_8_/_0.2)]'
    )}
  >
    {leading}
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <span className="truncate">{label}</span>
      {labelBadge}
    </span>
    {trailing}
  </li>
)

type SystemButtonProps = {
  label: string
  onClick: () => void
  itemRef: (element: HTMLElement | null) => void
  categoryRowId: string
  tourId?: string
  leading: ReactNode
  trailing?: ReactNode
  blockDropState?: 'available' | 'active'
}

const SystemItem = ({ label, onClick, itemRef, categoryRowId, tourId, leading, trailing, blockDropState }: SystemButtonProps): JSX.Element => (
  <SelectableItem
    label={label}
    onClick={onClick}
    itemRef={itemRef}
    categoryRowId={categoryRowId}
    tourId={tourId}
    leading={leading}
    trailing={trailing}
    blockDropState={blockDropState}
  />
)

const systemGoalIconClass = 'h-4 w-4 shrink-0 text-zinc-400'

const SectionLabel = ({ children }: { children: string }): JSX.Element => (
  <div className="relative z-10 mb-1 mt-3 px-2.5 text-xs uppercase tracking-wide text-zinc-500">{children}</div>
)

const PluginIcon = ({ name }: { name?: string }): JSX.Element => {
  const Icon = name === 'utensils'
    ? LuUtensils
    : name === 'leaf'
      ? LuLeaf
      : name === 'heart'
        ? LuHeartPulse
        : name === 'sparkles'
          ? LuSparkles
          : LuPuzzle
  return <Icon className={systemGoalIconClass} aria-hidden />
}

export const CategorySidebar = ({ className, ...props }: ComponentProps<'div'>): JSX.Element => {
  const { goals, selectedCategory, selectedPluginId, isCalendarSelected } = useGoals()
  const { plugins } = usePlugins()
  const { blocks } = useBlocks()
  const { selectCategory, selectPlugin, selectCalendar, deleteGoal } = useGoalActions()
  const { selectBlock } = useBlockActions()
  const { closeSearch } = useSearchActions()
  const { toggleLeftPanel } = usePanelActions()
  const { isLeftPanelOpen } = usePanels()
  const { settings } = useSettings()
  const { togglePinGoal } = useSettingsActions()
  const { activeDrag } = useBlockDrag()
  const { items: calendarItems } = useCalendar()
  const { openResolutionQueue } = useCalendarActions()
  const [search, setSearch] = useState('')
  const [isGoalSearchOpen, setIsGoalSearchOpen] = useState(false)
  const [contextGoal, setContextGoal] = useState<{ goal: Goal; position: { x: number; y: number } } | null>(null)
  const [editingGoal, setEditingGoal] = useState<{ goal: Goal; mode: 'rename' | 'description' } | null>(null)

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

  const registerPluginRef = useCallback(
    (pluginId: string) => (element: HTMLElement | null) => {
      const id = pluginRowId(pluginId)
      if (element) itemRefs.current.set(id, element)
      else itemRefs.current.delete(id)
    },
    []
  )

  const registerCalendarRef = useCallback((element: HTMLElement | null) => {
    if (element) itemRefs.current.set(calendarRowId, element)
    else itemRefs.current.delete(calendarRowId)
  }, [])

  const updateIndicator = useCallback((): void => {
    const container = listContainerRef.current
    const activeId = isGoalSearchOpen
      ? goalSearchId
      : isCalendarSelected
        ? calendarRowId
      : selectedPluginId
        ? pluginRowId(selectedPluginId)
        : categoryId(selectedCategory)
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
  }, [isGoalSearchOpen, isCalendarSelected, selectedCategory, selectedPluginId])

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
  const enabledPlugins = useMemo(
    () => (plugins ?? []).filter((plugin): plugin is InstalledPlugin & { id: string } =>
      typeof plugin.id === 'string' && plugin.enabled && plugin.valid
    ),
    [plugins]
  )
  const unvisitedCounts = useMemo(() => new Map(
    (goals ?? []).map((goal) => [goal.id, countUnvisitedBlocksForGoal(blocks, goal.id)])
  ), [blocks, goals])
  const pendingCalendarCount = countPendingCalendarItems(calendarItems)
  const hasUncertainCalendar = hasUncertainCalendarItems(calendarItems)

  const counterFor = (goalId: string): ReactNode => {
    const count = unvisitedCounts.get(goalId) ?? 0
    if (count === 0) return undefined
    return <button
      type="button"
      title={`${count} unvisited ${count === 1 ? 'note' : 'notes'}`}
      aria-label={`${count} unvisited ${count === 1 ? 'note' : 'notes'}`}
      onClick={(event) => event.stopPropagation()}
      className="min-w-5 shrink-0 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-center text-[10px] font-medium leading-none text-yellow-400"
    >
      {count}
    </button>
  }

  const pluginCounter = (count: number): ReactNode => count > 0 ? (
    <span
      title={`${count} ${count === 1 ? 'entry needs' : 'entries need'} review`}
      className="min-w-5 shrink-0 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-center text-[10px] font-medium leading-none text-yellow-400"
    >
      {count}
    </span>
  ) : undefined

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(updateIndicator)
    return () => cancelAnimationFrame(frame)
  }, [updateIndicator, pinnedGoals.length, visibleUnpinnedGoals.length, enabledPlugins.length, goals?.length, isGoalSearchOpen, isLeftPanelOpen])

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

  const handlePluginSelect = (pluginId: string) => (): void => {
    selectPlugin(pluginId)
    selectBlock(null)
    closeSearch()
    closeGoalSearch()
  }

  const handleCalendarSelect = (): void => {
    selectCalendar()
    selectBlock(null)
    closeSearch()
    closeGoalSearch()
  }

  const handlePinClick = (goalId: string) => (event: MouseEvent): void => {
    event.stopPropagation()
    void togglePinGoal(goalId)
  }

  const handleGoalContextMenu = (goal: Goal) => (event: MouseEvent): void => {
    event.preventDefault()
    setContextGoal({ goal, position: { x: event.clientX, y: event.clientY } })
  }

  const handleDeleteGoal = async (): Promise<void> => {
    if (!contextGoal) return
    const { goal } = contextGoal
    setContextGoal(null)
    if (!window.confirm(`Delete the goal "${goal.name}"? Blocks keep their other categories; uncategorized blocks return to Quick Notes.`)) return
    await deleteGoal(goal.id)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') closeGoalSearch()
  }

  const blockDropStateFor = (rowId: string): 'available' | 'active' | undefined => {
    if (!activeDrag) return undefined
    return activeDrag.target?.type === 'category' && categoryId(activeDrag.target.categoryId) === rowId
      ? 'active'
      : 'available'
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
            tourId="quick-notes-goal"
            blockDropState={blockDropStateFor(categoryId(null))}
            onClick={handleCategorySelect(null)}
            leading={<LuStickyNote className={systemGoalIconClass} aria-hidden />}
          />
          <SystemItem
            label="Research"
            itemRef={registerItemRef(researchCategory)}
            categoryRowId={categoryId(researchCategory)}
            tourId="research-goal"
            blockDropState={blockDropStateFor(categoryId(researchCategory))}
            onClick={handleCategorySelect(researchCategory)}
            leading={<LuBookOpen className={systemGoalIconClass} aria-hidden />}
          />
          <SystemItem
            label="Calendar"
            itemRef={registerCalendarRef}
            categoryRowId={calendarRowId}
            onClick={handleCalendarSelect}
            leading={<LuCalendarDays className={systemGoalIconClass} aria-hidden />}
            trailing={(pendingCalendarCount > 0 || hasUncertainCalendar) ? (
              <span className="flex shrink-0 items-center gap-1">
                {pendingCalendarCount > 0 && (
                  <span
                    title={`${pendingCalendarCount} ${pendingCalendarCount === 1 ? 'item needs' : 'items need'} validation`}
                    className="min-w-5 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-center text-[10px] font-medium leading-none text-emerald-400"
                  >
                    {pendingCalendarCount}
                  </span>
                )}
                {hasUncertainCalendar && (
                  <button
                    type="button"
                    title="Resolve uncertain calendar items"
                    aria-label="Resolve uncertain calendar items"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleCalendarSelect()
                      openResolutionQueue()
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-yellow-500/50 bg-yellow-500/10 text-[11px] font-bold leading-none text-yellow-400 hover:bg-yellow-500/20"
                  >
                    !
                  </button>
                )}
              </span>
            ) : undefined}
          />
        </ul>

        {enabledPlugins.length > 0 && (
          <>
            <SectionLabel>Plugins</SectionLabel>
            <ul className="space-y-1">
              {enabledPlugins.map((plugin) => (
                <SelectableItem
                  key={plugin.id}
                  label={plugin.sidebar?.label ?? plugin.name}
                  itemRef={registerPluginRef(plugin.id)}
                  categoryRowId={pluginRowId(plugin.id)}
                  onClick={handlePluginSelect(plugin.id)}
                  leading={<PluginIcon name={plugin.sidebar?.icon} />}
                  labelBadge={plugin.aiGenerated ? (
                    <span title="Created with AI" aria-label="Created with AI" className="shrink-0 text-violet-300">
                      <LuSparkles className="h-3 w-3" aria-hidden />
                    </span>
                  ) : undefined}
                  trailing={pluginCounter(plugin.badgeCount)}
                />
              ))}
            </ul>
          </>
        )}

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
                  tourId={goal.name.trim().toLowerCase() === 'work' ? 'work-goal' : undefined}
                  blockDropState={blockDropStateFor(categoryId(goal.id))}
                  onClick={handleCategorySelect(goal.id)}
                  onContextMenu={handleGoalContextMenu(goal)}
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
                  trailing={counterFor(goal.id)}
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
              tourId={goal.name.trim().toLowerCase() === 'work' ? 'work-goal' : undefined}
              blockDropState={blockDropStateFor(categoryId(goal.id))}
              onClick={handleCategorySelect(goal.id)}
              onContextMenu={handleGoalContextMenu(goal)}
              leading={
                <button
                  type="button"
                  title={canPinMore ? 'Pin goal' : `Pin limit reached (${maxPinnedGoals})`}
                  disabled={!canPinMore}
                  onClick={handlePinClick(goal.id)}
                  className="shrink-0 rounded p-0.5 hover:bg-zinc-600/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <LuPin className="h-3 w-3 text-zinc-600 hover:text-zinc-400" />
                </button>
              }
              trailing={counterFor(goal.id)}
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
      {contextGoal && <GoalContextMenu goal={contextGoal.goal} position={contextGoal.position} onClose={() => setContextGoal(null)} onRename={() => { setEditingGoal({ goal: contextGoal.goal, mode: 'rename' }); setContextGoal(null) }} onEditDescription={() => { setEditingGoal({ goal: contextGoal.goal, mode: 'description' }); setContextGoal(null) }} onDelete={() => { void handleDeleteGoal() }} />}
      {editingGoal && <GoalDialog goal={editingGoal.goal} mode={editingGoal.mode} onClose={() => setEditingGoal(null)} />}
    </div>
  )
}
