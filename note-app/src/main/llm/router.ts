import { AssistantMode, BlockMeta, LlmProvider } from '@shared/models'
import { AssistantModelSelection, AssistantScope, ImageRecognitionInput, LlmMessage, LlmModel } from '@shared/types'
import { PluginAiCompleteInput, PluginAiCompleteResult, PluginAiPromptLayers } from '@shared/plugins'
import { researchCategory } from '@shared/constants'
import { getBlocks, getCredential, getGoals, getSettings, readBlock, setBlockAiLabel, setBlockRouting } from '@/lib'
import { isImageRecognitionSelectionVerified, isLlmSelectionVerified } from '@shared/llmSettings'
import { hasSupportedImageSignature, maxImageRecognitionBytes, supportedImageMimeTypes, SupportedImageMimeType } from '@shared/vision'
import { blockNameSystemPrompt, normalizeBlockNameSummary } from './blockName'
import { parseRoutingClassification } from './classification'
import { rankNoteCandidates } from './noteRanking'
import { routingSystemPrompt } from './routingPrompt'
import { readSse } from './streamParser'
import { researchWeb } from './webResearch'
import { buildPluginAiMessages } from './pluginPrompt'
import { buildAssistantSystemPrompt } from './assistantPrompt'
import { buildImageRecognitionPrompt } from './imageRecognition'

export { buildAssistantSystemPrompt } from './assistantPrompt'

type StreamOptions = { signal: AbortSignal; onToken: (text: string) => void; maxTokens?: number }
type ImageRequest = {
    imageBase64: string
    mimeType: SupportedImageMimeType
    prompt: string
    signal: AbortSignal
}

type Adapter = {
    listModels: () => Promise<LlmModel[]>
    stream: (model: string, messages: LlmMessage[], options: StreamOptions) => Promise<void>
    recognizeImage: (model: string, request: ImageRequest) => Promise<string>
}

const errorFrom = async (response: Response): Promise<Error> => {
    const body = await response.json().catch(() => null) as { error?: { message?: string } | string; message?: string } | null
    const message = typeof body?.error === 'string' ? body.error : body?.error?.message ?? body?.message
    if (response.status === 401 || response.status === 403) return new Error('The provider rejected the configured API key.')
    return new Error(message ? `AI request failed: ${message}` : `AI request failed (HTTP ${response.status}).`)
}

const openAiCompatible = (
    baseUrl: string,
    token: string,
    outputTokenField: 'max_tokens' | 'max_completion_tokens' = 'max_tokens'
): Adapter => ({
    listModels: async () => {
        const response = await fetch(`${baseUrl}/v1/models`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
        if (!response.ok) throw await errorFrom(response)
        const payload = await response.json() as { data?: { id: string }[] }
        return (payload.data ?? []).map((model) => ({ id: model.id, label: model.id })).sort((a, b) => a.label.localeCompare(b.label))
    },
    stream: async (model, messages, { signal, onToken, maxTokens }) => {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST', signal,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
                ...(maxTokens ? { [outputTokenField]: maxTokens } : {})
            })
        })
        if (!response.ok) throw await errorFrom(response)
        await readSse(response, signal, (data) => {
            const payload = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
            const token = payload.choices?.[0]?.delta?.content
            if (token) onToken(token)
        })
    },
    recognizeImage: async (model, { imageBase64, mimeType, prompt, signal }) => {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST', signal,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({
                model,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
                    ]
                }],
                stream: false,
                [outputTokenField]: 4096
            })
        })
        if (!response.ok) throw await errorFrom(response)
        const payload = await response.json() as {
            choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[]
        }
        const content = payload.choices?.[0]?.message?.content
        return (typeof content === 'string'
            ? content
            : content?.map((part) => part.text ?? '').join('') ?? '').trim()
    }
})

