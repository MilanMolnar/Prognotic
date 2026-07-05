import { BlockMeta, NoteContent } from '@shared/models'
import { createContext, useContext } from 'react'

export type SelectedBlock = BlockMeta & { content: string }

export type BlocksState = {
    blocks: BlockMeta[] | undefined
    // Cache of block markdown keyed by id, filled lazily as categories are
    // viewed. Feed cards read from here; missing ids are being fetched.
    blockContents: Record<string, string>
    selectedBlockId: string | null
    selectedBlock: SelectedBlock | null
    openBlockId: string | null
    // Bumped when a quick-input append touches the selected block so the
    // editor remounts with the appended content.
    contentVersion: number
}

export type BlocksActions = {
    selectBlock: (id: string | null) => void
    submitQuickNote: (text: string) => Promise<void>
    saveBlock: (content: NoteContent) => Promise<void>
    deleteBlock: (id: string) => Promise<void>
}

// Split by concern: action consumers (toolbar buttons, capture bar) should
// not re-render when the block list or selection changes.
export const BlocksStateContext = createContext<BlocksState | null>(null)
export const BlocksActionsContext = createContext<BlocksActions | null>(null)

export const useBlocks = (): BlocksState => {
    const state = useContext(BlocksStateContext)
    if (!state) {
        throw new Error('useBlocks must be used within a BlocksProvider')
    }
    return state
}

export const useBlockActions = (): BlocksActions => {
    const actions = useContext(BlocksActionsContext)
    if (!actions) {
        throw new Error('useBlockActions must be used within a BlocksProvider')
    }
    return actions
}
