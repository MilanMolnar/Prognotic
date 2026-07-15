// Production SyncStore backed by Supabase Postgres (or any Postgres).
// All queries are parameterized; the only interpolated fragments are table
// and column identifiers from the constant configs below, never user input.
//
// Last-write-wins is enforced atomically in SQL: the conditional upsert's
// WHERE clause re-evaluates against the latest committed row version, so
// two devices pushing the same entity concurrently cannot interleave into
// an older-write-wins state.

import type pg from 'pg'
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
import type { AppSettings, BlockMeta, CalendarItem, GlossaryEntry, Goal } from '../types/models.js'

type EntityRow = {
    id: string
    payload: unknown
    updated_at: number
    deleted_at: number | null
    server_updated_at: number
}

type EntityRecord<P> = {
    id: string
    payload: P | null
    updatedAt: number
    deletedAt: number | null
    serverUpdatedAt: number
}

type EntityTable = {
    table: 'sync_goals' | 'sync_calendar_items' | 'sync_glossary_entries'
    payloadColumn: 'goal' | 'item' | 'entry'
}

const GOALS: EntityTable = { table: 'sync_goals', payloadColumn: 'goal' }
const CALENDAR: EntityTable = { table: 'sync_calendar_items', payloadColumn: 'item' }
const GLOSSARY: EntityTable = { table: 'sync_glossary_entries', payloadColumn: 'entry' }

const fromRow = <P>(row: EntityRow): EntityRecord<P> => ({
    id: row.id,
    payload: (row.payload as P | null) ?? null,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    serverUpdatedAt: row.server_updated_at,
})

export class PostgresSyncStore implements SyncStore {
    constructor(private pool: pg.Pool) {}

    private async upsertEntityIfNewer<P>(
        { table, payloadColumn }: EntityTable,
        userId: string,
        incoming: EntityRecord<P>
    ): Promise<UpsertResult<EntityRecord<P>>> {
        const applied = await this.pool.query(
            `insert into ${table} (user_id, id, ${payloadColumn}, updated_at, deleted_at, server_updated_at)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (user_id, id) do update
             set ${payloadColumn} = excluded.${payloadColumn},
                 updated_at = excluded.updated_at,
                 deleted_at = excluded.deleted_at,
                 server_updated_at = excluded.server_updated_at
             where ${table}.updated_at < excluded.updated_at
             returning id`,
            [
                userId,
                incoming.id,
                incoming.payload === null ? null : JSON.stringify(incoming.payload),
                incoming.updatedAt,
                incoming.deletedAt,
                incoming.serverUpdatedAt,
            ]
        )
        if (applied.rowCount === 1) return { outcome: 'applied', current: incoming }

        const existing = await this.pool.query<EntityRow>(
            `select id, ${payloadColumn} as payload, updated_at, deleted_at, server_updated_at
             from ${table} where user_id = $1 and id = $2`,
            [userId, incoming.id]
        )
        const row = existing.rows[0]
        // The row was visible to the failed upsert, so it must exist; guard
        // anyway in case it was hard-purged in between.
        if (!row) return { outcome: 'applied', current: incoming }
        const current = fromRow<P>(row)
        return { outcome: compareForUpsert(incoming.updatedAt, current.updatedAt), current }
    }

    private async listEntitiesSince<P>(
        { table, payloadColumn }: EntityTable,
        userId: string,
        since: number
    ): Promise<EntityRecord<P>[]> {
        const result = await this.pool.query<EntityRow>(
            `select id, ${payloadColumn} as payload, updated_at, deleted_at, server_updated_at
             from ${table}
             where user_id = $1 and server_updated_at > $2
             order by server_updated_at asc`,
            [userId, since]
        )
        return result.rows.map((row) => fromRow<P>(row))
    }