const gemini = async (): Promise<Adapter> => {
    const key = await getCredential('gemini')
    if (!key) throw new Error('Add a Gemini API key in Settings.')
    const base = 'https://generativelanguage.googleapis.com/v1beta'
    return {
        listModels: async () => {
            const response = await fetch(`${base}/models?key=${encodeURIComponent(key)}&pageSize=1000`)
            if (!response.ok) throw await errorFrom(response)
            const payload = await response.json() as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }[] }
            return (payload.models ?? []).filter((model) => model.supportedGenerationMethods?.includes('generateContent')).map((model) => ({
                id: model.name.replace(/^models\//, ''), label: model.displayName ?? model.name.replace(/^models\//, ''), contextWindow: model.inputTokenLimit
            }))
        },
        stream: async (model, messages, { signal, onToken, maxTokens }) => {
            const system = messages.find((message) => message.role === 'system')?.content
            const contents = messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }))
            const response = await fetch(`${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`, {
                method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
                    contents,
                    ...(maxTokens ? { generationConfig: { maxOutputTokens: maxTokens } } : {})
                })
            })
            if (!response.ok) throw await errorFrom(response)
            await readSse(response, signal, (data) => {
                const payload = JSON.parse(data) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
                const token = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
                if (token) onToken(token)
            })
        },
        recognizeImage: async (model, { imageBase64, mimeType, prompt, signal }) => {
            const response = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
                method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [
                            { inline_data: { mime_type: mimeType, data: imageBase64 } },
                            { text: prompt }
                        ]
                    }],
                    generationConfig: { maxOutputTokens: 4096, temperature: 0 }
                })
            })
            if (!response.ok) throw await errorFrom(response)
            const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
            return (payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '').trim()
        }
    }
}

const anthropic = async (): Promise<Adapter> => {
    const key = await getCredential('anthropic')
    if (!key) throw new Error('Add a Claude API key in Settings.')
    const base = 'https://api.anthropic.com/v1'
    const headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    return {
        listModels: async () => {
            const response = await fetch(`${base}/models?limit=1000`, { headers })
            if (!response.ok) throw await errorFrom(response)
            const payload = await response.json() as { data?: { id: string; display_name?: string }[] }
            return (payload.data ?? []).map((model) => ({ id: model.id, label: model.display_name ?? model.id }))
        },
        stream: async (model, messages, { signal, onToken, maxTokens }) => {
            const system = messages.find((message) => message.role === 'system')?.content
            const response = await fetch(`${base}/messages`, {
                method: 'POST', signal,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, max_tokens: maxTokens ?? 2048, stream: true, ...(system ? { system } : {}), messages: messages.filter((message) => message.role !== 'system') })
            })
            if (!response.ok) throw await errorFrom(response)
            await readSse(response, signal, (data) => {
                const payload = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } }
                if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta' && payload.delta.text) onToken(payload.delta.text)
            })
        },
        recognizeImage: async (model, { imageBase64, mimeType, prompt, signal }) => {
            const response = await fetch(`${base}/messages`, {
                method: 'POST', signal,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    max_tokens: 4096,
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
                            { type: 'text', text: prompt }
                        ]
                    }]
                })
            })
            if (!response.ok) throw await errorFrom(response)
            const payload = await response.json() as { content?: { type?: string; text?: string }[] }
            return (payload.content?.map((part) => part.type === 'text' ? part.text ?? '' : '').join('') ?? '').trim()
        }
    }
}

