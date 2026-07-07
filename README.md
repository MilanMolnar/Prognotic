# Prognotic

A desktop note-taking and knowledge-capture app built with **Electron**, **React 19**, and **TypeScript**. Notes are stored locally as Markdown — no cloud account, no database. Capture quick thoughts into time-windowed **blocks**, organize them under **goals**, and edit with a rich Markdown editor that auto-saves.

> Storage lives in a folder called **`NoteMark`** in your home directory. The in-app brand name is **Prognotic**.

## Features

- **Goal-based organization** — pinned system categories (**Quick Notes**, **Research**) plus user-defined goals with name and description; up to 3 goals can be pinned to the top of the sidebar
- **Multi-goal blocks** — a block can belong to more than one category at once (e.g. "send to Research" from the context menu) without duplicating its content on disk
- **Time-windowed blocks** — quick capture appends to the open block within a configurable window (default 5 minutes), then starts a new block
- **Two capture styles** — **Chat** mode (feed with a send bar at the bottom) or **Natural** mode (a document-style writing surface pinned at the top, with finalized blocks collapsing into cards below); toggle from the top bar, persisted in settings
- **Block feed** — chronological cards with short label, timestamp, and dim borders; click to edit in-place with live Markdown shortcuts; right-click for quick actions
- **Chat-style capture bar** — bottom input with Markdown toolbar (heading, bold, italic, list, code) and a dictation mic; shows which block you are appending to or **new** when the window has expired
- **Dictation** — **Windows voice typing** (Win+H, no key needed) or **Wispr Flow** (BYOK cloud transcription); selectable in Settings
- **Context-aware search** — fuzzy search across blocks in the selected goal from the top bar; in-block find/highlight when editing
- **Collapsible side panels** — goals sidebar (open by default) and AI assistant panel (closed by default, UI shell only)
- **Resizable assistant panel** — drag the divider between main content and chat to adjust width
- **Rich Markdown editing** — headings, lists, blockquotes, links, images, and code blocks via [MDXEditor](https://mdxeditor.dev/)
- **Auto-save** — throttled save while typing and immediate save on blur
- **Frameless window** — custom top bar with draggable region (acrylic on Windows, vibrancy on macOS)

## Where data is stored

All data lives in **`NoteMark`** inside your home directory:

| Platform | Path |
|----------|------|
| Windows  | `C:\Users\<you>\NoteMark\` |
| macOS    | `/Users/<you>/NoteMark/` |
| Linux    | `/home/<you>/NoteMark/` |

| File | Purpose |
|------|---------|
| `{uuid}.md` | Markdown content for each note block |
| `index.json` | Block metadata registry (timestamps, category, excerpt) |
| `goals.json` | User-defined goals |
| `settings.json` | App settings (e.g. block window duration) |

The folder is created automatically on first launch. Legacy `.md` files dropped into the folder are imported into the block index on next load. An empty folder seeds a welcome block.

## Using the app

### Layout

```
DraggableTopBar — Prognotic (left) | goal/timestamp + search (center) | window controls (right)
├── Left sidebar (collapsible) — goals, search, settings, collapse toggle
├── Main workspace
│   ├── Block feed (or full editor when a block is open)
│   └── Capture bar (chat-style input at the bottom)
└── Right panel (collapsible, resizable) — AI assistant shell (placeholder UI)
```

- **Left sidebar** — select a goal or system category; a sliding yellow border marks the active item. **+** opens a dialog to create a goal (name + description). Settings (cog) and panel toggle are at the bottom.
- **Top bar (center)** — shows the selected category name, or the open block's timestamp while editing. Hover for an animated underline; click to open fuzzy search. Search scope is the current goal's blocks, or the open block's content when editing.
- **Block feed** — blocks for the selected category, newest near the bottom (chat-style scroll). Open blocks show a yellow pulse on the card border.
- **Block editing** — click a block to expand into the full MDXEditor (`# heading` renders live). The capture bar fades while editing. Close with **X** or switch category to return to the feed.
- **Capture bar** — type and send (or Ctrl+Enter). Appends to the open block if still within the time window; otherwise creates a new block in the selected category. The border legend shows the target block name or **new**.

### Goals and categories

| Category | Meaning |
|----------|---------|
| **Quick Notes** | Default capture inbox (`category: null`) |
| **Research** | Pinned system topic for topics to research later |
| **Custom goals** | User-created; each has a description for future AI auto-sorting |

Switching goals exits block edit mode and clears search.

### Settings

Open the cog in the left sidebar to adjust **block window minutes** (how long after your last write a block stays "open" for appends) and **dictation mode** (Windows voice typing, or Wispr Flow with your own API key from platform.wisprflow.ai).

### AI assistant

The right panel is a **UI shell only**: message list, input, and placeholder replies. LLM integration and note querying are planned (see [`AI_PLAN.MD`](./AI_PLAN.MD) for the phased roadmap).

## Architecture

Electron three-process model with a sandboxed renderer; all filesystem access goes through a typed preload bridge.

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (React 19)                                    │
│  Context providers, MDXEditor, Tailwind CSS             │
│         │  window.context.*  (contextBridge)            │
├─────────┼───────────────────────────────────────────────┤
│  Preload                                                │
├─────────┼───────────────────────────────────────────────┤
│  Main process (Node.js) — file I/O, native dialogs      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
                   ~/NoteMark/
```

### IPC API (`window.context`)

| Method | Description |
|--------|-------------|
| `getBlocks()` | List all blocks from `index.json`, synced with `.md` files on disk |
| `readBlock(id)` | Read a block's Markdown content |
| `writeBlock(id, content)` | Write content; updates excerpt and timestamp |
| `createBlock(content, categories)` | Create a new block in the given categories |
| `updateBlockCategories(id, categories)` | Replace a block's full category list (multi-goal) |
| `appendToBlock(id, text)` | Append text to an existing block |
| `deleteBlock(id)` | Confirm (dialog) and delete a block |
| `deleteBlockIfEmpty(id)` | Silently delete a block only if its content is blank — no dialog |
| `getGoals()` | List user-defined goals |
| `createGoal(name, description)` | Create a goal |
| `getSettings()` / `setSettings(patch)` | Read/write app settings |
| `transcribeAudio(audio)` | Send a recorded clip to the Wispr Flow API for transcription (BYOK) |
| `toggleWindowsDictation()` | Focus the window and send Win+H to open Windows voice typing |
| `locale` / `platform` | Plain values (not calls) exposed by the preload script |

### State management

React Context providers (see `note-app/src/renderer/src/main.tsx`):

| Provider | Role |
|----------|------|
| `SettingsProvider` | Block window duration |
| `GoalsProvider` | Goals list and selected category |
| `BlocksProvider` | Blocks, open/selected block, quick capture |
| `SearchProvider` | Feed header search state |
| `PanelsProvider` | Sidebar/panel open state and chat panel width |

### Key source files

| Path | Role |
|------|------|
| `note-app/src/main/lib/index.ts` | Block/goal/settings persistence |
| `note-app/src/main/dictation/windows.ts` / `wisprflow.ts` | Dictation providers |
| `note-app/src/renderer/src/context/BlocksProvider.tsx` | Block lifecycle and capture logic |
| `note-app/src/renderer/src/components/CategorySidebar.tsx` | Goals sidebar |
| `note-app/src/renderer/src/components/BlockFeed.tsx` / `BlockCard.tsx` | Block feed UI (chat mode) |
| `note-app/src/renderer/src/components/NaturalCapturePanel.tsx` / `NaturalCaptureEditor.tsx` | Natural capture mode |
| `note-app/src/renderer/src/components/CaptureBar.tsx` | Quick capture input (chat mode) |
| `note-app/src/renderer/src/components/FeedHeader.tsx` | Top bar search |
| `note-app/src/renderer/src/components/ChatPanel.tsx` | AI assistant shell |
| `note-app/src/shared/models.ts` | `BlockMeta`, `Goal`, `AppSettings`, `CaptureMode`, `DictationMode` |

See [`note-app/DEVELOPER.md`](./note-app/DEVELOPER.md) for the full architecture, IPC table, and sequence diagrams, and [`TODO.md`](./TODO.md) for known issues and improvement ideas.

## Development

All commands run from the `note-app/` directory.

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm

### Install and run

```bash
cd note-app
npm install
npm run dev
```

### Other scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Preview a production build |
| `npm run build` | Type-check and build for production |
| `npm run build:win` | Build a Windows installer |
| `npm run build:mac` | Build a macOS `.dmg` |
| `npm run build:linux` | Build Linux packages |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript checks for main and renderer |

## Tech stack

- **Electron 39** — desktop shell
- **React 19** + **TypeScript**
- **React Context API** — app state
- **electron-vite** — build tooling
- **MDXEditor** — WYSIWYG Markdown editor
- **Tailwind CSS v4** — styling
- **fs-extra** — filesystem helpers in the main process
