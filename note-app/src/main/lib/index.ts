import { appDirectory, defaultSettings, excerptMaxLength, fileEncoding, goalsFileName, indexFileName, maxPinnedGoals, settingsFileName } from "@shared/constants"
import { clampGlossaryKeyMaxLength } from '@shared/glossary'
import { reconcileUserGoalPresence, setGoalPresence, userGoalPresenceForCategories } from '@shared/goalPresence'
import { AppSettings, AssistantConversation, BlockMeta, Goal, LlmCredentialName } from "@shared/models"
import { normalizeUiLocale } from '@shared/locales'
import { maxLlmUsageResetDays, normalizeLlmUsageThresholds } from '@shared/llmUsage'
import { AcknowledgeBlockInGoal, AppendToBlock, ApplyBlockRouting, ApplyNewGoalRouting, CreateBlock, CreateGoal, DeleteBlock, DeleteBlockIfEmpty, DeleteGoal, GetAssistantConversations, GetBlocks, GetGoals, GetSettings, ReadBlock, RenameGoal, SaveAssistantConversations, SetSettings, UpdateBlockCategories, WriteBlock } from "@shared/types"
import { randomUUID } from "crypto"
import { dialog, safeStorage } from "electron"
import { ensureDir, readdir, readFile, remove, rename, stat, writeFile } from "fs-extra"
import { homedir } from "os"
import welcomeNoteFile from '../../../resources/welcome-note.md?asset'
import { normalizeCategories, normalizeDictationModeForPlatform, normalizeVerifiedLlmConnection, planLegacyWisprMigration, recordRoutingDecision, updateRoutingDecision } from './persistenceHelpers'
import { removeCalendarItemsForBlock } from '../calendar/store'


export const separator = (): string => {
  if (process.platform === 'win32')
    return "\\"
  return "/"
}
export const getRootDir = (): string => {
    return `${homedir()}${separator()}${appDirectory}`
}

const getIndexPath = (): string => `${getRootDir()}${separator()}${indexFileName}`
const getSettingsPath = (): string => `${getRootDir()}${separator()}${settingsFileName}`
const getGoalsPath = (): string => `${getRootDir()}${separator()}${goalsFileName}`
const getBlockPath = (file: string): string => `${getRootDir()}${separator()}${file}`
const getSecretsPath = (): string => `${getRootDir()}${separator()}secrets.json`
const getAssistantHistoryPath = (): string => `${getRootDir()}${separator()}assistant-history.json`

type BlockIndex = {
    version: number
    blocks: Record<string, BlockMeta>
}

// Serializes every index read-modify-write so concurrent IPC calls
// (editor autosave vs quick-input append) cannot interleave.
let indexLock: Promise<unknown> = Promise.resolve()
const withIndexLock = <T>(task: () => Promise<T>): Promise<T> => {
    const run = indexLock.then(task, task)
    indexLock = run.catch(() => undefined)
    return run
}

// Write to a temp file and rename over the target so a crash mid-write
// never leaves a truncated JSON file behind.
export const writeJsonAtomic = async (filePath: string, data: unknown): Promise<void> => {
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(data, null, 2), { encoding: fileEncoding })
    await rename(tmpPath, filePath)
}

// Entries written before multi-goal support carry a single `category`
// (string | null) instead of `categories`.
type LegacyBlockMeta = Omit<BlockMeta, 'categories'> & { category: string | null }

const migrateBlockMeta = (raw: BlockMeta | LegacyBlockMeta): BlockMeta => {
    if ('categories' in raw && Array.isArray(raw.categories)) return raw
    const { category, ...rest } = raw as LegacyBlockMeta
    return { ...rest, categories: [category ?? null] }
}

