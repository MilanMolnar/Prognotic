import type {
    CreateGeneratedPluginInput,
    CreateGeneratedPluginResult,
    PluginCatalog,
    PluginWizardAnswer,
    PluginWizardInterviewInput,
    PluginWizardInterviewResult,
    PluginWizardSpec
} from '@shared/plugins'
import type { LlmMessage } from '@shared/types'
import { pluginUiDeclaredCommands } from '@shared/plugins'
import { ensureDir, move, pathExists, remove, writeFile } from 'fs-extra'
import { randomUUID } from 'node:crypto'
import { join, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { getRootDir } from '../lib'
import { completePluginWizardLlm } from '../llm/router'
import {
    buildPluginWizardGenerationMessages,
    buildPluginWizardInterviewMessages,
    normalizePluginWizardSpec,
    parseGeneratedPluginFiles,
    parsePluginWizardInterviewResponse,
    pluginManifestFromWizardSpec,
    pluginWizardScopeGuidance,
    resolveUniquePluginWizardSpec,
    summarizePluginWizardSpec,
    type GeneratedPluginFiles
} from '../llm/pluginWizardPrompt'
import {
    ensurePluginsDirectory,
    getPluginCatalog,
    refreshPluginCatalog
} from './index'
import { validatePluginManifest } from './manifest'
import { recordAiGeneratedPlugin } from './state'
import { preflightGeneratedPlugin } from './generatedPluginValidation'

const normalizeInterviewInput = (input: PluginWizardInterviewInput): PluginWizardInterviewInput => {
    if (!input || typeof input !== 'object') throw new Error('Describe the plugin you want to create.')
    const goal = typeof input.goal === 'string' ? input.goal.trim() : ''
    if (!goal) throw new Error('Describe the plugin you want to create.')
    if (goal.length > 4_000) throw new Error('Keep the plugin goal under 4,000 characters.')
    if (!Array.isArray(input.answers) || input.answers.length > 9) {
        throw new Error('The plugin interview supports at most 9 answers.')
    }
    const answers: PluginWizardAnswer[] = input.answers.map((answer, index) => {
        const question = typeof answer?.question === 'string' ? answer.question.trim() : ''
        const value = typeof answer?.answer === 'string' ? answer.answer.trim() : ''
        if (!question || !value) throw new Error(`Interview answer ${index + 1} is incomplete.`)
        if (question.length > 400 || value.length > 2_000) {
            throw new Error(`Interview answer ${index + 1} is too long.`)
        }
        return { question, answer: value }
    })
    return { goal, answers }
}

const installedIdentity = (catalog: PluginCatalog): { ids: string[]; folders: string[] } => ({
    ids: [...new Set(catalog.plugins.flatMap((plugin) => plugin.id ? [plugin.id] : []))],
    folders: [...new Set(catalog.plugins.map((plugin) => plugin.folderName))]
})

const retryMessages = (
    messages: LlmMessage[],
    previous: string,
    error: unknown,
    instruction: string
): LlmMessage[] => [
    ...messages,
    { role: 'assistant', content: previous.slice(0, 60_000) },
    {
        role: 'user',
        content: `${instruction} Validation error: ${error instanceof Error ? error.message : String(error)}`
    }
]

export const interviewPluginWizard = async (
    rawInput: PluginWizardInterviewInput
): Promise<PluginWizardInterviewResult> => {
    try {
        const input = normalizeInterviewInput(rawInput)
        const catalog = await getPluginCatalog()
        const identity = installedIdentity(catalog)
        const messages = buildPluginWizardInterviewMessages(input, identity.ids, identity.folders)
        let raw = await completePluginWizardLlm(messages, 3_200)
        let parsed: ReturnType<typeof parsePluginWizardInterviewResponse>
        try {
            parsed = parsePluginWizardInterviewResponse(raw, input.answers.length)
        } catch (error) {
            raw = await completePluginWizardLlm(
                retryMessages(
                    messages,
                    raw,
                    error,
                    'Return a corrected interview JSON object only. Keep the same requirements and v1 boundaries.'
                ),
                3_200
            )
            parsed = parsePluginWizardInterviewResponse(raw, input.answers.length)
        }

        const constraints = pluginWizardScopeGuidance([
            input.goal,
            ...input.answers.map((answer) => answer.answer)
        ].join('\n'))
        if (parsed.status === 'question') {
            const guidance = [parsed.guidance, ...constraints].filter(Boolean).join(' ')
            return {
                status: 'question',
                question: parsed.question,
                ...(guidance ? { guidance } : {})
            }
        }

        const spec = resolveUniquePluginWizardSpec(parsed.spec, identity.ids, identity.folders)
        return {
            status: 'ready_to_generate',
            spec,
            summary: summarizePluginWizardSpec(spec),
            constraints
        }
    } catch (error) {
        return {
            status: 'error',
            error: error instanceof Error ? error.message : 'The AI plugin interview failed.'
        }
    }
}

const validateGeneratedFiles = async (
    spec: PluginWizardSpec,
    files: GeneratedPluginFiles
): Promise<{ manifestJson: string; indexCjs: string }> => {
    const expectedManifest = pluginManifestFromWizardSpec(spec)
    if (!isDeepStrictEqual(files.pluginJson, expectedManifest)) {
        throw new Error('Generated plugin.json changed the approved plugin plan.')
    }
    const validation = validatePluginManifest(files.pluginJson)
    if (!validation.manifest) throw new Error(validation.error)
    await preflightGeneratedPlugin(
        files.indexCjs,
        pluginUiDeclaredCommands(validation.manifest.ui)
    )
    return {
        manifestJson: `${JSON.stringify(validation.manifest, null, 2)}\n`,
        indexCjs: files.indexCjs.endsWith('\n') ? files.indexCjs : `${files.indexCjs}\n`
    }
}

const generateValidatedFiles = async (
    spec: PluginWizardSpec,
    revision?: string
): Promise<{ manifestJson: string; indexCjs: string }> => {
    const messages = buildPluginWizardGenerationMessages(spec, revision)
    let raw = await completePluginWizardLlm(messages, 8_192, 120_000)
    try {
        return await validateGeneratedFiles(spec, parseGeneratedPluginFiles(raw))
    } catch (error) {
        raw = await completePluginWizardLlm(
            retryMessages(
                messages,
                raw,
                error,
                'Regenerate both fields and fix the validation failure. Return only the corrected JSON object.'
            ),
            8_192,
            120_000
        )
        return validateGeneratedFiles(spec, parseGeneratedPluginFiles(raw))
    }
}

const installGeneratedFiles = async (
    spec: PluginWizardSpec,
    files: { manifestJson: string; indexCjs: string }
): Promise<void> => {
    const pluginsPath = await ensurePluginsDirectory()
    const destination = resolve(pluginsPath, spec.folderName)
    if (!destination.startsWith(`${resolve(pluginsPath)}${sep}`)) {
        throw new Error('Generated plugin folder path is invalid.')
    }
    if (await pathExists(destination)) throw new Error('The generated plugin folder already exists.')

    const stagingPath = join(getRootDir(), `.plugin-wizard-${randomUUID()}`)
    let installed = false
    try {
        await ensureDir(stagingPath)
        await Promise.all([
            writeFile(join(stagingPath, 'plugin.json'), files.manifestJson, 'utf8'),
            writeFile(join(stagingPath, 'index.cjs'), files.indexCjs, 'utf8')
        ])
        await move(stagingPath, destination, { overwrite: false })
        installed = true
        await recordAiGeneratedPlugin(spec.id, spec.folderName)
    } catch (error) {
        await remove(installed ? destination : stagingPath).catch(() => undefined)
        throw error
    }
}

const creationFailure = async (error: unknown): Promise<CreateGeneratedPluginResult> => ({
    catalog: await getPluginCatalog(),
    error: error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : 'The generated plugin could not be installed.'
})

const createGeneratedPluginUnlocked = async (
    input: CreateGeneratedPluginInput
): Promise<CreateGeneratedPluginResult> => {
    if (input?.confirmed !== true) return creationFailure('Confirm the plugin plan before writing files.')
    try {
        const requestedSpec = normalizePluginWizardSpec(input.spec)
        const catalog = await getPluginCatalog()
        const identity = installedIdentity(catalog)
        const spec = resolveUniquePluginWizardSpec(requestedSpec, identity.ids, identity.folders)
        const files = await generateValidatedFiles(spec, input.revision)
        await installGeneratedFiles(spec, files)
        return {
            catalog: await refreshPluginCatalog(),
            pluginId: spec.id,
            folderName: spec.folderName
        }
    } catch (error) {
        return creationFailure(error)
    }
}

let creationLock: Promise<unknown> = Promise.resolve()

export const createGeneratedPlugin = async (
    input: CreateGeneratedPluginInput
): Promise<CreateGeneratedPluginResult> => {
    const run = creationLock.then(
        () => createGeneratedPluginUnlocked(input),
        () => createGeneratedPluginUnlocked(input)
    )
    creationLock = run.catch(() => undefined)
    return run
}
