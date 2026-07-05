import { BlockMeta, NoteContent } from '@shared/models'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    BlocksActions,
    BlocksActionsContext,
    BlocksState,
    BlocksStateContext,
    SelectedBlock
} from './BlocksContext'
import { useGoals } from './GoalsContext'
import { useSettings } from './SettingsContext'

const sortBlocks = (blocks: BlockMeta[]): BlockMeta[] =>
    [...blocks].sort((a, b) => b.createdAt - a.createdAt)

const joinAppend = (existing: string, text: string): string =>
    existing.trim().length === 0 ? text : `${existing.trimEnd()}\n\n${text}`

export const BlocksProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [blocks, setBlocks] = useState<BlockMeta[] | undefined>(undefined)
    const [blockContents, setBlockContents] = useState<Record<string, string>>({})
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
    const [openBlockId, setOpenBlockId] = useState<string | null>(null)
    const [contentVersion, setContentVersion] = useState(0)

    const { settings } = useSettings()
    const { selectedCategory } = useGoals()
    const windowMs = settings.blockWindowMinutes * 60_000

    useEffect(() => {
        let cancelled = false

        const loadBlocks = async (): Promise<void> => {
            // Settings are fetched here as well (not via context) so the
            // restart-reopen check below uses the persisted window even if
            // SettingsProvider has not finished loading yet.
            const [loadedBlocks, loadedSettings] = await Promise.all([
                window.context.getBlocks(),
                window.context.getSettings()
            ])
            if (cancelled) return
            setBlocks(sortBlocks(loadedBlocks))

            // Reopen the most recently touched block when the app was
            // restarted mid-window; otherwise everything starts closed.
            const latest = loadedBlocks.reduce<BlockMeta | null>(
                (acc, block) => (acc === null || block.updatedAt > acc.updatedAt ? block : acc),
                null
            )
            if (latest && Date.now() - latest.updatedAt < loadedSettings.blockWindowMinutes * 60_000) {
                setOpenBlockId(latest.id)
            }
        }

        void loadBlocks()
        return () => {
            cancelled = true
        }
    }, [])

    // Lazily fetch the markdown of blocks in the viewed category that are
    // not cached yet. Re-runs when the cache fills, but then finds nothing
    // missing and bails out immediately.
    useEffect(() => {
        if (!blocks) return
        const missing = blocks.filter(
            (block) => block.category === selectedCategory && !(block.id in blockContents)
        )
        if (missing.length === 0) return

        let cancelled = false

        const loadContents = async (): Promise<void> => {
            const entries = await Promise.all(
                missing.map(
                    async (block) =>
                        [block.id, (await window.context.readBlock(block.id)).content] as const
                )
            )
            if (cancelled) return
            setBlockContents((prev) => {
                const next = { ...prev }
                for (const [id, content] of entries) {
                    next[id] = content
                }
                return next
            })
        }

        void loadContents()
        return () => {
            cancelled = true
        }
    }, [blocks, selectedCategory, blockContents])

    const selectedBlock: SelectedBlock | null = useMemo(() => {
        if (selectedBlockId === null) return null
        const meta = blocks?.find((block) => block.id === selectedBlockId)
        const content = blockContents[selectedBlockId]
        return meta && content !== undefined ? { ...meta, content } : null
    }, [blocks, blockContents, selectedBlockId])

    // Latest snapshots so the action callbacks can stay referentially stable.
    // Synced after every commit; actions only run from user events, which React
    // dispatches after pending effects have flushed.
    const blocksRef = useRef(blocks)
    const selectedBlockRef = useRef(selectedBlock)
    const openBlockIdRef = useRef(openBlockId)
    const windowMsRef = useRef(windowMs)
    const selectedCategoryRef = useRef(selectedCategory)
    useEffect(() => {
        blocksRef.current = blocks
        selectedBlockRef.current = selectedBlock
        openBlockIdRef.current = openBlockId
        windowMsRef.current = windowMs
        selectedCategoryRef.current = selectedCategory
    })

    // Close the open block once its idle window elapses. Every write bumps
    // the block's updatedAt, which reschedules this timeout — that *is* the
    // "each write resets the countdown" behavior. Settings changes reschedule
    // via windowMs.
    const openBlockUpdatedAt =
        openBlockId !== null
            ? (blocks?.find((block) => block.id === openBlockId)?.updatedAt ?? null)
            : null
    useEffect(() => {
        if (openBlockId === null || openBlockUpdatedAt === null) return

        const remaining = openBlockUpdatedAt + windowMs - Date.now()
        const timer = setTimeout(() => setOpenBlockId(null), Math.max(remaining, 0))
        return () => clearTimeout(timer)
    }, [openBlockId, openBlockUpdatedAt, windowMs])

    const selectBlock = useCallback((id: string | null) => {
        setSelectedBlockId(id)
    }, [])

    const submitQuickNote = useCallback(async (text: string) => {
        const trimmed = text.trim()
        if (!trimmed) return

        // Captures target the viewed category (null = Quick Notes). The open
        // block only receives appends when it belongs to that category —
        // capturing elsewhere starts a fresh block, which then becomes the
        // single open one. Freshness is re-checked from the latest snapshots
        // at submit time so append-vs-create is correct even if the expiry
        // timer misfired.
        const targetCategory = selectedCategoryRef.current
        const currentBlocks = blocksRef.current
        const openId = openBlockIdRef.current
        const openTarget = openId ? currentBlocks?.find((block) => block.id === openId) : undefined

        if (
            openTarget &&
            openTarget.category === targetCategory &&
            Date.now() - openTarget.updatedAt < windowMsRef.current
        ) {
            const updatedMeta = await window.context.appendToBlock(openTarget.id, trimmed)
            if (updatedMeta) {
                setBlocks((prev) =>
                    prev?.map((block) => (block.id === updatedMeta.id ? updatedMeta : block))
                )
                setBlockContents((prev) =>
                    prev[updatedMeta.id] !== undefined
                        ? { ...prev, [updatedMeta.id]: joinAppend(prev[updatedMeta.id], trimmed) }
                        : prev
                )
                // Remount the editor if the appended block is being edited.
                if (selectedBlockRef.current?.id === updatedMeta.id) {
                    setContentVersion((version) => version + 1)
                }
                return
            }
            // The block vanished on disk — fall through and start a new one.
        }

        const meta = await window.context.createBlock({ content: trimmed }, targetCategory)
        setBlocks((prev) => (prev ? [meta, ...prev] : [meta]))
        setBlockContents((prev) => ({ ...prev, [meta.id]: trimmed }))
        setOpenBlockId(meta.id)
    }, [])

    const saveBlock = useCallback(async (newContent: NoteContent) => {
        const currentSelected = selectedBlockRef.current
        if (!currentSelected) return

        const updatedMeta = await window.context.writeBlock(currentSelected.id, newContent)
        if (!updatedMeta) return

        // Swap the meta without re-sorting so the block does not jump in the
        // feed. openBlockId is untouched: editing a closed block is
        // edit-in-place, while editing the open block extends its window via
        // the bumped updatedAt. MDXEditor ignores markdown prop changes on a
        // mounted instance, so refreshing the cache does not disturb typing.
        setBlocks((prev) =>
            prev?.map((block) => (block.id === updatedMeta.id ? updatedMeta : block))
        )
        setBlockContents((prev) => ({ ...prev, [updatedMeta.id]: newContent.content }))
    }, [])

    const deleteBlock = useCallback(async (id: string) => {
        const isDeleted = await window.context.deleteBlock(id)
        if (!isDeleted) return

        setBlocks((prev) => prev?.filter((block) => block.id !== id))
        setBlockContents((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
        })
        setOpenBlockId((prev) => (prev === id ? null : prev))
        setSelectedBlockId((prev) => (prev === id ? null : prev))
    }, [])

    const stateValue: BlocksState = useMemo(
        () => ({
            blocks,
            blockContents,
            selectedBlockId,
            selectedBlock,
            openBlockId,
            contentVersion
        }),
        [blocks, blockContents, selectedBlockId, selectedBlock, openBlockId, contentVersion]
    )

    const actionsValue: BlocksActions = useMemo(
        () => ({ selectBlock, submitQuickNote, saveBlock, deleteBlock }),
        [selectBlock, submitQuickNote, saveBlock, deleteBlock]
    )

    return (
        <BlocksStateContext.Provider value={stateValue}>
            <BlocksActionsContext.Provider value={actionsValue}>
                {children}
            </BlocksActionsContext.Provider>
        </BlocksStateContext.Provider>
    )
}
