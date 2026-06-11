import { MDXEditorMethods } from "@mdxeditor/editor";
import { SelectedNote, useNoteActions, useNotes } from "@renderer/context";
import { NoteContent } from "@shared/models";
import { RefObject, useRef } from "react";
import { throttle, DebouncedFuncLeading } from "lodash"
import { autoSavingTime } from "@shared/constants";

type UseMarkdownEditorResult = {
    selectedNote: SelectedNote | null
    editorRef: RefObject<MDXEditorMethods | null>
    handleAutoSaving: DebouncedFuncLeading<(content: string | NoteContent) => Promise<void>>
    handleBlur: () => Promise<void>
}

export const useMarkdownEditor = (): UseMarkdownEditorResult => {
    const { selectedNote } = useNotes();
    const { saveNote } = useNoteActions()
    const editorRef = useRef<MDXEditorMethods>(null)

    const handleAutoSaving = throttle( async (content: string | NoteContent) =>{
        if (!selectedNote) return

        console.log('auto saving....', selectedNote.title)

        const payload: NoteContent = typeof content === 'string' ? { content } : content

        await saveNote(payload)
        }, autoSavingTime, {
        leading: false,
        trailing: true
    } )

    const handleBlur = async (): Promise<void> => {
        if(!selectedNote) return

        handleAutoSaving.cancel()

        const content = editorRef.current?.getMarkdown()


        if (content != null){
            await saveNote({content : content})
        }
    }

    return {
        selectedNote,
        editorRef,
        handleAutoSaving,
        handleBlur
    };
}