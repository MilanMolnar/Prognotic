const ignoredDestinations = new Set([
    'annotation', 'author', 'colortbl', 'comment', 'datastore', 'filetbl', 'fonttbl',
    'footer', 'footerf', 'footerl', 'footerr', 'header', 'headerf', 'headerl', 'headerr',
    'info', 'listoverridetable', 'listtable', 'nonshppict', 'object', 'objdata', 'pict',
    'private', 'revtbl', 'rsidtbl', 'shp', 'shpinst', 'shppict', 'stylesheet', 'themedata',
    'xmlnstbl'
])

const specialCharacters: Record<string, string> = {
    bullet: '•',
    emdash: '—',
    endash: '–',
    lquote: '‘',
    ldblquote: '“',
    rquote: '’',
    rdblquote: '”'
}

type RtfState = {
    ignored: boolean
    unicodeFallbackLength: number
}

const windows1252 = (value: number): string => {
    const overrides: Record<number, string> = {
        0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
        0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘',
        0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜',
        0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ'
    }
    return overrides[value] ?? String.fromCharCode(value)
}

export const parseRtfDocument = (source: string): string => {
    const stack: RtfState[] = []
    let state: RtfState = { ignored: false, unicodeFallbackLength: 1 }
    let output = ''
    let fallbackCharactersToSkip = 0

    const append = (value: string): void => {
        if (fallbackCharactersToSkip > 0) {
            fallbackCharactersToSkip -= 1
            return
        }
        if (!state.ignored) output += value
    }

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index]
        if (char === '{') {
            stack.push(state)
            state = { ...state }
            continue
        }
        if (char === '}') {
            state = stack.pop() ?? state
            continue
        }
        if (char !== '\\') {
            if (char !== '\r' && char !== '\n') append(char)
            continue
        }

        const next = source[index + 1]
        if (next === undefined) break
        if (next === '\\' || next === '{' || next === '}') {
            append(next)
            index += 1
            continue
        }
        if (next === '~') {
            append(' ')
            index += 1
            continue
        }
        if (next === '-' || next === '_') {
            append('-')
            index += 1
            continue
        }
        if (next === '*') {
            state.ignored = true
            index += 1
            continue
        }
        if (next === "'") {
            const hex = source.slice(index + 2, index + 4)
            if (/^[0-9a-f]{2}$/i.test(hex)) {
                append(windows1252(Number.parseInt(hex, 16)))
                index += 3
                continue
            }
        }

        let cursor = index + 1
        while (cursor < source.length && /[a-z]/i.test(source[cursor])) cursor += 1
        const word = source.slice(index + 1, cursor).toLowerCase()
        let sign = 1
        if (source[cursor] === '-') {
            sign = -1
            cursor += 1
        }
        const numberStart = cursor
        while (cursor < source.length && /\d/.test(source[cursor])) cursor += 1
        const parameter = cursor > numberStart
            ? sign * Number.parseInt(source.slice(numberStart, cursor), 10)
            : null
        if (source[cursor] === ' ') cursor += 1
        index = cursor - 1

        if (!word) continue
        if (ignoredDestinations.has(word)) {
            state.ignored = true
            continue
        }
        if (word === 'uc' && parameter !== null) {
            state.unicodeFallbackLength = Math.max(0, Math.min(10, parameter))
            continue
        }
        if (word === 'u' && parameter !== null) {
            const codePoint = parameter < 0 ? parameter + 65_536 : parameter
            if (!state.ignored) output += String.fromCharCode(codePoint)
            fallbackCharactersToSkip = state.unicodeFallbackLength
            continue
        }
        if (word === 'bin' && parameter !== null) {
            index = Math.min(source.length - 1, index + Math.max(0, parameter))
            continue
        }
        if (word === 'par' || word === 'line') {
            append('\n')
            continue
        }
        if (word === 'tab') {
            append('\t')
            continue
        }
        const special = specialCharacters[word]
        if (special) append(special)
    }

    return output
        .split('\0').join('')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}
