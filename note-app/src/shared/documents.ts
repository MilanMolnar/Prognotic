export const supportedDocumentExtensions = [
    'txt',
    'text',
    'log',
    'md',
    'markdown',
    'json',
    'yaml',
    'yml',
    'csv',
    'tsv',
    'xlsx',
    'doc',
    'docx',
    'rtf'
] as const

export type SupportedDocumentExtension = typeof supportedDocumentExtensions[number]

export type DocumentFormat =
    | 'text'
    | 'markdown'
    | 'json'
    | 'yaml'
    | 'csv'
    | 'tsv'
    | 'xlsx'
    | 'doc'
    | 'docx'
    | 'rtf'

export const documentSummaryStyles = [
    { id: 'bullet-brief', label: 'Bullet brief' },
    { id: 'executive-summary', label: 'Executive summary' },
    { id: 'study-notes', label: 'Study notes' },
    { id: 'action-items', label: 'Action items' },
    { id: 'custom', label: 'Custom style' }
] as const

export type DocumentSummaryStyle = typeof documentSummaryStyles[number]['id']

export type DocumentSummaryOptions = {
    style: DocumentSummaryStyle
    customStyle: string
    targetPercent: number
    focus: string
    instructions: string
    preserveStructure: boolean
}

export const defaultDocumentSummaryOptions: DocumentSummaryOptions = {
    style: 'bullet-brief',
    customStyle: '',
    targetPercent: 25,
    focus: '',
    instructions: '',
    preserveStructure: true
}

export const maxBlockContentChars = 1_000_000
export const maxDocumentBytes = 20 * 1024 * 1024
export const maxPlainTextDocumentBytes = 5 * 1024 * 1024
export const maxRtfDocumentBytes = 10 * 1024 * 1024
export const maxLegacyWordDocumentBytes = 15 * 1024 * 1024
export const maxDecompressedOfficeBytes = 100 * 1024 * 1024
export const maxOfficeArchiveEntries = 5_000
export const maxSpreadsheetSheets = 50
export const maxTabularRows = 50_000
export const maxTabularColumns = 500
export const maxTabularCells = 100_000
export const maxParsedDocumentChars = 900_000
export const maxDocumentSummaryInputChars = 24_000
export const maxDocumentSummaryOutputChars = 100_000
export const maxDocumentAppendSeparatorChars = 4

const formatByExtension: Record<SupportedDocumentExtension, DocumentFormat> = {
    txt: 'text',
    text: 'text',
    log: 'text',
    md: 'markdown',
    markdown: 'markdown',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    csv: 'csv',
    tsv: 'tsv',
    xlsx: 'xlsx',
    doc: 'doc',
    docx: 'docx',
    rtf: 'rtf'
}

const mimeTypesByFormat: Record<DocumentFormat, readonly string[]> = {
    text: ['text/plain'],
    markdown: ['text/markdown', 'text/plain', 'text/x-markdown'],
    json: ['application/json', 'text/json', 'text/plain'],
    yaml: ['application/yaml', 'application/x-yaml', 'text/yaml', 'text/x-yaml', 'text/plain'],
    csv: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
    tsv: ['text/tab-separated-values', 'text/plain'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/zip', 'application/x-zip-compressed'],
    doc: ['application/msword', 'application/vnd.ms-word', 'application/x-msword', 'application/x-ole-storage'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/x-zip-compressed'],
    rtf: ['application/rtf', 'text/rtf', 'text/richtext', 'application/x-rtf', 'text/plain']
}

export const documentFileAccept = [
    ...supportedDocumentExtensions.map((extension) => `.${extension}`),
    ...new Set(Object.values(mimeTypesByFormat).flat())
].join(',')

export const supportedDocumentFileSummary = 'TXT, Markdown, JSON, YAML, CSV/TSV, XLSX, DOC, DOCX, RTF, or LOG'

export const extensionFromFileName = (fileName: string): string => {
    const normalized = fileName.trim().toLowerCase()
    const dot = normalized.lastIndexOf('.')
    return dot >= 0 && dot < normalized.length - 1 ? normalized.slice(dot + 1) : ''
}

export const supportedDocumentExtensionFor = (fileName: string): SupportedDocumentExtension | null => {
    const extension = extensionFromFileName(fileName)
    return supportedDocumentExtensions.includes(extension as SupportedDocumentExtension)
        ? extension as SupportedDocumentExtension
        : null
}

export const documentFormatForExtension = (extension: SupportedDocumentExtension): DocumentFormat =>
    formatByExtension[extension]

export const documentFormatForFileName = (fileName: string): DocumentFormat | null => {
    const extension = supportedDocumentExtensionFor(fileName)
    return extension ? documentFormatForExtension(extension) : null
}

export const documentFormatLabel = (format: DocumentFormat): string => {
    if (format === 'text') return 'Plain text'
    if (format === 'markdown') return 'Markdown'
    if (format === 'json') return 'JSON'
    if (format === 'yaml') return 'YAML'
    if (format === 'csv') return 'CSV'
    if (format === 'tsv') return 'TSV'
    if (format === 'xlsx') return 'Excel workbook'
    if (format === 'doc') return 'Legacy Word document'
    if (format === 'docx') return 'Word document'
    return 'Rich Text Format'
}

export const maxDocumentBytesForFormat = (format: DocumentFormat): number => {
    if (format === 'text' || format === 'markdown' || format === 'json' || format === 'yaml' || format === 'csv' || format === 'tsv') {
        return maxPlainTextDocumentBytes
    }
    if (format === 'rtf') return maxRtfDocumentBytes
    if (format === 'doc') return maxLegacyWordDocumentBytes
    return maxDocumentBytes
}

export const documentMimeTypeMatches = (format: DocumentFormat, mimeType: string): boolean => {
    const normalized = mimeType.trim().toLowerCase().split(';', 1)[0]
    if (!normalized || normalized === 'application/octet-stream') return true
    return mimeTypesByFormat[format].includes(normalized)
}

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
    signature.every((value, index) => bytes[index] === value)

export const hasZipSignature = (bytes: Uint8Array): boolean =>
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])

