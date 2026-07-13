import {
    DocumentFormat,
    documentFormatForExtension,
    documentMimeTypeMatches,
    hasOleSignature,
    hasRtfSignature,
    hasZipSignature,
    maxDocumentBytes,
    maxDocumentBytesForFormat,
    maxParsedDocumentChars,
    maxSpreadsheetSheets,
    supportedDocumentExtensionFor,
    supportedDocumentExtensions,
    truncateDocumentText
} from '@shared/documents'
import { ParseDocumentInput, ParsedDocument } from '@shared/types'
import mammoth from 'mammoth'
import readXlsxFile, { readSheetNames } from 'read-excel-file/node'
import WordExtractor from 'word-extractor'
import { parseDocument as parseYamlDocument } from 'yaml'
import { inspectOfficeArchive } from './archive'
import { parseDelimitedDocument, renderTabularRows } from './delimited'
import { parseRtfDocument } from './rtf'

type ParsedContent = {
    text: string
    warnings: string[]
}

type ValidatedDocumentInput = {
    bytes: Uint8Array
    fileName: string
    format: DocumentFormat
}

const normalizeText = (text: string): string => text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\0').join('')
    .trim()

const isProbablyBinary = (bytes: Uint8Array): boolean => {
    const sample = bytes.slice(0, Math.min(bytes.length, 8_192))
    if (sample.includes(0)) return true
    let controlBytes = 0
    for (const byte of sample) {
        if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) controlBytes += 1
    }
    return sample.length > 0 && controlBytes / sample.length > 0.05
}

