import {
    defaultSettings,
    glossaryExplanationMaxLength,
    maxGlossaryKeyLengthLimit,
    minGlossaryKeyLengthLimit
} from './constants'

// Clamps the user-configured key limit into the supported range; invalid
// values fall back to the default so settings.json edits cannot break saves.
export const clampGlossaryKeyMaxLength = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value)
        ? Math.max(minGlossaryKeyLengthLimit, Math.min(maxGlossaryKeyLengthLimit, Math.round(value)))
        : defaultSettings.glossaryKeyMaxLength

export type GlossaryValidationError = 'empty-key' | 'empty-explanation' | 'key-too-long'

export type GlossaryFieldValidation =
    | { key: string; explanation: string; error?: never }
    | { error: GlossaryValidationError; key?: never; explanation?: never }

export const validateGlossaryFields = (
    key: string,
    explanation: string,
    keyMaxLength: number
): GlossaryFieldValidation => {
    const trimmedKey = key.trim()
    if (!trimmedKey) return { error: 'empty-key' }
    if (trimmedKey.length > keyMaxLength) return { error: 'key-too-long' }
    const trimmedExplanation = explanation.trim()
    if (!trimmedExplanation) return { error: 'empty-explanation' }
    return {
        key: trimmedKey,
        // Explanations have no UI limit; the slice is storage safety only.
        explanation: trimmedExplanation.slice(0, glossaryExplanationMaxLength)
    }
}

// Keys are unique case-insensitively; comparison ignores surrounding space.
export const glossaryKeysEqual = (left: string, right: string): boolean =>
    left.trim().toLowerCase() === right.trim().toLowerCase()
