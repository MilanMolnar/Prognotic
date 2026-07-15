// Storage contract for synced vault data. Two implementations exist:
//   - PostgresSyncStore (src/db/postgresStore.ts) — production, Supabase
//   - MemorySyncStore   (src/db/memoryStore.ts)   — tests / local hacking
//
// Every record carries:
//   updatedAt       client-side last-write-wins timestamp (Unix ms). For
//                   tombstones this is the deletion time, so a single strict
//                   `incoming.updatedAt > existing.updatedAt` comparison
//                   resolves update-vs-update, delete-vs-update and revival.
//   deletedAt       tombstone marker (null while the entity is alive)
//   serverUpdatedAt server-assigned write time, the basis for pull cursors
//   payload         the client-shaped entity; null on tombstones whose
//                   payload the server never saw or has discarded

import type { AppSettings, BlockMeta, CalendarItem, GlossaryEntry, Goal } from '../types/models.js'

export type StoredBlock = {
    id: string
    meta: BlockMeta | null
    content: string | null
    updatedAt: number
    deletedAt: number | null
    serverUpdatedAt: number
}

export type StoredGoal = {
    id: string
    goal: Goal | null
    updatedAt: number
    deletedAt: number | null
    serverUpdatedAt: number
}

export type StoredCalendarItem = {
    id: string
    item: CalendarItem | null
    updatedAt: number
    deletedAt: number | null
    serverUpdatedAt: number
}

export type StoredGlossaryEntry = {
    id: string
    entry: GlossaryEntry | null
    updatedAt: number
    deletedAt: number | null
    serverUpdatedAt: number
}

export type StoredSettings = {
    value: AppSettings
    updatedAt: number
    serverUpdatedAt: number
}

export type UpsertOutcome = 'applied' | 'conflict' | 'unchanged'

export type UpsertResult<T> = {
    outcome: UpsertOutcome
    // The record now stored on the server. On 'applied' this echoes the
    // write; on 'conflict'/'unchanged' it is the winning server version so
    // clients can reconcile without an extra pull.
    current: T
}

// Writes must be atomic per record and apply last-write-wins:
//   - no existing record            -> applied
//   - incoming.updatedAt >  stored  -> applied (overwrites, including revival
//                                      of a tombstoned record)
//   - incoming.updatedAt == stored  -> unchanged (server copy wins; ties are
//                                      never overwritten so replays are safe)
//   - incoming.updatedAt <  stored  -> conflict
export interface SyncStore {
    upsertBlockIfNewer(userId: string, incoming: StoredBlock): Promise<UpsertResult<StoredBlock>>
    listBlocksSince(userId: string, since: number): Promise<StoredBlock[]>

    upsertGoalIfNewer(userId: string, incoming: StoredGoal): Promise<UpsertResult<StoredGoal>>
    listGoalsSince(userId: string, since: number): Promise<StoredGoal[]>

    upsertCalendarItemIfNewer(
        userId: string,
        incoming: StoredCalendarItem
    ): Promise<UpsertResult<StoredCalendarItem>>
    listCalendarItemsSince(userId: string, since: number): Promise<StoredCalendarItem[]>

    upsertGlossaryEntryIfNewer(
        userId: string,
        incoming: StoredGlossaryEntry
    ): Promise<UpsertResult<StoredGlossaryEntry>>
    listGlossaryEntriesSince(userId: string, since: number): Promise<StoredGlossaryEntry[]>

    putSettingsIfNewer(userId: string, incoming: StoredSettings): Promise<UpsertResult<StoredSettings>>
    getSettings(userId: string): Promise<StoredSettings | null>

    // Per-device bookkeeping (device registry + last sync time). Purely
    // observational in v1 — clients own their cursors — but it gives the
    // server the data needed for tombstone retention decisions later.
    touchDevice(userId: string, deviceId: string, now: number): Promise<void>
}

// Shared LWW decision used by both store implementations.
export const compareForUpsert = (
    incomingUpdatedAt: number,
    existingUpdatedAt: number
): UpsertOutcome => {
    if (incomingUpdatedAt > existingUpdatedAt) return 'applied'
    if (incomingUpdatedAt === existingUpdatedAt) return 'unchanged'
    return 'conflict'
}
