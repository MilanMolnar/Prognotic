import { useSettings, useSettingsActions } from '@renderer/context'
import { JSX, useEffect, useState } from 'react'

export type SettingsModalProps = {
  onClose: () => void
}

export const SettingsModal = ({ onClose }: SettingsModalProps): JSX.Element => {
  const { settings } = useSettings()
  const { updateSettings } = useSettingsActions()
  const [blockWindowMinutes, setBlockWindowMinutes] = useState(String(settings.blockWindowMinutes))

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
    await updateSettings({ blockWindowMinutes: minutes })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
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
