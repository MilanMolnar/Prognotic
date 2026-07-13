import { ActionButton, SettingsButton } from '@/components'
import { useBlockActions, useCalendar, useCalendarActions, useGoalActions, useGoals, usePanelActions } from '@renderer/context'
import { cn } from '@renderer/utils'
import { countPendingCalendarItems, hasUncertainCalendarItems } from '@shared/calendar'
import { JSX } from 'react'
import { LuCalendarDays, LuPanelLeftOpen } from 'react-icons/lu'

// Narrow strip shown while the goals sidebar is collapsed: settings and the
// expand control stacked at the bottom, mirroring the expanded layout.
export const CollapsedSidebar = (): JSX.Element => {
  const { toggleLeftPanel } = usePanelActions()
  const { isCalendarSelected } = useGoals()
  const { selectCalendar } = useGoalActions()
  const { selectBlock } = useBlockActions()
  const { items } = useCalendar()
  const { openResolutionQueue } = useCalendarActions()
  const pendingCount = countPendingCalendarItems(items)
  const hasUncertain = hasUncertainCalendarItems(items)

  const openCalendar = (): void => {
    selectCalendar()
    selectBlock(null)
  }

  return (
    <div className="flex h-full flex-col items-center justify-between pb-1">
      <div className="pt-1">
        <div className="relative">
          <ActionButton
            onClick={openCalendar}
            title="Calendar"
            className={cn('relative', isCalendarSelected && 'border-yellow-500/60')}
          >
            <LuCalendarDays className={cn('h-4 w-4', isCalendarSelected ? 'text-yellow-500' : 'text-zinc-300')} />
            {pendingCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full border border-emerald-500/60 bg-zinc-900 px-1 text-[9px] leading-4 text-emerald-400">
                {pendingCount}
              </span>
            )}
          </ActionButton>
          {hasUncertain && (
            <button
              type="button"
              title="Resolve uncertain calendar items"
              onClick={(event) => {
                event.stopPropagation()
                openCalendar()
                openResolutionQueue()
              }}
              className="absolute -bottom-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-yellow-500/60 bg-zinc-900 text-[10px] font-bold text-yellow-400"
            >
              !
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <SettingsButton />
        <ActionButton onClick={toggleLeftPanel} title="Expand sidebar">
          <LuPanelLeftOpen className="h-4 w-4 text-zinc-300" />
        </ActionButton>
      </div>
    </div>
  )
}
