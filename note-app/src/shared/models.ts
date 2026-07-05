export type BlockMeta = {
    id: string
    file: string
    createdAt: number
    updatedAt: number
    category: string | null
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

export type AppSettings = {
    blockWindowMinutes: number
    pinnedGoalIds: string[]
}
