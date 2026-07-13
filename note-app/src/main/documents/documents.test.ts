import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import readXlsxFile, { readSheetNames } from 'read-excel-file/node'
import type { ParseDocumentInput } from '@shared/types'
import { inspectOfficeArchive } from './archive'
import { parseDelimitedDocument } from './delimited'
import { decodeDocumentText, parseDocumentLocally, validateParseDocumentInput } from './index'
import { parseRtfDocument } from './rtf'

const exactArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const textInput = (
    fileName: string,
    extension: ParseDocumentInput['extension'],
    text: string,
    mimeType = 'text/plain'
): ParseDocumentInput => ({
    documentBytes: exactArrayBuffer(new TextEncoder().encode(text)),
    fileName,
    extension,
    mimeType
})

type ZipEntry = { name: string; content: string }

const storedZip = (entries: ZipEntry[], encrypted = false): Buffer => {
    const localParts: Buffer[] = []
    const centralParts: Buffer[] = []
    let localOffset = 0

    for (const entry of entries) {
        const name = Buffer.from(entry.name, 'utf8')
        const data = Buffer.from(entry.content, 'utf8')
        const checksum = crc32(data) >>> 0
        const flags = encrypted ? 1 : 0
        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0)
        local.writeUInt16LE(20, 4)
        local.writeUInt16LE(flags, 6)
        local.writeUInt16LE(0, 8)
        local.writeUInt32LE(checksum, 14)
        local.writeUInt32LE(data.length, 18)
        local.writeUInt32LE(data.length, 22)
        local.writeUInt16LE(name.length, 26)
        localParts.push(local, name, data)

        const central = Buffer.alloc(46)
        central.writeUInt32LE(0x02014b50, 0)
        central.writeUInt16LE(20, 4)
        central.writeUInt16LE(20, 6)
        central.writeUInt16LE(flags, 8)
        central.writeUInt16LE(0, 10)
        central.writeUInt32LE(checksum, 16)
        central.writeUInt32LE(data.length, 20)
        central.writeUInt32LE(data.length, 24)
        central.writeUInt16LE(name.length, 28)
        central.writeUInt32LE(localOffset, 42)
        centralParts.push(central, name)
        localOffset += local.length + name.length + data.length
    }

    const centralDirectory = Buffer.concat(centralParts)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(centralDirectory.length, 12)
    end.writeUInt32LE(localOffset, 16)
    return Buffer.concat([...localParts, centralDirectory, end])
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`

const docxFixture = (): Buffer => storedZip([
    { name: '[Content_Types].xml', content: contentTypes },
    {
        name: '_rels/.rels',
        content: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    },
    {
        name: 'word/document.xml',
        content: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello DOCX</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p></w:body></w:document>`
    }
])

const xlsxFixture = (): Buffer => storedZip([
    { name: '[Content_Types].xml', content: contentTypes },
    {
        name: '_rels/.rels',
        content: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    },
    {
        name: 'xl/workbook.xml',
        content: `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Plan" sheetId="1" r:id="rId1"/></sheets></workbook>`
    },
    {
        name: 'xl/_rels/workbook.xml.rels',
        content: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
    },
    {
        name: 'xl/worksheets/sheet1.xml',
        content: `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Task</t></is></c><c r="B1" t="inlineStr"><is><t>Status</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Ship</t></is></c><c r="B2" t="inlineStr"><is><t>Ready</t></is></c></row></sheetData></worksheet>`
    }
])

describe('local document parsing', () => {
    it('decodes UTF-8 and UTF-16 text without accepting binary data', () => {
        expect(decodeDocumentText(new TextEncoder().encode('hello'))).toBe('hello')
        expect(decodeDocumentText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]))).toBe('hi')
        expect(() => decodeDocumentText(new Uint8Array([0x00, 0x01, 0x02]))).toThrow('binary data')
    })

    it('pretty-prints JSON and validates YAML locally', async () => {
        const json = await parseDocumentLocally(textInput('data.json', 'json', '{"ok":true}', 'application/json'))
        expect(json.text).toContain('```json\n{\n  "ok": true\n}')

        const yaml = await parseDocumentLocally(textInput('data.yaml', 'yaml', 'name: Prognotic\nready: true', 'application/yaml'))
        expect(yaml.text).toContain('```yaml')
        expect(yaml.text).toContain('name: Prognotic')
        await expect(parseDocumentLocally(textInput('bad.yaml', 'yaml', 'a: [', 'application/yaml'))).rejects.toThrow('not valid YAML')
    })

    it('renders quoted CSV values as a Markdown table', () => {
        const result = parseDelimitedDocument('Name,Note\nAda,"Uses, commas"\nBob,"Line 1\nLine 2"', ',')
        expect(result.text).toContain('| Name | Note |')
        expect(result.text).toContain('| Ada | Uses, commas |')
        expect(result.text).toContain('Line 1<br>Line 2')
        expect(() => parseDelimitedDocument(`${'cell,'.repeat(500)}cell`, ',')).toThrow('more than 500 columns')
    })

    it('extracts RTF text while ignoring metadata and embedded destinations', () => {
        const rtf = String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}}Hello\par Caf\'e9 \u8212? done{\pict abc123}}`
        expect(parseRtfDocument(rtf)).toBe('Hello\nCafé — done')
    })

    it('extracts DOCX paragraphs and XLSX sheet tables from in-memory bytes', async () => {
        const docx = docxFixture()
        const docxResult = await parseDocumentLocally({
            documentBytes: exactArrayBuffer(docx),
            fileName: 'sample.docx',
            extension: 'docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })
        expect(docxResult.text).toContain('Hello DOCX')
        expect(docxResult.text).toContain('Second paragraph')

        const xlsx = xlsxFixture()
        expect(await readSheetNames(xlsx)).toEqual(['Plan'])
        const firstSheet = await readXlsxFile(xlsx, { sheet: 'Plan' })
        expect(firstSheet[0]?.[0]).toBe('Task')
        const xlsxResult = await parseDocumentLocally({
            documentBytes: exactArrayBuffer(xlsx),
            fileName: 'sample.xlsx',
            extension: 'xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
        expect(xlsxResult.text).toContain('## Sheet: Plan')
        expect(xlsxResult.text).toContain('| Task | Status |')
        expect(xlsxResult.text).toContain('| Ship | Ready |')
    })

    it('rejects encrypted archives and inconsistent IPC metadata before parsing', () => {
        const encrypted = storedZip([
            { name: '[Content_Types].xml', content: contentTypes },
            { name: 'word/document.xml', content: '<w:document />' }
        ], true)
        expect(() => inspectOfficeArchive(encrypted, 'docx')).toThrow('Password-protected or encrypted')

        expect(() => validateParseDocumentInput(textInput('notes.md', 'txt', 'hello'))).toThrow('does not match its filename')
        expect(() => validateParseDocumentInput(textInput('notes.txt', 'txt', 'hello', 'application/pdf'))).toThrow('does not match its extension')

        const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
        expect(() => validateParseDocumentInput({
            documentBytes: exactArrayBuffer(ole),
            fileName: 'locked.docx',
            extension: 'docx',
            mimeType: 'application/octet-stream'
        })).toThrow('Password-protected or encrypted')
    })
})
