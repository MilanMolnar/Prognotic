import { describe, expect, it } from 'vitest'
import { normalizePluginState } from './stateModel'

describe('plugin state migration', () => {
    it('adds empty AI origin metadata to a legacy v1 state file', () => {
        expect(normalizePluginState({
            version: 1,
            enabledPluginIds: ['dietary', 'dietary'],
            config: { dietary: { includeMacros: true } },
            seededPluginIds: ['dietary']
        })).toEqual({
            version: 1,
            enabledPluginIds: ['dietary'],
            config: { dietary: { includeMacros: true } },
            seededPluginIds: ['dietary'],
            aiGeneratedPlugins: {}
        })
    })

    it('keeps valid AI origin records and drops malformed records', () => {
        const state = normalizePluginState({
            enabledPluginIds: [],
            config: {},
            seededPluginIds: [],
            aiGeneratedPlugins: {
                'training-log': { folderName: ' training-log ', createdAt: 42 },
                malformed: { folderName: '' },
                primitive: true
            }
        })

        expect(state.aiGeneratedPlugins).toEqual({
            'training-log': { folderName: 'training-log', createdAt: 42 }
        })
    })
})
