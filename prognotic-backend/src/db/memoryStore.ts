// In-memory SyncStore used by the test suite (and handy for local hacking).
// Implements the exact LWW semantics documented on the SyncStore interface.

import {
    compareForUpsert,
    type StoredBlock,
    type StoredCalendarItem,
    type StoredGlossaryEntry,
    type StoredGoal,
    type StoredSettings,
    type SyncStore,
    type UpsertResult,
} from '../sync/store.js'

type DeviceInfo = { firstSeenAt: number; lastSyncedAt: number }

const clone = <T>(value: T): T => structuredClone(value)

type Keyed = { id: string; updatedAt: number; deletedAt: number | null; serverUpdatedAt: number }

const upsertIfNewer = <T extends Keyed>(
    table: Map<string, T>,
    incoming: T,
    merge?: (incoming: T, existing: T) => T
): UpsertResult<T> => {
    const existing = table.get(incoming.id)
    if (!existing) {
        table.set(incoming.id, clone(incoming))
        return { outcome: 'applied', current: clone(incoming) }
    }
    const outcome = compareForUpsert(incoming.updatedAt, existing.updatedAt)
    if (outcome !== 'applied') return { outcome, current: clone(existing) }
    const next = merge ? merge(incoming, existing) : incoming
    table.set(incoming.id, clone(next))
    return { outcome, current: clone(next) }
}

const listSince = <T extends Keyed>(table: Map<string, T> | undefined, since: number): T[] => {
    if (!table) return []
    return [...table.values()]
        .filter((record) => record.serverUpdatedAt > since)
        .sort((a, b) => a.serverUpdatedAt - b.serverUpdatedAt)
        .map(clone)
}

export class MemorySyncStore implements SyncStore {
    private blocks = new Map<string, Map<string, StoredBlock>>()
    private goals = new Map<string, Map<string, StoredGoal>>()
    private calendarItems = new Map<string, Map<string, StoredCalendarItem>>()
    private glossaryEntries = new Map<string, Map<string, StoredGlossaryEntry>>()
    private settings = new Map<string, StoredSettings>()
    private devices = new Map<string, Map<string, DeviceInfo>>()

    private table<T>(root: Map<string, Map<string, T>>, userId: string): Map<string, T> {
        let table = root.get(userId)
        if (!table) {
            table = new Map()
            root.set(userId, table)
        }
        return table
    }

    async upsertBlockIfNewer(userId: string, incoming: StoredBlock): Promise<UpsertResult<StoredBlock>> {
        return upsertIfNewer(this.table(this.blocks, userId), incoming, (next, existing) =>
            // A live metadata-only update (content null) keeps the stored
            // markdown; tombstones always clear it.
            next.deletedAt === null && next.content === null
                ? { ...next, content: existing.content }
                : next
        )
    }

    async listBlocksSince(userId: string, since: number): Promise<StoredBlock[]> {
        return listSince(this.blocks.get(userId), since)
    }

    async upsertGoalIfNewer(userId: string, incoming: StoredGoal): Promise<UpsertResult<StoredGoal>> {
        return upsertIfNewer(this.table(this.goals, userId), incoming)
    }

    async listGoalsSince(userId: string, since: number): Promise<StoredGoal[]> {
        return listSince(this.goals.get(userId), since)
    }

    async upsertCalendarItemIfNewer(
        userId: string,
        incoming: StoredCalendarItem
    ): Promise<UpsertResult<StoredCalendarItem>> {
        return upsertIfNewer(this.table(this.calendarItems, userId), incoming)
    }

    async listCalendarItemsSince(userId: string, since: number): Promise<StoredCalendarItem[]> {
        return listSince(this.calendarItems.get(userId), since)
    }

    async upsertGlossaryEntryIfNewer(
        userId: string,
        incoming: StoredGlossaryEntry
    ): Promise<UpsertResult<StoredGlossaryEntry>> {
        return upsertIfNewer(this.table(this.glossaryEntries, userId), incoming)
    }

    async listGlossaryEntriesSince(userId: string, since: number): Promise<StoredGlossaryEntry[]> {
        return listSince(this.glossaryEntries.get(userId), since)
    }

    async putSettingsIfNewer(
        userId: string,
        incoming: StoredSettings
    ): Promise<UpsertResult<StoredSettings>> {
        const existing = this.settings.get(userId)
        if (!existing) {
            this.settings.set(userId, clone(incoming))
            return { outcome: 'applied', current: clone(incoming) }
        }
        const outcome = compareForUpsert(incoming.updatedAt, existing.updatedAt)
        if (outcome !== 'applied') return { outcome, current: clone(existing) }
        this.settings.set(userId, clone(incoming))
        return { outcome, current: clone(incoming) }
    }

    async getSettings(userId: string): Promise<StoredSettings | null> {
        const stored = this.settings.get(userId)
        return stored ? clone(stored) : null
    }

    async touchDevice(userId: string, deviceId: string, now: number): Promise<void> {
        const table = this.table(this.devices, userId)
        const existing = table.get(deviceId)
        table.set(deviceId, {
            firstSeenAt: existing?.firstSeenAt ?? now,
            lastSyncedAt: now,
        })
    }
}
