// Minimal forward-only SQL migration runner.
// Applies db/migrations/*.sql in filename order, recording applied files in
// a _migrations table so re-runs are no-ops. Each migration runs in its own
// transaction.
//
// Usage: npm run db:migrate   (reads DATABASE_URL / DATABASE_SSL from .env)

import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createPool, type DatabaseSslMode } from '../src/db/pool.js'

const migrationsDir = fileURLToPath(new URL('../db/migrations/', import.meta.url))

const main = async (): Promise<void> => {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
        console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
        process.exitCode = 1
        return
    }
    const sslMode = (process.env.DATABASE_SSL ?? 'require') as DatabaseSslMode

    const pool = createPool(databaseUrl, sslMode)
    try {
        await pool.query(
            `create table if not exists _migrations (
                name text not null primary key,
                applied_at timestamptz not null default now()
            )`
        )

        const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
        const appliedResult = await pool.query<{ name: string }>('select name from _migrations')
        const applied = new Set(appliedResult.rows.map((row) => row.name))

        for (const file of files) {
            if (applied.has(file)) {
                console.log(`skip    ${file} (already applied)`)
                continue
            }
            const sql = await readFile(join(migrationsDir, file), 'utf8')
            const client = await pool.connect()
            try {
                await client.query('begin')
                await client.query(sql)
                await client.query('insert into _migrations (name) values ($1)', [file])
                await client.query('commit')
                console.log(`applied ${file}`)
            } catch (error) {
                await client.query('rollback').catch(() => undefined)
                throw error
            } finally {
                client.release()
            }
        }
        console.log('migrations up to date')
    } finally {
        await pool.end()
    }
}

main().catch((error) => {
    console.error('migration failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
})
