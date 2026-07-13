import {
    maxDecompressedOfficeBytes,
    maxOfficeArchiveEntries
} from '@shared/documents'

type OfficeArchiveFormat = 'docx' | 'xlsx'

const endOfCentralDirectorySignature = 0x06054b50
const centralDirectoryEntrySignature = 0x02014b50
const maxEndRecordSearchBytes = 65_557

const findEndOfCentralDirectory = (buffer: Buffer): number => {
    const start = Math.max(0, buffer.length - maxEndRecordSearchBytes)
    for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
        if (buffer.readUInt32LE(offset) === endOfCentralDirectorySignature) return offset
    }
    return -1
}

const requiredEntriesByFormat: Record<OfficeArchiveFormat, readonly string[]> = {
    docx: ['[Content_Types].xml', 'word/document.xml'],
    xlsx: ['[Content_Types].xml', 'xl/workbook.xml']
}

export type OfficeArchiveInspection = {
    entryNames: string[]
    uncompressedBytes: number
}

export const inspectOfficeArchive = (
    bytes: Uint8Array,
    format: OfficeArchiveFormat
): OfficeArchiveInspection => {
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const endOffset = findEndOfCentralDirectory(buffer)
    if (endOffset < 0) throw new Error('The Office document archive is incomplete or damaged.')

    const diskNumber = buffer.readUInt16LE(endOffset + 4)
    const centralDirectoryDisk = buffer.readUInt16LE(endOffset + 6)
    const entriesOnDisk = buffer.readUInt16LE(endOffset + 8)
    const entryCount = buffer.readUInt16LE(endOffset + 10)
    const centralDirectorySize = buffer.readUInt32LE(endOffset + 12)
    const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16)

    if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
        throw new Error('Multi-part Office document archives are not supported.')
    }
    if (entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
        throw new Error('This Office document uses an unsupported oversized archive format.')
    }
    if (entryCount > maxOfficeArchiveEntries) {
        throw new Error('The Office document contains too many embedded files to process safely.')
    }
    if (centralDirectoryOffset + centralDirectorySize > buffer.length) {
        throw new Error('The Office document archive is incomplete or damaged.')
    }

    const entryNames: string[] = []
    let totalUncompressedBytes = 0
    let offset = centralDirectoryOffset

    for (let index = 0; index < entryCount; index += 1) {
        if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== centralDirectoryEntrySignature) {
            throw new Error('The Office document archive is incomplete or damaged.')
        }

        const flags = buffer.readUInt16LE(offset + 8)
        const uncompressedBytes = buffer.readUInt32LE(offset + 24)
        const fileNameLength = buffer.readUInt16LE(offset + 28)
        const extraLength = buffer.readUInt16LE(offset + 30)
        const commentLength = buffer.readUInt16LE(offset + 32)
        const localHeaderOffset = buffer.readUInt32LE(offset + 42)
        const nextOffset = offset + 46 + fileNameLength + extraLength + commentLength
        if (nextOffset > buffer.length) {
            throw new Error('The Office document archive is incomplete or damaged.')
        }
        const localFlags = localHeaderOffset + 8 <= buffer.length && buffer.readUInt32LE(localHeaderOffset) === 0x04034b50
            ? buffer.readUInt16LE(localHeaderOffset + 6)
            : null
        if (localFlags === null) {
            throw new Error('The Office document archive is incomplete or damaged.')
        }
        if ((flags & 0x0001) !== 0 || (localFlags & 0x0001) !== 0) {
            throw new Error('Password-protected or encrypted Office documents cannot be opened.')
        }

        totalUncompressedBytes += uncompressedBytes
        if (totalUncompressedBytes > maxDecompressedOfficeBytes) {
            throw new Error('The Office document expands beyond the 100 MiB safety limit.')
        }

        const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength)
            .replace(/\\/g, '/')
            .replace(/^\.\//, '')
        entryNames.push(fileName)
        offset = nextOffset
    }

    const entrySet = new Set(entryNames)
    if (!requiredEntriesByFormat[format].every((entry) => entrySet.has(entry))) {
        throw new Error(`The selected file is not a valid ${format.toUpperCase()} document.`)
    }

    return { entryNames, uncompressedBytes: totalUncompressedBytes }
}
