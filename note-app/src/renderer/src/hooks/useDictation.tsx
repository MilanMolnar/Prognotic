import { useSettings } from '@renderer/context'
import { DictationMode } from '@shared/models'
import { useWindowsDictation } from './useWindowsDictation'
import { useWisprFlowDictation } from './useWisprFlowDictation'

export type UseDictationParams = {
    onFinalTranscript: (text: string) => void
    focusInput?: () => void
}

export type UseDictationResult = {
    dictationMode: DictationMode
    isListening: boolean
    interimText: string
    error: string | null
    // Provider status shown to the user (e.g. Wispr Flow's "Transcribing…").
    notice: string | null
    isAvailable: boolean
    toggle: () => void
    // Forced shutdown (bar became inert, draft was sent) — discards any
    // Wispr Flow take instead of transcribing it.
    stop: () => void
}

const titles: Record<DictationMode, string> = {
    windows: 'Open Windows voice typing (Win+H)',
    whisprflow: 'Wispr Flow dictation — click to start/stop'
}

export const dictationTitle = (mode: DictationMode, isListening: boolean): string => {
    if (mode === 'windows') return titles.windows
    return isListening ? 'Stop dictation' : titles[mode]
}

// Routes dictation to the provider selected in Settings. Both hooks are
// mounted (rules of hooks); only the active mode's engine ever starts.
export const useDictation = ({
    onFinalTranscript,
    focusInput
}: UseDictationParams): UseDictationResult => {
    const { settings } = useSettings()
    const { dictationMode, hasWhisprflowApiKey } = settings

    const windows = useWindowsDictation({ focusInput })
    const wisprFlow = useWisprFlowDictation({
        onFinalTranscript,
        hasApiKey: hasWhisprflowApiKey
    })

    if (dictationMode === 'whisprflow') {
        return {
            dictationMode,
            isListening: wisprFlow.isListening,
            interimText: '',
            error: wisprFlow.error,
            notice: wisprFlow.isTranscribing ? 'Transcribing…' : null,
            isAvailable: true,
            toggle: wisprFlow.toggle,
            stop: wisprFlow.abort
        }
    }

    return {
        dictationMode: 'windows',
        isListening: false,
        interimText: '',
        error: windows.error,
        notice: windows.notice,
        isAvailable: windows.isAvailable,
        toggle: windows.open,
        stop: windows.stop
    }
}