    async upsertBlockIfNewer(userId: string, incoming: StoredBlock): Promise<UpsertResult<StoredBlock>> {
        const client = await this.pool.connect()
        try {
            await client.query('begin')
            const applied = await client.query(
                `insert into sync_blocks (user_id, id, meta, updated_at, deleted_at, server_updated_at)
                 values ($1, $2, $3, $4, $5, $6)
                 on conflict (user_id, id) do update
                 set meta = excluded.meta,
                     updated_at = excluded.updated_at,
                     deleted_at = excluded.deleted_at,
                     server_updated_at = excluded.server_updated_at
                 where sync_blocks.updated_at < excluded.updated_at
                 returning id`,
                [
                    userId,
                    incoming.id,
                    incoming.meta === null ? null : JSON.stringify(incoming.meta),
                    incoming.updatedAt,
                    incoming.deletedAt,
                    incoming.serverUpdatedAt,
                ]
            )

            if (applied.rowCount !== 1) {
                await client.query('rollback')
                const existing = await this.getBlock(userId, incoming.id)
                if (!existing) return { outcome: 'applied', current: incoming }
                return {
                    outcome: compareForUpsert(incoming.updatedAt, existing.updatedAt),
                    current: existing,
                }
            }

            let content = incoming.content
            if (incoming.deletedAt !== null) {
                // Tombstone: drop the markdown body immediately.
                await client.query(
                    'delete from sync_block_contents where user_id = $1 and block_id = $2',
                    [userId, incoming.id]
                )
                content = null
            } else if (incoming.content !== null) {
                await client.query(
                    `insert into sync_block_contents (user_id, block_id, content)
                     values ($1, $2, $3)
                     on conflict (user_id, block_id) do update set content = excluded.content`,
                    [userId, incoming.id, incoming.content]
                )
            } else {
                // Metadata-only change: keep whatever markdown is stored.
                const stored = await client.query<{ content: string }>(
                    'select content from sync_block_contents where user_id = $1 and block_id = $2',
                    [userId, incoming.id]
                )
                content = stored.rows[0]?.content ?? null
            }
            await client.query('commit')
            return { outcome: 'applied', current: { ...incoming, content } }
        } catch (error) {
            await client.query('rollback').catch(() => undefined)
            throw error
        } finally {
            client.release()
        }
    }

    private async getBlock(userId: string, id: string): Promise<StoredBlock | null> {
        const result = await this.pool.query<EntityRow & { content: string | null }>(
            `select b.id, b.meta as payload, b.updated_at, b.deleted_at, b.server_updated_at, c.content
             from sync_blocks b
             left join sync_block_contents c on c.user_id = b.user_id and c.block_id = b.id
             where b.user_id = $1 and b.id = $2`,
            [userId, id]
        )
        const row = result.rows[0]
        if (!row) return null
        return {
            id: row.id,
            meta: (row.payload as BlockMeta | null) ?? null,
            content: row.content,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at,
            serverUpdatedAt: row.server_updated_at,
        }
    }

    async listBlocksSince(userId: string, since: number): Promise<StoredBlock[]> {
        const result = await this.pool.query<EntityRow & { content: string | null }>(
            `select b.id, b.meta as payload, b.updated_at, b.deleted_at, b.server_updated_at, c.content
             from sync_blocks b
             left join sync_block_contents c on c.user_id = b.user_id and c.block_id = b.id
             where b.user_id = $1 and b.server_updated_at > $2
             order by b.server_updated_at asc`,
            [userId, since]
        )
        return result.rows.map((row) => ({
            id: row.id,
            meta: (row.payload as BlockMeta | null) ?? null,
            content: row.content,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at,
            serverUpdatedAt: row.server_updated_at,
        }))
    }

    async upsertGoalIfNewer(userId: string, incoming: StoredGoal): Promise<UpsertResult<StoredGoal>> {
        const result = await this.upsertEntityIfNewer<Goal>(GOALS, userId, {
            id: incoming.id,
            payload: incoming.goal,
            updatedAt: incoming.updatedAt,
            deletedAt: incoming.deletedAt,
            serverUpdatedAt: incoming.serverUpdatedAt,
        })
        return { outcome: result.outcome, current: toStoredGoal(result.current) }
    }

    async listGoalsSince(userId: string, since: number): Promise<StoredGoal[]> {
        const records = await this.listEntitiesSince<Goal>(GOALS, userId, since)
        return records.map(toStoredGoal)
    }

