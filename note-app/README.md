# Prognotic app

Electron desktop app for local Markdown note capture and goal-based organization. This package is part of the [Prognotic repository](../README.md).

## Quick start

```bash
npm install
npm run dev
```

## What is implemented

- Quick Notes, Research, custom goals, pinned goals, and multi-goal blocks.
- Chat and Natural capture modes, MDXEditor, fuzzy search, Windows dictation, and Wispr Flow dictation.
- Goal context menu: Rename, Edit description, and Delete. Deleting a goal returns its blocks to Quick Notes.
- BYOK Gemini, OpenAI, Claude, and local LM Studio model selection with connection tests.
- Persistent, note-aware assistant conversations with streaming and clickable note citations.
- Quick Note AI routing after close: click a suggested goal to apply it. Routed notes stay in Quick Notes for review, appear dimmed, and move to the top in chat mode or the bottom in Natural mode.
- Translate and Explain block actions with Copy, Replace note, and Continue in chat.
- Optional AI dictation cleanup before the user reviews the transcript.

## Settings and credentials

Settings controls block-window duration, capture mode, dictation, active AI provider/model, LM Studio loopback URL, and optional dictation polishing. API keys are encrypted with Electron `safeStorage`; Settings displays only whether a key is configured.

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

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Electron development with HMR |
| `npm run build` | Type-check and build production bundles |
| `npm run typecheck` | TypeScript validation |
| `npm run lint` | ESLint |

For architecture and IPC details, see [DEVELOPER.md](./DEVELOPER.md). For AI status and backlog, see [AI_PLAN.MD](../AI_PLAN.MD).