// Missing or corrupt index degrades to empty; getBlocks rebuilds it from the
// markdown files on disk. Legacy single-category entries are migrated in
// memory here — `migrated` tells getBlocks to persist the new shape.
const loadIndex = async (): Promise<{ index: BlockIndex; migrated: boolean }> => {
    try {
        const raw = await readFile(getIndexPath(), { encoding: fileEncoding })
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && parsed.blocks && typeof parsed.blocks === 'object') {
            const blocks: Record<string, BlockMeta> = {}
            let migrated = false
            for (const [id, rawMeta] of Object.entries(parsed.blocks)) {
                const meta = migrateBlockMeta(rawMeta as BlockMeta | LegacyBlockMeta)
                if (meta !== rawMeta) migrated = true
                blocks[id] = meta
            }
            return { index: { version: 1, blocks }, migrated }
        }
    } catch {
        console.info('no readable block index, starting fresh')
    }
    return { index: { version: 1, blocks: {} }, migrated: false }
}

export const makeExcerpt = (content: string): string => {
    const firstLine = content
        .split('\n')
        .map((line) =>
            line
                .replace(/^(\s*(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+))+/, '')
                .replace(/[*_`~]/g, '')
                .trim()
        )
        .find((line) => line.length > 0)

    if (!firstLine) return ''
    return firstLine.length > excerptMaxLength ? `${firstLine.slice(0, excerptMaxLength - 1)}…` : firstLine
}

export const getBlocks: GetBlocks = async () => {
    const rootDir = getRootDir()
    await ensureDir(rootDir)

    return withIndexLock(async () => {
        const { index, migrated } = await loadIndex()
        // A legacy-shape index gets rewritten in the migrated shape.
        let changed = migrated

        const fileNames = await readdir(rootDir)
        const mdFiles = new Set(fileNames.filter((fileName) => fileName.endsWith('.md')))

        // Drop index entries whose markdown file disappeared.
        for (const [id, meta] of Object.entries(index.blocks)) {
            if (!mdFiles.has(meta.file)) {
                delete index.blocks[id]
                await removeCalendarItemsForBlock(id)
                changed = true
            }
        }

        // Absorb markdown files the index does not know about (legacy notes,
        // files dropped in by hand) as closed blocks; filenames are preserved.
        const indexedFiles = new Set(Object.values(index.blocks).map((meta) => meta.file))
        for (const file of mdFiles) {
            if (indexedFiles.has(file)) continue

            const fileStats = await stat(getBlockPath(file))
            const content = await readFile(getBlockPath(file), { encoding: fileEncoding })
            const id = randomUUID()

            index.blocks[id] = {
                id,
                file,
                // birthtime is unreliable on some filesystems, so never let
                // createdAt land after updatedAt
                createdAt: Math.min(fileStats.birthtimeMs || fileStats.mtimeMs, fileStats.mtimeMs),
                updatedAt: fileStats.mtimeMs,
                categories: [null],
                excerpt: makeExcerpt(content) || file.replace('.md', ''),
            }
            changed = true
        }

        // First run with no notes at all: seed a welcome block, backdated so
        // it never counts as the open block.
        if (Object.keys(index.blocks).length === 0) {
            console.info('no notes, seeding welcome block')
            const content = await readFile(welcomeNoteFile, { encoding: fileEncoding })
            const id = randomUUID()
            const file = `${id}.md`
            const backdated = Date.now() - 60 * 60 * 1000

            await writeFile(getBlockPath(file), content, { encoding: fileEncoding })
            index.blocks[id] = {
                id,
                file,
                createdAt: backdated,
                updatedAt: backdated,
                categories: [null],
                excerpt: makeExcerpt(content),
            }
            changed = true
        }

        if (changed) {
            await writeJsonAtomic(getIndexPath(), index)
        }

        return Object.values(index.blocks)
    })
}

export const readBlock: ReadBlock = async (id) => {
    const { index } = await loadIndex()
    const meta = index.blocks[id]
    if (!meta) return { content: '' }

    const content = await readFile(getBlockPath(meta.file), { encoding: fileEncoding })
    return { content }
}

export const readBlockSnapshot = async (
    id: string
): Promise<{ meta: BlockMeta; content: string } | null> => withIndexLock(async () => {
    const { index } = await loadIndex()
    const meta = index.blocks[id]
    if (!meta) return null
    const content = await readFile(getBlockPath(meta.file), { encoding: fileEncoding })
    return { meta: { ...meta }, content }
})

export const writeBlock: WriteBlock = async (id, content) => {
    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        if (!meta) return null

        console.info(`Writing block ${id}`)
        await writeFile(getBlockPath(meta.file), content.content, { encoding: fileEncoding })

        meta.updatedAt = Date.now()
        meta.excerpt = makeExcerpt(content.content)
        await writeJsonAtomic(getIndexPath(), index)

        return meta
    })
}

export const createBlock: CreateBlock = async (content, categories) => {
    const rootDir = getRootDir()
    await ensureDir(rootDir)

    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const id = randomUUID()
        const file = `${id}.md`
        const now = Date.now()

        console.info(`Creating block ${id}`)
        await writeFile(getBlockPath(file), content.content, { encoding: fileEncoding })

        const normalizedCategories = normalizeCategories(categories)

        const meta: BlockMeta = {
            id,
            file,
            createdAt: now,
            updatedAt: now,
            categories: normalizedCategories,
            excerpt: makeExcerpt(content.content),
            goalPresence: userGoalPresenceForCategories(normalizedCategories),
        }
        index.blocks[id] = meta
        await writeJsonAtomic(getIndexPath(), index)

        return meta
    })
}

// Re-homes a block: sets the full category list (the single .md file is
// shared by every category — nothing is duplicated on disk). Does not bump
// updatedAt, so re-categorizing never reopens or reorders a block.
export const updateBlockCategories: UpdateBlockCategories = async (id, categories) => {
    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        if (!meta) return null

        console.info(`Updating categories of block ${id}`)
        const normalizedCategories = normalizeCategories(categories)
        meta.goalPresence = reconcileUserGoalPresence(meta.goalPresence, meta.categories, normalizedCategories)
        meta.categories = normalizedCategories
        await writeJsonAtomic(getIndexPath(), index)

        return meta
    })
}

export const setBlockRouting = async (id: string, routing: NonNullable<BlockMeta['routing']>): Promise<BlockMeta | null> => {
    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        if (!meta) return null
        meta.routing = routing
        meta.routingHistory = recordRoutingDecision(meta.routingHistory, routing)
        await writeJsonAtomic(getIndexPath(), index)
        return meta
    })
}

export const setBlockAiLabel = async (id: string, aiLabel: string): Promise<BlockMeta | null> => {
    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        if (!meta) return null
        const normalized = aiLabel.trim().replace(/\s+/g, ' ').split(' ').slice(0, 5).join(' ')
        if (!normalized) return meta
        meta.aiLabel = normalized
        await writeJsonAtomic(getIndexPath(), index)
        return meta
    })
}

export const applyBlockRouting: ApplyBlockRouting = async (id, goalId) => {
    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        if (!meta?.routing || meta.routing.status !== 'pending') return null
        const assignment = meta.routing.assignments.find((item) => item.goalId === goalId)
        if (!assignment) return null
        const previousRouting = meta.routing
        meta.categories = normalizeCategories([...meta.categories, goalId])
        meta.goalPresence = setGoalPresence(meta.goalPresence, goalId, 'routed', false)
        const appliedRouting: NonNullable<BlockMeta['routing']> = { ...meta.routing, status: 'applied', assignments: [assignment] }
        meta.routing = appliedRouting
        meta.routingHistory = updateRoutingDecision(meta.routingHistory, previousRouting, appliedRouting)
        await writeJsonAtomic(getIndexPath(), index)
        return meta
    })
}

export const applyNewGoalRouting: ApplyNewGoalRouting = async (id) => {
    await ensureDir(getRootDir())

    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        const suggestion = meta?.routing?.suggestedNewGoal
        if (
            !meta?.routing ||
            meta.routing.status !== 'pending' ||
            meta.routing.hasConfidentMatch !== false ||
            !suggestion ||
            typeof suggestion.name !== 'string'
        ) return null

        const name = suggestion.name.trim().slice(0, 80)
        if (!name) return null
        const confidence = Number.isFinite(suggestion.confidence)
            ? Math.max(0, Math.min(1, suggestion.confidence))
            : 0
        const goalsFile = await loadGoalsFile()
        const goal: Goal = {
            id: randomUUID(),
            name,
            description: typeof suggestion.description === 'string'
                ? suggestion.description.trim().slice(0, 500)
                : '',
            routingHints: '',
            createdAt: Date.now()
        }

        const previousRouting = meta.routing
        meta.categories = normalizeCategories([...meta.categories, goal.id])
        meta.goalPresence = setGoalPresence(meta.goalPresence, goal.id, 'routed', false)
        const appliedRouting: NonNullable<BlockMeta['routing']> = {
            ...meta.routing,
            status: 'applied',
            assignments: [{ goalId: goal.id, confidence }]
        }
        meta.routing = appliedRouting
        meta.routingHistory = updateRoutingDecision(meta.routingHistory, previousRouting, appliedRouting)
        goalsFile.goals[goal.id] = goal

        await Promise.all([
            writeJsonAtomic(getGoalsPath(), goalsFile),
            writeJsonAtomic(getIndexPath(), index)
        ])
        return { goal, block: meta }
    })
}

export const acknowledgeBlockInGoal: AcknowledgeBlockInGoal = async (id, goalId) => {
    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        if (!meta?.categories.includes(goalId)) return null
        const presence = meta.goalPresence?.[goalId]
        if (!presence) return meta

        meta.goalPresence = setGoalPresence(meta.goalPresence, goalId, presence.source, true)
        await writeJsonAtomic(getIndexPath(), index)
        return meta
    })
}

export const setPluginBlockPresence = async (
    id: string,
    categoryId: string,
    visited: boolean
): Promise<BlockMeta | null> => {
    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        if (!meta?.categories.includes(categoryId)) return null

        meta.goalPresence = setGoalPresence(meta.goalPresence, categoryId, 'plugin', visited)
        await writeJsonAtomic(getIndexPath(), index)
        return meta
    })
}

export const appendToBlock: AppendToBlock = async (id, text) => {
    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        if (!meta) return null

        const blockPath = getBlockPath(meta.file)
        const existing = await readFile(blockPath, { encoding: fileEncoding })
        const joined = existing.trim().length === 0 ? text : `${existing.trimEnd()}\n\n${text}`

        console.info(`Appending to block ${id}`)
        await writeFile(blockPath, joined, { encoding: fileEncoding })

        meta.updatedAt = Date.now()
        meta.excerpt = makeExcerpt(joined)
        await writeJsonAtomic(getIndexPath(), index)

        return meta
    })
}

export const deleteBlockPermanently = async (id: string): Promise<boolean> => {
    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        if (!meta) return false

        await remove(getBlockPath(meta.file))
        delete index.blocks[id]
        await removeCalendarItemsForBlock(id)
        await writeJsonAtomic(getIndexPath(), index)
        return true
    })
}

export const deleteBlock: DeleteBlock = async (id) => {
    const { index } = await loadIndex()
    const meta = index.blocks[id]
    if (!meta) return false

    const label = meta.excerpt || new Date(meta.createdAt).toLocaleString()

    const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: 'delete note block',
        message: `Are you sure you want to delete "${label}"?`,
        buttons: ['Delete', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
    })

    if (response == 1) {
        console.info("delete canceled")
        return false
    }

    console.info('deleting block')

    return deleteBlockPermanently(id)
}

// Silent counterpart to deleteBlock for automatic cleanup of blocks left
// with no meaningful content. The emptiness check runs under the index lock,
// so an in-flight save (which queues ahead of this call) always wins — a
// block that just received text is never deleted. The seeded welcome block
// is safe by the same rule: it has content unless the user cleared it.
export const deleteBlockIfEmpty: DeleteBlockIfEmpty = async (id) => {
    return withIndexLock(async () => {
        const { index } = await loadIndex()
        const meta = index.blocks[id]
        if (!meta) return false

        const blockPath = getBlockPath(meta.file)
        let content = ''
        try {
            content = await readFile(blockPath, { encoding: fileEncoding })
        } catch {
            // Unreadable or missing file — treat as empty and drop the entry.
        }
        if (content.trim().length > 0) return false

        console.info(`Deleting empty block ${id}`)
        await remove(blockPath)
        delete index.blocks[id]
        await removeCalendarItemsForBlock(id)
        await writeJsonAtomic(getIndexPath(), index)

        return true
    })
}

type GoalsFile = {
    version: number
    goals: Record<string, Goal>
}

// Missing or corrupt goals file degrades to empty.
const loadGoalsFile = async (): Promise<GoalsFile> => {
    try {
        const raw = await readFile(getGoalsPath(), { encoding: fileEncoding })
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && parsed.goals && typeof parsed.goals === 'object') {
            return { version: 1, goals: parsed.goals }
        }
    } catch {
        console.info('no readable goals file, starting fresh')
    }
    return { version: 1, goals: {} }
}

export const getGoals: GetGoals = async () => {
    await ensureDir(getRootDir())
    const goalsFile = await loadGoalsFile()
    return Object.values(goalsFile.goals)
}

export const createGoal: CreateGoal = async (name, description, routingHints = '') => {
    await ensureDir(getRootDir())

    return withIndexLock(async () => {
        const goalsFile = await loadGoalsFile()
        const goal: Goal = {
            id: randomUUID(),
            name: name.trim(),
            description: description.trim(),
            routingHints: routingHints.trim(),
            createdAt: Date.now(),
        }

        console.info(`Creating goal ${goal.id}`)
        goalsFile.goals[goal.id] = goal
        await writeJsonAtomic(getGoalsPath(), goalsFile)

        return goal
    })
}

export const renameGoal: RenameGoal = async (id, name, description, routingHints = '') => {
    return withIndexLock(async () => {
        const goalsFile = await loadGoalsFile()
        const goal = goalsFile.goals[id]
        if (!goal) return null
        goal.name = name.trim()
        goal.description = description.trim()
        goal.routingHints = routingHints.trim()
        await writeJsonAtomic(getGoalsPath(), goalsFile)
        return goal
    })
}

export const deleteGoal: DeleteGoal = async (id) => {
    return withIndexLock(async () => {
        const goalsFile = await loadGoalsFile()
        if (!goalsFile.goals[id]) return false
        delete goalsFile.goals[id]

        const { index } = await loadIndex()
        for (const block of Object.values(index.blocks)) {
            if (block.categories.includes(id)) {
                block.categories = normalizeCategories(block.categories.filter((category) => category !== id))
            }
            if (block.goalPresence?.[id]) {
                const nextPresence = { ...block.goalPresence }
                delete nextPresence[id]
                block.goalPresence = Object.keys(nextPresence).length > 0 ? nextPresence : undefined
            }
        }

        await Promise.all([
            writeJsonAtomic(getGoalsPath(), goalsFile),
            writeJsonAtomic(getIndexPath(), index)
        ])
        return true
    })
}

const clampSettings = (settings: Partial<AppSettings>): AppSettings => ({
    uiLocale: normalizeUiLocale(settings.uiLocale),
    blockWindowMinutes: typeof settings.blockWindowMinutes === 'number' && Number.isFinite(settings.blockWindowMinutes)
        ? Math.max(1, Math.round(settings.blockWindowMinutes))
        : defaultSettings.blockWindowMinutes,
    glossaryKeyMaxLength: clampGlossaryKeyMaxLength(settings.glossaryKeyMaxLength),
    pinnedGoalIds: Array.isArray(settings.pinnedGoalIds)
        ? settings.pinnedGoalIds.filter((id): id is string => typeof id === 'string').slice(0, maxPinnedGoals)
        : defaultSettings.pinnedGoalIds,
    captureMode: settings.captureMode === 'natural' ? 'natural' : 'chat',
    dictationMode: normalizeDictationModeForPlatform(settings.dictationMode, process.platform),
    onboardingCompleted: settings.onboardingCompleted === true,
    onboardingSkipped: settings.onboardingSkipped === true,
    onboardingCompletedAt: typeof settings.onboardingCompletedAt === 'number' &&
        Number.isFinite(settings.onboardingCompletedAt)
        ? settings.onboardingCompletedAt
        : undefined,
    llm: {
        provider: settings.llm?.provider === 'openai' || settings.llm?.provider === 'anthropic' || settings.llm?.provider === 'local'
            ? settings.llm.provider
            : 'gemini',
        model: typeof settings.llm?.model === 'string' ? settings.llm.model.trim() : '',
        pluginWizardModel: typeof settings.llm?.pluginWizardModel === 'string'
            ? settings.llm.pluginWizardModel.trim()
            : '',
        imageRecognitionModel: typeof settings.llm?.imageRecognitionModel === 'string'
            ? settings.llm.imageRecognitionModel.trim()
            : '',
        localBaseUrl: typeof settings.llm?.localBaseUrl === 'string' && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/.test(settings.llm.localBaseUrl.trim())
            ? settings.llm.localBaseUrl.trim().replace(/\/$/, '')
            : defaultSettings.llm.localBaseUrl,
        polishDictation: settings.llm?.polishDictation === true,
        aiBlockNameSummary: settings.llm?.aiBlockNameSummary === true,
        usageBudget: {
            enabled: typeof settings.llm?.usageBudget?.enabled === 'boolean'
                ? settings.llm.usageBudget.enabled
                : defaultSettings.llm.usageBudget.enabled,
            limitUsd: typeof settings.llm?.usageBudget?.limitUsd === 'number' &&
                Number.isFinite(settings.llm.usageBudget.limitUsd)
                ? Math.max(0, Math.min(1_000_000, Math.round(settings.llm.usageBudget.limitUsd * 100) / 100))
                : defaultSettings.llm.usageBudget.limitUsd,
            resetInterval: settings.llm?.usageBudget?.resetInterval === 'forever' ||
                settings.llm?.usageBudget?.resetInterval === 'yearly' ||
                settings.llm?.usageBudget?.resetInterval === 'days'
                ? settings.llm.usageBudget.resetInterval
                : 'monthly',
            resetDays: typeof settings.llm?.usageBudget?.resetDays === 'number' &&
                Number.isFinite(settings.llm.usageBudget.resetDays)
                ? Math.max(1, Math.min(maxLlmUsageResetDays, Math.round(settings.llm.usageBudget.resetDays)))
                : defaultSettings.llm.usageBudget.resetDays,
            // Invalid or unordered persisted thresholds fall back as a set,
            // preserving yellow < red < critical within 0–100.
            thresholds: normalizeLlmUsageThresholds(settings.llm?.usageBudget?.thresholds),
            periodStartedAt: typeof settings.llm?.usageBudget?.periodStartedAt === 'number' &&
                Number.isFinite(settings.llm.usageBudget.periodStartedAt) &&
                settings.llm.usageBudget.periodStartedAt > 0 &&
                settings.llm.usageBudget.periodStartedAt <= Date.now()
                ? Math.round(settings.llm.usageBudget.periodStartedAt)
                : Date.now(),
        },
        verifiedConnection: normalizeVerifiedLlmConnection(settings.llm?.verifiedConnection),
        verifiedImageRecognitionConnection: normalizeVerifiedLlmConnection(
            settings.llm?.verifiedImageRecognitionConnection
        ),
    },
    googleCalendar: {
        enabled: settings.googleCalendar?.enabled === true,
        pushEnabled: settings.googleCalendar?.pushEnabled === true,
        pullEnabled: settings.googleCalendar?.pullEnabled === true,
        autoSyncMinutes: typeof settings.googleCalendar?.autoSyncMinutes === 'number' &&
            Number.isFinite(settings.googleCalendar.autoSyncMinutes)
            ? Math.max(0, Math.min(1440, Math.round(settings.googleCalendar.autoSyncMinutes)))
            : 0,
        connectedEmail: typeof settings.googleCalendar?.connectedEmail === 'string' &&
            settings.googleCalendar.connectedEmail.trim()
            ? settings.googleCalendar.connectedEmail.trim().slice(0, 320)
            : undefined,
        // These flags are derived from encrypted storage by publicSettings.
        hasOAuthClient: false,
        isConnected: false,
        lastSyncAt: typeof settings.googleCalendar?.lastSyncAt === 'number' &&
            Number.isFinite(settings.googleCalendar.lastSyncAt)
            ? settings.googleCalendar.lastSyncAt
            : undefined,
        lastSyncStatus: settings.googleCalendar?.lastSyncStatus === 'success' ||
            settings.googleCalendar?.lastSyncStatus === 'error'
            ? settings.googleCalendar.lastSyncStatus
            : 'idle',
        lastSyncMessage: typeof settings.googleCalendar?.lastSyncMessage === 'string' &&
            settings.googleCalendar.lastSyncMessage.trim()
            ? settings.googleCalendar.lastSyncMessage.trim().slice(0, 500)
            : undefined,
    },
    hasWhisprflowApiKey: false,
    hasGeminiApiKey: false,
    hasOpenaiApiKey: false,
    hasAnthropicApiKey: false,
    hasLocalApiToken: false,
})

type GoogleSecretName = 'googleOAuthClientId' | 'googleOAuthClientSecret' | 'googleRefreshToken'
type SecretName = LlmCredentialName | GoogleSecretName
type SecretFile = { version: 1; values: Partial<Record<SecretName, string>> }

const loadSecretFile = async (): Promise<SecretFile> => {
    try {
        const parsed = JSON.parse(await readFile(getSecretsPath(), { encoding: fileEncoding })) as SecretFile
        if (parsed && parsed.version === 1 && parsed.values && typeof parsed.values === 'object') return parsed
    } catch {
        // Secrets are created on first credential save.
    }
    return { version: 1, values: {} }
}

const ensureEncryptedStorage = (): void => {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encrypted credential storage is unavailable on this system.')
    }
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
        throw new Error('A secure OS credential store is required to save API keys.')
    }
}

const getSecret = async (name: SecretName): Promise<string> => {
    const stored = (await loadSecretFile()).values[name]
    if (!stored) return ''
    try {
        ensureEncryptedStorage()
        return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
        return ''
    }
}

export const getCredential = async (name: LlmCredentialName): Promise<string> => getSecret(name)

type CredentialFlag = keyof Pick<AppSettings, 'hasWhisprflowApiKey' | 'hasGeminiApiKey' | 'hasOpenaiApiKey' | 'hasAnthropicApiKey' | 'hasLocalApiToken'>

const credentialFlags: Record<LlmCredentialName, CredentialFlag> = {
    whisprflow: 'hasWhisprflowApiKey',
    gemini: 'hasGeminiApiKey',
    openai: 'hasOpenaiApiKey',
    anthropic: 'hasAnthropicApiKey',
    local: 'hasLocalApiToken',
}

const credentialFlag = (name: LlmCredentialName): CredentialFlag => credentialFlags[name]

const storeSecret = async (name: SecretName, value: string): Promise<void> => {
    await ensureDir(getRootDir())
    ensureEncryptedStorage()
    const secrets = await loadSecretFile()
    const trimmed = value.trim()
    if (trimmed) secrets.values[name] = safeStorage.encryptString(trimmed).toString('base64')
    else delete secrets.values[name]
    await writeJsonAtomic(getSecretsPath(), secrets)
}

const storeCredential = async (name: LlmCredentialName, value: string): Promise<void> =>
    storeSecret(name, value)

export const getGoogleOAuthClientCredentials = async (): Promise<{ clientId: string; clientSecret: string }> => ({
    clientId: process.env['GOOGLE_OAUTH_CLIENT_ID']?.trim() || await getSecret('googleOAuthClientId'),
    clientSecret: process.env['GOOGLE_OAUTH_CLIENT_SECRET']?.trim() || await getSecret('googleOAuthClientSecret')
})

export const setGoogleOAuthClientCredentials = async (
    clientId: string,
    clientSecret: string
): Promise<AppSettings> => {
    await storeSecret('googleOAuthClientId', clientId)
    await storeSecret('googleOAuthClientSecret', clientSecret)
    return getSettings()
}

export const getGoogleRefreshToken = async (): Promise<string> => getSecret('googleRefreshToken')

export const setGoogleRefreshToken = async (value: string): Promise<void> =>
    storeSecret('googleRefreshToken', value)

export const setCredential = async (name: LlmCredentialName, value: string): Promise<AppSettings> => {
    await storeCredential(name, value)
    return getSettings()
}

const publicSettings = async (settings: AppSettings): Promise<AppSettings> => {
    const next = { ...settings }
    for (const name of ['whisprflow', 'gemini', 'openai', 'anthropic', 'local'] as const) {
        next[credentialFlag(name)] = (await getCredential(name)).length > 0
    }
    const oauthClient = await getGoogleOAuthClientCredentials()
    const refreshToken = await getGoogleRefreshToken()
    next.googleCalendar = {
        ...settings.googleCalendar,
        hasOAuthClient: oauthClient.clientId.length > 0,
        isConnected: refreshToken.length > 0,
    }
    return next
}

export const getSettings: GetSettings = async () => {
    let raw: Record<string, unknown> = {}
    try {
        raw = JSON.parse(await readFile(getSettingsPath(), { encoding: fileEncoding })) as Record<string, unknown>
    } catch {
        // Default settings are returned below.
    }

    // Migrate the legacy plaintext Wispr Flow key once, then never return it
    // over IPC again. If an encrypted key already exists, discard any stale
    // plaintext copy immediately.
    const migration = planLegacyWisprMigration(raw, (await getCredential('whisprflow')).length > 0)
    if (migration.removePlaintextImmediately) {
        delete raw.whisprflowApiKey
        await writeJsonAtomic(getSettingsPath(), raw)
    } else if (migration.keyToEncrypt) {
        try {
            await storeCredential('whisprflow', migration.keyToEncrypt)
            delete raw.whisprflowApiKey
            await writeJsonAtomic(getSettingsPath(), raw)
        } catch {
            // The UI will surface encrypted-storage availability on the next save.
        }
    }
    return publicSettings(clampSettings(raw as Partial<AppSettings>))
}

export const setSettings: SetSettings = async (patch) => {
    const rootDir = getRootDir()
    await ensureDir(rootDir)

    const current = await getSettings()
    const merged = clampSettings({
        ...current,
        ...patch,
        llm: {
            ...current.llm,
            ...patch.llm,
            usageBudget: {
                ...current.llm.usageBudget,
                ...patch.llm?.usageBudget,
                thresholds: {
                    ...current.llm.usageBudget.thresholds,
                    ...patch.llm?.usageBudget?.thresholds,
                },
            },
        },
        googleCalendar: { ...current.googleCalendar, ...patch.googleCalendar }
    })
    await writeJsonAtomic(getSettingsPath(), merged)
    return publicSettings(merged)
}

export const getAssistantConversations: GetAssistantConversations = async () => {
    try {
        const parsed = JSON.parse(await readFile(getAssistantHistoryPath(), { encoding: fileEncoding })) as { conversations?: AssistantConversation[] }
        return Array.isArray(parsed.conversations) ? parsed.conversations.slice(0, 25) : []
    } catch {
        return []
    }
}

export const saveAssistantConversations: SaveAssistantConversations = async (conversations) => {
    await ensureDir(getRootDir())
    await writeJsonAtomic(getAssistantHistoryPath(), { conversations: conversations.slice(0, 25) })
}
