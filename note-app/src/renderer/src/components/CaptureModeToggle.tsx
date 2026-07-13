import { useSettings, useSettingsActions } from '@renderer/context'
import { cn } from '@renderer/utils'
import { CaptureMode } from '@shared/models'
import { JSX } from 'react'

const modes: { key: CaptureMode; label: string; title: string }[] = [
  { key: 'chat', label: 'Chat', title: 'Chat capture: feed with a send bar at the bottom' },
  { key: 'natural', label: 'Natural', title: 'Natural capture: write at the top, blocks collapse below' }
]

// Segmented switch between the two capture styles. Persisted in settings so
// the choice survives restarts; both styles feed the same block pipeline.
export const CaptureModeToggle = (): JSX.Element => {
  const { settings } = useSettings()
  const { updateSettings } = useSettingsActions()

  return (
    <div data-tour="capture-mode-toggle" className="no-drag flex items-center gap-0.5 rounded-md border border-zinc-400/40 p-0.5">
      {modes.map(({ key, label, title }) => (
        <button
          key={key}
          type="button"
          title={title}
          onClick={() => void updateSettings({ captureMode: key })}
          className={cn(
            'rounded px-2 py-px text-xs transition-colors duration-100',
            settings.captureMode === key
              ? 'bg-yellow-500/15 text-yellow-500'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
