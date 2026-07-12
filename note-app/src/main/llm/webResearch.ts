import { lookup } from 'dns/promises'
import { isIP } from 'net'

const searchTimeoutMs = 6_000
const pageTimeoutMs = 8_000
const maxSearchBytes = 320_000
const maxPageBytes = 320_000
const maxPages = 4
const maxSourceChars = 9_000
const maxWebContextChars = 30_000
const maxRedirects = 3

export type WebResearchSource = {
    title: string
    url: string
    text: string
}

export type WebResearchResult = {
    context: string
    sources: WebResearchSource[]
}

const decodeHtml = (value: string): string => value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')

export const extractReadableText = (html: string): { title: string; text: string } => {
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
    const title = decodeHtml((titleMatch?.[1] ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    const text = decodeHtml(html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
        .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/?(?:p|div|article|section|main|header|footer|h[1-6]|li|tr|blockquote)\b[^>]*>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' '))
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/ +([,.;:!?])/g, '$1')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    return { title, text }
}

const normalizedSearchUrl = (href: string): string | null => {
    try {
        const url = new URL(decodeHtml(href), 'https://html.duckduckgo.com')
        if (url.hostname.endsWith('duckduckgo.com') && url.pathname.startsWith('/l/')) {
            const target = url.searchParams.get('uddg')
            if (!target) return null
            const decoded = new URL(target)
            return decoded.protocol === 'http:' || decoded.protocol === 'https:' ? decoded.toString() : null
        }
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
    } catch {
        return null
    }
}

export const extractSearchResultUrls = (html: string): string[] => {
    const urls: string[] = []
    for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
        const attributes = match[1]
        if (!/\bresult__a\b/i.test(attributes)) continue
        const href = attributes.match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
        const normalized = normalizedSearchUrl(href?.[1] ?? href?.[2] ?? href?.[3] ?? '')
        if (normalized && !urls.includes(normalized)) urls.push(normalized)
    }
    return urls
}

export const isPrivateIp = (address: string): boolean => {
    const normalized = address.toLowerCase().split('%')[0]
    if (normalized.startsWith('::ffff:')) return isPrivateIp(normalized.slice(7))
    if (normalized.includes(':')) {
        return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
            normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff')
    }
    const octets = normalized.split('.').map(Number)
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
    const [a, b, c] = octets
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        (a === 192 && b === 0 && c === 0)
}

const assertPublicUrl = async (url: URL): Promise<void> => {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only HTTP(S) research sources are supported.')
    const hostname = url.hostname.toLowerCase().replace(/^\[|]$/g, '')
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        throw new Error('Local network addresses are not valid research sources.')
    }
    if (isIP(hostname)) {
        if (isPrivateIp(hostname)) throw new Error('Private network addresses are not valid research sources.')
        return
    }
    const addresses = await lookup(hostname, { all: true })
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
        throw new Error('The research source resolved to a private network address.')
    }
}

const boundedFetch = async (
    initialUrl: string,
    signal: AbortSignal,
    timeoutMs: number,
    maxBytes: number
): Promise<{ url: string; body: string }> => {
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    const timeout = setTimeout(abort, timeoutMs)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })

    try {
        let current = new URL(initialUrl)
        for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
            await assertPublicUrl(current)
            const response = await fetch(current, {
                signal: controller.signal,
                redirect: 'manual',
                headers: {
                    Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
                    'User-Agent': 'Prognotic/1.0 (bounded local research assistant)'
                }
            })
            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location')
                if (!location || redirectCount === maxRedirects) throw new Error('The research source redirected too many times.')
                await response.body?.cancel()
                current = new URL(location, current)
                continue
            }
            if (!response.ok) throw new Error(`Research source returned HTTP ${response.status}.`)
            const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
            if (contentType && !contentType.includes('text/') && !contentType.includes('application/xhtml+xml')) {
                throw new Error('The research source is not a readable text page.')
            }

            const reader = response.body?.getReader()
            if (!reader) return { url: current.toString(), body: '' }
            const decoder = new TextDecoder()
            let received = 0
            let body = ''
            let completed = false
            while (received < maxBytes) {
                const chunk = await reader.read()
                if (chunk.done) {
                    completed = true
                    break
                }
                const remaining = maxBytes - received
                const value = chunk.value.byteLength > remaining ? chunk.value.slice(0, remaining) : chunk.value
                received += value.byteLength
                body += decoder.decode(value, { stream: true })
                if (chunk.value.byteLength > remaining) {
                    break
                }
            }
            if (!completed && received >= maxBytes) await reader.cancel()
            body += decoder.decode()
            return { url: current.toString(), body }
        }
        throw new Error('The research source could not be fetched.')
    } finally {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
    }
}

const extractUrls = (text: string): string[] => (text.match(/https?:\/\/[^\s<>{}"']+/gi) ?? [])
    .map((url) => url.replace(/[\]),.;!?]+$/, ''))
    .filter((url, index, urls) => urls.indexOf(url) === index)

const searchQuery = (query: string): string => query
    .replace(/https?:\/\/[^\s<>{}"']+/gi, ' ')
    .replace(/\[block:[\w-]+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)

export const researchWeb = async (query: string, noteContext: string, signal: AbortSignal): Promise<WebResearchResult> => {
    const directUrls = [...extractUrls(query), ...extractUrls(noteContext)].slice(0, 2)
    const discoveredUrls: string[] = []
    const normalizedQuery = searchQuery(query)

    if (normalizedQuery) {
        try {
            // Keyless discovery is best effort. Explicit URLs from the user or
            // scoped notes remain usable when the public HTML endpoint blocks.
            const search = await boundedFetch(
                `https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`,
                signal,
                searchTimeoutMs,
                maxSearchBytes
            )
            discoveredUrls.push(...extractSearchResultUrls(search.body))
        } catch (error) {
            if (signal.aborted) throw error
        }
    }

    const targets = [...directUrls, ...discoveredUrls]
        .filter((url, index, urls) => urls.indexOf(url) === index)
        .slice(0, maxPages)
    const pages = await Promise.all(targets.map(async (url): Promise<WebResearchSource | null> => {
        try {
            const page = await boundedFetch(url, signal, pageTimeoutMs, maxPageBytes)
            const readable = extractReadableText(page.body)
            if (!readable.text) return null
            return {
                title: readable.title || new URL(page.url).hostname,
                url: page.url,
                text: readable.text.slice(0, maxSourceChars)
            }
        } catch (error) {
            if (signal.aborted) throw error
            return null
        }
    }))
    const sources = pages.filter((page): page is WebResearchSource => page !== null)
    let size = 0
    const entries: string[] = []
    for (const [index, source] of sources.entries()) {
        const entry = `[web-source:${index + 1}]\nTitle: ${source.title}\nURL: ${source.url}\nExtract:\n${source.text}`
        if (size + entry.length > maxWebContextChars) break
        size += entry.length
        entries.push(entry)
    }

    return {
        sources: sources.slice(0, entries.length),
        context: entries.join('\n\n') || '(No public web pages could be retrieved in this bounded research pass.)'
    }
}
