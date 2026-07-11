import { BlockMeta, Goal, NoteContent } from '@shared/models'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    BlocksActions,
    BlocksActionsContext,
    BlocksState,
    BlocksStateContext,
    SelectedBlock
} from './BlocksContext'
import { useGoalActions, useGoals } from './GoalsContext'
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
    const [routingErrors, setRoutingErrors] = useState<Record<string, string>>({})
    const [routingInProgressIds, setRoutingInProgressIds] = useState<Set<string>>(() => new Set())

    const { settings } = useSettings()
    const { selectedCategory } = useGoals()
    const { registerPersistedGoal } = useGoalActions()
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
            (block) => block.categories.includes(selectedCategory) && !(block.id in blockContents)
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
    const selectedBlockIdRef = useRef(selectedBlockId)
    const openBlockIdRef = useRef(openBlockId)
    const windowMsRef = useRef(windowMs)
    const selectedCategoryRef = useRef(selectedCategory)
    const captureModeRef = useRef(settings.captureMode)
    useEffect(() => {
        blocksRef.current = blocks
        selectedBlockRef.current = selectedBlock
        selectedBlockIdRef.current = selectedBlockId
        openBlockIdRef.current = openBlockId
        windowMsRef.current = windowMs
        selectedCategoryRef.current = selectedCategory
        captureModeRef.current = settings.captureMode
    })

    // Silent auto-cleanup of blocks left with no meaningful content. The
    // emptiness check runs atomically in main under the index lock, so a
    // still-in-flight save (queued ahead of this call) always wins.
    const cleanupBlockIfEmpty = useCallback(async (id: string) => {
        const isDeleted = await window.context.deleteBlockIfEmpty(id)
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

    const classifyQuickNote = useCallback(async (id: string) => {
        const block = blocksRef.current?.find((item) => item.id === id)
        if (!block?.categories.includes(null)) return
        setRoutingErrors((previous) => {
            const next = { ...previous }
            delete next[id]
            return next
        })
        setRoutingInProgressIds((previous) => new Set(previous).add(id))
        try {
            const result = await window.context.classifyBlock(id)
            if (result.error) {
                setRoutingErrors((previous) => ({ ...previous, [id]: result.error as string }))
                return
            }
            const updated = result.block
            if (!updated) return
            setBlocks((prev) => prev?.map((item) => item.id === updated.id ? updated : item))
        } catch (error) {
            setRoutingErrors((previous) => ({
                ...previous,
                [id]: error instanceof Error ? error.message : 'Could not classify this note.'
            }))
        } finally {
            setRoutingInProgressIds((previous) => {
                const next = new Set(previous)
                next.delete(id)
                return next
            })
        }
    }, [])

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
        const timer = setTimeout(() => {
            setOpenBlockId(null)
            // An expired block that was left empty is removed. When the
            // natural writing surface is mounted for this block's category
            // it finalizes the session itself — it may still hold unflushed
            // text, so deleting here could race that final save.
            const expired = blocksRef.current?.find((block) => block.id === openBlockId)
            const ownedByNaturalSurface =
                captureModeRef.current === 'natural' &&
                selectedBlockIdRef.current === null &&
                expired !== undefined &&
                expired.categories.includes(selectedCategoryRef.current)
            if (!ownedByNaturalSurface) {
                void cleanupBlockIfEmpty(openBlockId)
                void classifyQuickNote(openBlockId)
            }
        }, Math.max(remaining, 0))
        return () => clearTimeout(timer)
    }, [openBlockId, openBlockUpdatedAt, windowMs, cleanupBlockIfEmpty, classifyQuickNote])

    const selectBlock = useCallback(
        (id: string | null) => {
            const previousId = selectedBlockIdRef.current
            setSelectedBlockId(id)
            // Closing the editor (or switching blocks) removes the block it
            // showed if the user left it empty.
            if (previousId !== null && previousId !== id) {
                void cleanupBlockIfEmpty(previousId)
            }
        },
        [cleanupBlockIfEmpty]
    )

    const submitQuickNote = useCallback(async (text: string) => {
        const trimmed = text.trim()
        if (!trimmed) return

        // Captures target the viewed category (null = Quick Notes). The open
        // block only receives appends when the viewed category is among its
        // categories — capturing elsewhere starts a fresh block, which then
        // becomes the single open one. Freshness is re-checked from the
        // latest snapshots at submit time so append-vs-create is correct
        // even if the expiry timer misfired.
        const targetCategory = selectedCategoryRef.current
        const currentBlocks = blocksRef.current
        const openId = openBlockIdRef.current
        const openTarget = openId ? currentBlocks?.find((block) => block.id === openId) : undefined

        if (
            openTarget &&
            openTarget.categories.includes(targetCategory) &&
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

        const meta = await window.context.createBlock({ content: trimmed }, [targetCategory])
        setBlocks((prev) => (prev ? [meta, ...prev] : [meta]))
        setBlockContents((prev) => ({ ...prev, [meta.id]: trimmed }))
        setOpenBlockId(meta.id)
    }, [])

    const updateBlockContent = useCallback(async (id: string, newContent: NoteContent) => {
        const updatedMeta = await window.context.writeBlock(id, newContent)
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

        // A write that empties a block deletes it once the block is no longer
        // in use; blocks still selected or open are cleaned when they close.
        if (
            newContent.content.trim().length === 0 &&
            selectedBlockIdRef.current !== id &&
            openBlockIdRef.current !== id
        ) {
            void cleanupBlockIfEmpty(id)
        }
    }, [cleanupBlockIfEmpty])

    const saveBlock = useCallback(
        async (newContent: NoteContent) => {
            const currentSelected = selectedBlockRef.current
            if (!currentSelected) return
            await updateBlockContent(currentSelected.id, newContent)
        },
        [updateBlockContent]
    )

    // Starts a natural-capture session: the new block becomes the open one.
    // The category is explicit (not read from the ref) so a flush racing a
    // category switch still lands in the category the text was written in.
    const createCaptureBlock = useCallback(async (content: string, category: string | null) => {
        const meta = await window.context.createBlock({ content }, [category])
        setBlocks((prev) => (prev ? [meta, ...prev] : [meta]))
        setBlockContents((prev) => ({ ...prev, [meta.id]: content }))
        setOpenBlockId(meta.id)
        return meta
    }, [])

    // Multi-goal plumbing: replaces a block's full category list (future
    // "also show in…" UI). The block's markdown file is shared by all of
    // its categories.
    const updateBlockCategories = useCallback(async (id: string, categories: (string | null)[]) => {
        const updatedMeta = await window.context.updateBlockCategories(id, categories)
        if (!updatedMeta) return

        setBlocks((prev) =>
            prev?.map((block) => (block.id === updatedMeta.id ? updatedMeta : block))
        )
    }, [])

    const applyBlockRouting = useCallback(async (id: string, goalId: string): Promise<boolean> => {
        const updatedMeta = await window.context.applyBlockRouting(id, goalId)
        if (!updatedMeta) return false
        setBlocks((prev) => prev?.map((block) => (block.id === updatedMeta.id ? updatedMeta : block)))
        setRoutingErrors((previous) => {
            const next = { ...previous }
            delete next[id]
            return next
        })
        return true
    }, [])

    const applyNewGoalRouting = useCallback(async (id: string): Promise<Goal | null> => {
        const result = await window.context.applyNewGoalRouting(id)
        if (!result) return null
        registerPersistedGoal(result.goal)
        setBlocks((previous) => previous?.map((block) =>
            block.id === result.block.id ? result.block : block
        ))
        setRoutingErrors((previous) => {
            const next = { ...previous }
            delete next[id]
            return next
        })
        return result.goal
    }, [registerPersistedGoal])

    const acknowledgeBlockInGoal = useCallback(async (id: string, goalId: string): Promise<boolean> => {
        const updatedMeta = await window.context.acknowledgeBlockInGoal(id, goalId)
        if (!updatedMeta) return false
        setBlocks((previous) => previous?.map((block) => block.id === updatedMeta.id ? updatedMeta : block))
        return true
    }, [])

    // Manually finalizes the active capture session (distinct from delete):
    // the block simply stops being open and shows as a normal closed card in
    // the feed. A block left blank is removed by the empty cleanup, exactly
    // like window expiry. Callers with unflushed text (the natural surface)
    // must flush before calling this so the cleanup sees the final content.
    const closeOpenBlock = useCallback(() => {
        const openId = openBlockIdRef.current
        if (openId === null) return

        setOpenBlockId(null)
        void cleanupBlockIfEmpty(openId)
        void classifyQuickNote(openId)
    }, [cleanupBlockIfEmpty, classifyQuickNote])

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
            routingErrors,
            routingInProgressIds,
            contentVersion
        }),
        [blocks, blockContents, selectedBlockId, selectedBlock, openBlockId, routingErrors, routingInProgressIds, contentVersion]
    )

    const actionsValue: BlocksActions = useMemo(
        () => ({ selectBlock, submitQuickNote, saveBlock, updateBlockContent, createCaptureBlock, updateBlockCategories, applyBlockRouting, applyNewGoalRouting, acknowledgeBlockInGoal, classifyBlock: classifyQuickNote, cleanupBlockIfEmpty, closeOpenBlock, deleteBlock }),
        [selectBlock, submitQuickNote, saveBlock, updateBlockContent, createCaptureBlock, updateBlockCategories, applyBlockRouting, applyNewGoalRouting, acknowledgeBlockInGoal, classifyQuickNote, cleanupBlockIfEmpty, closeOpenBlock, deleteBlock]
    )

    return (
        <BlocksStateContext.Provider value={stateValue}>
            <BlocksActionsContext.Provider value={actionsValue}>
                {children}
            </BlocksActionsContext.Provider>
        </BlocksStateContext.Provider>
    )
}
