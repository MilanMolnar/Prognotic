// Push/pull sync logic, independent of Express and of the storage backend.
//
// Conflict resolution: last-write-wins on the client-supplied updatedAt
// (Unix ms), compared strictly per entity. Equal timestamps keep the server
// copy ('unchanged'), which makes re-pushing the same batch idempotent.
// Losing pushes are reported as conflicts together with the winning server
// record so the client can reconcile locally without an extra pull.
//
// Deletes are tombstones: the record survives with deletedAt set and its
// payload cleared, so every device eventually observes the deletion. An
// update with a newer updatedAt than the tombstone revives the entity.
//
// Pull cursors are server-assigned write times (serverUpdatedAt). A pull
// re-reads a small overlap window behind the client's cursor so writes that
// commit concurrently with a pull are never skipped; the LWW rules above
// make re-delivered records harmless.

import type { PushRequest } from '../validation/schemas.js'
import type {
    StoredBlock,
    StoredCalendarItem,
    StoredGlossaryEntry,
    StoredGoal,
    StoredSettings,
    SyncStore,
    UpsertOutcome,
} from './store.js'
import type { AppSettings, BlockMeta, CalendarItem, GlossaryEntry, Goal } from '../types/models.js'

export const DEFAULT_CURSOR_OVERLAP_MS = 5000

export type SyncConfig = {
    cursorOverlapMs: number
}

// Client-facing record shapes (stored records minus server bookkeeping).
export type BlockRecord = {
    id: string
    meta: BlockMeta | null
    content: string | null
    updatedAt: number
    deletedAt: number | null
}

export type GoalRecord = {
    id: string
    goal: Goal | null
    updatedAt: number
    deletedAt: number | null
}

export type CalendarItemRecord = {
    id: string
    item: CalendarItem | null
    updatedAt: number
    deletedAt: number | null
}

export type GlossaryEntryRecord = {
    id: string
    entry: GlossaryEntry | null
    updatedAt: number
    deletedAt: number | null
}

export type SettingsRecord = {
    value: AppSettings
    updatedAt: number
}

export type EntityPushResult<T> = {
    applied: string[]
    unchanged: string[]
    conflicts: { id: string; server: T }[]
}

export type PushResponse = {
    results: {
        blocks: EntityPushResult<BlockRecord>
        goals: EntityPushResult<GoalRecord>
        calendarItems: EntityPushResult<CalendarItemRecord>
        glossaryEntries: EntityPushResult<GlossaryEntryRecord>
        settings: { outcome: UpsertOutcome; server: SettingsRecord } | null
    }
    serverTime: number
    cursor: number
}

export type PullResponse = {
    blocks: BlockRecord[]
    goals: GoalRecord[]
    calendarItems: CalendarItemRecord[]
    glossaryEntries: GlossaryEntryRecord[]
    settings: SettingsRecord | null
    serverTime: number
    cursor: number
}

const toBlockRecord = (stored: StoredBlock): BlockRecord => ({
    id: stored.id,
    meta: stored.meta,
    content: stored.content,
    updatedAt: stored.updatedAt,
    deletedAt: stored.deletedAt,
})

const toGoalRecord = (stored: StoredGoal): GoalRecord => ({
    id: stored.id,
    goal: stored.goal,
    updatedAt: stored.updatedAt,
    deletedAt: stored.deletedAt,
})

const toCalendarItemRecord = (stored: StoredCalendarItem): CalendarItemRecord => ({
    id: stored.id,
    item: stored.item,
    updatedAt: stored.updatedAt,
    deletedAt: stored.deletedAt,
})

const toGlossaryEntryRecord = (stored: StoredGlossaryEntry): GlossaryEntryRecord => ({
    id: stored.id,
    entry: stored.entry,
    updatedAt: stored.updatedAt,
    deletedAt: stored.deletedAt,
})

const toSettingsRecord = (stored: StoredSettings): SettingsRecord => ({
    value: stored.value,
    updatedAt: stored.updatedAt,
})

const emptyResult = <T>(): EntityPushResult<T> => ({ applied: [], unchanged: [], conflicts: [] })

const record = <T>(result: EntityPushResult<T>, id: string, outcome: UpsertOutcome, server: T): void => {
    if (outcome === 'applied') result.applied.push(id)
    else if (outcome === 'unchanged') result.unchanged.push(id)
    else result.conflicts.push({ id, server })
}

