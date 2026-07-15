import { useCalendar, useCalendarActions, useI18n } from '@renderer/context'
import { dateTimeLocalValueToIso, toDateTimeLocalValue } from '@renderer/utils/calendarDate'
import { JSX, useState } from 'react'

export const CalendarResolutionDialog = (): JSX.Element | null => {
  const { items, resolutionItemId } = useCalendar()
  const { closeResolutionQueue, resolveItem } = useCalendarActions()
  const { formatDateTime, t } = useI18n()
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
        setError(t('calendar.error.validDate'))
        return
      }
      const resolved = await resolveItem({ id: item.id, action, ...(start ? { start } : {}) })
      if (!resolved) setError(t('calendar.error.changed'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('calendar.error.resolve'))
    } finally {
      setIsSaving(false)
    }
  }

  const suggestion = item.suggestedStart
    ? formatDateTime(new Date(item.suggestedStart), { dateStyle: 'medium', timeStyle: 'short' })
    : t('calendar.noSuggestion')

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={closeResolutionQueue}>
      <div className="w-full max-w-lg rounded-lg border border-yellow-500/30 bg-zinc-900 p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-yellow-500">{t('calendar.suggestion')}</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-100">{t('calendar.chooseTime', { title: item.title })}</h2>
          </div>
          <button type="button" onClick={closeResolutionQueue} className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200">×</button>
        </div>

        <div className="mt-4 rounded-md border border-white/10 bg-zinc-950/40 p-3">
          <p className="text-xs text-zinc-500">{t('calendar.matchedText')}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{item.sourceText}</p>
          {item.excerpt && item.excerpt !== item.sourceText && <p className="mt-2 truncate text-xs text-zinc-500">{t('calendar.from', { excerpt: item.excerpt })}</p>}
        </div>

        <div className="mt-3 rounded-md border border-yellow-500/25 bg-yellow-500/5 p-3">
          <p className="text-xs text-zinc-500">{t('calendar.suggestedSlot')}</p>
          <p className="mt-1 text-sm text-yellow-300">{suggestion}</p>
        </div>

        <label className="mt-4 block text-xs text-zinc-400" htmlFor="calendar-custom-time">{t('calendar.customTime')}</label>
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
          <button type="button" disabled={isSaving} onClick={() => { void apply('dismiss') }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-700 disabled:opacity-50">{t('calendar.dismiss')}</button>
          <button type="button" disabled={isSaving || !customTime} onClick={() => { void apply('custom_time') }} className="rounded-md border border-zinc-500 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50">{t('calendar.setCustom')}</button>
          <button type="button" disabled={isSaving || !item.suggestedStart} onClick={() => { void apply('accept_suggestion') }} className="rounded-md border border-yellow-500/60 bg-yellow-500/10 px-3 py-1.5 text-sm text-yellow-300 hover:bg-yellow-500/20 disabled:opacity-50">{t('calendar.accept')}</button>
        </div>
      </div>
    </div>
  )
}
