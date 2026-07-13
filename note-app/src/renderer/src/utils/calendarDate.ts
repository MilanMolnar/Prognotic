import type { CalendarItem } from '@shared/models'

export const dateKeyForDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export const dateKeyForCalendarItem = (item: CalendarItem): string => {
    if (!item.start) return ''
    return item.allDay ? item.start.slice(0, 10) : dateKeyForDate(new Date(item.start))
}

export const calendarItemStartDate = (item: CalendarItem): Date =>
    item.allDay && item.start
        ? new Date(`${item.start.slice(0, 10)}T00:00:00`)
        : new Date(item.start ?? 0)

export const startOfWeek = (date: Date): Date => {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    result.setDate(result.getDate() - ((result.getDay() + 6) % 7))
    return result
}

export const monthGridDates = (date: Date): Date[] => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1)
    const start = startOfWeek(first)
    return Array.from({ length: 42 }, (_, index) => {
        const value = new Date(start)
        value.setDate(start.getDate() + index)
        return value
    })
}

export const toDateTimeLocalValue = (iso: string | undefined): string => {
    if (!iso) return ''
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) return ''
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
}

export const dateTimeLocalValueToIso = (value: string): string | null => {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
