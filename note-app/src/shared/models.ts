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

export type AppSettings = {
    blockWindowMinutes: number
    pinnedGoalIds: string[]
    captureMode: CaptureMode
    dictationMode: DictationMode
    // Wispr Flow developer API key (platform.wisprflow.ai). Persisted here
    // but only ever read by the main process when transcribing — it never
    // travels over IPC.
    whisprflowApiKey: string
}
