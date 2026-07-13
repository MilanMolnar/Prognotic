# Prognotic app

Electron desktop app for local Markdown note capture and goal-based organization. This package is part of the [Prognotic repository](../README.md).

## Quick start

```bash
npm install
npm run dev
```

## What is implemented

- Quick Notes, Research, custom goals, pinned goals, and multi-goal blocks.
- Chat and Natural capture modes, MDXEditor, fuzzy search, Windows and macOS system dictation, and Wispr Flow dictation.
- Goal context menu: Rename, Edit description/routing hints, and Delete. Deletion preserves other categories and returns only otherwise-uncategorized blocks to Quick Notes.
- BYOK Gemini, OpenAI, Claude, and local LM Studio model selection with connection tests.
- Persistent, note-aware assistant conversations with relevance-ranked retrieval, streaming, clickable citations, rich scope filters, and per-conversation model overrides.
- Quick Note AI routing after close: click an existing-goal suggestion, or create and route to a green proposed goal when no existing goal fits confidently. Routed notes stay in Quick Notes for review, appear dimmed, move by capture mode, and remain unvisited in the destination goal until their emblem is acknowledged.
- Translate and Explain for full blocks or selected editor text, with Copy, Replace, and Continue in chat.
- Optional AI cleanup for Wispr Flow transcripts, with Retry and Use original recovery.
- Semantic goal matching across names, descriptions, and routing hints; honest low-confidence suggestions; sidebar unvisited counters; per-goal acknowledgement; and visible classification retry status.
- Folder-installed, manifest-driven plugins with scoped note blocks, host AI, local configuration/storage, and host-rendered views.
- A local-first month/week/day calendar extracted from notes across the vault, with validation badges and a one-at-a-time uncertain-time resolution queue.
- Optional two-way Google Calendar sync; imports require local validation and only verified Prognotic items can be exported.

## Settings and credentials

Settings controls block-window duration, capture mode, dictation, active AI provider/model, LM Studio loopback URL, and optional dictation polishing. API keys are encrypted with Electron `safeStorage`; Settings displays only whether a key is configured.

Google Calendar is off by default. Desktop OAuth client values and the refresh token are encrypted with `safeStorage`; event sync sends only verified appointment fields, never note bodies or block ids.

LM Studio must be running locally. The model picker lists only loaded LLM instances, not merely downloaded models.

## Storage

The app stores data in `~/NoteMark/`:

| File | Purpose |
|---|---|
| `{uuid}.md` | Block content |
| `index.json` | Block metadata and AI routing state |
| `goals.json` | Goals |
| `settings.json` | Public settings |
| `secrets.json` | Encrypted credentials |
| `assistant-history.json` | Recent assistant conversations |
| `calendar.json` | Calendar items, extraction state, Google mappings/tombstones, and sync token |
| `plugins/` | Manually installed plugin folders (`plugin.json` + CommonJS entry) |
| `plugin-state.json` | Enabled plugin ids, plugin configuration, and seed state |
| `plugin-data/` | Size-bounded, plugin-local JSON storage |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Electron development with HMR |
| `npm run build` | Type-check and build production bundles |
| `npm run typecheck` | TypeScript validation |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint |

For plugin development, see [docs/PLUGINS.md](./docs/PLUGINS.md). For architecture and IPC details, see [DEVELOPER.md](./DEVELOPER.md). For AI status and backlog, see [AI_PLAN.MD](../AI_PLAN.MD).