const local = async (): Promise<Adapter> => {
    const settings = await getSettings()
    const base = settings.llm.localBaseUrl
    const token = await getCredential('local')
    return {
        listModels: async () => {
            const response = await fetch(`${base}/api/v1/models`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
            if (!response.ok) throw await errorFrom(response)
            const payload = await response.json() as {
                models?: {
                    type: string
                    key: string
                    display_name: string
                    vision?: boolean
                    capabilities?: { vision?: boolean; image_input?: boolean; input_modalities?: string[] }
                    loaded_instances: {
                        id: string
                        vision?: boolean
                        config?: {
                            context_length?: number
                            vision?: boolean
                            capabilities?: { vision?: boolean; image_input?: boolean; input_modalities?: string[] }
                        }
                    }[]
                }[]
            }
            return (payload.models ?? [])
                .filter((model) => (model.type === 'llm' || model.type === 'vlm') && model.loaded_instances.length > 0)
                .map((model) => {
                    const loaded = model.loaded_instances[0]
                    const capabilities = loaded.config?.capabilities ?? model.capabilities
                    const vision = model.type === 'vlm' || model.vision === true || loaded.vision === true ||
                        loaded.config?.vision === true || capabilities?.vision === true ||
                        capabilities?.image_input === true || capabilities?.input_modalities?.includes('image') === true
                    return {
                        id: loaded.id || model.key,
                        label: model.display_name,
                        contextWindow: loaded.config?.context_length,
                        ...(vision ? { vision: true } : {})
                    }
                })
        },
        stream: openAiCompatible(base, token).stream,
        recognizeImage: openAiCompatible(base, token).recognizeImage
    }
}

const adapterFor = async (provider: LlmProvider): Promise<Adapter> => {
    if (provider === 'gemini') return gemini()
    if (provider === 'anthropic') return anthropic()
    if (provider === 'local') return local()
    const key = await getCredential('openai')
    if (!key) throw new Error('Add an OpenAI API key in Settings.')
    return openAiCompatible('https://api.openai.com', key, 'max_completion_tokens')
}

const resolveSelection = async (selection?: AssistantModelSelection): Promise<AssistantModelSelection> => {
    if (selection?.model.trim()) return { provider: selection.provider, model: selection.model.trim() }
    const settings = await getSettings()
    if (!settings.llm.model) throw new Error('Choose and test an AI model in Settings first.')
    return { provider: settings.llm.provider, model: settings.llm.model }
}

const collectWith = async (
    selection: AssistantModelSelection,
    messages: LlmMessage[],
    signal: AbortSignal,
    maxTokens?: number
): Promise<string> => {
    let text = ''
    await (await adapterFor(selection.provider)).stream(selection.model, messages, { signal, onToken: (token) => { text += token }, maxTokens })
    return text.trim()
}

type ResolvedGoalScope = { goalIds?: string[]; readGoalLabels: string[] }

const resolveGoalScope = async (
    message: string,
    scope: AssistantScope,
    selection: AssistantModelSelection,
    signal: AbortSignal
): Promise<ResolvedGoalScope> => {
    const goals = await getGoals()
    const goalNames = new Map(goals.map((goal) => [goal.id, goal.name]))
    goalNames.set(researchCategory, 'Research')

    if (scope.goalMode === 'open') {
        const goalId = scope.openGoalId ?? null
        return {
            goalIds: goalId === null ? [] : [goalId],
            readGoalLabels: [goalId === null ? 'Quick Notes' : (goalNames.get(goalId) ?? 'Currently open goal')]
        }
    }
    if (scope.goalMode === 'all') return { readGoalLabels: ['All goals'] }

    const candidates = [
        ...goals.map((goal) => ({ id: goal.id, name: goal.name, description: goal.description })),
        { id: researchCategory, name: 'Research', description: 'Research notes, sources, and reference material.' }
    ]
    const validIds = new Set(candidates.map((goal) => goal.id))
    const suppliedIds = (scope.goalIds ?? []).filter((id) => validIds.has(id))
    if (suppliedIds.length > 0) {
        return { goalIds: suppliedIds, readGoalLabels: suppliedIds.map((id) => goalNames.get(id) ?? id) }
    }
    if (candidates.length === 0) return { readGoalLabels: ['All goals'] }

    try {
        const raw = await collectWith(selection, [
            { role: 'system', content: 'Select every goal relevant to the user question. Compare the question with each goal name and description, prioritize specific domain evidence, and do not select broad names from generic words alone. Return only JSON: {"goalIds":["listed-id"]}. Never invent ids.' },
            { role: 'user', content: JSON.stringify({ goals: candidates, question: message }) }
        ], signal)
        const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, '')) as { goalIds?: string[] }
        const goalIds = [...new Set((parsed.goalIds ?? []).filter((id) => validIds.has(id)))]
        if (goalIds.length === 0) throw new Error('No relevant goals were selected.')
        return { goalIds, readGoalLabels: goalIds.map((id) => goalNames.get(id) ?? id) }
    } catch (error) {
        if (signal.aborted) throw error
        // Relevance selection must never turn a provider-formatting failure
        // into an empty answer. Fall back to all goals and disclose it.
        return { readGoalLabels: ['All goals (relevance fallback)'] }
    }
}

