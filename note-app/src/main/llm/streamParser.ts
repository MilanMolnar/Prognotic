export const readSse = async (
    response: Response,
    signal: AbortSignal,
    onData: (data: string) => void
): Promise<void> => {
    if (!response.body) throw new Error('The provider returned an empty stream.')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (!signal.aborted) {
        const result = await reader.read()
        if (result.done) break
        buffer += decoder.decode(result.value, { stream: true })
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() ?? ''
        for (const event of events) {
            const data = event
                .split(/\r?\n/)
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trim())
                .join('\n')
            if (data && data !== '[DONE]') onData(data)
        }
    }
}