export const decodeDocumentText = (bytes: Uint8Array): string => {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return normalizeText(new TextDecoder('utf-16le', { fatal: true }).decode(bytes.slice(2)))
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return normalizeText(new TextDecoder('utf-16be', { fatal: true }).decode(bytes.slice(2)))
    }
    if (isProbablyBinary(bytes)) {
        throw new Error('The selected file contains binary data instead of readable text.')
    }
    try {
        return normalizeText(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch {
        throw new Error('The text file is not valid UTF-8 or UTF-16 text.')
    }
}

const fenced = (language: string, content: string): string => {
    const marker = content.includes('```') ? '````' : '```'
    return `${marker}${language}\n${content}\n${marker}`
}

const parseJson = (text: string): ParsedContent => {
    try {
        return { text: fenced('json', JSON.stringify(JSON.parse(text), null, 2)), warnings: [] }
    } catch {
        throw new Error('The selected JSON file is not valid JSON.')
    }
}

const parseYaml = (text: string): ParsedContent => {
    const document = parseYamlDocument(text, { schema: 'core', uniqueKeys: true })
    if (document.errors.length > 0) throw new Error('The selected YAML file is not valid YAML.')
    try {
        document.toJS({ maxAliasCount: 100 })
    } catch {
        throw new Error('The YAML file contains too many aliases to process safely.')
    }
    const normalized = document.toString({ lineWidth: 0 }).trim()
    return { text: fenced('yaml', normalized), warnings: [] }
}

const parseXlsx = async (bytes: Uint8Array): Promise<ParsedContent> => {
    inspectOfficeArchive(bytes, 'xlsx')
    const buffer = Buffer.from(bytes)
    const sheetNames = await readSheetNames(buffer)
    if (sheetNames.length > maxSpreadsheetSheets) {
        throw new Error(`The workbook contains more than ${maxSpreadsheetSheets} sheets and cannot be processed safely.`)
    }
    const warnings = ['Excel formulas are not calculated; only stored cell values are included.']
    const sections: string[] = []
    for (const sheetName of sheetNames) {
        const rows = await readXlsxFile(buffer, { sheet: sheetName })
        const rendered = renderTabularRows(rows)
        warnings.push(...rendered.warnings.map((warning) => `${sheetName}: ${warning}`))
        const name = sheetName.replace(/[\r\n#]/g, ' ').trim() || 'Untitled sheet'
        sections.push(`## Sheet: ${name}\n\n${rendered.text || '_Empty sheet_'}`)
    }
    return { text: sections.join('\n\n'), warnings }
}

const parseDocx = async (bytes: Uint8Array): Promise<ParsedContent> => {
    inspectOfficeArchive(bytes, 'docx')
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
    const warnings = result.messages.length > 0
        ? [`Word extraction reported ${result.messages.length} formatting warning${result.messages.length === 1 ? '' : 's'}.`]
        : []
    return { text: result.value, warnings }
}

const parseLegacyDoc = async (bytes: Uint8Array): Promise<ParsedContent> => {
    try {
        const document = await new WordExtractor().extract(Buffer.from(bytes))
        return {
            text: document.getBody(),
            warnings: ['Legacy DOC extraction is best effort; formatting, tables, and embedded objects are omitted.']
        }
    } catch {
        throw new Error('This legacy Word file could not be read. It may be password-protected, damaged, or use unsupported features.')
    }
}

const validateFileName = (value: unknown): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > 255 || value.includes('\0') || /[\r\n]/.test(value)) {
        throw new Error('The selected document has an invalid filename.')
    }
    return value.trim()
}

export const validateParseDocumentInput = (input: unknown): ValidatedDocumentInput => {
    if (!input || typeof input !== 'object') throw new Error('Choose a document to parse.')
    const candidate = input as Partial<ParseDocumentInput>
    const fileName = validateFileName(candidate.fileName)
    if (!(candidate.documentBytes instanceof ArrayBuffer)) {
        throw new Error('The selected document could not be read.')
    }
    if (
        typeof candidate.extension !== 'string' ||
        !supportedDocumentExtensions.some((extension) => extension === candidate.extension)
    ) {
        throw new Error('This document type is not supported.')
    }

    const extension = candidate.extension as ParseDocumentInput['extension']
    if (supportedDocumentExtensionFor(fileName) !== extension) {
        throw new Error('The document extension does not match its filename.')
    }
    const format = documentFormatForExtension(extension)
    if (typeof candidate.mimeType !== 'string' || candidate.mimeType.length > 200) {
        throw new Error('The selected document has an invalid file type.')
    }
    if (!documentMimeTypeMatches(format, candidate.mimeType)) {
        throw new Error('The document file type does not match its extension.')
    }

    const byteLength = candidate.documentBytes.byteLength
    if (byteLength === 0) throw new Error('The selected document is empty.')
    if (byteLength > maxDocumentBytes || byteLength > maxDocumentBytesForFormat(format)) {
        const limitMiB = maxDocumentBytesForFormat(format) / 1024 / 1024
        throw new Error(`The selected document is larger than the ${limitMiB} MiB limit for this format.`)
    }

    const bytes = new Uint8Array(candidate.documentBytes)
    if (format === 'docx' || format === 'xlsx') {
        if (hasOleSignature(bytes)) {
            throw new Error('Password-protected or encrypted Office documents cannot be opened.')
        }
        if (!hasZipSignature(bytes)) {
            throw new Error(`The selected file is not a valid ${format.toUpperCase()} document.`)
        }
    } else if (format === 'doc' && !hasOleSignature(bytes)) {
        throw new Error('The selected file is not a valid legacy Word document.')
    } else if (format === 'rtf' && !hasRtfSignature(bytes)) {
        throw new Error('The selected file is not a valid RTF document.')
    }

    return { bytes, fileName, format }
}

const userSafeParserError = (error: unknown, format: DocumentFormat): Error => {
    if (error instanceof Error && /password|encrypted|safety limit|too many|more than|not valid|not supported|could not be read/i.test(error.message)) {
        return error
    }
    if (format === 'docx' || format === 'xlsx') {
        return new Error(`This ${format.toUpperCase()} file could not be read. It may be password-protected, damaged, or use unsupported features.`)
    }
    return error instanceof Error ? error : new Error('The document could not be parsed.')
}

export const parseDocumentLocally = async (input: ParseDocumentInput): Promise<ParsedDocument> => {
    const { bytes, format } = validateParseDocumentInput(input)
    let parsed: ParsedContent

    try {
        if (format === 'text' || format === 'markdown') {
            parsed = { text: decodeDocumentText(bytes), warnings: [] }
        } else if (format === 'json') {
            parsed = parseJson(decodeDocumentText(bytes))
        } else if (format === 'yaml') {
            parsed = parseYaml(decodeDocumentText(bytes))
        } else if (format === 'csv' || format === 'tsv') {
            parsed = parseDelimitedDocument(decodeDocumentText(bytes), format === 'csv' ? ',' : '\t')
        } else if (format === 'xlsx') {
            parsed = await parseXlsx(bytes)
        } else if (format === 'docx') {
            parsed = await parseDocx(bytes)
        } else if (format === 'doc') {
            parsed = await parseLegacyDoc(bytes)
        } else {
            parsed = { text: parseRtfDocument(Buffer.from(bytes).toString('latin1')), warnings: [] }
        }
    } catch (error) {
        throw userSafeParserError(error, format)
    }

    const normalized = normalizeText(parsed.text)
    if (!normalized) throw new Error('No readable text was found in the document.')
    const bounded = truncateDocumentText(normalized, maxParsedDocumentChars)
    const warnings = [...new Set(parsed.warnings)]
    if (bounded.truncated) warnings.push('The extracted text was truncated to the 900,000-character capture limit.')

    return {
        text: bounded.text,
        format,
        ...(warnings.length > 0 ? { warnings } : {}),
        truncated: bounded.truncated
    }
}
