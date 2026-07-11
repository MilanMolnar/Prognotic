# Prognotic

Prognotic is a local-first Electron desktop app for capturing Markdown notes in time-windowed blocks, organizing them under goals, and querying them through a private BYOK assistant.

Notes, goals, settings, encrypted credentials, and assistant history stay in `~/NoteMark/`.

## Features

- Goal-based organization with Quick Notes, Research, multi-goal blocks, pinning, and goal context-menu management.
- Chat and Natural capture modes with time-windowed appending, Markdown editing, fuzzy search, and dictation.
- AI assistant with persistent streaming conversations, relevance-ranked note retrieval, citations, goal scopes, today/week/custom dates, and per-conversation model overrides.
- BYOK Gemini, OpenAI, Claude, and LM Studio. LM Studio offers only models currently loaded in VRAM.
- Quick Note routing suggestions, per-goal acceptance, routing animation, and mode-aware inbox placement.
- Full-block and selected-text Translate/Explain, optional Wispr Flow dictation cleanup with retry, routing history, and goal rename/description/delete workflows.

## AI and privacy

AI credentials are encrypted through Electron `safeStorage` and are never returned to the renderer after saving. All API calls and note-context assembly run in the Electron main process.

The provider/model configured in Settings is the global default and drives routing, inline actions, and dictation cleanup. Assistant conversations can retain a model override from the selected provider. Open Settings to refresh available models and test the active selection.

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
npm test
npm run lint
npm run build
```

See [note-app/README.md](./note-app/README.md) for app-specific usage, [note-app/DEVELOPER.md](./note-app/DEVELOPER.md) for architecture, [todo-prompt](./todo-prompt) for the current dictation path, and [AI_PLAN.MD](./AI_PLAN.MD) for implementation status and the remaining roadmap.
