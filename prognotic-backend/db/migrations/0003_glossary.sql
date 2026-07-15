-- Glossary entries (mirrors glossary.json entries: GlossaryEntry from
-- note-app/src/shared/models.ts). Same conventions as 0002_sync_tables.sql:
-- updated_at is the client LWW timestamp, deleted_at marks tombstones (entry
-- payload null), server_updated_at drives incremental pulls. Ids are client
-- crypto.randomUUID() values. Case-insensitive key uniqueness is a client
-- concern — the server resolves conflicts per entry id only.
create table if not exists sync_glossary_entries (
    user_id text not null references "user" ("id") on delete cascade,
    id uuid not null,
    entry jsonb,
    updated_at bigint not null,
    deleted_at bigint,
    server_updated_at bigint not null,
    primary key (user_id, id)
);

create index if not exists sync_glossary_entries_user_server_updated_idx
    on sync_glossary_entries (user_id, server_updated_at);
