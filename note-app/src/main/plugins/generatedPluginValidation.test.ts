import { describe, expect, it } from 'vitest'
import {
    preflightGeneratedPlugin,
    validateGeneratedPluginSourcePolicy
} from './generatedPluginValidation'

const generatedEntryFixture = `'use strict'
exports.activate = (host) => ({
  commands: {
    addWorkout: async (input) => {
      const text = typeof input.text === 'string' ? input.text.trim() : ''
      if (!text) throw new Error('Describe the workout first.')
      return { blockId: (await host.blocks.createBlock(text, [host.categoryId])).id }
    },
    saveWorkout: async () => undefined,
    deleteWorkout: async () => undefined,
    analyzeWorkout: async () => undefined,
    markReviewed: async () => undefined
  }
})`

const declaredCommands = [
    'addWorkout',
    'saveWorkout',
    'deleteWorkout',
    'analyzeWorkout',
    'markReviewed'
]

describe('generated plugin preflight', () => {
    it('accepts a generated activation whose handlers exactly match the manifest UI', async () => {
        await expect(preflightGeneratedPlugin(generatedEntryFixture, declaredCommands)).resolves.toBeUndefined()
    })

    it('accepts an asynchronous activation registration', async () => {
        const asyncEntry = generatedEntryFixture.replace(
            'exports.activate = (host) =>',
            'exports.activate = async (host) =>'
        )
        await expect(preflightGeneratedPlugin(asyncEntry, declaredCommands)).resolves.toBeUndefined()
    })

    it('rejects missing manifest-declared commands before writing a plugin folder', async () => {
        await expect(preflightGeneratedPlugin(generatedEntryFixture, [...declaredCommands, 'missingCommand']))
            .rejects.toThrow('does not exactly match')
    })

    it('rejects dependency loading and markdown fences under wizard policy', () => {
        expect(() => validateGeneratedPluginSourcePolicy("require('fs')"))
            .toThrow('forbidden module loading')
        expect(() => validateGeneratedPluginSourcePolicy('```js\nexports.activate = () => ({})\n```'))
            .toThrow('markdown fence')
    })
})
