import { Router, type Request, type Response } from 'express'
import { authedUserId } from '../auth/middleware.js'
import { processPull, processPush, type SyncConfig } from '../sync/engine.js'
import type { SyncStore } from '../sync/store.js'
import { pullQuerySchema, pushRequestSchema } from '../validation/schemas.js'

// GET  /api/sync — pull changes since a cursor (0 / omitted = full pull)
// POST /api/sync — push a batch of local changes
// Both require authentication (mounted behind requireAuth in app.ts).
export const createSyncRouter = (store: SyncStore, config: SyncConfig): Router => {
    const router = Router()

    router.get('/', async (req: Request, res: Response) => {
        const parsed = pullQuerySchema.safeParse({
            since: req.query.since ?? undefined,
            deviceId: req.query.deviceId ?? req.header('x-device-id') ?? undefined,
        })
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid sync query' })
            return
        }
        const response = await processPull(store, authedUserId(res), parsed.data, Date.now(), config)
        res.json(response)
    })

    router.post('/', async (req: Request, res: Response) => {
        const parsed = pushRequestSchema.safeParse(req.body)
        if (!parsed.success) {
            res.status(400).json({
                error: 'Invalid sync payload',
                issues: parsed.error.issues.map((issue) => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                })),
            })
            return
        }
        const response = await processPush(store, authedUserId(res), parsed.data, Date.now())
        res.json(response)
    })

    return router
}
