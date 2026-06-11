
import { useNoteActions, useNotes } from "@renderer/context";
import { NoteInfo } from "@shared/models";

type UseNotesListResult = {
    notes: NoteInfo[] | undefined
    selectedNoteIndex: number | null
    handleNoteSelect: (index: number) => () => Promise<void>
}

export const useNotesList = ( {onSelect}: {onSelect?: () => void} ): UseNotesListResult => {
    const { notes, selectedNoteIndex } = useNotes();
    const { selectNote } = useNoteActions();

    const handleNoteSelect = (index: number) => async() => {
        selectNote(index);
        if (onSelect) {
            onSelect();
        }
    };
    return {
        notes,
        selectedNoteIndex,
        handleNoteSelect
    };
}