const maxNotesContextChars = 60_000
const maxSingleNoteChars = 6_000
const maxSearchNoteChars = 3_500

const excerptForMode = (mode: AssistantMode, message: string, content: string): string => {
    const limit = mode === 'search' ? maxSearchNoteChars : maxSingleNoteChars
    if (content.length <= limit || mode !== 'search') return content.slice(0, limit)
    const normalizedContent = content.toLowerCase()
    const normalizedQuery = message.trim().toLowerCase()
    const terms = normalizedQuery.match(/[\p{L}\p{N}]{2,}/gu) ?? []
    const exactIndex = normalizedQuery.length > 2 ? normalizedContent.indexOf(normalizedQuery) : -1
    const termIndexes = terms.map((term) => normalizedContent.indexOf(term)).filter((index) => index >= 0)
    const matchIndex = exactIndex >= 0 ? exactIndex : (termIndexes.length > 0 ? Math.min(...termIndexes) : 0)
    const start = Math.max(0, Math.min(content.length - limit, matchIndex - Math.floor(limit / 3)))
    return `${start > 0 ? '...' : ''}${content.slice(start, start + limit)}${start + limit < content.length ? '...' : ''}`
}

const categoryForCandidate = (
    block: BlockMeta,
    scope: AssistantScope,
    resolvedGoals: ResolvedGoalScope
): string | null => {
    if (scope.goalMode === 'open') return resolvedGoals.goalIds?.[0] ?? null
    const resolvedCategory = resolvedGoals.goalIds?.find((id) => block.categories.includes(id))
    return resolvedCategory ?? block.categories.find((category) => category !== null) ?? null
}

export const buildNotesContext = async (
    message: string,
    scope: AssistantScope,
    selection?: AssistantModelSelection,
    signal = new AbortController().signal
): Promise<{ prompt: string; citedIds: string[]; citedBlockCategoryIds: Record<string, string | null>; readGoalLabels: string[] }> => {
    const activeSelection = await resolveSelection(selection)
    const [blocks, goals] = await Promise.all([getBlocks(), getGoals()])
    const resolvedGoals = await resolveGoalScope(message, scope, activeSelection, signal)
    const blocksById = new Map(blocks.map((block) => [block.id, block]))
    // Explicit attachments are user-selected context: keep their complete
    // contents outside retrieval/date limits and exclude them from ranked
    // excerpts so the same block is never injected twice.
    const attachedBlocks = [...new Set(scope.attachedBlockIds ?? [])]
        .map((id) => blocksById.get(id))
        .filter((block): block is BlockMeta => block !== undefined)
    const attachedIds = new Set(attachedBlocks.map((block) => block.id))
    const scopedBlocks = blocks.filter((block) =>
        !attachedIds.has(block.id) &&
        (scope.goalMode === 'all' || resolvedGoals.goalIds === undefined ||
            (scope.goalMode === 'open' && resolvedGoals.goalIds.length === 0 ? block.categories.includes(null) : resolvedGoals.goalIds.some((id) => block.categories.includes(id)))) &&
        (scope.from === undefined || block.updatedAt >= scope.from) &&
        (scope.to === undefined || block.updatedAt <= scope.to)
    )
    const [attachedCandidates, candidates] = await Promise.all([
        Promise.all(attachedBlocks.map(async (block) => ({
            block,
            content: (await readBlock(block.id)).content
        }))),
        Promise.all(scopedBlocks.map(async (block) => ({
            block,
            content: (await readBlock(block.id)).content.trim()
        })))
    ])
    const ranked = rankNoteCandidates(message, candidates.filter((candidate) => candidate.content.length > 0))
    let size = 0
    const excerpts: string[] = []
    const citedIds: string[] = attachedCandidates.map(({ block }) => block.id)
    const citedBlockCategoryIds: Record<string, string | null> = {}
    const goalNames = new Map(goals.map((goal) => [goal.id, goal.name]))
    goalNames.set(researchCategory, 'Research')
    const labelForCategory = (category: string | null): string => category === null
        ? 'Quick Notes'
        : (goalNames.get(category) ?? 'Goal')
    const attachedNotesContext = attachedCandidates.map(({ block, content }) => {
        const preferredCategory = block.categories.find((category) => category !== null) ?? null
        citedBlockCategoryIds[block.id] = preferredCategory
        const categoryLabels = block.categories.map(labelForCategory).join(', ')
        const noteLabel = block.aiLabel ?? block.excerpt
        return `[block:${block.id}] Attached note; Goals: ${categoryLabels}; Note: ${noteLabel}\n${content}`
    }).join('\n\n')
    for (const { block, content } of ranked) {
        const excerpt = excerptForMode(scope.mode, message, content)
        const category = categoryForCandidate(block, scope, resolvedGoals)
        const categoryLabel = labelForCategory(category)
        const entry = `[block:${block.id}] Goal: ${categoryLabel}; Note: ${block.excerpt}\n${excerpt}`
        if (size + entry.length > maxNotesContextChars) break
        size += entry.length
        citedIds.push(block.id)
        citedBlockCategoryIds[block.id] = category
        excerpts.push(entry)
    }
    const goalContext = goals.map((goal) => `${goal.id}: ${goal.name}${goal.description ? ` - ${goal.description}` : ''}${goal.routingHints ? `; routing hints: ${goal.routingHints}` : ''}`).join('\n')
    const disclosure = resolvedGoals.readGoalLabels.join(', ')
    return {
        citedIds,
        citedBlockCategoryIds,
        readGoalLabels: resolvedGoals.readGoalLabels,
        prompt: buildAssistantSystemPrompt(scope.mode, disclosure, goalContext, excerpts.join('\n\n'), attachedNotesContext)
    }
}

