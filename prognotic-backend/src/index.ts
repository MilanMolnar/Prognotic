import 'dotenv/config'
import { createApp } from './app.js'
import { createAuth } from './auth/auth.js'
import { createPool } from './db/pool.js'
import { PostgresSyncStore } from './db/postgresStore.js'
import { loadEnv } from './env.js'

const env = loadEnv()

const pool = createPool(env.DATABASE_URL, env.DATABASE_SSL)
const store = new PostgresSyncStore(pool)
const auth = createAuth({
    database: pool,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.corsOrigins,
})

const app = createApp({
    auth,
    store,
    corsOrigins: env.corsOrigins,
    authRateLimit: env.AUTH_RATE_LIMIT,
    trustProxy: env.TRUST_PROXY,
})

const server = app.listen(env.PORT, () => {
    console.log(`prognotic-backend listening on port ${env.PORT}`)
})

const shutdown = (signal: string): void => {
    console.log(`${signal} received, shutting down`)
    server.close(() => {
        pool.end()
            .catch((error) => console.error('error closing pool:', error))
            .finally(() => process.exit(0))
    })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
