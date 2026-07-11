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

export type GoalPresenceSource = 'user' | 'routed' | 'assistant' | 'research'

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

// How the main panel captures notes: 'chat' = feed with a chat-style bar at
// the bottom, 'natural' = a document-style writing surface pinned at the top.
export type CaptureMode = 'chat' | 'natural'

// Speech-to-text backend for capture: 'windows' (Win+H system voice typing),
// 'whisprflow' (the Wispr Flow developer API — wisprflow.ai, not OpenAI
// Whisper). Persisted in settings.json.
export type DictationMode = 'windows' | 'whisprflow'

export type LlmProvider = 'gemini' | 'openai' | 'anthropic' | 'local'

export type LlmSettings = {
    provider: LlmProvider
    model: string
    localBaseUrl: string
    polishDictation: boolean
}

export type AppSettings = {
    blockWindowMinutes: number
    pinnedGoalIds: string[]
    captureMode: CaptureMode
    dictationMode: DictationMode
    llm: LlmSettings
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
    readGoalLabels?: string[]
}

export type AssistantGoalMode = 'open' | 'all' | 'relevant'
export type AssistantTimeRange = 'today' | 'week' | 'custom'

export type AssistantConversation = {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messages: AssistantMessage[]
    goalMode?: AssistantGoalMode
    timeRange?: AssistantTimeRange
    customStartDate?: string
    customEndDate?: string
    provider?: LlmProvider
    model?: string
    usesDefaultModel?: boolean
    readGoalLabels?: string[]
}
