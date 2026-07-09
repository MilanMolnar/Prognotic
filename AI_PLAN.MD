# Prognotic AI Status and Roadmap

## Current implementation

The AI assistant is implemented as a local-first Electron feature. All provider calls run in the main process; the sandboxed renderer uses only the typed `window.context` bridge.

### Implemented

| Capability | Status |
|---|---|
| Gemini BYOK | Implemented: model discovery, test connection, streaming chat |
| OpenAI BYOK | Implemented: model discovery, test connection, streaming chat |
| Claude BYOK | Implemented: model discovery, test connection, streaming chat |
| Local models | Implemented for LM Studio; only loaded LLM instances are selectable |
| Credential storage | Electron `safeStorage`; saved keys are never returned to the renderer |
| Note-aware assistant | Persistent right-panel conversations, scoped retrieval, streaming, clickable citations |
| Assistant scope | All notes, current goal, and this-week filters |
| Quick Note routing | Runs when a Quick Note closes; one or more goal suggestions with confidence; user selects one suggestion |
| Routed-note UX | Selected goal flies to the sidebar; routed notes remain in Quick Notes, are dimmed, and move away from active captures |
| Inline actions | Translate and Explain with Copy, Replace note, and Continue in chat |
| Dictation cleanup | Optional AI polishing before the transcript is inserted for review |
| Goal management | Context menu supports rename, edit description, and delete |

## Architecture

```text
Renderer: SettingsProvider / BlocksProvider / AssistantProvider
    -> preload contextBridge
    -> main IPC handlers
    -> main/llm/router.ts
    -> Gemini | OpenAI | Anthropic | LM Studio
```

- `src/main/llm/router.ts` owns provider selection, model discovery, streaming normalization, note-context construction, routing, inline actions, and dictation cleanup.
- `src/main/lib/index.ts` persists public settings, encrypted credentials, conversations, blocks, goals, and routing metadata.
- `AssistantProvider` owns conversation persistence, stream lifecycle, scope filters, and assistant-panel actions.
- LM Studio discovery uses `GET /api/v1/models` and filters to `type: "llm"` entries with a non-empty `loaded_instances` list. Inference uses the OpenAI-compatible chat endpoint.

## Security and data handling

- Credentials are encrypted using Electron `safeStorage` in `secrets.json`; `settings.json` contains only public settings and key-presence flags.
- A legacy plaintext Wispr Flow key is migrated to encrypted storage on read when encryption is available.
- Assistant history is stored locally in `assistant-history.json` and capped at 25 conversations.
- Notes are selected and excerpted in the main process. The model receives bounded relevant excerpts, never direct renderer filesystem access.

## Current workflow details

### Assistant

The right panel streams model responses and persists conversations. The main process ranks note excerpts by text match and recency, injects a bounded context, and parses `[block:<id>]` citations into clickable note references.

### Quick Note routing

Routing begins when a Quick Note block is manually closed or its block window expires. The classifier compares note content with goal descriptions and must return at least one valid user goal when any goals exist. The user clicks a suggested goal chip to apply that one category. No automatic category changes, goal creation, Todo routing, or Staging routing occur.

- In chat mode, accepted routed notes move to the top of Quick Notes; the newest accepted route is first.
- In Natural mode, accepted routed notes move to the bottom; the newest accepted route is last.
- Switching capture modes does not replay the route animation.

### Provider settings

One active provider/model is used for chat, routing, inline actions, and optional dictation polish. Model lists come from the selected provider after credentials are saved. Cloud provider catalogs may include models that are not suitable for text chat; the connection test validates the active choice.

## Remaining roadmap

### Next

1. Add automated tests for provider streaming/parsing, encrypted-key migration, note ranking, routing fallback, and route animations.
2. Improve routing quality with user-editable goal examples/keywords and a review/history surface for low-confidence classifications.
3. Add selection-aware inline actions in the Markdown editor; current actions operate on the full block context-menu target.
4. Add clearer in-app failure/retry status when classification or a provider request fails.

### Later

- Staging Inbox and research-agent jobs.
- Todo and Research system-topic detection.
- Semantic search and embeddings.
- Knowledge graph, multimodal/OCR, and broader local-runtime support.

## Verification

Run from `note-app/`:

```bash
npm run typecheck
npm run lint
npm run build
```
