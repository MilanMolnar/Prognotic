import { maxTabularCells, maxTabularColumns, maxTabularRows } from '@shared/documents'

export type TabularValue = string | number | boolean | Date | DateConstructor | null | undefined

export type RenderedTable = {
    text: string
    warnings: string[]
}

const normalizedRows = (rows: readonly (readonly TabularValue[])[]): TabularValue[][] => {
    const normalized = rows.map((row) => {
        const copy = [...row]
        while (copy.length > 0 && (copy[copy.length - 1] === null || copy[copy.length - 1] === undefined || copy[copy.length - 1] === '')) {
            copy.pop()
        }
        return copy
    })
    while (normalized.length > 0 && normalized[normalized.length - 1].length === 0) normalized.pop()
    return normalized
}

const valueText = (value: TabularValue): string => {
    if (value === null || value === undefined) return ''
    if (value === Date) return 'Date'
    if (value instanceof Date) {
        const iso = value.toISOString()
        return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
    }
    return String(value).replace(/\0/g, '')
}

const markdownCell = (value: TabularValue): string => valueText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
    .trim()

const looksLikeHeader = (row: readonly TabularValue[], columnCount: number): boolean => {
    if (row.length !== columnCount || columnCount === 0) return false
    const values = row.map((value) => valueText(value).trim())
    if (values.some((value) => !value)) return false
    if (new Set(values.map((value) => value.toLowerCase())).size !== values.length) return false
    return values.some((value) => Number.isNaN(Number(value)))
}

const headersFor = (row: readonly TabularValue[] | undefined, columnCount: number): string[] =>
    Array.from({ length: columnCount }, (_, index) => {
        const value = row ? valueText(row[index]).trim() : ''
        return value || `Column ${index + 1}`
    })

export const renderTabularRows = (
    inputRows: readonly (readonly TabularValue[])[]
): RenderedTable => {
    if (inputRows.length > maxTabularRows) {
        throw new Error(`The table contains more than ${maxTabularRows.toLocaleString()} rows.`)
    }
    let inputCellCount = 0
    for (const row of inputRows) {
        if (row.length > maxTabularColumns) {
            throw new Error(`The table contains more than ${maxTabularColumns} columns.`)
        }
        inputCellCount += row.length
        if (inputCellCount > maxTabularCells) {
            throw new Error(`The table contains more than ${maxTabularCells.toLocaleString()} cells.`)
        }
    }
    const rows = normalizedRows(inputRows)
    if (rows.length === 0) return { text: '', warnings: [] }

    const columnCount = Math.max(...rows.map((row) => row.length))
    if (columnCount === 0) return { text: '', warnings: [] }
    const firstRowIsHeader = looksLikeHeader(rows[0], columnCount)
    const headers = headersFor(firstRowIsHeader ? rows[0] : undefined, columnCount)
    const dataRows = firstRowIsHeader ? rows.slice(1) : rows
    const warnings: string[] = []

    if (rows.some((row) => row.length !== columnCount)) {
        warnings.push('Some rows have fewer columns than others; missing cells were left blank.')
    }

    if (columnCount <= 20 && dataRows.length <= 500) {
        const headerLine = `| ${headers.map(markdownCell).join(' | ')} |`
        const divider = `| ${headers.map(() => '---').join(' | ')} |`
        const body = dataRows.map((row) =>
            `| ${Array.from({ length: columnCount }, (_, index) => markdownCell(row[index])).join(' | ')} |`
        )
        return { text: [headerLine, divider, ...body].join('\n'), warnings }
    }

    warnings.push('This wide or long table was rendered as row sections for readability.')
    const rowSections = dataRows.map((row, rowIndex) => {
        const fields = headers.flatMap((header, columnIndex) => {
            const value = valueText(row[columnIndex]).trim()
            return value ? [`- **${header.replace(/\*/g, '\\*')}**: ${value}`] : []
        })
        return `### Row ${rowIndex + 1}\n\n${fields.length > 0 ? fields.join('\n') : '_Empty row_'}`
    })
    return { text: rowSections.join('\n\n'), warnings }
}

export const parseDelimitedRows = (text: string, delimiter: ',' | '\t'): string[][] => {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let quoted = false
    let cellCount = 0

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index]
        if (quoted) {
            if (char === '"') {
                if (text[index + 1] === '"') {
                    cell += '"'
                    index += 1
                } else {
                    quoted = false
                }
            } else {
                cell += char
            }
            continue
        }

        if (char === '"' && cell.length === 0) {
            quoted = true
        } else if (char === delimiter) {
            row.push(cell)
            if (row.length > maxTabularColumns) {
                throw new Error(`The delimited file contains more than ${maxTabularColumns} columns.`)
            }
            cell = ''
        } else if (char === '\n') {
            row.push(cell)
            if (row.length > maxTabularColumns) {
                throw new Error(`The delimited file contains more than ${maxTabularColumns} columns.`)
            }
            rows.push(row)
            if (rows.length > maxTabularRows) {
                throw new Error(`The delimited file contains more than ${maxTabularRows.toLocaleString()} rows.`)
            }
            cellCount += row.length
            if (cellCount > maxTabularCells) {
                throw new Error(`The delimited file contains more than ${maxTabularCells.toLocaleString()} cells.`)
            }
            row = []
            cell = ''
        } else if (char !== '\r') {
            cell += char
        }
    }

    if (quoted) throw new Error('The delimited file has an unclosed quoted value.')
    if (cell.length > 0 || row.length > 0) {
        row.push(cell)
        if (row.length > maxTabularColumns) {
            throw new Error(`The delimited file contains more than ${maxTabularColumns} columns.`)
        }
        if (cellCount + row.length > maxTabularCells) {
            throw new Error(`The delimited file contains more than ${maxTabularCells.toLocaleString()} cells.`)
        }
        rows.push(row)
    }
    return rows
}

export const parseDelimitedDocument = (text: string, delimiter: ',' | '\t'): RenderedTable =>
    renderTabularRows(parseDelimitedRows(text, delimiter))
