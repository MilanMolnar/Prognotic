import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import type { Auth } from './auth.js'

// Resolves the Better Auth session (cookie or bearer token) and stashes the
// user id in res.locals.userId for downstream handlers. Rejects with a
// generic 401 — no detail about whether the token was missing, expired, or
// malformed.
export const requireAuth = (auth: Auth): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
        if (!session) {
            res.status(401).json({ error: 'Unauthorized' })
            return
        }
        res.locals.userId = session.user.id
        next()
    }
}

export const authedUserId = (res: Response): string => {
    const userId = res.locals.userId
    if (typeof userId !== 'string' || userId.length === 0) {
        // requireAuth must run before any handler calling this.
        throw new Error('authedUserId called on an unauthenticated request')
    }
    return userId
}
