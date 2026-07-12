import { describe, expect, it } from 'vitest'
import { buildPluginAiMessages, pluginAiHostSystemPrompt } from './pluginPrompt'

describe('plugin AI prompt layering', () => {
    it('stacks immutable host, plugin, action, and call instructions in order', () => {
        const messages = buildPluginAiMessages(
            { prompt: 'USER TASK', system: 'CALL LAYER' },
            'NOTE CONTENT',
            { pluginSystemPrompt: 'PLUGIN LAYER', actionSystemPrompt: 'ACTION LAYER' }
        )

        const system = messages[0].content
        expect(system.indexOf(pluginAiHostSystemPrompt)).toBe(0)
        expect(system.indexOf('PLUGIN LAYER')).toBeGreaterThan(system.indexOf(pluginAiHostSystemPrompt))
        expect(system.indexOf('ACTION LAYER')).toBeGreaterThan(system.indexOf('PLUGIN LAYER'))
        expect(system.indexOf('CALL LAYER')).toBeGreaterThan(system.indexOf('ACTION LAYER'))
        expect(messages[1].content).toContain('USER TASK')
        expect(messages[1].content).toContain('NOTE CONTENT')
        expect(messages[1].content).not.toContain('PLUGIN LAYER')
    })
})
