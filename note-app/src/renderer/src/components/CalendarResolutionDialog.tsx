import { useCalendar, useCalendarActions } from '@renderer/context'
import { dateTimeLocalValueToIso, toDateTimeLocalValue } from '@renderer/utils/calendarDate'
import { JSX, useState } from 'react'

export const CalendarResolutionDialog = (): JSX.Element | null => {
  const { items, resolutionItemId } = useCalendar()
  const { closeResolutionQueue, resolveItem } = useCalendarActions()
  const item = items?.find((candidate) => candidate.id === resolutionItemId && candidate.status === 'uncertain')
  const [customTime, setCustomTime] = useState(() => toDateTimeLocalValue(item?.suggestedStart))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!item) return null

  const apply = async (action: 'accept_suggestion' | 'custom_time' | 'dismiss'): Promise<void> => {
    setError(null)
    setIsSaving(true)
    try {
      const start = action === 'custom_time' ? dateTimeLocalValueToIso(customTime) : undefined
      if (action === 'custom_time' && !start) {
        setError('Choose a valid date and time.')
        return
      }
      const resolved = await resolveItem({ id: item.id, action, ...(start ? { start } : {}) })
      if (!resolved) setError('This item could not be resolved. It may have changed in another action.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not resolve this calendar item.')
    } finally {
      setIsSaving(false)
    }
  }

  const suggestion = item.suggestedStart
    ? new Intl.DateTimeFormat(window.context.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.suggestedStart))
    : 'No suggestion available'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={closeResolutionQueue}>
      <div className="w-full max-w-lg rounded-lg border border-yellow-500/30 bg-zinc-900 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-yellow-500">Calendar suggestion</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-100">Choose a time for “{item.title}”</h2>
          </div>
          <button type="button" onClick={closeResolutionQueue} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200">×</button>
        </div>

        <div className="mt-4 rounded-md border border-white/10 bg-zinc-950/40 p-3">
          <p className="text-xs text-zinc-500">Matched note text</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{item.sourceText}</p>
          {item.excerpt && item.excerpt !== item.sourceText && <p className="mt-2 truncate text-xs text-zinc-500">From: {item.excerpt}</p>}
        </div>

        <div className="mt-3 rounded-md border border-yellow-500/25 bg-yellow-500/5 p-3">
          <p className="text-xs text-zinc-500">Suggested slot</p>
          <p className="mt-1 text-sm text-yellow-300">{suggestion}</p>
        </div>

        <label className="mt-4 block text-xs text-zinc-400" htmlFor="calendar-custom-time">Custom date and time</label>
        <input
          id="calendar-custom-time"
          type="datetime-local"
          value={customTime}
          min={toDateTimeLocalValue(new Date().toISOString())}
          onChange={(event) => setCustomTime(event.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-yellow-500/60"
        />
        {error && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={isSaving} onClick={() => { void apply('dismiss') }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-700 disabled:opacity-50">Dismiss</button>
          <button type="button" disabled={isSaving || !customTime} onClick={() => { void apply('custom_time') }} className="rounded-md border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50">Set custom time</button>
          <button type="button" disabled={isSaving || !item.suggestedStart} onClick={() => { void apply('accept_suggestion') }} className="rounded-md border border-yellow-500/60 bg-yellow-500/10 px-3 py-1.5 text-sm text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50">Accept suggestion</button>
        </div>
      </div>
    </div>
  )
}