export const listModels = async (provider: LlmProvider): Promise<LlmModel[]> => (await adapterFor(provider)).listModels()

// 544x80 PNG containing the high-contrast text "VISION 7391". Keeping the
// fixture in memory verifies pixel-reading capability without writing a file.
const imageTestPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAiAAAABQCAIAAACvVlmjAAACxElEQVR42u3dwY0DIRBE0co/aTsCHywNQ9G8HwDaQdBvLxb5SJK0oNgCSRJgJEmAkSQBRpIkwEiSACNJAowkSYCRJAFGkgQYSZIAI0kaAUx+9Ngf8ef62dRT37X677ltf1aft7b1lw+FsvPTdm7bznPz+QQMYAADGMAABjCAsT+AAQxgAAMYwAAGMIABDGAAAxjAAAYwgAGM/QEMYAADGMAABjCAAQxgAAMYwAAGMIABzH3rn37gTv8H5bbzMGnAvXl+2vanATbAAAYwgAEMYAADGMAABjCAAYwBBxjAAAYwgDGAAAMYwAAGMIABDGAAAxjAAMaAc+EBAxjAAMYAAgxgAAMYwAAGMIABjHMFGD+0NOAMAsAABjCAMYAAAxjAAAYwgAEMYAADGMAAxvoGAWAAAxjAGECAAQxgAAMYwAAGMIABDGAAY33AAAYwgAGMDW18uAkwewdE2wACSef9Ss5+GA0wLgBgAAMYwAAGMIABDGAAAxgDCDCAAYz7BRjAuACAAQxgAAMYwAAGMIABDGAMIMAABjDuF2AA4wIABjCAAcwUYE6/ePFDSOsPfdDJDyc9gAYYwAAAMAax7wIMYAADGMAABjCAAYz1AQMYwAAGMAAAjEHsuwADGMAABjCAcd8BAxjrAwYwgAEMYAAAGIPYdwEGMIABDGAA474DBjDWBwxgAAMYwAAAMAax7wIMYAADGMAAxn0HDGCsDxj3CDCAAQwAAGMQ+y7AAAYwgAEMYNx3wADG+oBxjwAzB5i2DcqmB39S9tBQ2/60PRiVoQ/ceVhsxoNjk/4ewAAGMIABDGAAAxjAAAYwgAEMYAADGMAABjCAAQxgAAMYwAAGMIABDGAAAxjAAAYwgAEMYAADGMAABjCAOQEYSZIAI0kCjCQJMJIkwEiSBBhJEmAkSYCRJAkwkiTASJIAI0kSYCRJ9cB8AUBRxiIfo9E7AAAAAElFTkSuQmCC'

