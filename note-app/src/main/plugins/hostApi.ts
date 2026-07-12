import type { BlockMeta, GoalPresence, NoteContent } from '@shared/models'
import type {
    PluginAiCompleteInput,
    PluginAiCompleteResult,
    PluginBlockFilter,
    PluginBlockMeta,
    PluginBlockRecord,
    PluginConfig,
    PluginHostRequest,
    PluginHostValue,
    PluginNotification,
    PluginNotificationTone,
    PluginStorageValue
} from '@shared/plugins'

const maxBlockChars = 1_000_000
const maxAppendChars = 100_000
const maxStorageValueBytes = 64_000
const storageKeyPattern = /^[a-z][a-zA-Z0-9._-]{0,79}$/

export const pluginCategoryId = (pluginId: string): string => `plugin:${pluginId}`

export const scopedPluginCategories = (
    pluginId: string,
    categories?: (string | null)[]
): string[] => {
    const categoryId = pluginCategoryId(pluginId)
    if (categories?.some((category) => category !== categoryId)) {
        throw new Error('Plugins can only use their own block category.')
    }
    return [categoryId]
}

export const pluginOwnsBlock = (pluginId: string, block: BlockMeta): boolean =>
    block.categories.includes(pluginCategoryId(pluginId))

const requireText = (value: unknown, label: string, maxLength: number): string => {
    if (typeof value !== 'string') throw new Error(`${label} must be text.`)
    if (value.length > maxLength) throw new Error(`${label} is too large.`)
    return value
}

const requireStorageKey = (key: unknown): string => {
    if (typeof key !== 'string' || !storageKeyPattern.test(key)) {
        throw new Error('Plugin storage keys must start with a letter and use only letters, numbers, dot, underscore, or hyphen.')
    }
    return key
}

const cloneStorageValue = (value: unknown): PluginStorageValue => {
    const seen = new WeakSet<object>()
    let nodes = 0
    const visit = (candidate: unknown, depth: number): PluginStorageValue => {
        nodes += 1
        if (nodes > 5_000 || depth > 12) throw new Error('Plugin storage value is too complex.')
        if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return candidate
        if (typeof candidate === 'number') {
            if (!Number.isFinite(candidate)) throw new Error('Plugin storage numbers must be finite.')
            return candidate
        }
        if (typeof candidate !== 'object') throw new Error('Plugin storage values must be JSON-compatible.')
        if (seen.has(candidate)) throw new Error('Plugin storage values cannot contain cycles.')
        seen.add(candidate)
        if (Array.isArray(candidate)) return candidate.map((item) => visit(item, depth + 1))
        const prototype = Object.getPrototypeOf(candidate)
        if (prototype !== Object.prototype && prototype !== null) {
            throw new Error('Plugin storage values must use plain objects.')
        }
        const result: Record<string, PluginStorageValue> = {}
        for (const [key, item] of Object.entries(candidate)) {
            if (key.length > 100 || key === '__proto__' || key === 'constructor' || key === 'prototype') {
                throw new Error('Plugin storage object contains an invalid key.')
            }
            result[key] = visit(item, depth + 1)
        }
        return result
    }
    const cloned = visit(value, 0)
    if (Buffer.byteLength(JSON.stringify(cloned), 'utf8') > maxStorageValueBytes) {
        throw new Error('A plugin storage value cannot exceed 64 KB.')
    }
    return cloned
}

const notificationFor = (
    message: unknown,
    tone: PluginNotificationTone | undefined
): PluginNotification => {
    const normalizedMessage = requireText(message, 'Notification message', 500).trim()
    if (!normalizedMessage) throw new Error('Notification message cannot be empty.')
    if (tone !== undefined && tone !== 'info' && tone !== 'success' && tone !== 'error') {
        throw new Error('Notification tone is unsupported.')
    }
    return { message: normalizedMessage, tone: tone ?? 'info' }
}

export type PluginHostDependencies = {
    getBlocks: () => Promise<BlockMeta[]>
    readBlock: (id: string) => Promise<NoteContent>
    createBlock: (content: NoteContent, categories: (string | null)[]) => Promise<BlockMeta>
    writeBlock: (id: string, content: NoteContent) => Promise<BlockMeta | null>
    deleteBlock: (id: string) => Promise<boolean>
    deleteBlockIfEmpty: (id: string) => Promise<boolean>
    updateBlockCategories: (id: string, categories: (string | null)[]) => Promise<BlockMeta | null>
    appendToBlock: (id: string, text: string) => Promise<BlockMeta | null>
    setPresence: (id: string, category: string, visited: boolean) => Promise<BlockMeta | null>
    acknowledgePresence: (id: string, category: string) => Promise<BlockMeta | null>
    complete: (
        input: PluginAiCompleteInput,
        blockContent?: string,
        layers?: { pluginSystemPrompt?: string; actionSystemPrompt?: string }
    ) => Promise<PluginAiCompleteResult>
    storageGet: (pluginId: string, key: string) => Promise<PluginStorageValue | null>
    storageSet: (pluginId: string, key: string, value: PluginStorageValue) => Promise<boolean>
    notify: (pluginId: string, notification: PluginNotification) => void
}