export const hasOleSignature = (bytes: Uint8Array): boolean =>
    startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

export const hasRtfSignature = (bytes: Uint8Array): boolean => {
    let offset = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0
    while (offset < bytes.length && (bytes[offset] === 0x20 || bytes[offset] === 0x09 || bytes[offset] === 0x0a || bytes[offset] === 0x0d)) {
        offset += 1
    }
    const prefix = Array.from(bytes.slice(offset, offset + 5), (value) => String.fromCharCode(value)).join('')
    return prefix.toLowerCase() === '{\\rtf'
}

const safeSlice = (text: string, end: number): string => {
    let safeEnd = Math.max(0, Math.min(text.length, end))
    if (
        safeEnd > 0 &&
        safeEnd < text.length &&
        /[\uD800-\uDBFF]/.test(text[safeEnd - 1]) &&
        /[\uDC00-\uDFFF]/.test(text[safeEnd])
    ) {
        safeEnd -= 1
    }
    return text.slice(0, safeEnd)
}

export type TruncatedDocumentText = { text: string; truncated: boolean }

export const truncateDocumentText = (
    text: string,
    maxChars: number,
    notice = '> Document text was truncated to stay within capture limits.'
): TruncatedDocumentText => {
    const limit = Math.max(0, Math.floor(maxChars))
    if (text.length <= limit) return { text, truncated: false }
    if (limit === 0) return { text: '', truncated: true }

    const suffix = `\n\n${notice}`
    if (suffix.length >= limit) return { text: safeSlice(text, limit), truncated: true }

    const hardEnd = limit - suffix.length
    let prefix = safeSlice(text, hardEnd).trimEnd()
    const lastLineBreak = prefix.lastIndexOf('\n')
    if (lastLineBreak >= Math.max(0, prefix.length - 1_000) && lastLineBreak >= Math.floor(hardEnd * 0.6)) {
        prefix = prefix.slice(0, lastLineBreak).trimEnd()
    }

    const openFenceFor = (value: string): string => {
        let openFence = ''
        for (const match of value.matchAll(/(?:^|\n)(`{3,})/g)) {
            const marker = match[1]
            if (!openFence) openFence = marker
            else if (marker.length >= openFence.length) openFence = ''
        }
        return openFence
    }
    let openFence = openFenceFor(prefix)
    let fenceClosure = openFence ? `\n${openFence}` : ''
    prefix = safeSlice(prefix, Math.max(0, limit - suffix.length - fenceClosure.length)).trimEnd()
    openFence = openFenceFor(prefix)
    fenceClosure = openFence ? `\n${openFence}` : ''
    return { text: `${prefix}${fenceClosure}${suffix}`.slice(0, limit), truncated: true }
}

export const prepareDocumentInsertion = (
    text: string,
    currentContentChars: number
): TruncatedDocumentText => {
    const remaining = Math.max(
        0,
        maxBlockContentChars - Math.max(0, Math.floor(currentContentChars)) - maxDocumentAppendSeparatorChars
    )
    return truncateDocumentText(
        text,
        remaining,
        '> Document text was truncated to fit the note block limit.'
    )
}
