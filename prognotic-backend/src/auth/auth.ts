import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { bearer } from 'better-auth/plugins/bearer'

export type CreateAuthOptions = {
    // pg.Pool in production; better-auth's memoryAdapter in tests.
    database: BetterAuthOptions['database']
    baseURL: string
    secret: string
    trustedOrigins?: string[]
}

// Email/password auth with cookie sessions plus the bearer plugin: on
// sign-in the session token is echoed in the `set-auth-token` response
// header, and clients without a cookie jar (Electron main process, mobile)
// authenticate with `Authorization: Bearer <token>`.
export const createAuth = (options: CreateAuthOptions) =>
    betterAuth({
        database: options.database,
        baseURL: options.baseURL,
        basePath: '/api/auth',
        secret: options.secret,
        trustedOrigins: options.trustedOrigins ?? [],
        emailAndPassword: {
            enabled: true,
            minPasswordLength: 8,
        },
        plugins: [bearer()],
    })

export type Auth = ReturnType<typeof createAuth>
