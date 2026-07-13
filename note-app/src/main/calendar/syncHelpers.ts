import type { CalendarItem } from '@shared/models'
import { createHash } from 'crypto'

export type GoogleEventLike = {
    id?: string | null
    status?: string | null
    etag?: string | null
    updated?: string | null
    summary?: string | null
    start?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null
    end?: { date?: string | null; dateTime?: string | null; timeZone?: string | null } | null
    extendedProperties?: {
        private?: Record<string, string> | null
    } | null
}

export type GoogleEventFields = {
    title: string
    start: string
    end: string
    allDay: boolean
    timeZone: string
}

export const calendarItemSyncHash = (item: Pick<CalendarItem, 'title' | 'start' | 'end' | 'allDay' | 'timeZone'>): string =>
    createHash('sha256')
        .update(JSON.stringify({
            title: item.title.trim(),
            start: item.start ?? '',
            end: item.end ?? '',
            allDay: item.allDay,
            timeZone: item.timeZone,
        }))
        .digest('hex')

export const googleEventPayloadForItem = (item: CalendarItem): Record<string, unknown> => {
    if (!item.start || !item.end) throw new Error('A scheduled item needs both a start and end time.')
    return {
        summary: item.title,
        start: item.allDay
            ? { date: item.start }
            : { dateTime: item.start, timeZone: item.timeZone },
        end: item.allDay
            ? { date: item.end }
            : { dateTime: item.end, timeZone: item.timeZone },
        extendedProperties: {
            private: {
                prognoticItemId: item.id
            }
        }
    }
}

export const googleEventFields = (
    event: GoogleEventLike,
    fallbackTimeZone: string
): GoogleEventFields | null => {
    const startDate = event.start?.date
    const endDate = event.end?.date
    if (startDate && endDate) {
        return {
            title: event.summary?.trim().slice(0, 160) || 'Google Calendar event',
            start: startDate,
            end: endDate,
            allDay: true,
            timeZone: event.start?.timeZone || fallbackTimeZone,
        }
    }

    const startMs = event.start?.dateTime ? Date.parse(event.start.dateTime) : Number.NaN
    const endMs = event.end?.dateTime ? Date.parse(event.end.dateTime) : Number.NaN
    if (!Number.isFinite(startMs)) return null
    return {
        title: event.summary?.trim().slice(0, 160) || 'Google Calendar event',
        start: new Date(startMs).toISOString(),
        end: new Date(Number.isFinite(endMs) && endMs > startMs ? endMs : startMs + 60 * 60 * 1000).toISOString(),
        allDay: false,
        timeZone: event.start?.timeZone || fallbackTimeZone,
    }
}

export const findCalendarItemForGoogleEvent = (
    items: CalendarItem[],
    event: GoogleEventLike,
    calendarId = 'primary'
): CalendarItem | undefined => {
    const localId = event.extendedProperties?.private?.prognoticItemId
    if (localId) {
        const direct = items.find((item) => item.id === localId)
        if (direct) return direct
    }
    if (!event.id) return undefined
    return items.find(
        (item) => item.google?.calendarId === calendarId && item.google.eventId === event.id
    )
}
