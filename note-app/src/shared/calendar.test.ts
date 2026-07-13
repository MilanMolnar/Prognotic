import { describe, expect, it } from 'vitest'
import {
    countPendingCalendarItems,
    countUncertainCalendarItems,
    hasUncertainCalendarItems,
    isGooglePushEligible,
    shouldAutoSyncGoogle
} from './calendar'
import type { CalendarItem, CalendarItemStatus } from './models'

const item = (status: CalendarItemStatus, overrides: Partial<CalendarItem> = {}): CalendarItem => ({
    id: `${status}-${Math.random()}`,
    source: 'note',
    sourceOrder: 0,
    sourceText: 'Dentist Tuesday at 3pm',
    sourceFingerprint: 'fingerprint',
    title: 'Dentist',
    excerpt: 'Dentist Tuesday at 3pm',
    status,
    confidence: 0.9,
    start: '2026-07-14T13:00:00.000Z',
    end: '2026-07-14T14:00:00.000Z',
    allDay: false,
    timeZone: 'Europe/Budapest',
    createdAt: 1,
    updatedAt: 1,
    ...overrides
})

describe('calendar presence helpers', () => {
    it('counts only pending validation items for the green badge', () => {
        expect(countPendingCalendarItems([
            item('pending_validation'),
            item('verified'),
            item('uncertain'),
            item('pending_validation', { deletedAt: 2 })
        ])).toBe(1)
    })

    it('uses a boolean uncertain indicator rather than a numeric badge', () => {
        const items = [item('uncertain'), item('uncertain'), item('dismissed')]
        expect(countUncertainCalendarItems(items)).toBe(2)
        expect(hasUncertainCalendarItems(items)).toBe(true)
        expect(hasUncertainCalendarItems([item('dismissed')])).toBe(false)
    })

    it('allows only verified scheduled items to be pushed to Google', () => {
        expect(isGooglePushEligible(item('verified'))).toBe(true)
        expect(isGooglePushEligible(item('pending_validation'))).toBe(false)
        expect(isGooglePushEligible(item('verified', { start: undefined }))).toBe(false)
    })

    it('never schedules Google network work while sync is disabled', () => {
        const settings = {
            enabled: false,
            pushEnabled: true,
            pullEnabled: true,
            autoSyncMinutes: 15,
            hasOAuthClient: true,
            isConnected: true,
            lastSyncStatus: 'idle' as const
        }
        expect(shouldAutoSyncGoogle(settings)).toBe(false)
        expect(shouldAutoSyncGoogle({ ...settings, enabled: true })).toBe(true)
    })
})
