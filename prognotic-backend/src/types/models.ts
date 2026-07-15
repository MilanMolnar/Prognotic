// Domain types mirrored from the Electron client:
//   note-app/src/shared/models.ts
//
// Field names and shapes are kept in lockstep with the client so future
// Electron / web / mobile sync integrations can serialize their local state
// verbatim. This is documented duplication — the backend deliberately does
// not import from note-app/ so the two packages stay independently buildable.
// When the client model changes, update this file and the zod schemas in
// src/validation/schemas.ts together.
//
// Deliberately NOT mirrored (never synced by this backend):
//   - secrets.json contents (LLM API keys, Google OAuth client/refresh tokens)
//   - assistant-history.json (AssistantConversation) — deferred to v2
//   - plugin-state.json / plugin-data/ — deferred to v2
//   - CalendarStoreState.google.syncToken — device/account-specific Google
//     cursor, meaningless on another device

export type SuggestedNewGoal = {
    name: string
    description: string
    confidence: number
}

export type BlockRouting = {
    status: 'pending' | 'applied' | 'overridden'
    decidedAt: number
    assignments: { goalId: string | null; confidence: number }[]
    model: string
    hasConfidentMatch?: boolean
    suggestedNewGoal?: SuggestedNewGoal
}

export type GoalPresenceSource = 'user' | 'routed' | 'assistant' | 'research' | 'plugin'

export type GoalPresence = {
    source: GoalPresenceSource
    visited: boolean
}

export type BlockMeta = {
    id: string
    file: string
    createdAt: number
    updatedAt: number
    // Every category the block appears in — a Goal id, "research", or null
    // for Quick Notes. Always has at least one entry.
    categories: (string | null)[]
    excerpt: string
    aiLabel?: string
    goalPresence?: Record<string, GoalPresence>
    routing?: BlockRouting
    routingHistory?: BlockRouting[]
}

// A user-defined goal (intelligent category). Note: the client model has no
// updatedAt — the sync envelope adds one (see GoalChange in schemas.ts).
export type Goal = {
    id: string
    name: string
    description: string
    routingHints?: string
    createdAt: number
}

// A personal-dictionary entry (glossary.json). Keys are unique
// case-insensitively per user on the client; the server stores whatever the
// client sends and leaves uniqueness to client-side validation, since LWW
// conflict resolution operates per entry id.
export type GlossaryEntry = {
    id: string
    key: string
    explanation: string
    createdAt: number
    updatedAt: number
}

export type CaptureMode = 'chat' | 'natural'

export type DictationMode = 'windows' | 'macos' | 'whisprflow'

export type LlmProvider = 'gemini' | 'openai' | 'anthropic' | 'local'

export type VerifiedLlmConnection = {
    provider: LlmProvider
    model: string
}

export type LlmSettings = {
    provider: LlmProvider
    model: string
    pluginWizardModel: string
    imageRecognitionModel: string
    localBaseUrl: string
    polishDictation: boolean
    aiBlockNameSummary: boolean
    verifiedConnection?: VerifiedLlmConnection
    verifiedImageRecognitionConnection?: VerifiedLlmConnection
}

export type CalendarItemStatus =
    | 'pending_validation'
    | 'verified'
    | 'uncertain'
    | 'resolved'
    | 'dismissed'

export type CalendarItemResolution = {
    type: 'validated' | 'accepted_suggestion' | 'custom_time' | 'manual_edit'
    resolvedAt: number
}

export type CalendarItemGoogleLink = {
    calendarId: string
    eventId: string
    etag?: string
    remoteUpdatedAt?: number
    lastSyncedAt: number
    lastSyncedLocalHash: string
}

export type CalendarItem = {
    id: string
    blockId?: string
    source: 'note' | 'google'
    sourceOrder: number
    sourceText: string
    sourceFingerprint: string
    sourceBlockUpdatedAt?: number
    title: string
    excerpt: string
    status: CalendarItemStatus
    confidence: number
    start?: string
    end?: string
    allDay: boolean
    timeZone: string
    suggestedStart?: string
    suggestedEnd?: string
    resolution?: CalendarItemResolution
    google?: CalendarItemGoogleLink
    createdAt: number
    updatedAt: number
    deletedAt?: number
}

export type GoogleCalendarSettings = {
    enabled: boolean
    pushEnabled: boolean
    pullEnabled: boolean
    autoSyncMinutes: number
    connectedEmail?: string
    hasOAuthClient: boolean
    isConnected: boolean
    lastSyncAt?: number
    lastSyncStatus: 'idle' | 'success' | 'error'
    lastSyncMessage?: string
}

// Public settings only (settings.json). The has*ApiKey booleans indicate
// key presence on some device — never key values. Raw credentials live in
// the client's encrypted secrets.json and are never accepted by this API.
export type AppSettings = {
    blockWindowMinutes: number
    // Maximum characters allowed for glossary keys (client clamps to 50–300).
    glossaryKeyMaxLength: number
    pinnedGoalIds: string[]
    captureMode: CaptureMode
    dictationMode: DictationMode
    onboardingCompleted: boolean
    onboardingSkipped: boolean
    onboardingCompletedAt?: number
    llm: LlmSettings
    googleCalendar: GoogleCalendarSettings
    hasWhisprflowApiKey: boolean
    hasGeminiApiKey: boolean
    hasOpenaiApiKey: boolean
    hasAnthropicApiKey: boolean
    hasLocalApiToken: boolean
}
