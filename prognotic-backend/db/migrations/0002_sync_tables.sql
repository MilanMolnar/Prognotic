-- Synced vault data, one row per entity per user.
--
-- Conventions (mirroring the Electron client's local persistence):
--   * updated_at / deleted_at / server_updated_at are Unix milliseconds
--     (bigint), matching BlockMeta.createdAt/updatedAt on the client.
--   * updated_at is the client's last-write-wins timestamp. For tombstones
--     it equals deleted_at, so one comparison resolves every conflict.
--   * server_updated_at is assigned by the server on every write and drives
--     incremental pulls (`where server_updated_at > $cursor`).
--   * Payload columns are jsonb snapshots of the client-shaped entity
--     (BlockMeta / Goal / CalendarItem / AppSettings from
--     note-app/src/shared/models.ts). They are null on tombstones.
--   * Secrets are never stored: the API whitelists public settings fields
--     and there is no column for credential values anywhere.

-- Block metadata (mirrors index.json entries: BlockMeta).
create table if not exists sync_blocks (
    user_id text not null references "user" ("id") on delete cascade,
    id uuid not null,
    meta jsonb,
    updated_at bigint not null,
    deleted_at bigint,
    server_updated_at bigint not null,
    primary key (user_id, id)
);

create index if not exists sync_blocks_user_server_updated_idx
    on sync_blocks (user_id, server_updated_at);

-- Block markdown bodies (mirrors the per-block {uuid}.md files). Stored
-- separately from metadata, exactly like the client keeps index.json apart
-- from the markdown files. Content rows are removed when a block is
-- tombstoned.
create table if not exists sync_block_contents (
    user_id text not null,
    block_id uuid not null,
    content text not null,
    primary key (user_id, block_id),
    foreign key (user_id, block_id) references sync_blocks (user_id, id) on delete cascade
);

-- Goals (mirrors goals.json: Goal). The client model has no updatedAt, so
-- the sync envelope's updated_at lives only in this table.
create table if not exists sync_goals (
    user_id text not null references "user" ("id") on delete cascade,
    id uuid not null,
    goal jsonb,
    updated_at bigint not null,
    deleted_at bigint,
    server_updated_at bigint not null,
    primary key (user_id, id)
);

create index if not exists sync_goals_user_server_updated_idx
    on sync_goals (user_id, server_updated_at);

-- Calendar items (mirrors calendar.json items: CalendarItem, including the
-- google link metadata). The account-level Google syncToken is deliberately
-- never synced. Item ids are opaque client strings, not necessarily UUIDs.
create table if not exists sync_calendar_items (
    user_id text not null references "user" ("id") on delete cascade,
    id text not null,
    item jsonb,
    updated_at bigint not null,
    deleted_at bigint,
    server_updated_at bigint not null,
    primary key (user_id, id)
);

create index if not exists sync_calendar_items_user_server_updated_idx
    on sync_calendar_items (user_id, server_updated_at);

-- Public app settings (mirrors settings.json: AppSettings) as a single
-- per-user document.
create table if not exists sync_settings (
    user_id text not null primary key references "user" ("id") on delete cascade,
    value jsonb not null,
    updated_at bigint not null,
    server_updated_at bigint not null
);

-- Device registry: one row per client installation, updated on every sync.
-- Supports future tombstone retention decisions ("purge tombstones older
-- than the stalest active device").
create table if not exists sync_devices (
    user_id text not null references "user" ("id") on delete cascade,
    device_id uuid not null,
    first_seen_at bigint not null,
    last_synced_at bigint not null,
    primary key (user_id, device_id)
);
