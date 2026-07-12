import { describe, expect, it } from 'vitest'
import { prognoticPluginSignature } from '@shared/plugins'
import { validatePluginManifest } from './manifest'
import dietaryManifest from '../../../resources/plugins/dietary/plugin.json'
import templateManifest from '../../../resources/plugins/_template/plugin.json'

const validManifest = {
    id: 'test-plugin',
    name: 'Test plugin',
    version: '1.2.3',
    description: 'A test plugin.',
    signature: prognoticPluginSignature,
    entry: 'index.cjs',
    permissions: { blocks: 'own', ai: true },
    configSchema: [
        { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
        {
            key: 'mode',
            label: 'Mode',
            type: 'select',
            default: 'brief',
            options: [{ label: 'Brief', value: 'brief' }]
        }
    ]
}

describe('plugin manifest validation', () => {
    it('accepts the v1 signature and required metadata', () => {
        const result = validatePluginManifest(validManifest)
        expect(result.error).toBeUndefined()
        expect(result.manifest?.signature).toBe(prognoticPluginSignature)
        expect(result.manifest?.configSchema).toHaveLength(2)
    })

    it('rejects a missing or unknown signature with a clear reason', () => {
        expect(validatePluginManifest({ ...validManifest, signature: undefined }).error)
            .toContain(prognoticPluginSignature)
        expect(validatePluginManifest({ ...validManifest, signature: 'another-host/v1' }).error)
            .toContain(prognoticPluginSignature)
    })

    it('rejects entry paths that leave the plugin folder', () => {
        const result = validatePluginManifest({ ...validManifest, entry: '../outside.cjs' })
        expect(result.manifest).toBeUndefined()
        expect(result.error).toContain('inside the plugin folder')
    })

    it('parses the bounded UI element catalog and action AI prompt', () => {
        const result = validatePluginManifest({
            ...validManifest,
            ui: {
                type: 'note-feed',
                layout: [
                    'header',
                    {
                        type: 'capture',
                        command: 'addEntry',
                        label: 'Add entry',
                        placeholder: 'Write something'
                    },
                    {
                        type: 'stat-row',
                        items: [{ key: 'unvisited', label: 'Need review' }]
                    },
                    {
                        type: 'grouped-list',
                        groupBy: 'day',
                        entry: {
                            type: 'entry',
                            content: 'excerpt',
                            editor: { type: 'entry-editor', command: 'saveEntry' },
                            actions: [{
                                type: 'action',
                                command: 'analyzeEntry',
                                label: 'Analyze',
                                tone: 'ai',
                                aiPrompt: 'Return a short structured analysis.'
                            }]
                        }
                    },
                    { type: 'empty-state', message: 'Nothing here yet.' }
                ]
            }
        })

        expect(result.error).toBeUndefined()
        expect(result.manifest?.ui?.layout).toHaveLength(5)
        expect(result.manifest?.ui?.layout?.[3]).toMatchObject({
            type: 'grouped-list',
            groupBy: 'day'
        })
    })

    it('rejects unknown UI elements with their layout path', () => {
        const result = validatePluginManifest({
            ...validManifest,
            ui: { type: 'note-feed', layout: ['header', 'iframe'] }
        })

        expect(result.manifest).toBeUndefined()
        expect(result.error).toContain('ui.layout[1]')
        expect(result.error).toContain('unsupported')
    })

    it('keeps legacy note-feed manifests valid without an explicit layout', () => {
        const result = validatePluginManifest({
            ...validManifest,
            ui: {
                type: 'note-feed',
                capture: { command: 'addEntry', label: 'Add' },
                editCommand: 'saveEntry',
                actions: [{ command: 'reviewEntry', label: 'Review' }]
            }
        })

        expect(result.error).toBeUndefined()
        expect(result.manifest?.ui?.layout).toBeUndefined()
        expect(result.manifest?.ui?.editCommand).toBe('saveEntry')
    })

    it('accepts the bundled Dietary and copy-paste template manifests', () => {
        expect(validatePluginManifest(dietaryManifest).error).toBeUndefined()
        expect(validatePluginManifest(templateManifest).error).toBeUndefined()
    })
})
