export const blockNameSystemPrompt = 'Create a concise topical display name for the supplied note. Return plain text only: no Markdown, labels, quotation marks, or trailing punctuation. Use at most five words.'

export const normalizeBlockNameSummary = (value: string): string => {
    const plainText = value
        .replace(/```(?:text|markdown)?/gi, ' ')
        .replace(/\r?\n/g, ' ')
        .trim()
        .replace(/^(?:title|name|summary)\s*:\s*/i, '')
        .replace(/^(?:#{1,6}\s+|[-*+]\s+)/, '')
        .replace(/[*_~`]/g, '')
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
        .replace(/[.!?;:,]+$/, '')
        .replace(/\s+/g, ' ')
        .trim()

    return plainText.split(' ').filter(Boolean).slice(0, 5).join(' ')
}
