import { describe, expect, it } from 'vitest'
import {
    documentFormatForFileName,
    documentMimeTypeMatches,
    hasOleSignature,
    hasRtfSignature,
    hasZipSignature,
    maxBlockContentChars,
    prepareDocumentInsertion,
    supportedDocumentExtensionFor,
    truncateDocumentText
} from './documents'

describe('document format detection and limits', () => {
    it('detects supported extensions case-insensitively', () => {
        expect(supportedDocumentExtensionFor('Quarterly.Report.DOCX')).toBe('docx')
        expect(documentFormatForFileName('notes.markdown')).toBe('markdown')
        expect(documentFormatForFileName('data.yml')).toBe('yaml')
        expect(documentFormatForFileName('scan.pdf')).toBeNull()
    })

    it('accepts generic MIME values but rejects a concrete mismatch', () => {
        expect(documentMimeTypeMatches('docx', 'application/octet-stream')).toBe(true)
        expect(documentMimeTypeMatches('csv', 'text/plain; charset=utf-8')).toBe(true)
        expect(documentMimeTypeMatches('xlsx', 'application/pdf')).toBe(false)
    })

    it('recognizes bounded Office and RTF signatures', () => {
        expect(hasZipSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true)
        expect(hasOleSignature(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(true)
        expect(hasRtfSignature(new TextEncoder().encode('{\\rtf1\\ansi Hello}'))).toBe(true)
        expect(hasRtfSignature(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{\\rtf1')]))).toBe(true)
        expect(hasRtfSignature(new TextEncoder().encode('plain text'))).toBe(false)
    })

    it('truncates at a safe Unicode boundary with an explicit notice', () => {
        const source = `${'a'.repeat(40)}😀tail`
        const result = truncateDocumentText(source, 44, '> Cut.')
        expect(result.truncated).toBe(true)
        expect(result.text.length).toBeLessThanOrEqual(44)
        expect(result.text).toContain('> Cut.')

        const boundary = truncateDocumentText(source, 41, 'x'.repeat(100))
        expect(boundary.text.endsWith('\ud83d')).toBe(false)

        const fenced = truncateDocumentText(`\`\`\`\`json\n${'a'.repeat(100)}\n\`\`\`\``, 60, '> Cut.')
        expect(fenced.text).toContain('\n````\n\n> Cut.')
    })

    it('reserves room for the current draft and block separator', () => {
        const result = prepareDocumentInsertion('document body', maxBlockContentChars - 6)
        expect(result.truncated).toBe(true)
        expect(result.text.length).toBe(2)
        expect(prepareDocumentInsertion('document body', maxBlockContentChars).text).toBe('')
    })
})
