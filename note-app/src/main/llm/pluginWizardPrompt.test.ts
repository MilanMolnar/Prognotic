import { describe, expect, it } from 'vitest'
import { validatePluginManifest } from '../plugins/manifest'
import {
    normalizePluginWizardSpec,
    parseGeneratedPluginFiles,
    parsePluginWizardInterviewResponse,
    pluginManifestFromWizardSpec,
    pluginWizardScopeGuidance,
    resolveUniquePluginWizardSpec,
    summarizePluginWizardSpec
} from './pluginWizardPrompt'

const generatedFixture = {
    id: 'training-log',
    folderName: 'training-log',
    name: 'Training Log',
    description: 'Track gym exercises and review AI-assisted workout observations.',
    sidebar: { label: 'Training', icon: 'heart' },
    configSchema: [{
        key: 'unit',
        label: 'Weight unit',
        type: 'select',
        default: 'kg',
        options: [
            { label: 'Kilograms', value: 'kg' },
            { label: 'Pounds', value: 'lb' }
        ]
    }],
    ui: {
        type: 'note-feed',
        layout: [
            'header',
            'capture',
            { type: 'stat-row', items: [{ key: 'unvisited', label: 'need review' }] },
            { type: 'empty-state', message: 'No workouts logged.' },
            {
                type: 'grouped-list',
                groupBy: 'day',
                entry: {
                    type: 'entry',
                    content: 'body',
                    editor: { type: 'entry-editor', command: 'saveWorkout' },
                    deleteCommand: 'deleteWorkout',
                    actions: [
                        {
                            type: 'action',
                            command: 'analyzeWorkout',
                            label: 'Analyze',
                            tone: 'ai',
                            aiPrompt: 'Return concise Markdown observations grounded only in the workout entry.'
                        },
                        {
                            type: 'action',
                            command: 'markReviewed',
                            label: 'Mark reviewed',
                            tone: 'review',
                            showWhen: 'unvisited'
                        }
                    ]
                }
            }
        ],
        capture: {
            command: 'addWorkout',
            label: 'Log workout',
            placeholder: 'Exercise, sets, reps, weight...'
        }
    },
    commands: [
        { command: 'addWorkout', input: 'text', purpose: 'Create a workout entry.', usesAi: false },
        { command: 'saveWorkout', input: 'blockId-content', purpose: 'Save an edited workout.', usesAi: false },
        { command: 'deleteWorkout', input: 'blockId', purpose: 'Delete a workout.', usesAi: false },
        { command: 'analyzeWorkout', input: 'blockId', purpose: 'Append workout observations.', usesAi: true },
        { command: 'markReviewed', input: 'blockId', purpose: 'Acknowledge a reviewed entry.', usesAi: false }
    ],
    ai: {
        enabled: true,
        systemPrompt: 'Use only stated training facts and avoid medical advice.',
        actionPrompts: [{
            command: 'analyzeWorkout',
            prompt: 'Return concise Markdown observations grounded only in the workout entry.'
        }]
    }
}

describe('plugin wizard planning helpers', () => {
    it('normalizes a generated fixture into a manifest accepted by the production validator', () => {
        const spec = normalizePluginWizardSpec(generatedFixture)
        const manifest = pluginManifestFromWizardSpec(spec)

        expect(validatePluginManifest(manifest).error).toBeUndefined()
        expect(manifest.permissions).toEqual({ blocks: 'own', ai: true })
        expect(summarizePluginWizardSpec(spec).at(-1)).toContain('leave disabled')
    })

    it('rejects a command outline whose input does not match its UI placement', () => {
        const invalid = structuredClone(generatedFixture)
        invalid.commands[0].input = 'blockId'

        expect(() => normalizePluginWizardSpec(invalid)).toThrow('wrong input shape')
    })

    it('parses fenced provider output and validates a ready plan', () => {
        const result = parsePluginWizardInterviewResponse(
            `Plan:\n\`\`\`json\n${JSON.stringify({ status: 'ready_to_generate', spec: generatedFixture })}\n\`\`\``,
            3
        )

        expect(result.status).toBe('ready_to_generate')
        if (result.status === 'ready_to_generate') expect(result.spec.id).toBe('training-log')
    })

    it('enforces the one-extra-follow-up interview cap', () => {
        expect(() => parsePluginWizardInterviewResponse(
            '{"status":"question","question":"One more?"}',
            9
        )).toThrow('question limit')
    })

    it('suffixes both id and folder when either identity collides', () => {
        const spec = normalizePluginWizardSpec(generatedFixture)
        const unique = resolveUniquePluginWizardSpec(
            spec,
            ['training-log', 'training-log-2'],
            ['some-folder']
        )

        expect(unique.id).toBe('training-log-3')
        expect(unique.folderName).toBe('training-log-3')
    })

    it('identifies v1 reframing needs for custom UI, secrets, and cross-plugin access', () => {
        const guidance = pluginWizardScopeGuidance(
            'Build a React dashboard that reads other plugins and stores my API key.'
        )

        expect(guidance).toHaveLength(3)
        expect(guidance.join(' ')).toContain('Custom UI')
        expect(guidance.join(' ')).toContain('own plugin note blocks')
        expect(guidance.join(' ')).toContain('cannot hold secrets')
    })

    it('extracts the exact generated files object without markdown persistence', () => {
        const files = parseGeneratedPluginFiles(JSON.stringify({
            pluginJson: pluginManifestFromWizardSpec(normalizePluginWizardSpec(generatedFixture)),
            indexCjs: "'use strict'\nexports.activate = () => ({ commands: {} })"
        }))

        expect(files.pluginJson.id).toBe('training-log')
        expect(files.indexCjs).not.toContain('```')
    })
})
