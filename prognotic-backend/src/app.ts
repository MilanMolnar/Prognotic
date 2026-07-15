import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { toNodeHandler } from 'better-auth/node'
import type { Auth } from './auth/auth.js'
import { requireAuth } from './auth/middleware.js'
import { createSyncRouter } from './routes/sync.js'
import { DEFAULT_CURSOR_OVERLAP_MS, type SyncConfig } from './sync/engine.js'
import type { SyncStore } from './sync/store.js'

export type AppDeps = {
    auth: Auth
    store: SyncStore
    // Exact allowed origins for browser clients; empty = no browser origins
    // (native clients are unaffected by CORS).
    corsOrigins: string[]
    // Requests allowed per IP on /api/auth per 15-minute window.
    authRateLimit?: number
    trustProxy?: boolean
    sync?: SyncConfig
}

export const createApp = (deps: AppDeps): express.Express => {
    const app = express()
    app.disable('x-powered-by')
    // Behind a reverse proxy (Railway/Fly/etc.) the client IP arrives in
    // X-Forwarded-For; without this, rate limiting would key on the proxy.
    if (deps.trustProxy) app.set('trust proxy', 1)

    app.get('/health', (_req: Request, res: Response) => {
        res.json({ ok: true, service: 'prognotic-backend', time: Date.now() })
    })

    app.use(
        cors({
            origin: deps.corsOrigins,
            credentials: true,
        })
    )

    app.use(
        '/api/auth',
        rateLimit({
            windowMs: 15 * 60 * 1000,
            limit: deps.authRateLimit ?? 100,
            standardHeaders: true,
            legacyHeaders: false,
            message: { error: 'Too many requests, slow down' },
        })
    )

    // Better Auth owns everything under /api/auth. Its handler consumes the
    // raw request body, so it MUST be mounted before express.json().
    app.all('/api/auth/*splat', toNodeHandler(deps.auth))

    app.use(express.json({ limit: '16mb' }))

    const syncConfig = deps.sync ?? { cursorOverlapMs: DEFAULT_CURSOR_OVERLAP_MS }
    app.use('/api/sync', requireAuth(deps.auth), createSyncRouter(deps.store, syncConfig))

    app.use((_req: Request, res: Response) => {
        res.status(404).json({ error: 'Not found' })
    })

    // Clients get a generic message; details stay in server logs. Express 5
    // forwards rejected async handlers here automatically.
    app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
        console.error('unhandled request error:', error)
        if (res.headersSent) return
        res.status(500).json({ error: 'Internal server error' })
    })

    return app
}
