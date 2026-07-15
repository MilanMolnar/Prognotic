import {
    appDirectory,
    fileEncoding,
    glossaryExplanationMaxLength,
    glossaryFileName,
    maxGlossaryKeyLengthLimit
} from '@shared/constants'
import { glossaryKeysEqual, validateGlossaryFields } from '@shared/glossary'
import type { GlossaryEntry } from '@shared/models'
import type {
    CreateGlossaryEntry,
    DeleteGlossaryEntry,
    GetGlossaryEntries,
    GlossaryMutationResult,
    UpdateGlossaryEntry
} from '@shared/types'
import { randomUUID } from 'crypto'
import { ensureDir, readFile, rename, writeFile } from 'fs-extra'
import { homedir } from 'os'
import { join } from 'path'
import { getSettings } from '../lib'

export type GlossaryStoreState = {
    version: 1
    entries: Record<string, GlossaryEntry>
}

const glossaryPath = (): string => join(homedir(), appDirectory, glossaryFileName)

const normalizeEntry = (raw: unknown): GlossaryEntry | null => {
    if (!raw || typeof raw !== 'object') return null
    const entry = raw as Partial<GlossaryEntry>
    if (
        typeof entry.id !== 'string' ||
        typeof entry.key !== 'string' ||
        typeof entry.explanation !== 'string'
    ) return null

    // Stored entries are trusted up to the hard limits; the configurable key
    // limit only applies to new writes so lowering it never destroys data.
    const key = entry.key.trim().slice(0, maxGlossaryKeyLengthLimit)
    const explanation = entry.explanation.trim().slice(0, glossaryExplanationMaxLength)
    if (!key || !explanation) return null

    const now = Date.now()
    return {
        id: entry.id,
        key,
        explanation,
        createdAt: typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
            ? entry.createdAt
            : now,
        updatedAt: typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
            ? entry.updatedAt
            : now
    }
}

const emptyState = (): GlossaryStoreState => ({ version: 1, entries: {} })

const loadGlossaryState = async (): Promise<GlossaryStoreState> => {
    try {
        const parsed = JSON.parse(await readFile(glossaryPath(), { encoding: fileEncoding })) as {
            entries?: unknown
        }
        const values = parsed.entries && typeof parsed.entries === 'object'
            ? Object.values(parsed.entries as Record<string, unknown>)
            : []
        const entries: Record<string, GlossaryEntry> = {}
        for (const raw of values) {
            const entry = normalizeEntry(raw)
            if (entry) entries[entry.id] = entry
        }
        return { version: 1, entries }
    } catch {
        return emptyState()
    }
}

const saveGlossaryState = async (state: GlossaryStoreState): Promise<void> => {
    await ensureDir(join(homedir(), appDirectory))
    const path = glossaryPath()
    const temporary = `${path}.tmp`
    await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: fileEncoding })
    await rename(temporary, path)
}

let glossaryLock: Promise<unknown> = Promise.resolve()

const withGlossaryLock = <T>(task: () => Promise<T>): Promise<T> => {
    const run = glossaryLock.then(task, task)
    glossaryLock = run.catch(() => undefined)
    return run
}

const mutateGlossaryState = async <T>(
    mutate: (state: GlossaryStoreState) => T | Promise<T>
): Promise<T> => withGlossaryLock(async () => {
    const state = await loadGlossaryState()
    const result = await mutate(state)
    await saveGlossaryState(state)
    return result
})

const sortEntries = (entries: GlossaryEntry[]): GlossaryEntry[] =>
    entries.sort((left, right) =>
        left.key.localeCompare(right.key, undefined, { sensitivity: 'base' }) ||
        left.createdAt - right.createdAt
    )

export const getGlossaryEntries: GetGlossaryEntries = async () => {
    const state = await withGlossaryLock(loadGlossaryState)
    return sortEntries(Object.values(state.entries))
}

const configuredKeyMaxLength = async (): Promise<number> =>
    // getSettings already clamps glossaryKeyMaxLength into the allowed range.
    (await getSettings()).glossaryKeyMaxLength

const hasDuplicateKey = (state: GlossaryStoreState, key: string, ownId?: string): boolean =>
    Object.values(state.entries).some((entry) => entry.id !== ownId && glossaryKeysEqual(entry.key, key))

export const createGlossaryEntry: CreateGlossaryEntry = async (key, explanation) => {
    const keyMaxLength = await configuredKeyMaxLength()
    return mutateGlossaryState((state): GlossaryMutationResult => {
        const validated = validateGlossaryFields(key, explanation, keyMaxLength)
        if (validated.error) return { error: validated.error }
        if (hasDuplicateKey(state, validated.key)) return { error: 'duplicate-key' }

        const now = Date.now()
        const entry: GlossaryEntry = {
            id: randomUUID(),
            key: validated.key,
            explanation: validated.explanation,
            createdAt: now,
            updatedAt: now
        }
        state.entries[entry.id] = entry
        return { entry }
    })
}

export const updateGlossaryEntry: UpdateGlossaryEntry = async (id, key, explanation) => {
    const keyMaxLength = await configuredKeyMaxLength()
    return mutateGlossaryState((state): GlossaryMutationResult => {
        const existing = state.entries[id]
        if (!existing) return { error: 'not-found' }
        const validated = validateGlossaryFields(key, explanation, keyMaxLength)
        if (validated.error) return { error: validated.error }
        if (hasDuplicateKey(state, validated.key, id)) return { error: 'duplicate-key' }

        const entry: GlossaryEntry = {
            ...existing,
            key: validated.key,
            explanation: validated.explanation,
            updatedAt: Date.now()
        }
        state.entries[id] = entry
        return { entry }
    })
}

export const deleteGlossaryEntry: DeleteGlossaryEntry = async (id) =>
    mutateGlossaryState((state) => {
        if (!state.entries[id]) return false
        delete state.entries[id]
        return true
    })
