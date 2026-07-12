import { describe, expect, it, vi } from 'vitest'
import { BlockMeta } from '@shared/models'
import { createPluginHostApi, PluginHostDependencies } from './hostApi'

const block = (id: string, categories: (string | null)[]): BlockMeta => ({
    id,
    file: `${id}.md`,
    createdAt: 1,
    updatedAt: 1,
    categories,
    excerpt: id
})

const dependenciesFor = (blocks: BlockMeta[]): PluginHostDependencies => ({
    getBlocks: vi.fn(async () => blocks),
    readBlock: vi.fn(async () => ({ content: 'content' })),
    createBlock: vi.fn(async (content, categories) => ({ ...block('created', categories), excerpt: content.content })),
    writeBlock: vi.fn(async (id) => blocks.find((item) => item.id === id) ?? null),
    deleteBlock: vi.fn(async () => true),
    deleteBlockIfEmpty: vi.fn(async () => false),
    updateBlockCategories: vi.fn(async (id) => blocks.find((item) => item.id === id) ?? null),
    appendToBlock: vi.fn(async (id) => blocks.find((item) => item.id === id) ?? null),
    setPresence: vi.fn(async (id) => blocks.find((item) => item.id === id) ?? null),
    acknowledgePresence: vi.fn(async (id) => blocks.find((item) => item.id === id) ?? null),
    complete: vi.fn(async () => ({ text: 'done' })),
    storageGet: vi.fn(async () => null),
    storageSet: vi.fn(async () => true),
    notify: vi.fn()
})

describe('plugin NoteBlock host API', () => {
    it('forces new blocks into the plugin namespace', async () => {
        const dependencies = dependenciesFor([])
        const host = createPluginHostApi({
            pluginId: 'dietary',
            canUseAi: true,
            getConfig: async () => ({}),
            dependencies
        })

        await host.blocks.createBlock('meal')
        expect(dependencies.createBlock).toHaveBeenCalledWith(
            { content: 'meal' },
            ['plugin:dietary']
        )
        await expect(host.blocks.createBlock('meal', [null])).rejects.toThrow('own block category')
    })

    it('denies reads outside the plugin namespace', async () => {
        const dependencies = dependenciesFor([
            block('owned', ['plugin:dietary']),
            block('foreign', ['another-goal'])
        ])
        const host = createPluginHostApi({
            pluginId: 'dietary',
            canUseAi: false,
            getConfig: async () => ({}),
            dependencies
        })

        await expect(host.blocks.readBlock('owned')).resolves.toMatchObject({ content: 'content' })
        await expect(host.blocks.readBlock('foreign')).rejects.toThrow('cannot access')
    })

    it('returns scoped safe metadata without index internals', async () => {
        const owned = {
            ...block('owned', ['plugin:dietary']),
            aiLabel: 'Lunch',
            goalPresence: { 'plugin:dietary': { source: 'plugin' as const, visited: false } }
        }
        const host = createPluginHostApi({
            pluginId: 'dietary',
            canUseAi: false,
            getConfig: async () => ({}),
            dependencies: dependenciesFor([owned])
        })

        await expect(host.blocks.getMeta('owned')).resolves.toEqual({
            id: 'owned',
            createdAt: 1,
            updatedAt: 1,
            excerpt: 'owned',
            aiLabel: 'Lunch',
            presence: { source: 'plugin', visited: false }
        })
        expect(await host.blocks.getMeta('owned')).not.toHaveProperty('file')
    })

    it('rejects storage keys that could escape the plugin-local key space', async () => {
        const dependencies = dependenciesFor([])
        const host = createPluginHostApi({
            pluginId: 'dietary',
            canUseAi: false,
            getConfig: async () => ({}),
            dependencies
        })

        await expect(host.storage.set('../outside', 'value')).rejects.toThrow('storage keys')
        expect(dependencies.storageSet).not.toHaveBeenCalled()
    })
})
