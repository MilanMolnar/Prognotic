import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@renderer/context'
import type { TranslationKey } from '@renderer/i18n'
import type { TranscriptionErrorCode } from '@shared/types'

export type UseWisprFlowDictationParams = {
    onFinalTranscript: (text: string) => void
    hasApiKey: boolean
}

export type UseWisprFlowDictationResult = {
    isListening: boolean
    isTranscribing: boolean
    error: string | null
    start: () => void
    // stop finishes the take and transcribes it; abort discards it.
    stop: () => void
    abort: () => void
    toggle: () => void
}

const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

const transcriptionErrorKeys: Record<TranscriptionErrorCode, TranslationKey> = {
    'invalid-audio': 'capture.invalidAudio',
    'no-audio': 'capture.noAudio',
    'too-long': 'capture.tooLong',
    'key-required': 'capture.wisprKeyRequired',
    'key-rejected': 'capture.wisprKeyRejected',
    failed: 'capture.transcriptionFailed',
    unreachable: 'capture.wisprUnreachable'
}

const pickMimeType = (): string | undefined =>
    preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type))

// Wispr Flow accepts only base64 16 kHz PCM WAV, and MediaRecorder cannot
// produce that directly — the recorded take (webm/opus) is decoded and
// resampled here before it goes to main.
const targetSampleRate = 16000

const encodeWavPcm16 = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    const writeAscii = (offset: number, value: string): void => {
        for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
    }

    writeAscii(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeAscii(8, 'WAVE')
    writeAscii(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, 1, true) // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true) // byte rate
    view.setUint16(32, 2, true) // block align
    view.setUint16(34, 16, true) // bits per sample
    writeAscii(36, 'data')
    view.setUint32(40, samples.length * 2, true)

    for (let i = 0; i < samples.length; i++) {
        const clamped = Math.max(-1, Math.min(1, samples[i]))
        view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    }
    return buffer
}

const toWav16kMono = async (blob: Blob): Promise<ArrayBuffer> => {
    const decoder = new AudioContext()
    try {
        const decoded = await decoder.decodeAudioData(await blob.arrayBuffer())
        const offline = new OfflineAudioContext(
            1,
            Math.ceil(decoded.duration * targetSampleRate),
            targetSampleRate
        )
        const source = offline.createBufferSource()
        source.buffer = decoded
        source.connect(offline.destination)
        source.start()
        const rendered = await offline.startRendering()
        return encodeWavPcm16(rendered.getChannelData(0), targetSampleRate)
    } finally {
        void decoder.close()
    }
}

// Wispr Flow (wisprflow.ai) dictation — push-to-talk recording in the
// renderer, transcription by main via the Wispr Flow developer API (the key
// lives in the encrypted credential store, read only by main). Not OpenAI Whisper.
export const useWisprFlowDictation = ({
    onFinalTranscript,
    hasApiKey
}: UseWisprFlowDictationParams): UseWisprFlowDictationResult => {
    const { t } = useI18n()
    const [isListening, setIsListening] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const recorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    // Set before stop() when the take should be thrown away instead of sent.
    const discardRef = useRef(false)
    // Synced after every commit so the async onstop path sees the latest
    // handler (writing the ref during render violates react-hooks/refs).
    const onFinalRef = useRef(onFinalTranscript)
    useEffect(() => {
        onFinalRef.current = onFinalTranscript
    })

    const teardown = useCallback((): void => {
        const recorder = recorderRef.current
        recorderRef.current = null
        recorder?.stream.getTracks().forEach((track) => track.stop())
        setIsListening(false)
    }, [])

    const transcribe = useCallback(async (blob: Blob): Promise<void> => {
        setIsTranscribing(true)
        try {
            const wav = await toWav16kMono(blob)
            const result = await window.context.transcribeAudio(wav)
            if (result.error !== undefined) {
                setError(t(result.code ? transcriptionErrorKeys[result.code] : 'capture.transcriptionFailed'))
                return
            }
            const text = result.text.trim()
            if (!text) {
                setError(t('capture.noSpeech'))
                return
            }
            onFinalRef.current(text)
        } catch {
            setError(t('capture.recordingFailed'))
        } finally {
            setIsTranscribing(false)
        }
    }, [t])

    const start = useCallback((): void => {
        setError(null)
        if (!hasApiKey) {
            setError(t('capture.wisprKeyRequired'))
            return
        }

        void navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
                const mimeType = pickMimeType()
                const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
                chunksRef.current = []
                discardRef.current = false

                recorder.ondataavailable = (event: BlobEvent): void => {
                    if (event.data.size > 0) chunksRef.current.push(event.data)
                }
                recorder.onstop = (): void => {
                    const chunks = chunksRef.current
                    chunksRef.current = []
                    if (discardRef.current || chunks.length === 0) return
                    void transcribe(new Blob(chunks, { type: recorder.mimeType }))
                }

                recorderRef.current = recorder
                recorder.start()
                setIsListening(true)
            })
            .catch(() => {
                setError(t('capture.microphoneDenied'))
            })
    }, [hasApiKey, t, transcribe])

    const stop = useCallback((): void => {
        const recorder = recorderRef.current
        if (recorder?.state === 'recording') recorder.stop()
        teardown()
    }, [teardown])

    const abort = useCallback((): void => {
        discardRef.current = true
        const recorder = recorderRef.current
        if (recorder?.state === 'recording') recorder.stop()
        teardown()
    }, [teardown])

    const toggle = useCallback((): void => {
        if (isListening) stop()
        else start()
    }, [isListening, start, stop])

    // Discard any in-flight recording on unmount.
    const abortRef = useRef(abort)
    useEffect(() => {
        abortRef.current = abort
    })
    useEffect(() => () => abortRef.current(), [])

    return {
        isListening,
        isTranscribing,
        error,
        start,
        stop,
        abort,
        toggle
    }
}
