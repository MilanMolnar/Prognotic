# Prognotic (note-app)

Electron desktop app for local Markdown note capture and goal-based organization. Part of the [NoteAppAI](../) monorepo.

## Quick start

```bash
npm install
npm run dev
```

## Features

- **Goals sidebar** — Quick Notes, Research (pinned), and custom goals with sliding yellow selection indicator
- **Block feed** — time-stamped cards filtered by selected goal; short label (first ~5 words) + timestamp in the border
- **Quick capture** — chat-style input with Markdown toolbar; time-windowed append vs new block
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
├── DraggableTopBar — Prognotic | FeedHeader (search)
└── RootLayout
    ├── Sidebar — CategorySidebar | CollapsedSidebar
    ├── Content — BlockPanel (BlockFeed | MarkdownEditor), CaptureBar
    └── ChatPanel
```

## Context providers

`SettingsProvider` → `GoalsProvider` → `BlocksProvider` → `SearchProvider` → `PanelsProvider`

## IPC

See root [README](../README.md#ipc-api-windowcontext) for the full `window.context` API.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development with HMR |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript validation |
| `npm run lint` | ESLint |
