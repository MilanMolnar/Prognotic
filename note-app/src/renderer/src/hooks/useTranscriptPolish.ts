import { useCallback, useState } from 'react'
import { useI18n } from '@renderer/context/I18nContext'

export type UseTranscriptPolishParams = {
    enabled: boolean
    onAccepted: (text: string) => void
}

export type UseTranscriptPolishResult = {
    acceptTranscript: (text: string) => Promise<void>
    retryPolish: () => void
    useOriginal: () => void
    polishError: string | null
    isPolishing: boolean
    hasPendingTranscript: boolean
}

export const useTranscriptPolish = ({ enabled, onAccepted }: UseTranscriptPolishParams): UseTranscriptPolishResult => {
    const { t } = useI18n()
    const [pendingTranscript, setPendingTranscript] = useState<string | null>(null)
    const [polishError, setPolishError] = useState<string | null>(null)
    const [isPolishing, setIsPolishing] = useState(false)

    const polish = useCallback(async (text: string): Promise<void> => {
        setPendingTranscript(text)
        setPolishError(null)
        setIsPolishing(true)
        try {
            const result = await window.context.polishTranscript(text)
            if ('error' in result) {
                setPolishError(t('ai.transcriptCleanupFailed'))
                return
            }
            onAccepted(result.text || text)
            setPendingTranscript(null)
        } catch {
            setPolishError(t('ai.transcriptCleanupFailed'))
        } finally {
            setIsPolishing(false)
        }
    }, [onAccepted, t])

    const acceptTranscript = useCallback(async (text: string): Promise<void> => {
        if (!enabled) {
            onAccepted(text)
            return
        }
        await polish(text)
    }, [enabled, onAccepted, polish])

    const retryPolish = useCallback((): void => {
        if (pendingTranscript && !isPolishing) void polish(pendingTranscript)
    }, [isPolishing, pendingTranscript, polish])

    const useOriginal = useCallback((): void => {
        if (!pendingTranscript) return
        onAccepted(pendingTranscript)
        setPendingTranscript(null)
        setPolishError(null)
    }, [onAccepted, pendingTranscript])

    return {
        acceptTranscript,
        retryPolish,
        useOriginal,
        polishError,
        isPolishing,
        hasPendingTranscript: pendingTranscript !== null
    }
}
