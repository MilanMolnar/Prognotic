import { usePluginActions, usePlugins } from '@renderer/context'
import { cn } from '@renderer/utils'
import type { PluginConfig, PluginConfigValue } from '@shared/plugins'
import { JSX, useEffect, useState } from 'react'
import { LuClipboard, LuFolderOpen, LuRefreshCw, LuTrash2, LuX } from 'react-icons/lu'

export type PluginManagerModalProps = { onClose: () => void }

export const PluginManagerModal = ({ onClose }: PluginManagerModalProps): JSX.Element => {
  const { plugins, pluginsPath, error } = usePlugins()
  const {
    refreshPlugins,
    setPluginEnabled,
    setPluginConfig,
    removePlugin,
    openPluginsFolder
  } = usePluginActions()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const [draftConfig, setDraftConfig] = useState<PluginConfig>({})
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const runBusy = async (key: string, action: () => Promise<string | null>): Promise<void> => {
    setBusyKey(key)
    setStatus(null)
    try {
      setStatus(await action())
    } catch (actionError) {
      setStatus(actionError instanceof Error ? actionError.message : 'Plugin action failed.')
    } finally {
      setBusyKey(null)
    }
  }

  const copyPath = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(pluginsPath)
      setStatus('Plugins folder path copied.')
    } catch {
      setStatus('Could not copy the plugins folder path.')
    }
  }

  const beginConfigure = (pluginId: string, config: PluginConfig): void => {
    setConfiguringId(pluginId)
    setDraftConfig({ ...config })
    setStatus(null)
  }

  const setDraftValue = (key: string, value: PluginConfigValue): void => {
    setDraftConfig((previous) => ({ ...previous, [key]: value }))
  }

  const displayedStatus = status ?? error
  const displayedStatusIsError = status !== null
    ? /could not|failed|invalid|unavailable/i.test(status)
    : error !== null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-start gap-3 border-b border-white/10 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-zinc-100">Plugins</h2>
            <p className="mt-1 text-xs text-zinc-500">Install a plugin by copying its folder here, then refresh this list.</p>
          </div>
          <button type="button" title="Close plugin manager" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100">
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-400" title={pluginsPath}>{pluginsPath || 'Loading plugins folder...'}</code>
            <button type="button" title="Copy path" disabled={!pluginsPath} onClick={() => { void copyPath() }} className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"><LuClipboard className="h-4 w-4" /></button>
            <button type="button" title="Open folder" disabled={!pluginsPath} onClick={() => { void runBusy('open-folder', openPluginsFolder) }} className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"><LuFolderOpen className="h-4 w-4" /></button>
            <button type="button" title="Refresh plugins" disabled={busyKey !== null} onClick={() => { void runBusy('refresh', async () => { await refreshPlugins(); return null }) }} className="rounded border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"><LuRefreshCw className={cn('h-4 w-4', busyKey === 'refresh' && 'animate-spin')} /></button>
          </div>
          {displayedStatus && <p className={cn('mt-2 text-xs', displayedStatusIsError ? 'text-red-400' : 'text-zinc-400')} role="status">{displayedStatus}</p>}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {plugins === undefined && <p className="text-sm text-zinc-500">Discovering plugins...</p>}
          {plugins?.length === 0 && <p className="rounded border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">No plugin folders found.</p>}
          {plugins?.map((plugin) => {
            const canToggle = plugin.id !== null && (plugin.valid || plugin.enabled)
            const isConfiguring = plugin.id !== null && configuringId === plugin.id
            return (
              <section key={plugin.folderName} className={cn('rounded-lg border p-3', plugin.valid ? 'border-white/10' : 'border-red-500/30 bg-red-500/5')}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-zinc-100">{plugin.name}</h3>
                      <span className="text-xs text-zinc-500">v{plugin.version}</span>
                      <span className={cn('rounded-full border px-1.5 py-0.5 text-[10px]', plugin.valid ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400')}>{plugin.valid ? 'Ready' : 'Unusable'}</span>
                    </div>
                    {plugin.description && <p className="mt-1 text-sm text-zinc-400">{plugin.description}</p>}
                    <p className="mt-1 text-[11px] text-zinc-600">Folder: {plugin.folderName}</p>
                    {plugin.reason && <p className="mt-2 text-xs text-red-400" role="alert">{plugin.reason}</p>}
                  </div>
                  <label className={cn('flex shrink-0 items-center gap-2 text-xs', canToggle ? 'text-zinc-300' : 'text-zinc-600')}>
                    <input
                      type="checkbox"
                      checked={plugin.enabled}
                      disabled={!canToggle || busyKey !== null}
                      onChange={(event) => {
                        if (!plugin.id) return
                        void runBusy(`toggle:${plugin.folderName}`, () => setPluginEnabled(plugin.id as string, event.target.checked))
                      }}
                      className="accent-yellow-500"
                    />
                    Enabled
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {plugin.valid && plugin.id && plugin.configSchema.length > 0 && (
                    <button type="button" onClick={() => isConfiguring ? setConfiguringId(null) : beginConfigure(plugin.id as string, plugin.config)} className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800">{isConfiguring ? 'Close configuration' : 'Configure'}</button>
                  )}
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => {
                      if (!window.confirm(`Remove ${plugin.name}? Its note blocks will remain in the vault.`)) return
                      void runBusy(`remove:${plugin.folderName}`, () => removePlugin(plugin.folderName))
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded border border-red-500/30 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                  >
                    <LuTrash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>

                {isConfiguring && plugin.id && (
                  <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                    {plugin.configSchema.map((field) => (
                      <div key={field.key}>
                        {field.type === 'boolean' ? (
                          <label className="flex items-center gap-2 text-sm text-zinc-300">
                            <input type="checkbox" checked={draftConfig[field.key] === true} onChange={(event) => setDraftValue(field.key, event.target.checked)} className="accent-yellow-500" />
                            {field.label}
                          </label>
                        ) : (
                          <>
                            <label htmlFor={`plugin-${plugin.id}-${field.key}`} className="text-sm text-zinc-300">{field.label}</label>
                            {field.type === 'select' ? (
                              <select id={`plugin-${plugin.id}-${field.key}`} value={String(draftConfig[field.key] ?? '')} onChange={(event) => setDraftValue(field.key, event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-yellow-500/50">
                                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            ) : (
                              <input
                                id={`plugin-${plugin.id}-${field.key}`}
                                type={field.type === 'number' ? 'number' : 'text'}
                                min={field.type === 'number' ? field.min : undefined}
                                max={field.type === 'number' ? field.max : undefined}
                                value={String(draftConfig[field.key] ?? '')}
                                onChange={(event) => setDraftValue(field.key, field.type === 'number' ? Number(event.target.value) : event.target.value)}
                                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-yellow-500/50"
                              />
                            )}
                          </>
                        )}
                        {field.description && <p className="mt-1 text-xs text-zinc-600">{field.description}</p>}
                      </div>
                    ))}
                    <div className="flex justify-end">
                      <button type="button" disabled={busyKey !== null} onClick={() => { void runBusy(`config:${plugin.id}`, async () => { const message = await setPluginConfig(plugin.id as string, draftConfig); if (!message) setConfiguringId(null); return message }) }} className="rounded border border-yellow-500/40 px-2 py-1 text-xs text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-40">Save configuration</button>
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
