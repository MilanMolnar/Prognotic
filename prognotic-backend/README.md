# prognotic-backend

Cloud sync server for Prognotic (NoteMark). Provides email/password accounts
(Better Auth) and multi-device push/pull sync of the vault — note blocks,
goals, calendar items, glossary entries, and public app settings — stored in
Supabase Postgres.

The API mirrors the Electron client's domain model
(`note-app/src/shared/models.ts`): same field names, UUID ids, Unix-ms
timestamps. Clients can serialize their local state verbatim.

**Never synced:** `secrets.json` (LLM API keys, Google OAuth client/refresh
tokens, Wispr Flow key), the Google Calendar `syncToken`, assistant chat
history, and plugin state. The settings schema whitelists public fields only;
unknown keys are stripped at validation, so a raw credential cannot reach the
database through any endpoint.

## Stack

- Node.js 20.19+ / TypeScript, ESM
- Express 5
- [Better Auth](https://better-auth.com) — email/password, cookie sessions +
  bearer tokens (for Electron/mobile)
- Supabase Postgres via `pg` (parameterized SQL, no ORM)
- zod for request validation, vitest + supertest for tests

## Setup

### 1. Create a Supabase project

1. [supabase.com](https://supabase.com) → New project (any region/plan).
2. Project Settings → Database → Connection string → copy the **session
   pooler** URI (port 5432).
3. That URI (with your database password filled in) is your `DATABASE_URL`.
   Any other Postgres works too — Supabase is not required at runtime, only a
   Postgres connection string.

### 2. Configure the environment

```bash
cd prognotic-backend
npm install
cp .env.example .env
# fill in DATABASE_URL and BETTER_AUTH_SECRET (openssl rand -base64 32)
```

### 3. Run migrations

```bash
npm run db:migrate
```

Applies `db/migrations/*.sql` in order and records them in `_migrations`:

- `0001_better_auth.sql` — Better Auth core tables (`user`, `session`,
  `account`, `verification`), verified against better-auth 1.6.23. After a
  better-auth upgrade, re-check with `npx @better-auth/cli generate`.
- `0002_sync_tables.sql` — sync tables (see [Data model](#data-model)).
- `0003_glossary.sql` — `sync_glossary_entries` for the client's Glossary
  page (`glossary.json`).

### 4. Run

```bash
npm run dev        # tsx watch mode
npm run build      # compile to dist/
npm start          # run compiled server
npm run typecheck
npm test
```

## API

All requests/response bodies are JSON. Authenticated routes accept either the
Better Auth session cookie or `Authorization: Bearer <token>`.

### Health

```
GET /health   ->  { "ok": true, "service": "prognotic-backend", "time": 1783978960982 }
```

### Auth (Better Auth, mounted at `/api/auth`)

| Route | Purpose |
|---|---|
| `POST /api/auth/sign-up/email` | Register — body `{ email, password, name }` |
| `POST /api/auth/sign-in/email` | Login — body `{ email, password }` |
| `POST /api/auth/sign-out` | Invalidate the current session |
| `GET  /api/auth/get-session` | Current session + user |

On sign-in (and sign-up) the response includes the session token both in the
body and in the `set-auth-token` response header. Non-browser clients store
that token and send it as a Bearer header; browsers can rely on the httpOnly
session cookie instead. Passwords are hashed by Better Auth (scrypt);
minimum length 8. `/api/auth/*` is rate-limited per IP
(`AUTH_RATE_LIMIT` per 15 minutes).

```bash
curl -s http://localhost:3001/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"milan@example.com","password":"correct-horse-battery","name":"Milan"}'

TOKEN=$(curl -si http://localhost:3001/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"milan@example.com","password":"correct-horse-battery"}' \
  | grep -i '^set-auth-token:' | cut -d' ' -f2 | tr -d '\r')

curl -s http://localhost:3001/api/auth/get-session -H "Authorization: Bearer $TOKEN"
```

### Sync

Two endpoints, both authenticated. Entities are keyed by client-generated id
(UUIDs for blocks/goals, opaque strings for calendar items) and scoped to the
authenticated user — no cross-user access is possible.

#### `GET /api/sync?since=<cursor>&deviceId=<uuid>` — pull

- `since` omitted or `0` → full bootstrap pull.
- `since=<cursor from a previous response>` → incremental pull.
- `deviceId` (query or `x-device-id` header) is optional on pull and updates
  the device registry.

```jsonc
// 200 response
{
  "blocks": [
    {
      "id": "0d9c…",                    // BlockMeta.id
      "meta": { /* BlockMeta, exactly as in the client's index.json */ },
      "content": "# markdown body",     // the block's {uuid}.md content
      "updatedAt": 1783970000000,
      "deletedAt": null                  // set (and meta/content null) on tombstones
    }
  ],
  "goals":           [ { "id": "…", "goal": { /* Goal */ }, "updatedAt": 1783970000000, "deletedAt": null } ],
  "calendarItems":   [ { "id": "…", "item": { /* CalendarItem */ }, "updatedAt": 1783970000000, "deletedAt": null } ],
  "glossaryEntries": [ { "id": "…", "entry": { /* GlossaryEntry */ }, "updatedAt": 1783970000000, "deletedAt": null } ],
  "settings":      { "value": { /* AppSettings */ }, "updatedAt": 1783970000000 },  // null if unchanged since cursor
  "serverTime": 1783978960982,
  "cursor": 1783978960982                // pass as ?since= on the next pull
}
```

#### `POST /api/sync` — push

```jsonc
{
  "deviceId": "b32d55e8-…",             // required; stable per installation
  "blocks": {
    "upserts": [ { "meta": { /* BlockMeta */ }, "content": "# markdown" } ],
    "deletes": [ { "id": "0d9c…", "deletedAt": 1783978000000 } ]
  },
  "goals": {
    "upserts": [ { /* Goal fields */, "updatedAt": 1783978000000 } ],  // envelope adds updatedAt (Goal has none)
    "deletes": [ { "id": "…", "deletedAt": 1783978000000 } ]
  },
  "calendarItems": {
    "upserts": [ { /* CalendarItem; may carry deletedAt as a tombstone */ } ],
    "deletes": [ { "id": "…", "deletedAt": 1783978000000 } ]           // for items hard-removed locally
  },
  "glossaryEntries": {
    "upserts": [ { /* GlossaryEntry (carries its own updatedAt) */ } ],
    "deletes": [ { "id": "…", "deletedAt": 1783978000000 } ]
  },
  "settings": { "value": { /* AppSettings */ }, "updatedAt": 1783978000000 }
}
```

Omitting `content` on a block upsert means "metadata-only change, keep the
stored markdown" (re-categorization, routing updates). Always send `content`
when creating a block. Batches are capped at 500 items per array; send
multiple pushes for larger backlogs.

```jsonc
// 200 response
{
  "results": {
    "blocks":        { "applied": ["0d9c…"], "unchanged": [], "conflicts": [ { "id": "…", "server": { /* winning record */ } } ] },
    "goals":           { "applied": [], "unchanged": [], "conflicts": [] },
    "calendarItems":   { "applied": [], "unchanged": [], "conflicts": [] },
    "glossaryEntries": { "applied": [], "unchanged": [], "conflicts": [] },
    "settings":      { "outcome": "applied", "server": { "value": { /* … */ }, "updatedAt": 1783978000000 } }
  },
  "serverTime": 1783978960982,
  "cursor": 1783978960982
}
```

Malformed payloads return `400 { "error": "Invalid sync payload", "issues": [...] }`.
Unauthenticated requests return `401`. Other failures return a generic `500`;
details are only logged server-side.

## Sync protocol

- **Conflict resolution — last-write-wins.** Every entity carries a
  client-stamped `updatedAt` (Unix ms). A push wins only if its timestamp is
  **strictly newer** than the stored one. Equal timestamps keep the server
  copy and report `unchanged`, which makes replaying a batch idempotent.
  Losing pushes are reported under `conflicts` together with the winning
  server record, so the loser can reconcile locally without an extra pull.
- **Deletes — tombstones.** A delete stores `deletedAt` and clears the
  payload (and the block's markdown). Tombstones are returned by pulls so
  every device observes the deletion. An edit stamped after the deletion
  revives the entity. Tombstones are retained indefinitely in v1; a
  retention/purge job ("purge tombstones older than the stalest device's
  `last_synced_at`, minimum 30 days") is the documented v2 plan — the
  `sync_devices` table already records what it needs.
- **Cursors.** Every write gets a server-assigned `server_updated_at`; pulls
  return `cursor = serverTime` and `?since=` filters on
  `server_updated_at > since - 5000`. The 5-second overlap window guarantees
  writes that commit concurrently with a pull are never skipped; re-delivered
  records are harmless because upserts are idempotent under LWW.
- **Devices.** `deviceId` is a client-generated stable UUID. The server keeps
  a per-user device registry (`first_seen_at` / `last_synced_at`) for future
  retention decisions; clients own their own cursors.
- **Goals have no `updatedAt` in the client model** — the sync envelope adds
  one, stamped by the client whenever the goal is created or edited.

## Data model

| Table | Keys | Contents |
|---|---|---|
| `user`, `session`, `account`, `verification` | Better Auth | accounts, hashed passwords, sessions |
| `sync_blocks` | PK `(user_id, id uuid)` | `meta jsonb` (BlockMeta), `updated_at`, `deleted_at`, `server_updated_at` (all bigint ms) |
| `sync_block_contents` | PK `(user_id, block_id)` | `content text` — the block's markdown, stored apart from metadata like the client's `index.json` vs `{uuid}.md` split |
| `sync_goals` | PK `(user_id, id uuid)` | `goal jsonb` (Goal) + LWW columns |
| `sync_calendar_items` | PK `(user_id, id text)` | `item jsonb` (CalendarItem incl. `google` link metadata) + LWW columns |
| `sync_glossary_entries` | PK `(user_id, id uuid)` | `entry jsonb` (GlossaryEntry) + LWW columns; case-insensitive key uniqueness stays a client concern |
| `sync_settings` | PK `user_id` | `value jsonb` (AppSettings, public fields only) + LWW columns |
| `sync_devices` | PK `(user_id, device_id)` | `first_seen_at`, `last_synced_at` |

Each entity table has an index on `(user_id, server_updated_at)` for
incremental pulls. All `user_id` columns cascade-delete with the account.
LWW is enforced atomically in SQL (`ON CONFLICT … DO UPDATE … WHERE
stored.updated_at < excluded.updated_at`), so concurrent pushes cannot
interleave into an older-write-wins state.

## Security

- All sync routes require a valid session; per-user isolation is enforced by
  scoping every query to the authenticated `user_id`.
- zod validates every request; unknown object keys are stripped
  (credential values cannot be smuggled into settings).
- Parameterized queries only; identifiers are compile-time constants.
- `/api/auth` is rate-limited per IP.
- Generic client-facing error messages; details stay in server logs.
  Passwords/tokens are never logged.
- CORS origins are an explicit allowlist from `CORS_ORIGINS`.

## Testing

`npm test` runs integration tests (vitest + supertest) against the real
Express app with Better Auth on its in-memory adapter and the in-memory
`SyncStore` — no database or network required. Covered: registration, login,
session, sign-out, 401s, full push/pull round trip, metadata-only updates,
LWW conflicts, idempotent replays, tombstones + revival, calendar tombstone
variants, glossary LWW/tombstone/limit enforcement, incremental cursors,
secret stripping, cross-user isolation, and payload validation.

`PostgresSyncStore` implements the same `SyncStore` contract with the LWW
comparison pushed into SQL; it is exercised by typecheck/build and requires a
live database to integration-test (run migrations, set `DATABASE_URL`).

## Deferred to v2

- Assistant chat history (`assistant-history.json`) sync
- Plugin state (`plugin-state.json`, `plugin-data/`) sync
- `CalendarStoreState.extractedBlocks` (device-local extraction cache;
  `sourceFingerprint` already prevents duplicate extraction)
- Tombstone purge job (retention data already collected)
- Real-time change notification (WebSockets/SSE) — v1 clients poll pull
- Electron/web/mobile client integration
