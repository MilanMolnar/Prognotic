import { NoteContent, NoteInfo } from '@shared/models'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    NotesActions,
    NotesActionsContext,
    NotesState,
    NotesStateContext,
    SelectedNote
} from './NotesContext'

const sortNotes = (notes: NoteInfo[]): NoteInfo[] =>
    [...notes].sort((a, b) => b.lastEditTime - a.lastEditTime)

export const NotesProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [notes, setNotes] = useState<NoteInfo[] | undefined>(undefined)
    const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(null)
    // Most recently loaded note. Kept while the next note's content loads
    // (mirrors the old unwrap(..., prev) behavior) so the editor does not flash empty.
    const [loadedNote, setLoadedNote] = useState<SelectedNote | null>(null)

    useEffect(() => {
        let cancelled = false

        const loadNotes = async (): Promise<void> => {
            const loadedNotes = await window.context.getNotes()
            if (cancelled) return
            setNotes(sortNotes(loadedNotes))
        }

        void loadNotes()
        return () => {
            cancelled = true
        }
    }, [])

    const selectedTitle =
        selectedNoteIndex !== null && notes ? (notes[selectedNoteIndex]?.title ?? null) : null

    const selectedNote = selectedTitle === null ? null : loadedNote

    // Latest snapshots so the action callbacks can stay referentially stable.
    // Synced after every commit; actions only run from user events, which React
    // dispatches after pending effects have flushed.
    const notesRef = useRef(notes)
    const selectedNoteRef = useRef(selectedNote)
    useEffect(() => {
        notesRef.current = notes
        selectedNoteRef.current = selectedNote
    })

    // Fetch content whenever the selected note identity changes. Stale
    // responses (rapid re-selection, StrictMode double-invoke) are discarded.
    useEffect(() => {
        if (selectedTitle === null) return

        let cancelled = false

        const loadSelectedNote = async (): Promise<void> => {
            const noteContent = await window.context.readNote(selectedTitle)
            if (cancelled) return

            const normalizedContent: string =
                typeof noteContent === 'string' ? noteContent : noteContent.content
            const noteInfo = notesRef.current?.find((note) => note.title === selectedTitle)

            setLoadedNote({
                title: selectedTitle,
                lastEditTime: noteInfo?.lastEditTime ?? Date.now(),
                content: normalizedContent
            })
        }

        void loadSelectedNote()
        return () => {
            cancelled = true
        }
    }, [selectedTitle])

    const selectNote = useCallback((index: number | null) => {
        setSelectedNoteIndex(index)
    }, [])

    const createEmptyNote = useCallback(async () => {
        const currentNotes = notesRef.current
        if (!currentNotes) return

        const title = await window.context.createNote()
        if (!title) return

        const newNote: NoteInfo = {
            title,
            lastEditTime: Date.now()
        }

        setNotes([newNote, ...currentNotes.filter((note) => note.title !== newNote.title)])
        setSelectedNoteIndex(0) // Select the newly created note
    }, [])

    const deleteNote = useCallback(async () => {
        const currentNotes = notesRef.current
        const currentSelectedNote = selectedNoteRef.current
        if (!currentSelectedNote || !currentNotes) return

        const isDeleted = await window.context.deleteNote(currentSelectedNote.title)
        if (!isDeleted) return

        setNotes(currentNotes.filter((note) => note.title !== currentSelectedNote.title))
        // Clear the selection when the last note was removed, otherwise select
        // the top note after deletion.
        setSelectedNoteIndex(currentNotes.length === 1 ? null : 0)
    }, [])

    const saveNote = useCallback(async (newContent: NoteContent) => {
        const currentNotes = notesRef.current
        const currentSelectedNote = selectedNoteRef.current
        if (!currentSelectedNote || !currentNotes) return

        await window.context.writeNote(currentSelectedNote.title, newContent)

        // Bump the edit time without re-sorting, matching previous behavior.
        setNotes(
            currentNotes.map((note) =>
                note.title === currentSelectedNote.title
                    ? { ...note, lastEditTime: Date.now() }
                    : note
            )
        )
    }, [])

    const stateValue: NotesState = useMemo(
        () => ({ notes, selectedNoteIndex, selectedNote }),
        [notes, selectedNoteIndex, selectedNote]
    )

    const actionsValue: NotesActions = useMemo(
        () => ({ selectNote, createEmptyNote, deleteNote, saveNote }),
        [selectNote, createEmptyNote, deleteNote, saveNote]
    )

    return (
        <NotesStateContext.Provider value={stateValue}>
            <NotesActionsContext.Provider value={actionsValue}>
                {children}
            </NotesActionsContext.Provider>
        </NotesStateContext.Provider>
    )
}
