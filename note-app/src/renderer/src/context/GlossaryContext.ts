import type { GlossaryEntry } from '@shared/models'
import type { GlossaryErrorCode } from '@shared/types'
import { createContext, useContext } from 'react'

export type GlossaryState = {
    entries: GlossaryEntry[] | undefined
    isLoading: boolean
    loadFailed: boolean
    // Fraction of the list width given to the key column. Session-only —
    // it survives view switches but is not persisted to settings.
    splitRatio: number
}

// Error codes stay untranslated here; the view maps them to i18n strings.
export type GlossaryMutationOutcome = { ok: true } | { ok: false; error: GlossaryErrorCode }

export type GlossaryActions = {
    refreshEntries: () => Promise<void>
    createEntry: (key: string, explanation: string) => Promise<GlossaryMutationOutcome>
    updateEntry: (id: string, key: string, explanation: string) => Promise<GlossaryMutationOutcome>
    deleteEntry: (id: string) => Promise<boolean>
    setSplitRatio: (ratio: number) => void
}

export const GlossaryStateContext = createContext<GlossaryState | null>(null)
export const GlossaryActionsContext = createContext<GlossaryActions | null>(null)

export const useGlossary = (): GlossaryState => {
    const state = useContext(GlossaryStateContext)
    if (!state) throw new Error('useGlossary must be used within a GlossaryProvider')
    return state
}

export const useGlossaryActions = (): GlossaryActions => {
    const actions = useContext(GlossaryActionsContext)
    if (!actions) throw new Error('useGlossaryActions must be used within a GlossaryProvider')
    return actions
}