const recognizeWith = async (
    selection: AssistantModelSelection,
    imageBase64: string,
    mimeType: SupportedImageMimeType,
    prompt: string,
    timeoutMs: number
): Promise<string> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
        return await (await adapterFor(selection.provider)).recognizeImage(selection.model, {
            imageBase64,
            mimeType,
            prompt,
            signal: controller.signal
        })
    } catch (error) {
        if (controller.signal.aborted) throw new Error('Image recognition took too long. Try again.')
        throw error
    } finally {
        clearTimeout(timeout)
    }
}

export const testImageRecognitionConnection = async (): Promise<AssistantModelSelection> => {
    const settings = await getSettings()
    const model = settings.llm.imageRecognitionModel.trim()
    if (!model) throw new Error('Choose an image recognition model in Settings first.')
    const selection = { provider: settings.llm.provider, model }
    const text = await recognizeWith(
        selection,
        imageTestPngBase64,
        'image/png',
        'Read the large text in this image and reply with that text only.',
        20_000
    )
    if (!text.toUpperCase().includes('VISION 7391')) {
        throw new Error('The selected model did not read the image test text correctly.')
    }
    return selection
}

export const recognizeImage = async (input: ImageRecognitionInput): Promise<string> => {
    const settings = await getSettings()
    if (!isImageRecognitionSelectionVerified(settings.llm)) {
        throw new Error('Choose an image recognition model and test that exact connection in Settings first.')
    }
    if (!supportedImageMimeTypes.includes(input.mimeType)) {
        throw new Error('Choose a PNG, JPEG, WebP, or GIF image.')
    }
    const byteLength = input.imageBytes?.byteLength ?? 0
    if (byteLength === 0) throw new Error('The selected image is empty.')
    if (byteLength > maxImageRecognitionBytes) {
        throw new Error('The selected image is larger than the 10 MiB limit.')
    }
    const bytes = new Uint8Array(input.imageBytes)
    if (!hasSupportedImageSignature(input.mimeType, bytes)) {
        throw new Error('The selected file does not contain a valid image matching its file type.')
    }

    const text = await recognizeWith(
        { provider: settings.llm.provider, model: settings.llm.imageRecognitionModel },
        Buffer.from(bytes).toString('base64'),
        input.mimeType,
        buildImageRecognitionPrompt(input.language, input.containsHandwriting),
        60_000
    )
    if (!text.trim()) throw new Error('No readable text was found in the image.')
    return text.trim()
}

export const testConnection = async (): Promise<AssistantModelSelection> => {
    const selection = await resolveSelection()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
        let text = ''
        await (await adapterFor(selection.provider)).stream(selection.model, [{ role: 'user', content: 'Reply with OK.' }], { signal: controller.signal, onToken: (token) => { text += token } })
        if (!text.trim()) throw new Error('The provider returned an empty response.')
        return selection
    } finally { clearTimeout(timeout) }
}

export const streamAssistant = async (message: string, history: LlmMessage[], scope: AssistantScope, selection: AssistantModelSelection | undefined, options: StreamOptions): Promise<{ citedBlockIds: string[]; citedBlockCategoryIds: Record<string, string | null>; readGoalLabels: string[] }> => {
    const activeSelection = await resolveSelection(selection)
    const context = await buildNotesContext(message, scope, activeSelection, options.signal)
    const web = scope.mode === 'research' ? await researchWeb(message, context.prompt, options.signal) : null
    const systemPrompt = web ? `${context.prompt}\n\nWeb research:\n${web.context}` : context.prompt
    await (await adapterFor(activeSelection.provider)).stream(activeSelection.model, [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: message }], options)
    return { citedBlockIds: context.citedIds, citedBlockCategoryIds: context.citedBlockCategoryIds, readGoalLabels: context.readGoalLabels }
}

