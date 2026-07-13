import type { CalendarItem } from '@shared/models'
import { describe, expect, it } from 'vitest'
import {
    calendarItemSyncHash,
    findCalendarItemForGoogleEvent,
    googleEventPayloadForItem
} from './syncHelpers'

const item: CalendarItem = {
    id: 'local-item',
    blockId: 'private-block-id',
    source: 'note',
    sourceOrder: 0,
    sourceText: 'Dentist Tuesday at 3pm',
    sourceFingerprint: 'fingerprint',
    title: 'Dentist',
    excerpt: 'Private note excerpt that must not sync',
    status: 'verified',
    confidence: 0.9,
    start: '2026-07-14T13:00:00.000Z',
    end: '2026-07-14T14:00:00.000Z',
    allDay: false,
    timeZone: 'Europe/Budapest',
    createdAt: 1,
    updatedAt: 1,
    google: {
        calendarId: 'primary',
        eventId: 'google-event',
        lastSyncedAt: 1,
        lastSyncedLocalHash: 'old-hash'
    }
}

describe('Google Calendar sync mapping', () => {
    it('sends only appointment fields and a stable item id', () => {
        const payload = googleEventPayloadForItem(item)
        expect(payload).toEqual({
            summary: 'Dentist',
            start: { dateTime: item.start, timeZone: item.timeZone },
            end: { dateTime: item.end, timeZone: item.timeZone },
            extendedProperties: { private: { prognoticItemId: item.id } }
        })
        expect(JSON.stringify(payload)).not.toContain(item.blockId)
        expect(JSON.stringify(payload)).not.toContain(item.excerpt)
    })

    it('finds mappings by private stable id or persisted Google event id', () => {
        expect(findCalendarItemForGoogleEvent([item], {
            id: 'other',
            extendedProperties: { private: { prognoticItemId: item.id } }
        })).toBe(item)
        expect(findCalendarItemForGoogleEvent([item], { id: 'google-event' })).toBe(item)
    })

    it('changes the sync hash only when exported fields change', () => {
        const privateTextChanged: CalendarItem = { ...item, excerpt: 'Changed private text' }
        expect(calendarItemSyncHash(privateTextChanged)).toBe(calendarItemSyncHash(item))
        expect(calendarItemSyncHash({ ...item, title: 'Updated dentist' })).not.toBe(calendarItemSyncHash(item))
    })
})
