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
    // Optional so routing decisions stored before new-goal suggestions remain
    // valid when loaded from index.json.
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
    // Every category the block appears in — a Goal id, researchCategory, or
    // null for Quick Notes. Always has at least one entry; one .md file per
    // block regardless of how many categories list it.
    categories: (string | null)[]
    excerpt: string
    // Optional AI-generated display name. Missing on legacy index entries;
    // renderer settings decide whether it is preferred over the excerpt.
    aiLabel?: string
    // Per-category provenance and acknowledgement. Missing legacy entries
    // are treated as already seen, so migrations never create false badges.
    goalPresence?: Record<string, GoalPresence>
    routing?: BlockRouting
    routingHistory?: BlockRouting[]
}

export type NoteContent = {
    content: string
}

// A user-defined goal (intelligent category). The description guides the
// future AI auto-sorting of Quick Notes blocks into goals.
export type Goal = {
    id: string
    name: string
    description: string
    routingHints?: string
    createdAt: number
}

// A personal-dictionary entry: a short key (command, phrase, or technical
// term) paired with a longer explanation. Keys are unique case-insensitively.
export type GlossaryEntry = {
    id: string
    key: string
    explanation: string
    createdAt: number
    updatedAt: number
}

// How the main panel captures notes: 'chat' = feed with a chat-style bar at
// the bottom, 'natural' = a document-style writing surface pinned at the top.
export type CaptureMode = 'chat' | 'natural'

// Speech-to-text backend for capture: native Windows (Win+H), native macOS
// (Fn-D), or the Wispr Flow developer API. Persisted in settings.json.
export type DictationMode = 'windows' | 'macos' | 'whisprflow'

export type { UiLocale } from './locales'

export type LlmProvider = 'gemini' | 'openai' | 'anthropic' | 'local'

export type VerifiedLlmConnection = {
    provider: LlmProvider
    model: string
}

export type LlmUsageResetInterval = 'forever' | 'monthly' | 'yearly' | 'days'

export type LlmUsageThresholds = {
    yellow: number
    red: number
    critical: number
}

export type LlmUsageBudgetSettings = {
    enabled: boolean
    limitUsd: number
    resetInterval: LlmUsageResetInterval
    resetDays: number
    thresholds: LlmUsageThresholds
    // Anchor for rolling custom-day windows. Calendar month/year periods use
    // their local calendar boundaries instead.
    periodStartedAt: number
}

export type LlmSettings = {
    provider: LlmProvider
    model: string
    pluginWizardModel: string
    imageRecognitionModel: string
    localBaseUrl: string
    polishDictation: boolean
    aiBlockNameSummary: boolean
    usageBudget: LlmUsageBudgetSettings
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
    // Synced deletions remain as local tombstones until Google confirms the
    // matching external event was removed.
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

export type AppSettings = {
    uiLocale: import('./locales').UiLocale
    blockWindowMinutes: number
    // Maximum characters allowed for glossary keys; clamped to the range in
    // constants.ts on save.
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

export type LlmCredentialName = 'whisprflow' | 'gemini' | 'openai' | 'anthropic' | 'local'

export type AssistantMessage = {
    id: string
    role: 'user' | 'assistant'
    text: string
    createdAt: number
    provider?: LlmProvider
    model?: string
    citedBlockIds?: string[]
    citedBlockCategoryIds?: Record<string, string | null>
    readGoalLabels?: string[]
}

export type AssistantMode = 'note-chat' | 'research' | 'search'
export type AssistantGoalMode = 'open' | 'all' | 'relevant'
export type AssistantTimeRange = 'today' | 'week' | 'custom' | 'all'

export type AssistantConversation = {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messages: AssistantMessage[]
    // Optional only for assistant-history.json files written before modes
    // existed. The renderer normalizes missing values to Note Chat on load.
    mode?: AssistantMode
    goalMode?: AssistantGoalMode
    timeRange?: AssistantTimeRange
    customStartDate?: string
    customEndDate?: string
    provider?: LlmProvider
    model?: string
    usesDefaultModel?: boolean
    readGoalLabels?: string[]
}
