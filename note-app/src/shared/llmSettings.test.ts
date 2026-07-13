import { defaultSettings } from './constants'
import {
    isImageRecognitionReady,
    isImageRecognitionSelectionVerified,
    isLlmSelectionVerified,
    resolvePluginWizardModel
} from './llmSettings'
import { describe, expect, it } from 'vitest'

describe('LLM settings', () => {
    it('keeps AI block naming opt-in by default', () => {
        expect(defaultSettings.llm.aiBlockNameSummary).toBe(false)
        expect(defaultSettings.llm.imageRecognitionModel).toBe('')
        expect(defaultSettings.llm.pluginWizardModel).toBe('')
    })

    it('verifies only an exact non-empty provider and model pair', () => {
        const verifiedConnection = { provider: 'gemini' as const, model: 'gemini-test' }
        expect(isLlmSelectionVerified({ provider: 'gemini', model: 'gemini-test', verifiedConnection })).toBe(true)
        expect(isLlmSelectionVerified({ provider: 'openai', model: 'gemini-test', verifiedConnection })).toBe(false)
        expect(isLlmSelectionVerified({ provider: 'gemini', model: 'gemini-test ', verifiedConnection })).toBe(false)
        expect(isLlmSelectionVerified({ provider: 'gemini', model: '', verifiedConnection })).toBe(false)
        expect(isLlmSelectionVerified({ provider: 'gemini', model: 'gemini-test' })).toBe(false)
    })

    it('uses the active model unless the plugin wizard has an override', () => {
        expect(resolvePluginWizardModel({ model: 'active-model', pluginWizardModel: '' })).toBe('active-model')
        expect(resolvePluginWizardModel({ model: 'active-model', pluginWizardModel: 'wizard-model' })).toBe('wizard-model')
        expect(resolvePluginWizardModel({ model: 'active-model', pluginWizardModel: '   ' })).toBe('active-model')
    })

    it('requires a separate exact image-recognition verification pair', () => {
        const verifiedImageRecognitionConnection = { provider: 'openai' as const, model: 'gpt-5.6' }
        const selection = {
            provider: 'openai' as const,
            imageRecognitionModel: 'gpt-5.6',
            verifiedImageRecognitionConnection
        }
        expect(isImageRecognitionSelectionVerified(selection)).toBe(true)
        expect(isImageRecognitionReady(selection)).toBe(true)
        expect(isImageRecognitionSelectionVerified({ ...selection, imageRecognitionModel: 'gpt-4o' })).toBe(false)
        expect(isImageRecognitionSelectionVerified({ ...selection, provider: 'gemini' })).toBe(false)
        expect(isImageRecognitionReady({
            provider: 'local',
            imageRecognitionModel: 'loaded-vlm',
            verifiedImageRecognitionConnection: { provider: 'local', model: 'loaded-vlm' }
        })).toBe(true)
    })
})
