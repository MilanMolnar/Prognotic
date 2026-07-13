import type { CalendarItem, GoogleCalendarSettings } from './models'

const activeItems = (items: CalendarItem[] | undefined): CalendarItem[] =>
    items?.filter((item) => item.deletedAt === undefined) ?? []

export const countPendingCalendarItems = (items: CalendarItem[] | undefined): number =>
    activeItems(items).filter((item) => item.status === 'pending_validation').length

export const countUncertainCalendarItems = (items: CalendarItem[] | undefined): number =>
    activeItems(items).filter((item) => item.status === 'uncertain').length

export const hasUncertainCalendarItems = (items: CalendarItem[] | undefined): boolean =>
    countUncertainCalendarItems(items) > 0

export const isScheduledCalendarItem = (item: CalendarItem): boolean =>
    item.deletedAt === undefined &&
    typeof item.start === 'string' &&
    item.start.length > 0 &&
    item.status !== 'uncertain' &&
    item.status !== 'dismissed'

export const isGooglePushEligible = (item: CalendarItem): boolean =>
    item.deletedAt === undefined && item.status === 'verified' && isScheduledCalendarItem(item)

export const shouldAutoSyncGoogle = (settings: GoogleCalendarSettings): boolean =>
    settings.enabled &&
    settings.isConnected &&
    settings.autoSyncMinutes > 0 &&
    (settings.pushEnabled || settings.pullEnabled)
