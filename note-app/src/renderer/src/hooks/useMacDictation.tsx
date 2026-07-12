import { useCallback, useEffect, useRef, useState } from 'react'

export type UseMacDictationParams = {
    focusInput?: () => void
}

export type UseMacDictationResult = {
    error: string | null
    notice: string | null
    isAvailable: boolean
    open: () => void
    stop: () => void
}

const focusDelayMs = 50
const noticeDurationMs = 3500

// macOS Dictation types directly into the focused field after main sends
// Fn-D. macOS exposes no transcript or reliable active-state API here, so
// this hook intentionally does not track a listening state.
export const useMacDictation = ({
    focusInput
}: UseMacDictationParams): UseMacDictationResult => {
    const isAvailable = window.context.platform === 'darwin'

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
            setError('macOS dictation is only available on macOS.')
            return
        }
        setError(null)
        focusInput?.()
        void (async (): Promise<void> => {
            await new Promise((resolve) => setTimeout(resolve, focusDelayMs))
            try {
                const result = await window.context.toggleMacDictation()
                if (!result.ok) {
                    setError(result.error ?? 'macOS dictation failed.')
                    return
                }
                showNotice('Listening...')
            } catch {
                setError('macOS dictation failed.')
            }
        })()
    }, [isAvailable, focusInput, showNotice])

    // No-op: the operating system owns the Dictation session.
    const stop = useCallback((): void => undefined, [])

    return {
        error,
        notice,
        isAvailable,
        open,
        stop
    }
}
