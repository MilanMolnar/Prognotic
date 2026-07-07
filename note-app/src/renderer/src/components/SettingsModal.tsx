import { useSettings, useSettingsActions } from '@renderer/context'
import { cn } from '@renderer/utils'
import { DictationMode } from '@shared/models'
import { JSX, useEffect, useState } from 'react'

export type SettingsModalProps = {
  onClose: () => void
}

const dictationOptions: {
  mode: DictationMode
  label: string
  description: string
}[] = [
  {
    mode: 'windows',
    label: 'Windows dictation',
    description:
      "Opens Windows system's voice dictation. (Windows only)."
  },
  {
    mode: 'whisprflow',
    label: 'Wispr Flow',
    description:
      'Wispr Flow developer API (wisprflow.ai) — accurate AI dictation. Needs an API key from platform.wisprflow.ai.'
  }
]

export const SettingsModal = ({ onClose }: SettingsModalProps): JSX.Element => {
  const { settings } = useSettings()
  const { updateSettings } = useSettingsActions()
  const [blockWindowMinutes, setBlockWindowMinutes] = useState(String(settings.blockWindowMinutes))
  const [dictationMode, setDictationMode] = useState<DictationMode>(settings.dictationMode)
  const [whisprflowApiKey, setWhisprflowApiKey] = useState(settings.whisprflowApiKey)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSave = async (): Promise<void> => {
    const parsed = Math.round(Number(blockWindowMinutes))
    const minutes = Number.isFinite(parsed) && parsed >= 1 ? parsed : settings.blockWindowMinutes
    await updateSettings({
      blockWindowMinutes: minutes,
      dictationMode,
      whisprflowApiKey: dictationMode === 'whisprflow' ? whisprflowApiKey : settings.whisprflowApiKey
    })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4 font-bold">Settings</h2>

        <label className="block text-sm text-zinc-300">
          Note block window (minutes)
          <input
            type="number"
            min={1}
            value={blockWindowMinutes}
            onChange={(event) => setBlockWindowMinutes(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500 focus:border-zinc-300/50"
          />
        </label>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-zinc-200">Dictation mode</legend>
          <p className="mt-0.5 text-xs text-zinc-500">
            Chat capture mic button uses the selected provider.
          </p>
          <div className="mt-2 space-y-2">
            {dictationOptions.map(({ mode, label, description }) => (
              <label
                key={mode}
                className={cn(
                  'flex cursor-pointer gap-2 rounded-md border px-3 py-2 transition-colors duration-100',
                  dictationMode === mode
                    ? 'border-yellow-500/40 bg-yellow-500/5'
                    : 'border-zinc-400/30 hover:border-zinc-400/50'
                )}
              >
                <input
                  type="radio"
                  name="dictationMode"
                  value={mode}
                  checked={dictationMode === mode}
                  onChange={() => setDictationMode(mode)}
                  className="mt-0.5 accent-yellow-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-zinc-200">{label}</span>
                  <span className="block text-xs text-zinc-500">{description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {dictationMode === 'whisprflow' && (
          <label className="mt-4 block text-sm text-zinc-300">
            Wispr Flow API key
            <input
              type="password"
              value={whisprflowApiKey}
              onChange={(event) => setWhisprflowApiKey(event.target.value)}
              placeholder="Paste your Wispr Flow key…"
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500 placeholder:text-zinc-600 focus:border-zinc-300/50"
            />
            <span className="mt-1 block text-xs text-zinc-500">
              Stored locally, only sent to Wispr Flow when transcribing. API access requires
              approval at platform.wisprflow.ai.
            </span>
          </label>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md border border-zinc-400/50 hover:bg-zinc-600/50 transition-colors duration-100 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            className="px-2 py-1 rounded-md border border-yellow-500/50 hover:bg-yellow-500/20 transition-colors duration-100 text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