export const processPush = async (
    store: SyncStore,
    userId: string,
    push: PushRequest,
    now: number
): Promise<PushResponse> => {
    await store.touchDevice(userId, push.deviceId, now)

    const blocks = emptyResult<BlockRecord>()
    for (const upsert of push.blocks?.upserts ?? []) {
        const incoming: StoredBlock = {
            id: upsert.meta.id,
            meta: upsert.meta,
            // null = metadata-only change; the store keeps its existing
            // markdown. Clients must send content when creating a block.
            content: upsert.content ?? null,
            updatedAt: upsert.meta.updatedAt,
            deletedAt: null,
            serverUpdatedAt: now,
        }
        const { outcome, current } = await store.upsertBlockIfNewer(userId, incoming)
        record(blocks, incoming.id, outcome, toBlockRecord(current))
    }
    for (const del of push.blocks?.deletes ?? []) {
        const incoming: StoredBlock = {
            id: del.id,
            meta: null,
            content: null,
            updatedAt: del.deletedAt,
            deletedAt: del.deletedAt,
            serverUpdatedAt: now,
        }
        const { outcome, current } = await store.upsertBlockIfNewer(userId, incoming)
        record(blocks, del.id, outcome, toBlockRecord(current))
    }

    const goals = emptyResult<GoalRecord>()
    for (const upsert of push.goals?.upserts ?? []) {
        const { updatedAt, ...goal } = upsert
        const incoming: StoredGoal = {
            id: goal.id,
            goal,
            updatedAt,
            deletedAt: null,
            serverUpdatedAt: now,
        }
        const { outcome, current } = await store.upsertGoalIfNewer(userId, incoming)
        record(goals, goal.id, outcome, toGoalRecord(current))
    }
    for (const del of push.goals?.deletes ?? []) {
        const incoming: StoredGoal = {
            id: del.id,
            goal: null,
            updatedAt: del.deletedAt,
            deletedAt: del.deletedAt,
            serverUpdatedAt: now,
        }
        const { outcome, current } = await store.upsertGoalIfNewer(userId, incoming)
        record(goals, del.id, outcome, toGoalRecord(current))
    }

    const calendarItems = emptyResult<CalendarItemRecord>()
    for (const item of push.calendarItems?.upserts ?? []) {
        // An upserted item that already carries deletedAt (a client-side
        // tombstone, e.g. a Google-linked event awaiting remote deletion)
        // is stored as a tombstone but keeps its payload.
        const incoming: StoredCalendarItem = {
            id: item.id,
            item,
            updatedAt: Math.max(item.updatedAt, item.deletedAt ?? 0),
            deletedAt: item.deletedAt ?? null,
            serverUpdatedAt: now,
        }
        const { outcome, current } = await store.upsertCalendarItemIfNewer(userId, incoming)
        record(calendarItems, item.id, outcome, toCalendarItemRecord(current))
    }
    for (const del of push.calendarItems?.deletes ?? []) {
        const incoming: StoredCalendarItem = {
            id: del.id,
            item: null,
            updatedAt: del.deletedAt,
            deletedAt: del.deletedAt,
            serverUpdatedAt: now,
        }
        const { outcome, current } = await store.upsertCalendarItemIfNewer(userId, incoming)
        record(calendarItems, del.id, outcome, toCalendarItemRecord(current))
    }

    const glossaryEntries = emptyResult<GlossaryEntryRecord>()
    for (const entry of push.glossaryEntries?.upserts ?? []) {
        const incoming: StoredGlossaryEntry = {
            id: entry.id,
            entry,
            updatedAt: entry.updatedAt,
            deletedAt: null,
            serverUpdatedAt: now,
        }
        const { outcome, current } = await store.upsertGlossaryEntryIfNewer(userId, incoming)
        record(glossaryEntries, entry.id, outcome, toGlossaryEntryRecord(current))
    }
    for (const del of push.glossaryEntries?.deletes ?? []) {
        const incoming: StoredGlossaryEntry = {
            id: del.id,
            entry: null,
            updatedAt: del.deletedAt,
            deletedAt: del.deletedAt,
            serverUpdatedAt: now,
        }
        const { outcome, current } = await store.upsertGlossaryEntryIfNewer(userId, incoming)
        record(glossaryEntries, del.id, outcome, toGlossaryEntryRecord(current))
    }

    let settings: PushResponse['results']['settings'] = null
    if (push.settings) {
        const { outcome, current } = await store.putSettingsIfNewer(userId, {
            value: push.settings.value,
            updatedAt: push.settings.updatedAt,
            serverUpdatedAt: now,
        })
        settings = { outcome, server: toSettingsRecord(current) }
    }

    return {
        results: { blocks, goals, calendarItems, glossaryEntries, settings },
        serverTime: now,
        cursor: now,
    }
}

export const processPull = async (
    store: SyncStore,
    userId: string,
    query: { since: number; deviceId?: string | undefined },
    now: number,
    config: SyncConfig = { cursorOverlapMs: DEFAULT_CURSOR_OVERLAP_MS }
): Promise<PullResponse> => {
    if (query.deviceId) await store.touchDevice(userId, query.deviceId, now)

    // Re-read a small window behind the cursor so a write that committed
    // while the previous pull was in flight is never skipped forever.
    const since = Math.max(0, query.since - config.cursorOverlapMs)

    const [blocks, goals, calendarItems, glossaryEntries, storedSettings] = await Promise.all([
        store.listBlocksSince(userId, since),
        store.listGoalsSince(userId, since),
        store.listCalendarItemsSince(userId, since),
        store.listGlossaryEntriesSince(userId, since),
        store.getSettings(userId),
    ])

    const settings =
        storedSettings && storedSettings.serverUpdatedAt > since
            ? toSettingsRecord(storedSettings)
            : null

    return {
        blocks: blocks.map(toBlockRecord),
        goals: goals.map(toGoalRecord),
        calendarItems: calendarItems.map(toCalendarItemRecord),
        glossaryEntries: glossaryEntries.map(toGlossaryEntryRecord),
        settings,
        serverTime: now,
        cursor: now,
    }
}
