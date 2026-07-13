import { appDirectory, calendarFileName, fileEncoding } from '@shared/constants'
import type { CalendarItem, CalendarItemStatus } from '@shared/models'
import { ensureDir, readFile, rename, writeFile } from 'fs-extra'
import { homedir } from 'os'
import { join } from 'path'

export type CalendarStoreState = {
    version: 1
    items: Record<string, CalendarItem>
    extractedBlocks: Record<string, number>
    google: {
        syncToken?: string
        accountEmail?: string
    }
}

const calendarPath = (): string => join(homedir(), appDirectory, calendarFileName)
const systemTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const validStatuses = new Set<CalendarItemStatus>([
    'pending_validation',
    'verified',
    'uncertain',
    'resolved',
    'dismissed'
])

const normalizeItem = (raw: unknown): CalendarItem | null => {
    if (!raw || typeof raw !== 'object') return null
    const item = raw as Partial<CalendarItem>
    if (
        typeof item.id !== 'string' ||
        typeof item.title !== 'string' ||
        typeof item.status !== 'string' ||
        !validStatuses.has(item.status as CalendarItemStatus)
    ) return null

    const now = Date.now()
    const google = item.google &&
        typeof item.google.calendarId === 'string' &&
        typeof item.google.eventId === 'string' &&
        typeof item.google.lastSyncedAt === 'number' &&
        Number.isFinite(item.google.lastSyncedAt) &&
        typeof item.google.lastSyncedLocalHash === 'string'
        ? {
            calendarId: item.google.calendarId,
            eventId: item.google.eventId,
            ...(typeof item.google.etag === 'string' ? { etag: item.google.etag } : {}),
            ...(typeof item.google.remoteUpdatedAt === 'number' && Number.isFinite(item.google.remoteUpdatedAt)
                ? { remoteUpdatedAt: item.google.remoteUpdatedAt }
                : {}),
            lastSyncedAt: item.google.lastSyncedAt,
            lastSyncedLocalHash: item.google.lastSyncedLocalHash
        }
        : undefined
    const resolution = item.resolution &&
        (item.resolution.type === 'validated' ||
            item.resolution.type === 'accepted_suggestion' ||
            item.resolution.type === 'custom_time' ||
            item.resolution.type === 'manual_edit') &&
        typeof item.resolution.resolvedAt === 'number' &&
        Number.isFinite(item.resolution.resolvedAt)
        ? item.resolution
        : undefined
    return {
        id: item.id,
        ...(typeof item.blockId === 'string' ? { blockId: item.blockId } : {}),
        source: item.source === 'google' ? 'google' : 'note',
        sourceOrder: typeof item.sourceOrder === 'number' && Number.isFinite(item.sourceOrder)
            ? Math.max(0, Math.round(item.sourceOrder))
            : 0,
        sourceText: typeof item.sourceText === 'string' ? item.sourceText : '',
        sourceFingerprint: typeof item.sourceFingerprint === 'string'
            ? item.sourceFingerprint
            : item.id,
        ...(typeof item.sourceBlockUpdatedAt === 'number' && Number.isFinite(item.sourceBlockUpdatedAt)
            ? { sourceBlockUpdatedAt: item.sourceBlockUpdatedAt }
            : {}),
        title: item.title.trim().slice(0, 160) || 'Untitled event',
        excerpt: typeof item.excerpt === 'string' ? item.excerpt.slice(0, 500) : '',
        status: item.status as CalendarItemStatus,
        confidence: typeof item.confidence === 'number' && Number.isFinite(item.confidence)
            ? Math.max(0, Math.min(1, item.confidence))
            : 0,
        ...(typeof item.start === 'string' ? { start: item.start } : {}),
        ...(typeof item.end === 'string' ? { end: item.end } : {}),
        allDay: item.allDay === true,
        timeZone: typeof item.timeZone === 'string' && item.timeZone ? item.timeZone : systemTimeZone(),
        ...(typeof item.suggestedStart === 'string' ? { suggestedStart: item.suggestedStart } : {}),
        ...(typeof item.suggestedEnd === 'string' ? { suggestedEnd: item.suggestedEnd } : {}),
        ...(resolution ? { resolution } : {}),
        ...(google ? { google } : {}),
        createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
            ? item.createdAt
            : now,
        updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
            ? item.updatedAt
            : now,
        ...(typeof item.deletedAt === 'number' && Number.isFinite(item.deletedAt)
            ? { deletedAt: item.deletedAt }
            : {}),
    }
}

