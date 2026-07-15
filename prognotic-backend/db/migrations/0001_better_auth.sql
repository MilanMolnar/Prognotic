-- Better Auth core schema (verified against better-auth 1.6.23 via
-- getAuthTables() with emailAndPassword + bearer enabled).
-- Column names are camelCase because Better Auth's Kysely adapter quotes
-- identifiers; keep them quoted here and in any manual queries.
-- If you upgrade better-auth, re-check with: npx @better-auth/cli generate

create table if not exists "user" (
    "id" text not null primary key,
    "name" text not null,
    "email" text not null unique,
    "emailVerified" boolean not null default false,
    "image" text,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null default now()
);

create table if not exists "session" (
    "id" text not null primary key,
    "expiresAt" timestamptz not null,
    "token" text not null unique,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null,
    "ipAddress" text,
    "userAgent" text,
    "userId" text not null references "user" ("id") on delete cascade
);

create index if not exists "session_userId_idx" on "session" ("userId");

create table if not exists "account" (
    "id" text not null primary key,
    "accountId" text not null,
    "providerId" text not null,
    "userId" text not null references "user" ("id") on delete cascade,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamptz,
    "refreshTokenExpiresAt" timestamptz,
    "scope" text,
    "password" text,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null
);

create index if not exists "account_userId_idx" on "account" ("userId");

create table if not exists "verification" (
    "id" text not null primary key,
    "identifier" text not null,
    "value" text not null,
    "expiresAt" timestamptz not null,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null default now()
);

create index if not exists "verification_identifier_idx" on "verification" ("identifier");
