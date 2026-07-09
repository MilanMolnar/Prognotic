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
    routing?: {
        status: 'pending' | 'applied' | 'overridden'
        decidedAt: number
        assignments: { goalId: string | null; confidence: number }[]
        model: string
    }
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
    // Wispr Flow developer API key (platform.wisprflow.ai). Persisted here
    // but only ever read by the main process when transcribing — it never
    // travels over IPC.
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
}

export type AssistantConversation = {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messages: AssistantMessage[]
}
