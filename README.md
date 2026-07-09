# Prognotic

Prognotic is a local-first Electron desktop app for capturing Markdown notes in time-windowed blocks, organizing them under goals, and querying them through a private BYOK assistant.

Notes, goals, settings, encrypted credentials, and assistant history stay in `~/NoteMark/`.

## Features

- Goal-based organization with Quick Notes, Research, multi-goal blocks, pinning, and goal context-menu management.
- Chat and Natural capture modes with time-windowed appending, Markdown editing, fuzzy search, and dictation.
- AI assistant with persistent streaming conversations, note retrieval, citations, current-goal and this-week scope.
- BYOK Gemini, OpenAI, Claude, and LM Studio. LM Studio offers only models currently loaded in VRAM.
- Quick Note routing suggestions, per-goal acceptance, routing animation, and mode-aware inbox placement.
- Translate, Explain, optional dictation cleanup, and goal rename/description/delete workflows.

## AI and privacy

AI credentials are encrypted through Electron `safeStorage` and are never returned to the renderer after saving. All API calls and note-context assembly run in the Electron main process.

One active provider/model is shared by chat, routing, inline actions, and dictation cleanup. Open Settings to configure a provider, refresh its available models, and test the active selection.

## Storage

| File | Purpose |
|---|---|
| `{uuid}.md` | Markdown content for one block |
| `index.json` | Block metadata, categories, excerpts, and routing state |
| `goals.json` | User-created goals |
| `settings.json` | Public application and AI settings |
| `secrets.json` | `safeStorage`-encrypted provider credentials |
| `assistant-history.json` | Recent persisted assistant conversations |

## Development

Run commands from `note-app/`:

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run build
```

See [note-app/README.md](./note-app/README.md) for app-specific usage, [note-app/DEVELOPER.md](./note-app/DEVELOPER.md) for architecture, and [AI_PLAN.MD](./AI_PLAN.MD) for implementation status and the remaining roadmap.