const emptyState = (): CalendarStoreState => ({ version: 1, items: {}, extractedBlocks: {}, google: {} })

const loadCalendarState = async (): Promise<CalendarStoreState> => {
    try {
        const parsed = JSON.parse(await readFile(calendarPath(), { encoding: fileEncoding })) as {
            items?: unknown
            extractedBlocks?: unknown
            google?: unknown
        }
        const entries = parsed.items && typeof parsed.items === 'object'
            ? Object.values(parsed.items as Record<string, unknown>)
            : []
        const items: Record<string, CalendarItem> = {}
        for (const raw of entries) {
            const item = normalizeItem(raw)
            if (item) items[item.id] = item
        }
        const google = parsed.google && typeof parsed.google === 'object'
            ? parsed.google as { syncToken?: unknown; accountEmail?: unknown }
            : {}
        const extractedBlocks = parsed.extractedBlocks && typeof parsed.extractedBlocks === 'object'
            ? Object.fromEntries(Object.entries(parsed.extractedBlocks as Record<string, unknown>)
                .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])))
            : {}
        return {
            version: 1,
            items,
            extractedBlocks,
            google: {
                ...(typeof google.syncToken === 'string' ? { syncToken: google.syncToken } : {}),
                ...(typeof google.accountEmail === 'string' ? { accountEmail: google.accountEmail } : {})
            }
        }
    } catch {
        return emptyState()
    }
}

const saveCalendarState = async (state: CalendarStoreState): Promise<void> => {
    const root = join(homedir(), appDirectory)
    await ensureDir(root)
    const path = calendarPath()
    const temporary = `${path}.tmp`
    await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: fileEncoding })
    await rename(temporary, path)
}

let calendarLock: Promise<unknown> = Promise.resolve()

const withCalendarLock = <T>(task: () => Promise<T>): Promise<T> => {
    const run = calendarLock.then(task, task)
    calendarLock = run.catch(() => undefined)
    return run
}

export const readCalendarState = async (): Promise<CalendarStoreState> =>
    withCalendarLock(loadCalendarState)

export const mutateCalendarState = async <T>(
    mutate: (state: CalendarStoreState) => T | Promise<T>
): Promise<T> => withCalendarLock(async () => {
    const state = await loadCalendarState()
    const result = await mutate(state)
    await saveCalendarState(state)
    return result
})

export const getCalendarItems = async (): Promise<CalendarItem[]> => {
    const state = await readCalendarState()
    return Object.values(state.items)
        .filter((item) => item.deletedAt === undefined)
        .sort((a, b) => a.createdAt - b.createdAt)
}

export const removeCalendarItemsForBlock = async (blockId: string): Promise<void> => {
    await mutateCalendarState((state) => {
        delete state.extractedBlocks[blockId]
        const now = Date.now()
        for (const item of Object.values(state.items)) {
            if (item.blockId !== blockId) continue
            if (item.google) {
                item.deletedAt = now
                item.updatedAt = now
            } else {
                delete state.items[item.id]
            }
        }
    })
}

export const clearGoogleSyncToken = async (): Promise<void> => {
    await mutateCalendarState((state) => {
        delete state.google.syncToken
    })
}

export const prepareGoogleAccount = async (email: string): Promise<void> => {
    await mutateCalendarState((state) => {
        const previousEmail = state.google.accountEmail
        if (previousEmail && previousEmail.toLowerCase() !== email.toLowerCase()) {
            for (const item of Object.values(state.items)) {
                if (item.source === 'google') delete state.items[item.id]
                else delete item.google
            }
        }
        state.google.accountEmail = email
        delete state.google.syncToken
    })
}
