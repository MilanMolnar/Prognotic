import type { CalendarItem } from '@shared/models'
import { describe, expect, it } from 'vitest'
import { temporalCandidateFingerprint, type TemporalCandidate } from './extraction'
import { reconcileNoteCalendarItems } from './reconcile'

const candidate = (sourceText = 'Dentist 2026-07-20 14:00'): TemporalCandidate => ({
    kind: 'concrete',
    title: 'Dentist',
    sourceText,
    confidence: 0.95,
    start: '2026-07-20T12:00:00.000Z',
    end: '2026-07-20T13:00:00.000Z',
    allDay: false
})

const existingItem = (source: TemporalCandidate, overrides: Partial<CalendarItem> = {}): CalendarItem => ({
    id: 'calendar-item',
    blockId: 'block',
    source: 'note',
    sourceOrder: 0,
    sourceText: source.sourceText,
    sourceFingerprint: temporalCandidateFingerprint(source),
    sourceBlockUpdatedAt: 10,
    title: source.title,
    excerpt: source.sourceText,
    status: 'dismissed',
    confidence: source.confidence,
    start: source.start,
    end: source.end,
    allDay: false,
    timeZone: 'Europe/Budapest',
    createdAt: 1,
    updatedAt: 2,
    ...overrides
})

const context = {
    blockId: 'block',
    blockUpdatedAt: 20,
    excerpt: 'Dentist',
    timeZone: 'Europe/Budapest',
    now: 30
}

describe('calendar note reconciliation', () => {
    it('keeps a dismissed item dismissed when temporal text is unchanged', () => {
        const source = candidate()
        const [result] = reconcileNoteCalendarItems([existingItem(source)], [source], context)
        expect(result.id).toBe('calendar-item')
        expect(result.status).toBe('dismissed')
    })

    it('reopens the stable item for validation when temporal text changes', () => {
        const previous = candidate()
        const changed = candidate('Dentist 2026-07-20 15:00')
        changed.start = '2026-07-20T13:00:00.000Z'
        changed.end = '2026-07-20T14:00:00.000Z'
        const [result] = reconcileNoteCalendarItems([existingItem(previous)], [changed], context)
        expect(result.id).toBe('calendar-item')
        expect(result.status).toBe('pending_validation')
        expect(result.start).toBe(changed.start)
    })

    it('keeps a tombstone when a Google-mapped note intent disappears', () => {
        const source = candidate()
        const mapped = existingItem(source, {
            status: 'verified',
            google: {
                calendarId: 'primary',
                eventId: 'google-event',
                lastSyncedAt: 10,
                lastSyncedLocalHash: 'hash'
            }
        })
        const [result] = reconcileNoteCalendarItems([mapped], [], context)
        expect(result.deletedAt).toBe(30)
        expect(result.google?.eventId).toBe('google-event')
    })

    it('ignores a stale extraction that finishes after a newer one', () => {
        const source = candidate()
        const newer = existingItem(source, { sourceBlockUpdatedAt: 50 })
        expect(reconcileNoteCalendarItems([newer], [], context)).toEqual([newer])
    })
})