const collect = async (messages: LlmMessage[]): Promise<string> => {
    const selection = await resolveSelection()
    const controller = new AbortController()
    return collectWith(selection, messages, controller.signal)
}

export const runInlineAction = async (action: 'translate' | 'explain', text: string, blockId?: string): Promise<string> => {
    void blockId
    return collect([
    { role: 'system', content: action === 'translate' ? 'Translate the supplied note text into clear English. Return only the translation.' : 'Explain the supplied note text clearly and concisely. Preserve important technical details.' },
    { role: 'user', content: text }
    ])
}

export const completePluginAi = async (
    input: PluginAiCompleteInput,
    blockContent?: string,
    layers: PluginAiPromptLayers = {}
): Promise<PluginAiCompleteResult> => {
    const settings = await getSettings()
    if (!isLlmSelectionVerified(settings.llm)) {
        return { error: 'AI is not ready. Choose a model and test the connection in Settings.' }
    }

    const prompt = input.prompt.trim().slice(0, 12_000)
    if (!prompt) return { error: 'Add some text before running this AI action.' }
    const maxTokens = Number.isFinite(input.maxTokens)
        ? Math.max(64, Math.min(2_048, Math.round(input.maxTokens as number)))
        : 800
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)

    try {
        const text = await collectWith(
            { provider: settings.llm.provider, model: settings.llm.model },
            buildPluginAiMessages({ ...input, prompt }, blockContent, layers),
            controller.signal,
            maxTokens
        )
        return text
            ? { text }
            : { error: 'AI returned an empty response. Try again.' }
    } catch {
        return {
            error: controller.signal.aborted
                ? 'AI took too long to respond. Try again.'
                : 'AI request failed. Check the AI connection in Settings and try again.'
        }
    } finally {
        clearTimeout(timeout)
    }
}

export const polishTranscript = async (text: string): Promise<string> => collect([
    { role: 'system', content: 'Clean up grammar and filler words in this dictation transcript. Preserve meaning, facts, and markdown. Return only the polished transcript.' },
    { role: 'user', content: text }
])

export const summarizeBlockName = async (blockId: string): Promise<BlockMeta | null> => {
    const [content, settings] = await Promise.all([readBlock(blockId), getSettings()])
    const note = content.content.trim()
    if (!note || !settings.llm.aiBlockNameSummary || !isLlmSelectionVerified(settings.llm)) return null

    const controller = new AbortController()
    const raw = await collectWith(
        { provider: settings.llm.provider, model: settings.llm.model },
        [
            { role: 'system', content: blockNameSystemPrompt },
            { role: 'user', content: note.slice(0, 6000) }
        ],
        controller.signal
    )
    const aiLabel = normalizeBlockNameSummary(raw)
    if (!aiLabel) throw new Error('The provider returned an empty note name.')
    return setBlockAiLabel(blockId, aiLabel)
}

export const classifyBlock = async (blockId: string): Promise<BlockMeta | null> => {
    const [content, goals, settings] = await Promise.all([readBlock(blockId), getGoals(), getSettings()])
    if (!content.content.trim()) return null
    if (!settings.llm.model) throw new Error('Choose and test an AI model in Settings before routing notes.')
    const goalList = goals.map((goal) => ({ id: goal.id, name: goal.name, description: goal.description, routingHints: goal.routingHints }))
    const raw = await collect([
        { role: 'system', content: routingSystemPrompt },
        { role: 'user', content: JSON.stringify({ goals: goalList, note: content.content.slice(0, 6000) }) }
    ])
    const classification = parseRoutingClassification(raw, content.content, goals)
    return setBlockRouting(blockId, {
        status: 'pending',
        decidedAt: Date.now(),
        assignments: classification.assignments,
        model: [settings.llm.provider, settings.llm.model].join(':'),
        hasConfidentMatch: classification.hasConfidentMatch,
        ...(classification.suggestedNewGoal
            ? { suggestedNewGoal: classification.suggestedNewGoal }
            : {})
    })
}
