const normalizeLanguage = (language: string): string =>
    language.trim().replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').slice(0, 80) || 'English'

export const buildImageRecognitionPrompt = (
    language: string,
    containsHandwriting: boolean
): string => [
    'Extract all readable text from the attached image.',
    `Language: ${normalizeLanguage(language)}`,
    `Contains handwriting: ${containsHandwriting ? 'yes' : 'no'}`,
    'Use the language hint and handwriting mode when interpreting ambiguous characters.',
    'Return only the extracted text. Preserve reading order and line breaks where reasonable.',
    'Do not add commentary, labels, Markdown fences, or text that is not visible in the image.'
].join('\n')
