import { TranscribeAudio } from '@shared/types'
import { app } from 'electron'
import { getCredential } from '../lib'

// Wispr Flow developer API (platform.wisprflow.ai) — Wispr's dictation
// service, not to be confused with OpenAI's Whisper model. It accepts a
// base64-encoded 16 kHz PCM WAV clip (max 25 MB / 6 minutes); the renderer
// records and converts before it reaches this module.
const wisprFlowEndpoint = 'https://platform-api.wisprflow.ai/api/v1/dash/api'

const maxAudioBytes = 25 * 1024 * 1024

// The API key is read from settings.json here in main — the renderer never
// sends (or needs) it.
export const transcribeAudio: TranscribeAudio = async (audio) => {
    if (!(audio instanceof ArrayBuffer)) {
        return { error: 'Invalid audio payload.' }
    }
    if (audio.byteLength === 0) {
        return { error: 'No audio was recorded.' }
    }
    if (audio.byteLength > maxAudioBytes) {
        return { error: 'Recording is too long — Wispr Flow accepts up to 6 minutes.' }
    }

    const apiKey = (await getCredential('whisprflow')).trim()
    if (!apiKey) {
        return { error: 'Add your Wispr Flow API key in Settings to use Wispr Flow dictation.' }
    }

    // Two-letter ISO 639-1 code; steering recognition to the OS language
    // beats Wispr Flow's autodetection on short clips.
    const language = app.getLocale().slice(0, 2).toLowerCase()

    try {
        const response = await fetch(wisprFlowEndpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio: Buffer.from(audio).toString('base64'),
                language: [language],
                context: { app: { name: 'Prognotic', type: 'other' } }
            })
        })

        if (!response.ok) {
            if (response.status === 401) {
                return { error: 'Wispr Flow rejected the API key — check it in Settings.' }
            }
            if (response.status === 413) {
                return { error: 'Recording is too long — Wispr Flow accepts up to 6 minutes.' }
            }
            const body = (await response.json().catch(() => null)) as { detail?: string } | null
            return {
                error: body?.detail
                    ? `Transcription failed: ${body.detail}`
                    : `Transcription failed (HTTP ${response.status}).`
            }
        }

        const payload = (await response.json()) as { text?: string }
        return { text: typeof payload.text === 'string' ? payload.text : '' }
    } catch {
        return { error: 'Could not reach Wispr Flow — check your internet connection.' }
    }
}
