import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import {
    bearer,
    createTestApp,
    makeBlockMeta,
    makeCalendarItem,
    makeGlossaryEntry,
    makeGoal,
    makeSettings,
    registerAndLogin,
    sleep,
} from './helpers.js'

const DEVICE_A = randomUUID()
const DEVICE_B = randomUUID()

const push = (app: Express, token: string, body: object) =>
    request(app).post('/api/sync').set(bearer(token)).send(body)

const pull = (app: Express, token: string, since = 0, deviceId = DEVICE_B) =>
    request(app).get('/api/sync').set(bearer(token)).query({ since, deviceId })

describe('sync', () => {
    it('pushes a full vault from device A and pulls it on device B', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const meta = makeBlockMeta({ excerpt: 'Grocery run' })
        const goal = makeGoal()
        const calendarItem = makeCalendarItem()
        const glossaryEntry = makeGlossaryEntry()
        const settings = makeSettings()

        const pushed = await push(app, token, {
            deviceId: DEVICE_A,
            blocks: { upserts: [{ meta, content: '# Groceries\n\n- oat milk\n- bread' }] },
            goals: { upserts: [{ ...goal, updatedAt: goal.createdAt }] },
            calendarItems: { upserts: [calendarItem] },
            glossaryEntries: { upserts: [glossaryEntry] },
            settings: { value: settings, updatedAt: 1_700_000_000_000 },
        })
        expect(pushed.status).toBe(200)
        expect(pushed.body.results.blocks.applied).toEqual([meta.id])
        expect(pushed.body.results.goals.applied).toEqual([goal.id])
        expect(pushed.body.results.calendarItems.applied).toEqual([calendarItem.id])
        expect(pushed.body.results.glossaryEntries.applied).toEqual([glossaryEntry.id])
        expect(pushed.body.results.settings.outcome).toBe('applied')
        expect(pushed.body.cursor).toBeTypeOf('number')

        const pulled = await pull(app, token)
        expect(pulled.status).toBe(200)
        expect(pulled.body.blocks).toHaveLength(1)
        expect(pulled.body.blocks[0].meta).toEqual(meta)
        expect(pulled.body.blocks[0].content).toBe('# Groceries\n\n- oat milk\n- bread')
        expect(pulled.body.blocks[0].deletedAt).toBeNull()
        expect(pulled.body.goals[0].goal).toEqual(goal)
        expect(pulled.body.calendarItems[0].item).toEqual(calendarItem)
        expect(pulled.body.glossaryEntries[0].entry).toEqual(glossaryEntry)
        expect(pulled.body.glossaryEntries[0].deletedAt).toBeNull()
        expect(pulled.body.settings.value).toEqual(settings)
    })

    it('keeps stored markdown on a metadata-only block update', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const meta = makeBlockMeta()
        await push(app, token, {
            deviceId: DEVICE_A,
            blocks: { upserts: [{ meta, content: 'original body' }] },
        })

        // Re-categorization bumps nothing but categories + updatedAt and
        // sends no content (mirrors updateBlockCategories on the client).
        const recategorized = { ...meta, categories: ['research'], updatedAt: meta.updatedAt + 1 }
        const pushed = await push(app, token, {
            deviceId: DEVICE_A,
            blocks: { upserts: [{ meta: recategorized }] },
        })
        expect(pushed.body.results.blocks.applied).toEqual([meta.id])

        const pulled = await pull(app, token)
        expect(pulled.body.blocks[0].meta.categories).toEqual(['research'])
        expect(pulled.body.blocks[0].content).toBe('original body')
    })

    it('resolves concurrent edits with last-write-wins and reports conflicts', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const meta = makeBlockMeta()
        await push(app, token, {
            deviceId: DEVICE_A,
            blocks: { upserts: [{ meta: { ...meta, updatedAt: 2000 }, content: 'newer text' }] },
        })

        // Device B pushes a stale edit (older updatedAt) — it must lose and
        // receive the winning server record for local reconciliation.
        const stale = await push(app, token, {
            deviceId: DEVICE_B,
            blocks: { upserts: [{ meta: { ...meta, updatedAt: 1000 }, content: 'stale text' }] },
        })
        expect(stale.body.results.blocks.applied).toEqual([])
        expect(stale.body.results.blocks.conflicts).toHaveLength(1)
        expect(stale.body.results.blocks.conflicts[0].id).toBe(meta.id)
        expect(stale.body.results.blocks.conflicts[0].server.content).toBe('newer text')

        const pulled = await pull(app, token)
        expect(pulled.body.blocks[0].content).toBe('newer text')
    })

    it('treats replays of the same push as unchanged (idempotency)', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const meta = makeBlockMeta()
        const body = {
            deviceId: DEVICE_A,
            blocks: { upserts: [{ meta, content: 'same text' }] },
        }
        const first = await push(app, token, body)
        expect(first.body.results.blocks.applied).toEqual([meta.id])

        const replay = await push(app, token, body)
        expect(replay.body.results.blocks.applied).toEqual([])
        expect(replay.body.results.blocks.conflicts).toEqual([])
        expect(replay.body.results.blocks.unchanged).toEqual([meta.id])

        const pulled = await pull(app, token)
        expect(pulled.body.blocks).toHaveLength(1)
        expect(pulled.body.blocks[0].content).toBe('same text')
    })

    it('propagates deletes as tombstones and supports revival by a newer edit', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const meta = makeBlockMeta({ updatedAt: 1000 })
        const goal = makeGoal()
        await push(app, token, {
            deviceId: DEVICE_A,
            blocks: { upserts: [{ meta, content: 'to be deleted' }] },
            goals: { upserts: [{ ...goal, updatedAt: 1000 }] },
        })

        const deleted = await push(app, token, {
            deviceId: DEVICE_A,
            blocks: { deletes: [{ id: meta.id, deletedAt: 2000 }] },
            goals: { deletes: [{ id: goal.id, deletedAt: 2000 }] },
        })
        expect(deleted.body.results.blocks.applied).toEqual([meta.id])
        expect(deleted.body.results.goals.applied).toEqual([goal.id])

        // Device B still sees the tombstone so it can delete locally; the
        // payload and markdown are gone from the server.
        const pulled = await pull(app, token)
        expect(pulled.body.blocks[0].deletedAt).toBe(2000)
        expect(pulled.body.blocks[0].meta).toBeNull()
        expect(pulled.body.blocks[0].content).toBeNull()
        expect(pulled.body.goals[0].deletedAt).toBe(2000)
        expect(pulled.body.goals[0].goal).toBeNull()

        // An edit stamped after the deletion revives the block.
        const revived = await push(app, token, {
            deviceId: DEVICE_B,
            blocks: { upserts: [{ meta: { ...meta, updatedAt: 3000 }, content: 'back again' }] },
        })
        expect(revived.body.results.blocks.applied).toEqual([meta.id])
        const afterRevival = await pull(app, token)
        expect(afterRevival.body.blocks[0].deletedAt).toBeNull()
        expect(afterRevival.body.blocks[0].content).toBe('back again')
    })

    it('applies LWW, tombstones, and revival to glossary entries', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const entry = makeGlossaryEntry({ updatedAt: 2000 })
        await push(app, token, {
            deviceId: DEVICE_A,
            glossaryEntries: { upserts: [entry] },
        })

        // A stale edit from another device loses and gets the winner back.
        const stale = await push(app, token, {
            deviceId: DEVICE_B,
            glossaryEntries: {
                upserts: [{ ...entry, explanation: 'Outdated explanation.', updatedAt: 1000 }],
            },
        })
        expect(stale.body.results.glossaryEntries.applied).toEqual([])
        expect(stale.body.results.glossaryEntries.conflicts).toHaveLength(1)
        expect(stale.body.results.glossaryEntries.conflicts[0].server.entry.explanation).toBe(
            entry.explanation
        )

        // Delete tombstones the entry; the payload is gone from pulls.
        const deleted = await push(app, token, {
            deviceId: DEVICE_A,
            glossaryEntries: { deletes: [{ id: entry.id, deletedAt: 3000 }] },
        })
        expect(deleted.body.results.glossaryEntries.applied).toEqual([entry.id])
        const pulled = await pull(app, token)
        expect(pulled.body.glossaryEntries[0].deletedAt).toBe(3000)
        expect(pulled.body.glossaryEntries[0].entry).toBeNull()

        // A newer edit revives it.
        const revived = await push(app, token, {
            deviceId: DEVICE_B,
            glossaryEntries: { upserts: [{ ...entry, updatedAt: 4000 }] },
        })
        expect(revived.body.results.glossaryEntries.applied).toEqual([entry.id])
        const afterRevival = await pull(app, token)
        expect(afterRevival.body.glossaryEntries[0].deletedAt).toBeNull()
        expect(afterRevival.body.glossaryEntries[0].entry).toEqual({ ...entry, updatedAt: 4000 })
    })

    it('rejects glossary entries beyond the client hard limits', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const overlongKey = await push(app, token, {
            deviceId: DEVICE_A,
            glossaryEntries: { upserts: [makeGlossaryEntry({ key: 'k'.repeat(301) })] },
        })
        expect(overlongKey.status).toBe(400)
        expect(overlongKey.body.error).toBe('Invalid sync payload')

        const emptyExplanation = await push(app, token, {
            deviceId: DEVICE_A,
            glossaryEntries: { upserts: [makeGlossaryEntry({ explanation: '' })] },
        })
        expect(emptyExplanation.status).toBe(400)
    })

    it('accepts calendar tombstones both as deletedAt upserts and explicit deletes', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        // Google-linked items stay around client-side as tombstones with a
        // payload; locally hard-deleted items arrive as bare deletes.
        const googleLinked = makeCalendarItem({ deletedAt: 5000 })
        const hardDeletedId = randomUUID()
        const pushed = await push(app, token, {
            deviceId: DEVICE_A,
            calendarItems: {
                upserts: [googleLinked],
                deletes: [{ id: hardDeletedId, deletedAt: 5000 }],
            },
        })
        expect(pushed.body.results.calendarItems.applied).toEqual(
            expect.arrayContaining([googleLinked.id, hardDeletedId])
        )

        const pulled = await pull(app, token)
        const byId = new Map(
            (pulled.body.calendarItems as { id: string; item: unknown; deletedAt: number | null }[]).map(
                (record) => [record.id, record]
            )
        )
        expect(byId.get(googleLinked.id)?.deletedAt).toBe(5000)
        expect(byId.get(googleLinked.id)?.item).toEqual(googleLinked)
        expect(byId.get(hardDeletedId)?.deletedAt).toBe(5000)
        expect(byId.get(hardDeletedId)?.item).toBeNull()
    })

    it('supports incremental pulls via the cursor', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const first = makeBlockMeta()
        await push(app, token, {
            deviceId: DEVICE_A,
            blocks: { upserts: [{ meta: first, content: 'first' }] },
        })
        const bootstrap = await pull(app, token)
        expect(bootstrap.body.blocks).toHaveLength(1)
        const cursor = bootstrap.body.cursor as number

        // Ensure the next write lands on a later millisecond than the cursor
        // (production uses a 5s overlap window instead; tests run with 0).
        await sleep(10)

        const second = makeBlockMeta()
        await push(app, token, {
            deviceId: DEVICE_A,
            blocks: { upserts: [{ meta: second, content: 'second' }] },
        })

        const incremental = await pull(app, token, cursor)
        expect(incremental.body.blocks).toHaveLength(1)
        expect(incremental.body.blocks[0].id).toBe(second.id)
        // Settings unchanged since the cursor are not re-sent.
        expect(incremental.body.settings).toBeNull()
    })

    it('strips unknown fields so raw API keys can never be stored', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const settings = makeSettings()
        const poisoned = {
            ...settings,
            geminiApiKey: 'sk-super-secret-value',
            llm: { ...settings.llm, apiKey: 'sk-another-secret' },
        }
        const pushed = await push(app, token, {
            deviceId: DEVICE_A,
            settings: { value: poisoned, updatedAt: 1_700_000_000_000 },
        })
        expect(pushed.status).toBe(200)
        expect(pushed.body.results.settings.outcome).toBe('applied')

        const pulled = await pull(app, token)
        expect(pulled.body.settings.value).toEqual(settings)
        expect(JSON.stringify(pulled.body)).not.toContain('sk-super-secret-value')
        expect(JSON.stringify(pulled.body)).not.toContain('sk-another-secret')
    })

    it('isolates users from each other', async () => {
        const { app } = createTestApp()
        const tokenA = await registerAndLogin(app, 'alice@example.com')
        const tokenB = await registerAndLogin(app, 'bob@example.com')

        await push(app, tokenA, {
            deviceId: DEVICE_A,
            blocks: { upserts: [{ meta: makeBlockMeta(), content: 'alice private note' }] },
        })

        const bobPull = await pull(app, tokenB)
        expect(bobPull.body.blocks).toEqual([])
        expect(bobPull.body.goals).toEqual([])
        expect(bobPull.body.glossaryEntries).toEqual([])
        expect(bobPull.body.settings).toBeNull()
    })

    it('rejects malformed push payloads with 400', async () => {
        const { app } = createTestApp()
        const token = await registerAndLogin(app, 'milan@example.com')

        const missingDevice = await push(app, token, {
            blocks: { upserts: [] },
        })
        expect(missingDevice.status).toBe(400)

        const badBlock = await push(app, token, {
            deviceId: DEVICE_A,
            blocks: { upserts: [{ meta: { id: 'not-a-uuid' } }] },
        })
        expect(badBlock.status).toBe(400)
        expect(badBlock.body.error).toBe('Invalid sync payload')
    })
})