export type NoteBlockPluginHostApi = {
    pluginId: string
    categoryId: string
    getConfig: () => Promise<PluginConfig>
    blocks: {
        createBlock: (content: string, categories?: (string | null)[]) => Promise<BlockMeta>
        readBlock: (id: string) => Promise<PluginBlockRecord>
        getMeta: (id: string) => Promise<PluginBlockMeta>
        writeBlock: (id: string, content: string) => Promise<BlockMeta>
        deleteBlock: (id: string) => Promise<boolean>
        deleteBlockIfEmpty: (id: string) => Promise<boolean>
        updateBlockCategories: (id: string, categories: (string | null)[]) => Promise<BlockMeta>
        appendToBlock: (id: string, text: string) => Promise<BlockMeta>
        listBlocks: (filter?: PluginBlockFilter) => Promise<PluginBlockRecord[]>
        getPresence: (id: string, category?: string) => Promise<GoalPresence | null>
        setPresence: (id: string, visited: boolean, category?: string) => Promise<BlockMeta>
        acknowledgePresence: (id: string, category?: string) => Promise<BlockMeta>
    }
    ai: {
        complete: (input: PluginAiCompleteInput) => Promise<PluginAiCompleteResult>
    }
    storage: {
        get: (key: string) => Promise<PluginStorageValue | null>
        set: (key: string, value: PluginStorageValue) => Promise<boolean>
    }
    notify: (message: string, options?: { tone?: PluginNotificationTone }) => PluginNotification
}

type CreatePluginHostOptions = {
    pluginId: string
    canUseAi: boolean
    pluginSystemPrompt?: string
    getActionSystemPrompt?: () => string | undefined
    getConfig: () => Promise<PluginConfig>
    dependencies: PluginHostDependencies
}

