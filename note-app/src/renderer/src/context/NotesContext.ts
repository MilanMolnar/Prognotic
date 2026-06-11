import { NoteContent, NoteInfo } from '@shared/models'
import { createContext, useContext } from 'react'

export type SelectedNote = NoteInfo & { content: string }

export type NotesState = {
    notes: NoteInfo[] | undefined
    selectedNoteIndex: number | null
    selectedNote: SelectedNote | null
}

export type NotesActions = {
    selectNote: (index: number | null) => void
    createEmptyNote: () => Promise<void>
    deleteNote: () => Promise<void>
    saveNote: (content: NoteContent) => Promise<void>
}

// Split by concern: action consumers (toolbar buttons) should not re-render
// when the notes list or selection changes.
export const NotesStateContext = createContext<NotesState | null>(null)
export const NotesActionsContext = createContext<NotesActions | null>(null)

export const useNotes = (): NotesState => {
    const state = useContext(NotesStateContext)
    if (!state) {
        throw new Error('useNotes must be used within a NotesProvider')
    }
    return state
}

export const useNoteActions = (): NotesActions => {
    const actions = useContext(NotesActionsContext)
    if (!actions) {
        throw new Error('useNoteActions must be used within a NotesProvider')
    }
    return actions
}
