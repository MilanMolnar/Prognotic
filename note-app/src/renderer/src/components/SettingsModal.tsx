import { useSettings, useSettingsActions } from '@renderer/context'
import { cn } from '@renderer/utils'
import { DictationMode, LlmProvider } from '@shared/models'
import { LlmModel } from '@shared/types'
import { JSX, useEffect, useState } from 'react'

export type SettingsModalProps = { onClose: () => void }

const dictationOptions: { mode: DictationMode; label: string; description: string }[] = [
  { mode: 'windows', label: 'Windows dictation', description: "Opens Windows system's voice dictation. (Windows only)." },
  { mode: 'whisprflow', label: 'Wispr Flow', description: 'Wispr Flow developer API. Requires a key from platform.wisprflow.ai.' }
]

const providerOptions: { provider: LlmProvider; label: string }[] = [
  { provider: 'gemini', label: 'Google Gemini' },
  { provider: 'openai', label: 'OpenAI' },
  { provider: 'anthropic', label: 'Claude' },
  { provider: 'local', label: 'LM Studio (local)' }
]

const keyStatus = (provider: LlmProvider, settings: ReturnType<typeof useSettings>['settings']): boolean => ({
  gemini: settings.hasGeminiApiKey,
  openai: settings.hasOpenaiApiKey,
  anthropic: settings.hasAnthropicApiKey,
  local: settings.hasLocalApiToken
}[provider])

export const SettingsModal = ({ onClose }: SettingsModalProps): JSX.Element => {
  const { settings } = useSettings()
  const { updateSettings } = useSettingsActions()
  const [blockWindowMinutes, setBlockWindowMinutes] = useState(String(settings.blockWindowMinutes))
  const [dictationMode, setDictationMode] = useState<DictationMode>(settings.dictationMode)
  const [provider, setProvider] = useState<LlmProvider>(settings.llm.provider)
  const [model, setModel] = useState(settings.llm.model)
  const [localBaseUrl, setLocalBaseUrl] = useState(settings.llm.localBaseUrl)
  const [polishDictation, setPolishDictation] = useState(settings.llm.polishDictation)
  const [apiKey, setApiKey] = useState('')
  const [wisprKey, setWisprKey] = useState('')
  const [models, setModels] = useState<LlmModel[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [isLoadingModels, setIsLoadingModels] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const refreshModels = async (): Promise<void> => {
    setIsLoadingModels(true)
    setStatus(null)
    await updateSettings({ llm: { provider, model, localBaseUrl, polishDictation } })
    if (apiKey.trim()) await window.context.setCredential(provider, apiKey)
    const result = await window.context.getLlmModels(provider)
    setIsLoadingModels(false)
    if ('error' in result) { setModels([]); setStatus(result.error ?? 'Could not load models.'); return }
    setModels(result.models)
    if (!result.models.some((item) => item.id === model)) setModel(result.models[0]?.id ?? '')
  }

  const handleSave = async (): Promise<void> => {
    const parsed = Math.round(Number(blockWindowMinutes))
    const minutes = Number.isFinite(parsed) && parsed >= 1 ? parsed : settings.blockWindowMinutes
    await updateSettings({ blockWindowMinutes: minutes, dictationMode, llm: { provider, model, localBaseUrl, polishDictation } })
    if (apiKey.trim()) await window.context.setCredential(provider, apiKey)
    if (wisprKey.trim()) await window.context.setCredential('whisprflow', wisprKey)
    if (apiKey.trim() || wisprKey.trim()) await updateSettings({})
    onClose()
  }

  const testConnection = async (): Promise<void> => {
    await updateSettings({ llm: { provider, model, localBaseUrl, polishDictation } })
    if (apiKey.trim()) await window.context.setCredential(provider, apiKey)
    if (apiKey.trim()) await updateSettings({})
    setStatus('Testing connection...')
    const result = await window.context.testLlmConnection()
    setStatus(result.ok ? 'Connection succeeded.' : result.error ?? 'Connection failed.')
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
    <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <h2 className="mb-4 font-bold">Settings</h2>
      <label className="block text-sm text-zinc-300">Note block window (minutes)
        <input type="number" min={1} value={blockWindowMinutes} onChange={(event) => setBlockWindowMinutes(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
      </label>

      <fieldset className="mt-5"><legend className="text-sm font-medium text-zinc-200">Dictation mode</legend>
        <div className="mt-2 space-y-2">{dictationOptions.map(({ mode, label, description }) => <label key={mode} className={cn('flex cursor-pointer gap-2 rounded-md border px-3 py-2', dictationMode === mode ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-zinc-400/30')}>
          <input type="radio" name="dictationMode" checked={dictationMode === mode} onChange={() => setDictationMode(mode)} className="mt-0.5 accent-yellow-500" />
          <span><span className="block text-sm text-zinc-200">{label}</span><span className="block text-xs text-zinc-500">{description}</span></span>
        </label>)}</div>
      </fieldset>
      {dictationMode === 'whisprflow' && <label className="mt-3 block text-sm text-zinc-300">Wispr Flow API key {settings.hasWhisprflowApiKey && <span className="text-xs text-zinc-500">(configured)</span>}
        <input type="password" value={wisprKey} onChange={(event) => setWisprKey(event.target.value)} placeholder="Replace API key..." autoComplete="off" className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
      </label>}

      <fieldset className="mt-6 border-t border-white/10 pt-4"><legend className="text-sm font-medium text-zinc-200">AI assistant</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">{providerOptions.map((option) => <label key={option.provider} className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm', provider === option.provider ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-zinc-400/30')}>
          <input type="radio" name="llmProvider" checked={provider === option.provider} onChange={() => { setProvider(option.provider); setModels([]); setModel('') }} className="accent-yellow-500" />{option.label}
        </label>)}</div>
        {provider === 'local' && <label className="mt-3 block text-sm text-zinc-300">LM Studio URL
          <input value={localBaseUrl} onChange={(event) => setLocalBaseUrl(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
        </label>}
        <label className="mt-3 block text-sm text-zinc-300">{provider === 'local' ? 'LM Studio API token (optional)' : `${providerOptions.find((item) => item.provider === provider)?.label} API key`} {keyStatus(provider, settings) && <span className="text-xs text-zinc-500">(configured)</span>}
          <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Replace credential..." autoComplete="off" className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
        </label>
        <div className="mt-3 flex gap-2"><button type="button" onClick={() => void refreshModels()} disabled={isLoadingModels} className="rounded-md border border-zinc-400/50 px-2 py-1 text-sm hover:bg-zinc-600/50 disabled:opacity-40">{isLoadingModels ? 'Loading...' : 'Refresh models'}</button>
          <button type="button" onClick={() => void testConnection()} disabled={!model} className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm hover:bg-yellow-500/20 disabled:opacity-40">Test connection</button></div>
        <label className="mt-3 block text-sm text-zinc-300">Active model
          <select value={model} onChange={(event) => setModel(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-400/50 bg-zinc-900 px-2 py-1 outline-none">{models.length === 0 && <option value="">Refresh models first</option>}{models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={polishDictation} onChange={(event) => setPolishDictation(event.target.checked)} className="accent-yellow-500" />Polish dictation with AI before review</label>
        {status && <p className="mt-2 text-xs text-zinc-400" aria-live="polite">{status}</p>}
      </fieldset>
      <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-md border border-zinc-400/50 px-2 py-1 text-sm hover:bg-zinc-600/50">Cancel</button><button onClick={() => void handleSave()} className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm hover:bg-yellow-500/20">Save</button></div>
    </div>
  </div>
}