export const createPluginHostApi = ({
    pluginId,
    canUseAi,
    pluginSystemPrompt,
    getActionSystemPrompt,
    getConfig,
    dependencies
}: CreatePluginHostOptions): NoteBlockPluginHostApi => {
    const categoryId = pluginCategoryId(pluginId)

    const requireOwnedBlock = async (id: string): Promise<BlockMeta> => {
        const block = (await dependencies.getBlocks()).find((candidate) => candidate.id === id)
        if (!block || !pluginOwnsBlock(pluginId, block)) {
            throw new Error('Plugin cannot access this note block.')
        }
        return block
    }

    const requireOwnCategory = (category: string | undefined): string => {
        const requested = category ?? categoryId
        if (requested !== categoryId) throw new Error('Plugin cannot access another category presence.')
        return requested
    }

    const readOwnedBlock = async (id: string): Promise<PluginBlockRecord> => {
        const block = await requireOwnedBlock(id)
        const content = (await dependencies.readBlock(id)).content
        return { block, content }
    }

    const safeMeta = (block: BlockMeta): PluginBlockMeta => ({
        id: block.id,
        createdAt: block.createdAt,
        updatedAt: block.updatedAt,
        excerpt: block.excerpt,
        ...(block.aiLabel ? { aiLabel: block.aiLabel } : {}),
        presence: block.goalPresence?.[categoryId] ?? null
    })

    const host: NoteBlockPluginHostApi = {
        pluginId,
        categoryId,
        getConfig,
        blocks: {
            createBlock: async (content, categories) => dependencies.createBlock(
                { content: requireText(content, 'Block content', maxBlockChars) },
                scopedPluginCategories(pluginId, categories)
            ),
            readBlock: readOwnedBlock,
            getMeta: async (id) => safeMeta(await requireOwnedBlock(id)),
            writeBlock: async (id, content) => {
                await requireOwnedBlock(id)
                const updated = await dependencies.writeBlock(id, {
                    content: requireText(content, 'Block content', maxBlockChars)
                })
                if (!updated) throw new Error('The note block no longer exists.')
                return updated
            },
            deleteBlock: async (id) => {
                await requireOwnedBlock(id)
                return dependencies.deleteBlock(id)
            },
            deleteBlockIfEmpty: async (id) => {
                await requireOwnedBlock(id)
                return dependencies.deleteBlockIfEmpty(id)
            },
            updateBlockCategories: async (id, categories) => {
                await requireOwnedBlock(id)
                const updated = await dependencies.updateBlockCategories(
                    id,
                    scopedPluginCategories(pluginId, categories)
                )
                if (!updated) throw new Error('The note block no longer exists.')
                return updated
            },
            appendToBlock: async (id, text) => {
                await requireOwnedBlock(id)
                const updated = await dependencies.appendToBlock(
                    id,
                    requireText(text, 'Appended text', maxAppendChars)
                )
                if (!updated) throw new Error('The note block no longer exists.')
                return updated
            },
            listBlocks: async (filter = {}) => {
                if (filter.category !== undefined && filter.category !== categoryId) {
                    throw new Error('Plugin cannot list another category.')
                }
                const createdAfter = Number.isFinite(filter.createdAfter) ? filter.createdAfter as number : undefined
                const updatedAfter = Number.isFinite(filter.updatedAfter) ? filter.updatedAfter as number : undefined
                const limit = Number.isFinite(filter.limit)
                    ? Math.max(1, Math.min(200, Math.floor(filter.limit as number)))
                    : 100
                const blocks = (await dependencies.getBlocks())
                    .filter((block) => pluginOwnsBlock(pluginId, block))
                    .filter((block) => createdAfter === undefined || block.createdAt >= createdAfter)
                    .filter((block) => updatedAfter === undefined || block.updatedAt >= updatedAfter)
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .slice(0, limit)
                return Promise.all(blocks.map(async (block) => ({
                    block,
                    content: (await dependencies.readBlock(block.id)).content
                })))
            },
            getPresence: async (id, category) => {
                const block = await requireOwnedBlock(id)
                return block.goalPresence?.[requireOwnCategory(category)] ?? null
            },
            setPresence: async (id, visited, category) => {
                await requireOwnedBlock(id)
                const updated = await dependencies.setPresence(id, requireOwnCategory(category), visited === true)
                if (!updated) throw new Error('The note block no longer exists.')
                return updated
            },
            acknowledgePresence: async (id, category) => {
                await requireOwnedBlock(id)
                const updated = await dependencies.acknowledgePresence(id, requireOwnCategory(category))
                if (!updated) throw new Error('The note block no longer exists.')
                return updated
            }
        },
        ai: {
            complete: async (input) => {
                if (!canUseAi) return { error: 'This plugin has not declared host AI access.' }
                let blockContent: string | undefined
                if (input.blockId) blockContent = (await readOwnedBlock(input.blockId)).content
                const actionSystemPrompt = getActionSystemPrompt?.()
                return dependencies.complete(input, blockContent, {
                    ...(pluginSystemPrompt ? { pluginSystemPrompt } : {}),
                    ...(actionSystemPrompt ? { actionSystemPrompt } : {})
                })
            }
        },
        storage: {
            get: async (key) => dependencies.storageGet(pluginId, requireStorageKey(key)),
            set: async (key, value) => dependencies.storageSet(
                pluginId,
                requireStorageKey(key),
                cloneStorageValue(value)
            )
        },
        notify: (message, options) => {
            const notification = notificationFor(message, options?.tone)
            dependencies.notify(pluginId, notification)
            return notification
        }
    }

    return Object.freeze({
        ...host,
        blocks: Object.freeze(host.blocks),
        ai: Object.freeze(host.ai),
        storage: Object.freeze(host.storage)
    })
}

export const invokePluginHost = async (
    host: NoteBlockPluginHostApi,
    request: PluginHostRequest
): Promise<PluginHostValue> => {
    switch (request.method) {
        case 'blocks.create': return host.blocks.createBlock(request.content, request.categories)
        case 'blocks.read': return host.blocks.readBlock(request.id)
        case 'blocks.getMeta': return host.blocks.getMeta(request.id)
        case 'blocks.write': return host.blocks.writeBlock(request.id, request.content)
        case 'blocks.delete': return host.blocks.deleteBlock(request.id)
        case 'blocks.deleteIfEmpty': return host.blocks.deleteBlockIfEmpty(request.id)
        case 'blocks.updateCategories': return host.blocks.updateBlockCategories(request.id, request.categories)
        case 'blocks.append': return host.blocks.appendToBlock(request.id, request.text)
        case 'blocks.list': return host.blocks.listBlocks(request.filter)
        case 'presence.get': return host.blocks.getPresence(request.id, request.category)
        case 'presence.set': return host.blocks.setPresence(request.id, request.visited, request.category)
        case 'presence.acknowledge': return host.blocks.acknowledgePresence(request.id, request.category)
        case 'ai.complete': return host.ai.complete(request.input)
        case 'storage.get': return host.storage.get(request.key)
        case 'storage.set': return host.storage.set(request.key, request.value)
        case 'notify': return host.notify(
            request.message,
            request.tone ? { tone: request.tone } : undefined
        )
    }
}
