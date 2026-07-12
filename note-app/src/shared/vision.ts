import { LlmProvider } from './models'

export const supportedImageMimeTypes = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
] as const

export type SupportedImageMimeType = typeof supportedImageMimeTypes[number]

// Keeps IPC and provider payloads bounded. Base64 encoding adds roughly 33%,
// so 10 MiB remains practical while covering normal phone photos and scans.
export const maxImageRecognitionBytes = 10 * 1024 * 1024

const startsWith = (bytes: Uint8Array, signature: number[]): boolean =>
    signature.every((value, index) => bytes[index] === value)

export const hasSupportedImageSignature = (
    mimeType: SupportedImageMimeType,
    bytes: Uint8Array
): boolean => {
    if (mimeType === 'image/png') return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (mimeType === 'image/jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff])
    if (mimeType === 'image/gif') {
        return startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
            startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    }
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])
}

export type VisionModelCandidate = {
    id: string
    label: string
    vision?: boolean
}

const modelSearchText = (model: VisionModelCandidate): string =>
    `${model.id} ${model.label}`.trim().toLowerCase()

const isGeminiVisionModel = (model: VisionModelCandidate): boolean => {
    const value = modelSearchText(model)
    if (/(?:embedding|aqa|live|native[- ]audio|tts|image[- ]generation)/.test(value)) return false
    return /^gemini-(?:pro-vision|1\.5|[2-9](?:\.|-|$))/.test(model.id.toLowerCase())
}

const isOpenAiVisionModel = (model: VisionModelCandidate): boolean => {
    const value = modelSearchText(model)
    if (/(?:audio|realtime|transcrib|tts|speech|embedding|moderation|dall-e|image[- ]generation|search|codex|instruct)/.test(value)) {
        return false
    }
    return /^(?:gpt-(?:4o|4\.1|4\.5|4-turbo|4-vision|5(?:[.-]\d+)?)(?:-|$)|chatgpt-4o-latest$|o1(?:-|$)|o3(?:-|$)|o4-mini(?:-|$)|computer-use-preview)/.test(model.id.toLowerCase())
}

const isAnthropicVisionModel = (model: VisionModelCandidate): boolean =>
    /^claude-(?:3(?:[-.]|$)|4(?:[-.]|$)|(?:opus|sonnet|haiku)-4(?:[-.]|$))/.test(model.id.toLowerCase())

export const filterVisionModels = <T extends VisionModelCandidate>(
    provider: LlmProvider,
    models: T[]
): T[] => models.filter((model) => {
    if (model.vision === true) return true
    if (model.vision === false) return false
    if (provider === 'local') return false
    if (provider === 'gemini') return isGeminiVisionModel(model)
    if (provider === 'anthropic') return isAnthropicVisionModel(model)
    return isOpenAiVisionModel(model)
})

export const isImageRecognitionAvailable = (
    provider: LlmProvider,
    models: VisionModelCandidate[] = []
): boolean => provider === 'local'
    ? filterVisionModels(provider, models).length > 0
    : true
