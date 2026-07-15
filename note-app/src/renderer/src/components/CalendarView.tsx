import { useBlockActions, useBlocks, useCalendar, useCalendarActions, useGoalActions, useI18n } from '@renderer/context'
import { cn } from '@renderer/utils'
import {
  calendarItemStartDate,
  dateKeyForCalendarItem,
  dateKeyForDate,
  monthGridDates,
  startOfWeek
} from '@renderer/utils/calendarDate'
import { isScheduledCalendarItem } from '@shared/calendar'
import type { CalendarItem } from '@shared/models'
import { JSX, useMemo, useState } from 'react'
import { LuCalendarCheck, LuChevronLeft, LuChevronRight } from 'react-icons/lu'

type CalendarMode = 'month' | 'week' | 'day'

const sameDay = (left: Date, right: Date): boolean => dateKeyForDate(left) === dateKeyForDate(right)

export const CalendarView = (): JSX.Element => {
  const { items, isLoading, notice } = useCalendar()
  const { validateItem, openResolutionQueue } = useCalendarActions()
  const { blocks } = useBlocks()
  const { selectBlock } = useBlockActions()
  const { selectCategory } = useGoalActions()
  const { formatDateTime, formatNumber, t } = useI18n()
  const [mode, setMode] = useState<CalendarMode>('month')
  const [cursor, setCursor] = useState(() => new Date())

  const scheduledItems = useMemo(() => (items ?? [])
    .filter(isScheduledCalendarItem)
    .sort((left, right) => calendarItemStartDate(left).getTime() - calendarItemStartDate(right).getTime()), [items])
  const uncertainCount = (items ?? []).filter(
    (item) => item.deletedAt === undefined && item.status === 'uncertain'
  ).length
  const monthDates = monthGridDates(cursor)
  const weekStart = startOfWeek(cursor)
  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + index)
    return date
  })
  const visibleDates = mode === 'month' ? monthDates : mode === 'week' ? weekDates : [cursor]
  const itemsByDate = new Map<string, CalendarItem[]>()
  for (const item of scheduledItems) {
    const key = dateKeyForCalendarItem(item)
    const values = itemsByDate.get(key) ?? []
    values.push(item)
    itemsByDate.set(key, values)
  }

  const move = (direction: -1 | 1): void => {
    setCursor((current) => {
      const next = new Date(current)
      if (mode === 'month') {
        next.setDate(1)
        next.setMonth(next.getMonth() + direction)
      }
      else next.setDate(next.getDate() + direction * (mode === 'week' ? 7 : 1))
      return next
    })
  }

  const heading = mode === 'month'
    ? formatDateTime(cursor, { month: 'long', year: 'numeric' })
    : mode === 'week'
      ? `${formatDateTime(weekDates[0], { month: 'short', day: 'numeric' })} – ${formatDateTime(weekDates[6], { month: 'short', day: 'numeric', year: 'numeric' })}`
      : formatDateTime(cursor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const openLinkedNote = (item: CalendarItem): void => {
    if (!item.blockId) return
    const block = blocks?.find((candidate) => candidate.id === item.blockId)
    if (!block) return
    selectCategory(block.categories[0] ?? null)
    selectBlock(block.id)
  }

  const timeLabel = (item: CalendarItem): string => item.allDay
    ? t('calendar.allDay')
    : formatDateTime(calendarItemStartDate(item), { hour: 'numeric', minute: '2-digit' })

  const renderItem = (item: CalendarItem, compact: boolean): JSX.Element => (
    <div
      key={item.id}
      className={cn(
        'group flex min-w-0 items-center gap-1 rounded border px-1.5 py-1 text-left',
        item.status === 'pending_validation'
          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
          : 'border-white/10 bg-zinc-800/80 text-zinc-200'
      )}
    >
      <button
        type="button"
        disabled={!item.blockId}
        title={item.blockId ? t('calendar.openLinked') : t('calendar.importedEvent')}
        onClick={() => openLinkedNote(item)}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <span className="block truncate text-[11px] font-medium">{item.title}</span>
        {!compact && <span className="block text-[10px] text-zinc-400">{timeLabel(item)}</span>}
      </button>
      {item.status === 'pending_validation' && (
        <button
          type="button"
          title={t('calendar.validate')}
          aria-label={t('calendar.validateNamed', { title: item.title })}
          onClick={() => { void validateItem(item.id) }}
          className="shrink-0 rounded p-0.5 text-emerald-400 hover:bg-emerald-500/20"
        >
          <LuCalendarCheck className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  return (
    <section className="flex h-full min-h-0 flex-col px-2 pb-2">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3 pt-1">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} className="rounded p-1.5 hover:bg-zinc-700" title={t('calendar.previous')}>
            <LuChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setCursor(new Date())} className="rounded border border-white/15 px-2 py-1 text-xs hover:bg-zinc-700">{t('common.today')}</button>
          <button type="button" onClick={() => move(1)} className="rounded p-1.5 hover:bg-zinc-700" title={t('calendar.next')}>
            <LuChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-zinc-100">{heading}</h1>
        <div className="flex rounded-md border border-white/10 p-0.5">
          {(['month', 'week', 'day'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn('rounded px-2 py-1 text-xs capitalize', mode === value ? 'bg-yellow-500/15 text-yellow-400' : 'text-zinc-400 hover:bg-zinc-700')}
            >
              {value === 'month' ? t('calendar.month') : value === 'week' ? t('calendar.week') : t('calendar.day')}
            </button>
          ))}
        </div>
      </header>

      {uncertainCount > 0 && (
        <button
          type="button"
          onClick={() => openResolutionQueue()}
          className="mt-2 flex items-center justify-between rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-300 hover:bg-yellow-500/15"
        >
          <span>{uncertainCount === 1 ? t('calendar.uncertainOne') : t('calendar.uncertainMany', { count: formatNumber(uncertainCount) })}</span>
          <span className="font-semibold">{t('calendar.resolve')}</span>
        </button>
      )}
      {notice && <p className="mt-2 rounded border border-zinc-600 bg-zinc-900/60 px-2 py-1.5 text-xs text-zinc-400" role="status">{notice}</p>}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">{t('calendar.loading')}</div>
      ) : mode === 'month' ? (
        <div className="mt-2 grid min-h-0 flex-1 grid-cols-7 grid-rows-[auto_repeat(6,minmax(0,1fr))] overflow-hidden rounded-md border border-white/10">
          {weekDates.map((date) => (
            <div key={date.getDay()} className="border-b border-white/10 px-2 py-1 text-center text-[11px] uppercase tracking-wide text-zinc-500">
              {formatDateTime(date, { weekday: 'short' })}
            </div>
          ))}
          {visibleDates.map((date, index) => {
            const dateItems = itemsByDate.get(dateKeyForDate(date)) ?? []
            return (
              <div
                key={date.toISOString()}
                className={cn(
                  'min-h-0 overflow-y-auto border-b border-r border-white/10 p-1 last:border-r-0',
                  index % 7 === 6 && 'border-r-0',
                  date.getMonth() !== cursor.getMonth() && 'bg-zinc-950/20 text-zinc-600'
                )}
              >
                <button
                  type="button"
                  onClick={() => { setCursor(date); setMode('day') }}
                  className={cn('mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs hover:bg-zinc-700', sameDay(date, new Date()) && 'bg-yellow-500 text-zinc-950')}
                >
                  {formatNumber(date.getDate())}
                </button>
                <div className="space-y-1">{dateItems.slice(0, 4).map((item) => renderItem(item, true))}</div>
                {dateItems.length > 4 && <p className="mt-1 text-[10px] text-zinc-500">{t('calendar.more', { count: formatNumber(dateItems.length - 4) })}</p>}
              </div>
            )
          })}
        </div>
      ) : (
        <div className={cn('mt-2 grid min-h-0 flex-1 gap-2 overflow-auto', mode === 'week' ? 'grid-cols-7' : 'grid-cols-1')}>
          {visibleDates.map((date) => {
            const dateItems = itemsByDate.get(dateKeyForDate(date)) ?? []
            return (
              <div key={date.toISOString()} className="min-w-0 rounded-md border border-white/10 bg-zinc-900/30 p-2">
                <button type="button" onClick={() => { setCursor(date); setMode('day') }} className="mb-2 text-left">
                  <span className="block text-xs text-zinc-500">{formatDateTime(date, { weekday: 'short' })}</span>
                  <span className={cn('text-lg', sameDay(date, new Date()) && 'text-yellow-400')}>{formatNumber(date.getDate())}</span>
                </button>
                <div className="space-y-1.5">
                  {dateItems.map((item) => renderItem(item, false))}
                  {dateItems.length === 0 && <p className="text-xs text-zinc-600">{t('common.noItems')}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
