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
| Assistant scope | Open goal, all goals, relevant goals, today, this week, and custom date filters |
| Quick Note routing | Runs when a Quick Note closes; semantic matching prioritizes goal descriptions and name meaning, preserves honest no-match decisions, and can propose one-click goal creation |
| Routed-note UX | Selected goal flies to the sidebar; routed notes remain in Quick Notes, are dimmed, move away from active captures, and require per-goal acknowledgement |
| Inline actions | Full-block and editor-selection Translate/Explain with Copy, Replace, and Continue in chat |
| Dictation cleanup | Optional AI polishing for Wispr Flow transcripts with visible retry/use-original recovery |
| Goal management | Context menu supports rename, edit description, and delete |
| Failure recovery | Routing, inline actions, assistant requests, and transcript polish expose errors and retry paths |
| Automated tests | Vitest coverage for stream parsing, note ranking, routing fallback/presentation/history, and persistence migration helpers |

## Architecture

```text
Renderer: SettingsProvider / BlocksProvider / AssistantProvider
    -> preload contextBridge
    -> main IPC handlers
    -> main/llm/router.ts
    -> Gemini | OpenAI | Anthropic | LM Studio
```

- `src/main/llm/router.ts` owns provider selection, model discovery, streaming normalization, note-context construction, routing, inline actions, and dictation cleanup. Pure ranking, stream, and classification helpers are colocated in `src/main/llm/`.
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

Routing begins when a Quick Note block is manually closed or its block window expires, including Natural capture after its final queued save. The classifier compares the note's semantic scope with each goal's name, description, and user-editable routing hints, rejecting generic keyword overlap. A confident decision returns ranked existing goals. A deliberate no-match decision retains the best existing goal when available and can include a proposed new goal instead of receiving a fabricated 0.1 match; the keyword fallback is reserved for malformed or empty legacy output.

The user clicks either an existing-goal chip or the green proposed-goal chip. Accepting a proposal creates the goal and applies the route in one main-process operation. No category or goal is created automatically, and Todo or Staging routing is not implemented. Decisions are retained in a capped per-block history.

Accepted routes persist per-goal provenance as unvisited. User-goal rows show derived counts, and the routed block carries a clickable acknowledgement emblem in that goal's feed. Direct user capture is stored as already visited; acknowledgement is independent for each goal on a multi-goal block.

- In chat mode, accepted routed notes move to the top of Quick Notes; the newest accepted route is first.
- In Natural mode, accepted routed notes move to the bottom; the newest accepted route is last.
- Switching capture modes does not replay the route animation.

### Provider settings

The Settings provider/model is the global default and is always used for routing, inline actions, and optional dictation polish. Assistant conversations can retain a model override from the currently selected provider. Model lists come from the selected provider after credentials are saved. Cloud provider catalogs may include models that are not suitable for text chat; the connection test validates the active choice.

## Remaining roadmap

### Recently completed

1. Added Vitest coverage for provider stream parsing, credential-migration decisions, note ranking, routing fallback, persisted routing history, placement, and animation transitions.
2. Added user-editable routing examples/keywords, sidebar unvisited counters, and per-goal acknowledgement for routed notes.
3. Added selection-aware Translate and Explain actions to the Markdown editor.
4. Added visible failure/retry or recovery paths for classification, assistant requests, inline actions, and Wispr Flow transcript polishing.
5. Added semantic no-match routing decisions with a best-existing alternative and one-click proposed-goal creation.

### Next

1. Add component and Electron integration tests around `safeStorage`, IPC failures, and timing-sensitive capture expiry.
2. Add explicit accept/reject/override controls and aggregate routing-quality metrics from local history.
3. Tighten cloud model catalogs so obviously incompatible models are hidden before connection testing.

### Later

- Staging Inbox and research-agent jobs.
- Todo and Research system-topic detection.
- Semantic search and embeddings.
- Knowledge graph, multimodal/OCR, and broader local-runtime support.

## Verification

Run from `note-app/`:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```
