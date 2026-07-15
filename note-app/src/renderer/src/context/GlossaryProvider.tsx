import type { GlossaryEntry } from '@shared/models'
import type { GlossaryMutationResult } from '@shared/types'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    GlossaryActions,
    GlossaryActionsContext,
    GlossaryMutationOutcome,
    GlossaryState,
    GlossaryStateContext
} from './GlossaryContext'

const sortEntries = (entries: GlossaryEntry[]): GlossaryEntry[] =>
    [...entries].sort((left, right) =>
        left.key.localeCompare(right.key, undefined, { sensitivity: 'base' }) ||
        left.createdAt - right.createdAt
    )

const outcomeFor = (result: GlossaryMutationResult): GlossaryMutationOutcome =>
    result.error ? { ok: false, error: result.error } : { ok: true }

export const GlossaryProvider = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
    const [entries, setEntries] = useState<GlossaryEntry[] | undefined>(undefined)
    const [isLoading, setIsLoading] = useState(true)
    const [loadFailed, setLoadFailed] = useState(false)
    const [splitRatio, setSplitRatioState] = useState(0.35)

    const refreshEntries = useCallback(async (): Promise<void> => {
        setIsLoading(true)
        try {
            const loaded = await window.context.getGlossaryEntries()
            setEntries(sortEntries(loaded))
            setLoadFailed(false)
        } catch {
            setEntries((previous) => previous ?? [])
            setLoadFailed(true)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        void refreshEntries()
    }, [refreshEntries])

    const createEntry = useCallback(async (key: string, explanation: string): Promise<GlossaryMutationOutcome> => {
        const result = await window.context.createGlossaryEntry(key, explanation)
        if (result.entry) {
            const created = result.entry
            setEntries((previous) => sortEntries([...(previous ?? []), created]))
        }
        return outcomeFor(result)
    }, [])

    const updateEntry = useCallback(async (
        id: string,
        key: string,
        explanation: string
    ): Promise<GlossaryMutationOutcome> => {
        const result = await window.context.updateGlossaryEntry(id, key, explanation)
        if (result.entry) {
            const updated = result.entry
            setEntries((previous) => sortEntries(
                (previous ?? []).map((entry) => entry.id === id ? updated : entry)
            ))
        }
        return outcomeFor(result)
    }, [])

    const deleteEntry = useCallback(async (id: string): Promise<boolean> => {
        const deleted = await window.context.deleteGlossaryEntry(id)
        if (deleted) setEntries((previous) => previous?.filter((entry) => entry.id !== id))
        return deleted
    }, [])

    const setSplitRatio = useCallback((ratio: number): void => {
        setSplitRatioState(Math.min(0.8, Math.max(0.2, ratio)))
    }, [])

    const stateValue: GlossaryState = useMemo(
        () => ({ entries, isLoading, loadFailed, splitRatio }),
        [entries, isLoading, loadFailed, splitRatio]
    )

    const actionsValue: GlossaryActions = useMemo(
        () => ({ refreshEntries, createEntry, updateEntry, deleteEntry, setSplitRatio }),
        [refreshEntries, createEntry, updateEntry, deleteEntry, setSplitRatio]
    )

    return (
        <GlossaryStateContext.Provider value={stateValue}>
            <GlossaryActionsContext.Provider value={actionsValue}>
                {children}
            </GlossaryActionsContext.Provider>
        </GlossaryStateContext.Provider>
    )
}
