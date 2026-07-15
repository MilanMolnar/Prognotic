import pg from 'pg'

// Sync timestamps are stored as bigint (Unix ms). node-postgres returns
// int8 as strings by default; ms timestamps fit comfortably in a JS number
// (safe up to 2^53), so parse them globally.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value))

export type DatabaseSslMode = 'require' | 'strict' | 'disable'

// 'require'  — TLS on, certificate chain not verified. Works out of the box
//              with the Supabase connection pooler.
// 'strict'   — TLS on with full certificate verification.
// 'disable'  — plain TCP, for local Postgres only.
export const createPool = (connectionString: string, sslMode: DatabaseSslMode): pg.Pool =>
    new pg.Pool({
        connectionString,
        ssl:
            sslMode === 'disable'
                ? undefined
                : sslMode === 'strict'
                  ? true
                  : { rejectUnauthorized: false },
        max: 10,
    })
