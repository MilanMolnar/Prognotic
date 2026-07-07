import { useCallback, useEffect, useRef, useState } from 'react'

export type UseWindowsDictationParams = {
    focusInput?: () => void
}

export type UseWindowsDictationResult = {
    error: string | null
    notice: string | null
    isAvailable: boolean
    open: () => void
    stop: () => void
}

const focusDelayMs = 50
const noticeDurationMs = 3500

// Windows dictation: mic sends Win+H to open system voice typing. There is no
// public API to read whether the Windows bar is open, so we never track a
// listening state — the mic does not turn red.
export const useWindowsDictation = ({
    focusInput
}: UseWindowsDictationParams): UseWindowsDictationResult => {
    const isAvailable = window.context.platform === 'win32'

    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const noticeTimerRef = useRef<number | null>(null)

    const clearNoticeTimer = useCallback((): void => {
        if (noticeTimerRef.current !== null) {
            clearTimeout(noticeTimerRef.current)
            noticeTimerRef.current = null
        }
    }, [])

    const showNotice = useCallback(
        (message: string): void => {
            clearNoticeTimer()
            setNotice(message)
            noticeTimerRef.current = window.setTimeout(() => {
                noticeTimerRef.current = null
                setNotice(null)
            }, noticeDurationMs)
        },
        [clearNoticeTimer]
    )

    useEffect(() => () => clearNoticeTimer(), [clearNoticeTimer])

    const open = useCallback((): void => {
        if (!isAvailable) {
            setError('Windows dictation is only available on Windows.')
            return
        }
        setError(null)
        focusInput?.()
        void (async (): Promise<void> => {
            await new Promise((resolve) => setTimeout(resolve, focusDelayMs))
            const result = await window.context.toggleWindowsDictation()
            if (!result.ok) {
                setError(result.error ?? 'Windows dictation failed.')
                return
            }
            showNotice('Listening...')
        })()
    }, [isAvailable, focusInput, showNotice])

    // No-op: we cannot detect when the user closes the Windows bar.
    const stop = useCallback((): void => undefined, [])

    return {
        error,
        notice,
        isAvailable,
        open,
        stop
    }
}
