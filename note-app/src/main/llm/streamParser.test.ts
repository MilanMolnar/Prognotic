import { describe, expect, it } from 'vitest'
import { readSse } from './streamParser'

describe('readSse', () => {
    it('handles chunk boundaries, multiline data, and the done sentinel', async () => {
        const encoder = new TextEncoder()
        const chunks = ['data: {"token":"hel', 'lo"}\n\ndata: first\ndata: second\n\ndata: [DONE]\n\n']
        const response = new Response(new ReadableStream({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
                controller.close()
            }
        }))
        const events: string[] = []

        await readSse(response, new AbortController().signal, (data) => events.push(data))

        expect(events).toEqual(['{"token":"hello"}', 'first\nsecond'])
    })

    it('rejects an empty provider body', async () => {
        await expect(readSse(new Response(null), new AbortController().signal, () => undefined))
            .rejects.toThrow('empty stream')
    })
})