    async upsertCalendarItemIfNewer(
        userId: string,
        incoming: StoredCalendarItem
    ): Promise<UpsertResult<StoredCalendarItem>> {
        const result = await this.upsertEntityIfNewer<CalendarItem>(CALENDAR, userId, {
            id: incoming.id,
            payload: incoming.item,
            updatedAt: incoming.updatedAt,
            deletedAt: incoming.deletedAt,
            serverUpdatedAt: incoming.serverUpdatedAt,
        })
        return { outcome: result.outcome, current: toStoredCalendarItem(result.current) }
    }

    async listCalendarItemsSince(userId: string, since: number): Promise<StoredCalendarItem[]> {
        const records = await this.listEntitiesSince<CalendarItem>(CALENDAR, userId, since)
        return records.map(toStoredCalendarItem)
    }

    async upsertGlossaryEntryIfNewer(
        userId: string,
        incoming: StoredGlossaryEntry
    ): Promise<UpsertResult<StoredGlossaryEntry>> {
        const result = await this.upsertEntityIfNewer<GlossaryEntry>(GLOSSARY, userId, {
            id: incoming.id,
            payload: incoming.entry,
            updatedAt: incoming.updatedAt,
            deletedAt: incoming.deletedAt,
            serverUpdatedAt: incoming.serverUpdatedAt,
        })
        return { outcome: result.outcome, current: toStoredGlossaryEntry(result.current) }
    }

    async listGlossaryEntriesSince(userId: string, since: number): Promise<StoredGlossaryEntry[]> {
        const records = await this.listEntitiesSince<GlossaryEntry>(GLOSSARY, userId, since)
        return records.map(toStoredGlossaryEntry)
    }

    async putSettingsIfNewer(
        userId: string,
        incoming: StoredSettings
    ): Promise<UpsertResult<StoredSettings>> {
        const applied = await this.pool.query(
            `insert into sync_settings (user_id, value, updated_at, server_updated_at)
             values ($1, $2, $3, $4)
             on conflict (user_id) do update
             set value = excluded.value,
                 updated_at = excluded.updated_at,
                 server_updated_at = excluded.server_updated_at
             where sync_settings.updated_at < excluded.updated_at
             returning user_id`,
            [userId, JSON.stringify(incoming.value), incoming.updatedAt, incoming.serverUpdatedAt]
        )
        if (applied.rowCount === 1) return { outcome: 'applied', current: incoming }

        const existing = await this.getSettings(userId)
        if (!existing) return { outcome: 'applied', current: incoming }
        return { outcome: compareForUpsert(incoming.updatedAt, existing.updatedAt), current: existing }
    }

    async getSettings(userId: string): Promise<StoredSettings | null> {
        const result = await this.pool.query<{
            value: AppSettings
            updated_at: number
            server_updated_at: number
        }>('select value, updated_at, server_updated_at from sync_settings where user_id = $1', [
            userId,
        ])
        const row = result.rows[0]
        if (!row) return null
        return { value: row.value, updatedAt: row.updated_at, serverUpdatedAt: row.server_updated_at }
    }

    async touchDevice(userId: string, deviceId: string, now: number): Promise<void> {
        await this.pool.query(
            `insert into sync_devices (user_id, device_id, first_seen_at, last_synced_at)
             values ($1, $2, $3, $3)
             on conflict (user_id, device_id) do update set last_synced_at = excluded.last_synced_at`,
            [userId, deviceId, now]
        )
    }
}

const toStoredGoal = (record: EntityRecord<Goal>): StoredGoal => ({
    id: record.id,
    goal: record.payload,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    serverUpdatedAt: record.serverUpdatedAt,
})

const toStoredCalendarItem = (record: EntityRecord<CalendarItem>): StoredCalendarItem => ({
    id: record.id,
    item: record.payload,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    serverUpdatedAt: record.serverUpdatedAt,
})

const toStoredGlossaryEntry = (record: EntityRecord<GlossaryEntry>): StoredGlossaryEntry => ({
    id: record.id,
    entry: record.payload,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    serverUpdatedAt: record.serverUpdatedAt,
})
