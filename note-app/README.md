# Prognotic (note-app)

Electron desktop app for local Markdown note capture and goal-based organization. Part of the [NoteAppAI](../) monorepo.

## Quick start

```bash
npm install
npm run dev
```

## Features

- **Goals sidebar** — Quick Notes, Research (pinned), and custom goals with sliding yellow selection indicator; pin up to 3 goals
- **Block feed** — time-stamped cards filtered by selected goal; short label (first ~5 words) + timestamp in the border; right-click for quick actions (e.g. send to Research)
- **Two capture modes** — **Chat** (feed + bottom input) or **Natural** (pinned writing surface, blocks collapse below); toggle in the top bar
- **Quick capture** — chat-style input with Markdown toolbar; time-windowed append vs new block
- **Dictation** — Windows voice typing (Win+H) or Wispr Flow (BYOK); mic button in the capture bar and natural editor
- **Block editor** — click a block for full MDXEditor with live Markdown shortcuts
- **Top bar search** — fuzzy filter/reorder in goal view; in-block highlight in edit view
- **Collapsible panels** — left goals (default open), right AI assistant (default closed, UI only)
- **Resizable chat panel** — drag the left edge of the assistant panel

## Storage (`~/NoteMark/`)

| File | Purpose |
|------|---------|
| `{uuid}.md` | Block content |
| `index.json` | Block metadata |
| `goals.json` | User goals |
| `settings.json` | App settings |

## Component tree

```
App.tsx
├── DraggableTopBar — Prognotic | FeedHeader (search) | CaptureModeToggle
└── RootLayout
    ├── Sidebar — CategorySidebar | CollapsedSidebar
    ├── Content — BlockPanel (BlockFeed | NaturalCapturePanel | MarkdownEditor), CaptureBar
    └── ChatPanel
```

## Context providers

`SettingsProvider` → `GoalsProvider` → `BlocksProvider` → `SearchProvider` → `PanelsProvider`

All global state uses React Context — there is no Jotai in this codebase.

## Dictation

Two BYOK-free/BYOK providers, selected in Settings (`AppSettings.dictationMode`):

- **`windows`** — simulates Win+H to open Windows' system voice typing (no API key, Windows only)
- **`whisprflow`** — records in the renderer, transcribes via the [Wispr Flow](https://wisprflow.ai) developer API in the main process (key never crosses IPC)

See `note-app/src/main/dictation/` and `note-app/src/renderer/src/hooks/useDictation.tsx`.

## IPC

See root [README](../README.md#ipc-api-windowcontext) for the full `window.context` API.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development with HMR |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript validation |
| `npm run lint` | ESLint |
