import { MDXEditorMethods } from "@mdxeditor/editor";
import { SelectedBlock, useBlockActions, useBlocks } from "@renderer/context";
import { NoteContent } from "@shared/models";
import { RefObject, useRef } from "react";
import { throttle, DebouncedFuncLeading } from "lodash"
import { autoSavingTime } from "@shared/constants";

type UseMarkdownEditorResult = {
    selectedBlock: SelectedBlock | null
    editorKey: string
    editorRef: RefObject<MDXEditorMethods | null>
    handleAutoSaving: DebouncedFuncLeading<(content: string | NoteContent) => Promise<void>>
    handleBlur: () => Promise<void>
}

export const useMarkdownEditor = (): UseMarkdownEditorResult => {
    const { selectedBlock, contentVersion } = useBlocks();
    const { saveBlock } = useBlockActions()
    const editorRef = useRef<MDXEditorMethods>(null)

    // contentVersion bumps when a quick-input append touches the selected
    // block, remounting the editor with the appended content.
    const editorKey = selectedBlock ? `${selectedBlock.id}:${contentVersion}` : ''

    const handleAutoSaving = throttle( async (content: string | NoteContent) =>{
        if (!selectedBlock) return

        console.log('auto saving....', selectedBlock.id)

        const payload: NoteContent = typeof content === 'string' ? { content } : content

        await saveBlock(payload)
        }, autoSavingTime, {
        leading: false,
        trailing: true
    } )

    const handleBlur = async (): Promise<void> => {
        if(!selectedBlock) return

        handleAutoSaving.cancel()

        const content = editorRef.current?.getMarkdown()


        if (content != null){
            await saveBlock({content : content})
        }
    }

    return {
        selectedBlock,
        editorKey,
        editorRef,
        handleAutoSaving,
        handleBlur
    };
}
