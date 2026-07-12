import { describe, expect, it } from 'vitest'
import { extractReadableText, extractSearchResultUrls, isPrivateIp } from './webResearch'

describe('web research parsing', () => {
    it('extracts readable page text without executable or styling content', () => {
        const result = extractReadableText(`
            <html><head><title>Example &amp; source</title><style>.hidden { color: red }</style></head>
            <body><main><h1>Finding</h1><p>Useful <strong>evidence</strong>.</p><script>ignore()</script></main></body></html>
        `)

        expect(result.title).toBe('Example & source')
        expect(result.text).toContain('Finding')
        expect(result.text).toContain('Useful evidence.')
        expect(result.text).not.toContain('ignore')
        expect(result.text).not.toContain('color: red')
    })

    it('decodes public result targets from DuckDuckGo redirect links', () => {
        const urls = extractSearchResultUrls(`
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fresearch%3Fa%3D1">Example</a>
            <a class="other" href="https://ignored.example">Ignored</a>
        `)

        expect(urls).toEqual(['https://example.com/research?a=1'])
    })

    it('recognizes local and private network destinations', () => {
        expect(isPrivateIp('127.0.0.1')).toBe(true)
        expect(isPrivateIp('10.20.30.40')).toBe(true)
        expect(isPrivateIp('169.254.169.254')).toBe(true)
        expect(isPrivateIp('::1')).toBe(true)
        expect(isPrivateIp('fd00::1')).toBe(true)
        expect(isPrivateIp('93.184.216.34')).toBe(false)
        expect(isPrivateIp('2606:2800:220:1:248:1893:25c8:1946')).toBe(false)
    })
})
