import { useCalendarActions, useOnboardingActions, useSettings, useSettingsActions } from '@renderer/context'
import { cn } from '@renderer/utils'
import { isImageRecognitionSelectionVerified, isLlmSelectionVerified } from '@shared/llmSettings'
import { DictationMode, LlmProvider } from '@shared/models'
import { LlmModel } from '@shared/types'
import { filterVisionModels, isImageRecognitionAvailable } from '@shared/vision'
import { JSX, useEffect, useState } from 'react'
import { LuCheck } from 'react-icons/lu'
import { dispatchOnboardingEvent, onboardingEvents } from '@renderer/onboarding/events'
import { SettingInfoButton } from './SettingInfoButton'
import { SettingInfoModal } from './SettingInfoModal'
import { PluginManagerModal } from './PluginManagerModal'

export type SettingsModalProps = { onClose: () => void }

type SettingHelp = { title: string; body: string }
type DictationOption = { mode: DictationMode; label: string; description: string; help: SettingHelp }
type Status = { message: string; tone: 'neutral' | 'success' | 'error' }

const settingHelp = {
  noteBlockWindow: {
    title: 'Note block window',
    body: 'Sets how long a capture remains open after its most recent write. New captures in the same category append to that block while the window is active, and each write restarts the timer. When the window expires, the block is finalized and eligible optional AI workflows run. The minimum is one minute.'
  },
  dictationMode: {
    title: 'Dictation mode',
    body: 'Chooses which speech-to-text path the capture editors use. Native dictation types through the operating system, while Wispr Flow records audio and returns a transcript through its developer API. Native availability depends on the current platform. Changing this setting does not modify existing notes.'
  },
  wisprKey: {
    title: 'Wispr Flow API key',
    body: 'Authenticates transcription requests sent to the Wispr Flow developer API. Prognotic encrypts this key with Electron safeStorage, and the renderer receives only a configured flag after saving. It is required only when Wispr Flow is the selected dictation mode. Entering a value replaces the saved key.'
  },
  aiProvider: {
    title: 'AI provider',
    body: 'Selects the global provider used by routing, inline actions, the default assistant model, and optional AI features. Models and credentials are provider-specific. A provider or model change makes the current connection unverified unless the saved verified pair exactly matches the new selection. Checked opt-in values are retained when verification is unavailable.'
  },
  aiAssistant: {
    title: 'AI assistant',
    body: 'Configures the global provider and model used by Prognotic AI workflows. Cloud requests use the encrypted credential for the selected provider, while LM Studio uses the configured local loopback server. Provider and model selection does not enable the two optional AI features until Test connection succeeds.'
  },
  localUrl: {
    title: 'LM Studio URL',
    body: 'Points Prognotic to the local LM Studio server used for model discovery and inference. Only loopback HTTP addresses such as 127.0.0.1 or localhost are accepted. The default port is 1234. LM Studio must be running before models can be refreshed or tested.'
  },
  refreshModels: {
    title: 'Refresh models',
    body: 'Saves the current provider connection fields, then asks that provider for its available models. For LM Studio, only loaded LLM instances are listed. If the current model is unavailable, the first returned model becomes the draft selection. Refreshing the list does not verify that inference succeeds.'
  },
  activeModel: {
    title: 'Active model',
    body: 'Sets the global default model for routing, inline actions, optional AI features, new assistant conversations, and the AI Plugin Wizard when its selector is set to Active model. A model must be selected before the connection can be tested. Verification belongs to the exact provider and model pair shown here. Changing the selection leaves checked opt-ins intact but disables them until the pair is verified.'
  },
  pluginWizardModel: {
    title: 'AI Plugin Wizard model',
    body: 'Selects the model used for the plugin interview and plugin code generation. Active model is the default and follows the global model selection automatically. A specific override still uses the current provider and credential, and the active connection must pass Test connection before the wizard can run. Changing providers resets this override to Active model.'
  },
  testConnection: {
    title: 'Test connection',
    body: 'Sends a short prompt through the selected provider and active model. A successful response stores the exact provider and model pair and turns this button green. A failed test clears verification, while changing either selection makes a different saved pair invalid. Both AI opt-in checkboxes require the current button to be green.'
  },
  imageRecognitionModel: {
    title: 'Image recognition model',
    body: 'Selects a separate vision-capable model for extracting printed or handwritten text from capture images. It uses the current AI provider and credential, but never replaces the active text model used by the assistant or other AI workflows. Cloud catalogs are filtered by conservative model-family rules. LM Studio requires an explicitly identified loaded vision model.'
  },
  testImageRecognition: {
    title: 'Test image recognition',
    body: 'Sends a small in-memory test image to the selected vision model. A successful response stores a separate exact provider and image-model verification pair. Capture image buttons remain hidden until this test succeeds, and changing the provider or image model makes the saved verification inapplicable.'
  },
  polishDictation: {
    title: 'Polish dictation with AI before review',
    body: 'When Wispr Flow returns a transcript, the active model removes filler and improves grammar before the text is inserted. The original meaning, facts, and Markdown should be preserved, and failures still offer Retry or Use original. This option can be changed only after the current provider and model pass Test connection. If it remains checked after the pair becomes unverified, the value is retained but polishing stays inactive.'
  },
  aiBlockNameSummary: {
    title: 'Note-block AI name summary',
    body: 'When a non-empty block is finalized, the active model creates a concise topical display name of at most five words. The name is stored in block metadata, so rendering and restart do not trigger another model call. Naming failures are silent and the first five excerpt words remain the fallback. This option requires a verified current provider and model. Turning it off makes every label use the excerpt fallback without deleting saved AI names.'
  }
} satisfies Record<string, SettingHelp>

const dictationOptionsForPlatform = (platform: NodeJS.Platform): DictationOption[] => {
  const native: DictationOption[] = platform === 'win32'
    ? [{
        mode: 'windows',
        label: 'Windows dictation',
        description: 'Opens Windows voice typing with Win+H.',
        help: {
          title: 'Windows dictation',
          body: 'Uses the Windows voice typing overlay and sends its text directly to the focused editor. Prognotic does not receive a transcript to process through Wispr Flow or AI polishing. This choice is available on Windows only.'
        }
      }]
    : platform === 'darwin'
      ? [{
          mode: 'macos',
          label: 'macOS dictation',
          description: 'Starts macOS Dictation with Fn-D. Requires Accessibility permission.',
          help: {
            title: 'macOS dictation',
            body: 'Uses macOS Dictation and sends its text directly to the focused editor. Accessibility permission is required so Prognotic can trigger the system shortcut. Prognotic does not receive this transcript for AI polishing.'
          }
        }]
      : []
  return [
    ...native,
    {
      mode: 'whisprflow',
      label: 'Wispr Flow',
      description: 'Wispr Flow developer API. Requires a key from platform.wisprflow.ai.',
      help: {
        title: 'Wispr Flow',
        body: 'Records microphone audio in Prognotic and sends it to the Wispr Flow developer API for transcription. It requires a saved Wispr Flow API key and microphone permission. Returned transcripts can optionally be polished by the verified active AI model before insertion.'
      }
    }
  ]
}

const providerOptions: { provider: LlmProvider; label: string; help: SettingHelp }[] = [
  {
    provider: 'gemini',
    label: 'Google Gemini',
    help: {
      title: 'Google Gemini',
      body: 'Uses Google Gemini for model discovery and AI requests. A Gemini API key must be saved before models can be loaded or tested. Notes sent to AI features are processed by Google according to that account and model.'
    }
  },
  {
    provider: 'openai',
    label: 'OpenAI',
    help: {
      title: 'OpenAI',
      body: 'Uses the OpenAI API for model discovery and AI requests. An OpenAI API key must be saved before models can be loaded or tested. Notes sent to AI features are processed by OpenAI according to that account and model.'
    }
  },
  {
    provider: 'anthropic',
    label: 'Claude',
    help: {
      title: 'Claude',
      body: 'Uses Anthropic Claude for model discovery and AI requests. An Anthropic API key must be saved before models can be loaded or tested. Notes sent to AI features are processed by Anthropic according to that account and model.'
    }
  },
  {
    provider: 'local',
    label: 'LM Studio (local)',
    help: {
      title: 'LM Studio (local)',
      body: 'Uses a model loaded in LM Studio on this computer through its local server. Model content stays with that local endpoint unless LM Studio itself is configured otherwise. The server must be running, and only currently loaded LLM instances appear in the model list.'
    }
  }
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
  const { startTour } = useOnboardingActions()
  const { configureGoogle, connectGoogle, disconnectGoogle, syncGoogleNow } = useCalendarActions()
  const dictationOptions = dictationOptionsForPlatform(window.context.platform)
  const [blockWindowMinutes, setBlockWindowMinutes] = useState(String(settings.blockWindowMinutes))
  const [dictationMode, setDictationMode] = useState<DictationMode>(settings.dictationMode)
  const [provider, setProvider] = useState<LlmProvider>(settings.llm.provider)
  const [model, setModel] = useState(settings.llm.model)
  const [pluginWizardModel, setPluginWizardModel] = useState(settings.llm.pluginWizardModel)
  const [imageRecognitionModel, setImageRecognitionModel] = useState(settings.llm.imageRecognitionModel)
  const [localBaseUrl, setLocalBaseUrl] = useState(settings.llm.localBaseUrl)
  const [polishDictation, setPolishDictation] = useState(settings.llm.polishDictation)
  const [aiBlockNameSummary, setAiBlockNameSummary] = useState(settings.llm.aiBlockNameSummary)
  const [apiKey, setApiKey] = useState('')
  const [wisprKey, setWisprKey] = useState('')
  const [models, setModels] = useState<LlmModel[]>([])
  const [status, setStatus] = useState<Status | null>(null)
  const [imageRecognitionStatus, setImageRecognitionStatus] = useState<Status | null>(null)
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isTestingImageRecognition, setIsTestingImageRecognition] = useState(false)
  const [activeHelp, setActiveHelp] = useState<SettingHelp | null>(null)
  const [isPluginManagerOpen, setIsPluginManagerOpen] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(settings.googleCalendar.enabled)
  const [googlePushEnabled, setGooglePushEnabled] = useState(settings.googleCalendar.pushEnabled)
  const [googlePullEnabled, setGooglePullEnabled] = useState(settings.googleCalendar.pullEnabled)
  const [googleAutoSyncMinutes, setGoogleAutoSyncMinutes] = useState(settings.googleCalendar.autoSyncMinutes)
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleClientSecret, setGoogleClientSecret] = useState('')
  const [showGoogleOAuthFields, setShowGoogleOAuthFields] = useState(!settings.googleCalendar.hasOAuthClient)
  const [googleStatus, setGoogleStatus] = useState<Status | null>(null)
  const [isGoogleWorking, setIsGoogleWorking] = useState(false)

  const draftLlm = {
    provider,
    model,
    pluginWizardModel,
    imageRecognitionModel,
    localBaseUrl,
    polishDictation,
    aiBlockNameSummary,
    verifiedConnection: settings.llm.verifiedConnection,
    verifiedImageRecognitionConnection: settings.llm.verifiedImageRecognitionConnection
  }
  const draftGoogleCalendar = {
    ...settings.googleCalendar,
    enabled: googleEnabled,
    pushEnabled: googlePushEnabled,
    pullEnabled: googlePullEnabled,
    autoSyncMinutes: googleAutoSyncMinutes
  }
  const isVerifiedForCurrentSelection = isLlmSelectionVerified(draftLlm)
  const isImageRecognitionVerified = isImageRecognitionSelectionVerified(draftLlm)
  const visionModels = filterVisionModels(provider, models)
  const isImageRecognitionAvailableForDraft = isImageRecognitionAvailable(provider, models) ||
    (provider === 'local' && isImageRecognitionVerified)
  const canKeepCurrentImageModel = imageRecognitionModel.length > 0 && (
    isImageRecognitionVerified ||
    filterVisionModels(provider, [{ id: imageRecognitionModel, label: imageRecognitionModel }]).length > 0
  )
  const credentialLabel = provider === 'local'
    ? 'LM Studio API token (optional)'
    : `${providerOptions.find((item) => item.provider === provider)?.label} API key`
  const credentialHelp: SettingHelp = {
    title: credentialLabel,
    body: provider === 'local'
      ? 'Adds an optional bearer token when the local LM Studio server requires authentication. Prognotic encrypts the token with Electron safeStorage and returns only a configured flag to the renderer. Most default local LM Studio installations do not require a token. Replacing it does not verify the active model by itself.'
      : 'Authenticates model discovery and AI requests for the selected cloud provider. Prognotic encrypts the key with Electron safeStorage and returns only a configured flag to the renderer. Entering a value replaces the saved credential for this provider. Refresh models and run Test connection to validate it with the active model.'
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && activeHelp === null && !isPluginManagerOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeHelp, isPluginManagerOpen, onClose])

  useEffect(() => {
    window.addEventListener(onboardingEvents.closeSettingsModal, onClose)
    return () => window.removeEventListener(onboardingEvents.closeSettingsModal, onClose)
  }, [onClose])

  useEffect(() => {
    dispatchOnboardingEvent(onboardingEvents.providerChanged, { provider })
    dispatchOnboardingEvent(onboardingEvents.visionModelChanged, {
      hasVisionModel: imageRecognitionModel.length > 0
    })
  }, [imageRecognitionModel, provider])

  const refreshModels = async (): Promise<void> => {
    setIsLoadingModels(true)
    setStatus(null)
    setImageRecognitionStatus(null)
    try {
      await updateSettings({ llm: draftLlm })
      if (apiKey.trim()) {
        await window.context.setCredential(provider, apiKey)
        await updateSettings({})
      }
      const result = await window.context.getLlmModels(provider)
      if ('error' in result) {
        setModels([])
        setStatus({ message: result.error ?? 'Could not load models.', tone: 'error' })
        return
      }
      setModels(result.models)
      if (!result.models.some((item) => item.id === model)) setModel(result.models[0]?.id ?? '')
      if (pluginWizardModel && !result.models.some((item) => item.id === pluginWizardModel)) {
        setPluginWizardModel('')
      }
      const nextVisionModels = filterVisionModels(provider, result.models)
      if (!nextVisionModels.some((item) => item.id === imageRecognitionModel)) {
        setImageRecognitionModel(nextVisionModels[0]?.id ?? '')
      }
    } catch (error) {
      setModels([])
      setStatus({ message: error instanceof Error ? error.message : 'Could not load models.', tone: 'error' })
    } finally {
      setIsLoadingModels(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    const parsed = Math.round(Number(blockWindowMinutes))
    const minutes = Number.isFinite(parsed) && parsed >= 1 ? parsed : settings.blockWindowMinutes
    if (googleClientId.trim()) {
      const configured = await configureGoogle(googleClientId, googleClientSecret)
      if (!configured.ok) {
        setGoogleStatus({ message: configured.error ?? 'Could not save Google OAuth configuration.', tone: 'error' })
        return
      }
    }
    await updateSettings({
      blockWindowMinutes: minutes,
      dictationMode,
      llm: draftLlm,
      googleCalendar: draftGoogleCalendar
    })
    if (apiKey.trim()) await window.context.setCredential(provider, apiKey)
    if (wisprKey.trim()) await window.context.setCredential('whisprflow', wisprKey)
    if (apiKey.trim() || wisprKey.trim()) await updateSettings({})
    dispatchOnboardingEvent(onboardingEvents.settingsSaved)
    onClose()
  }

  const handleGoogleConnect = async (): Promise<void> => {
    if (isGoogleWorking) return
    setIsGoogleWorking(true)
    setGoogleStatus({ message: 'Opening Google authorization…', tone: 'neutral' })
    try {
      if (googleClientId.trim()) {
        const configured = await configureGoogle(googleClientId, googleClientSecret)
        if (!configured.ok) {
          setGoogleStatus({ message: configured.error ?? 'Could not save Google OAuth configuration.', tone: 'error' })
          return
        }
      }
      const result = await connectGoogle()
      setGoogleStatus(result.ok
        ? { message: 'Google Calendar connected.', tone: 'success' }
        : { message: result.error ?? 'Could not connect Google Calendar.', tone: 'error' })
      if (result.ok) {
        setGoogleClientId('')
        setGoogleClientSecret('')
        setShowGoogleOAuthFields(false)
      }
    } finally {
      setIsGoogleWorking(false)
    }
  }

  const handleGoogleDisconnect = async (): Promise<void> => {
    if (isGoogleWorking) return
    setIsGoogleWorking(true)
    try {
      const result = await disconnectGoogle()
      setGoogleStatus(result.ok && !result.error
        ? { message: 'Google Calendar disconnected.', tone: 'success' }
        : { message: result.error ?? 'Could not disconnect Google Calendar.', tone: 'error' })
      if (result.ok) setGoogleEnabled(false)
    } finally {
      setIsGoogleWorking(false)
    }
  }

  const handleGoogleSync = async (): Promise<void> => {
    if (isGoogleWorking) return
    setIsGoogleWorking(true)
    setGoogleStatus({ message: 'Syncing Google Calendar…', tone: 'neutral' })
    try {
      await updateSettings({ googleCalendar: draftGoogleCalendar })
      const result = await syncGoogleNow()
      setGoogleStatus(result.ok
        ? { message: 'Google Calendar sync completed.', tone: 'success' }
        : { message: result.error ?? 'Google Calendar sync failed.', tone: 'error' })
    } finally {
      setIsGoogleWorking(false)
    }
  }

  const testConnection = async (): Promise<void> => {
    if (!model || isTesting) return
    setIsTesting(true)
    setStatus({ message: 'Testing connection...', tone: 'neutral' })
    try {
      await updateSettings({ llm: draftLlm })
      if (apiKey.trim()) {
        await window.context.setCredential(provider, apiKey)
        await updateSettings({})
      }
      const result = await window.context.testLlmConnection()
      // The main process persists or clears verification as part of the test;
      // refresh renderer settings without changing the saved checkbox values.
      await updateSettings({})
      setStatus(result.ok
        ? { message: 'Connection succeeded.', tone: 'success' }
        : { message: result.error ?? 'Connection failed.', tone: 'error' })
    } catch (error) {
      try {
        await updateSettings({})
      } catch {
        // Keep the original test failure visible if settings refresh also fails.
      }
      setStatus({ message: error instanceof Error ? error.message : 'Connection failed.', tone: 'error' })
    } finally {
      setIsTesting(false)
    }
  }

  const testImageRecognition = async (): Promise<void> => {
    if (!imageRecognitionModel || isTestingImageRecognition || !isImageRecognitionAvailableForDraft) return
    setIsTestingImageRecognition(true)
    setImageRecognitionStatus({ message: 'Testing image recognition...', tone: 'neutral' })
    try {
      await updateSettings({ llm: draftLlm })
      if (apiKey.trim()) {
        await window.context.setCredential(provider, apiKey)
        await updateSettings({})
      }
      const result = await window.context.testImageRecognitionConnection()
      await updateSettings({})
      setImageRecognitionStatus(result.ok
        ? { message: 'Image recognition connection succeeded.', tone: 'success' }
        : { message: result.error ?? 'Image recognition connection failed.', tone: 'error' })
    } catch (error) {
      try {
        await updateSettings({})
      } catch {
        // Keep the original test failure visible if settings refresh also fails.
      }
      setImageRecognitionStatus({
        message: error instanceof Error ? error.message : 'Image recognition connection failed.',
        tone: 'error'
      })
    } finally {
      setIsTestingImageRecognition(false)
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
    <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <h2 className="mb-4 font-bold">Settings</h2>
      <div>
        <div className="flex items-center gap-1 text-sm text-zinc-300">
          <label htmlFor="block-window-minutes">Note block window (minutes)</label>
          <SettingInfoButton settingName={settingHelp.noteBlockWindow.title} onOpen={() => setActiveHelp(settingHelp.noteBlockWindow)} />
        </div>
        <input id="block-window-minutes" type="number" min={1} value={blockWindowMinutes} onChange={(event) => setBlockWindowMinutes(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-zinc-200">
          <span className="inline-flex items-center gap-1">Dictation mode
            <SettingInfoButton settingName={settingHelp.dictationMode.title} onOpen={() => setActiveHelp(settingHelp.dictationMode)} />
          </span>
        </legend>
        <div className="mt-2 space-y-2">{dictationOptions.map(({ mode, label, description, help }) => <div key={mode} className={cn('flex items-start gap-2 rounded-md border px-3 py-2', dictationMode === mode ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-zinc-400/30')}>
          <input id={`dictation-${mode}`} type="radio" name="dictationMode" checked={dictationMode === mode} onChange={() => setDictationMode(mode)} className="mt-0.5 accent-yellow-500" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1"><label htmlFor={`dictation-${mode}`} className="cursor-pointer text-sm text-zinc-200">{label}</label><SettingInfoButton settingName={help.title} onOpen={() => setActiveHelp(help)} /></div>
            <label htmlFor={`dictation-${mode}`} className="block cursor-pointer text-xs text-zinc-500">{description}</label>
          </div>
        </div>)}</div>
      </fieldset>
      {dictationMode === 'whisprflow' && <div className="mt-3">
        <div className="flex items-center gap-1 text-sm text-zinc-300"><label htmlFor="wispr-api-key">Wispr Flow API key</label><SettingInfoButton settingName={settingHelp.wisprKey.title} onOpen={() => setActiveHelp(settingHelp.wisprKey)} />{settings.hasWhisprflowApiKey && <span className="text-xs text-zinc-500">(configured)</span>}</div>
        <input id="wispr-api-key" type="password" value={wisprKey} onChange={(event) => setWisprKey(event.target.value)} placeholder="Replace API key..." autoComplete="off" className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
      </div>}

      <fieldset className="mt-6 border-t border-white/10 pt-4"><legend className="text-sm font-medium text-zinc-200"><span className="inline-flex items-center gap-1">AI assistant<SettingInfoButton settingName={settingHelp.aiAssistant.title} onOpen={() => setActiveHelp(settingHelp.aiAssistant)} /></span></legend>
        <div className="mt-2 flex items-center gap-1 text-sm text-zinc-300">AI provider<SettingInfoButton settingName={settingHelp.aiProvider.title} onOpen={() => setActiveHelp(settingHelp.aiProvider)} /></div>
        <div data-tour="settings-providers" className="mt-2 grid grid-cols-2 gap-2">{providerOptions.map((option) => <div data-tour={`provider-${option.provider}`} key={option.provider} className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm', provider === option.provider ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-zinc-400/30')}>
          <input id={`provider-${option.provider}`} type="radio" name="llmProvider" checked={provider === option.provider} onChange={() => { setProvider(option.provider); setModels([]); setModel(''); setPluginWizardModel(''); setImageRecognitionModel(''); setStatus(null); setImageRecognitionStatus(null) }} className="accent-yellow-500" />
          <label htmlFor={`provider-${option.provider}`} className="min-w-0 cursor-pointer truncate text-zinc-200">{option.label}</label>
          <SettingInfoButton settingName={option.help.title} onOpen={() => setActiveHelp(option.help)} />
        </div>)}</div>
        {provider === 'local' && <div className="mt-3">
          <div className="flex items-center gap-1 text-sm text-zinc-300"><label htmlFor="lm-studio-url">LM Studio URL</label><SettingInfoButton settingName={settingHelp.localUrl.title} onOpen={() => setActiveHelp(settingHelp.localUrl)} /></div>
          <input id="lm-studio-url" data-tour="lm-studio-url" value={localBaseUrl} onChange={(event) => setLocalBaseUrl(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
        </div>}
        <div className="mt-3">
          <div className="flex items-center gap-1 text-sm text-zinc-300"><label htmlFor="llm-api-key">{credentialLabel}</label><SettingInfoButton settingName={credentialHelp.title} onOpen={() => setActiveHelp(credentialHelp)} />{keyStatus(provider, settings) && <span className="text-xs text-zinc-500">(configured)</span>}</div>
          <input id="llm-api-key" data-tour="llm-credential" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Replace credential..." autoComplete="off" className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
        </div>
        <div className="mt-3 flex items-center gap-1">
          <button data-tour="settings-refresh-models" type="button" onClick={() => void refreshModels()} disabled={isLoadingModels} className="rounded-md border border-zinc-400/50 px-2 py-1 text-sm hover:bg-zinc-600/50 disabled:cursor-not-allowed disabled:opacity-40">{isLoadingModels ? 'Loading...' : 'Refresh models'}</button>
          <SettingInfoButton settingName={settingHelp.refreshModels.title} onOpen={() => setActiveHelp(settingHelp.refreshModels)} />
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-1 text-sm text-zinc-300"><label htmlFor="active-model">Active model</label><SettingInfoButton settingName={settingHelp.activeModel.title} onOpen={() => setActiveHelp(settingHelp.activeModel)} /></div>
          <select id="active-model" data-tour="settings-active-model" value={model} onChange={(event) => { setModel(event.target.value); setStatus(null) }} className="mt-1 w-full rounded-md border border-zinc-400/50 bg-zinc-900 px-2 py-1 outline-none">
            {!model && <option value="">Refresh models first</option>}
            {model && !models.some((item) => item.id === model) && <option value={model}>{model}</option>}
            {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            data-tour="settings-test-connection"
            type="button"
            onClick={() => void testConnection()}
            disabled={!model || isTesting}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              isVerifiedForCurrentSelection
                ? 'border-green-500/60 bg-green-500/10 text-green-300 hover:bg-green-500/20'
                : 'border-yellow-500/50 text-zinc-200 hover:bg-yellow-500/20',
              !model && 'border-zinc-700 bg-transparent text-zinc-500 hover:bg-transparent'
            )}
          >
            {isVerifiedForCurrentSelection && <LuCheck className="h-4 w-4" />}
            {isTesting ? 'Testing...' : 'Test connection'}
          </button>
          <SettingInfoButton settingName={settingHelp.testConnection.title} onOpen={() => setActiveHelp(settingHelp.testConnection)} />
          {status && <span className={cn('text-xs', status.tone === 'success' ? 'text-green-400' : status.tone === 'error' ? 'text-red-400' : 'text-zinc-400')} aria-live="polite">{status.message}</span>}
        </div>
        <div data-tour="settings-plugin-model" className="mt-4 border-t border-white/10 pt-3">
          <div className="flex items-center gap-1 text-sm text-zinc-300">
            <label htmlFor="plugin-wizard-model">AI Plugin Wizard model</label>
            <SettingInfoButton settingName={settingHelp.pluginWizardModel.title} onOpen={() => setActiveHelp(settingHelp.pluginWizardModel)} />
          </div>
          <select
            id="plugin-wizard-model"
            value={pluginWizardModel}
            onChange={(event) => setPluginWizardModel(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-400/50 bg-zinc-900 px-2 py-1 outline-none"
          >
            <option value="">{model ? `Active model (${models.find((item) => item.id === model)?.label ?? model})` : 'Active model'}</option>
            {pluginWizardModel && !models.some((item) => item.id === pluginWizardModel) && <option value={pluginWizardModel}>{pluginWizardModel}</option>}
            {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-zinc-500">Uses the current provider and credential. Active model is the default.</p>
        </div>
        <div data-tour="settings-image-model" className="mt-4 border-t border-white/10 pt-3">
          <div className={cn('flex items-center gap-1 text-sm', isImageRecognitionAvailableForDraft ? 'text-zinc-300' : 'text-zinc-500')}>
            <label htmlFor="image-recognition-model">Image recognition model</label>
            <SettingInfoButton settingName={settingHelp.imageRecognitionModel.title} onOpen={() => setActiveHelp(settingHelp.imageRecognitionModel)} />
          </div>
          <select
            id="image-recognition-model"
            value={imageRecognitionModel}
            disabled={!isImageRecognitionAvailableForDraft}
            onChange={(event) => { setImageRecognitionModel(event.target.value); setImageRecognitionStatus(null) }}
            className="mt-1 w-full rounded-md border border-zinc-400/50 bg-zinc-900 px-2 py-1 outline-none disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-600"
          >
            {!imageRecognitionModel && <option value="">{isImageRecognitionAvailableForDraft ? 'Refresh models first' : 'No vision-capable model available'}</option>}
            {canKeepCurrentImageModel && !visionModels.some((item) => item.id === imageRecognitionModel) && <option value={imageRecognitionModel}>{imageRecognitionModel}</option>}
            {visionModels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            {provider === 'local'
              ? isImageRecognitionAvailableForDraft
                ? 'Only loaded LM Studio models explicitly marked as vision-capable are listed.'
                : 'Refresh models after loading a VLM in LM Studio. Unknown local model capabilities stay disabled.'
              : 'Only conservatively identified vision-capable models from this provider are listed.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              data-tour="settings-test-image"
              type="button"
              onClick={() => void testImageRecognition()}
              disabled={!imageRecognitionModel || isTestingImageRecognition || !isImageRecognitionAvailableForDraft}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                isImageRecognitionVerified
                  ? 'border-green-500/60 bg-green-500/10 text-green-300 hover:bg-green-500/20'
                  : 'border-yellow-500/50 text-zinc-200 hover:bg-yellow-500/20',
                (!imageRecognitionModel || !isImageRecognitionAvailableForDraft) && 'border-zinc-700 bg-transparent text-zinc-500 hover:bg-transparent'
              )}
            >
              {isImageRecognitionVerified && <LuCheck className="h-4 w-4" />}
              {isTestingImageRecognition ? 'Testing...' : 'Test image recognition'}
            </button>
            <SettingInfoButton settingName={settingHelp.testImageRecognition.title} onOpen={() => setActiveHelp(settingHelp.testImageRecognition)} />
            {imageRecognitionStatus && <span className={cn('text-xs', imageRecognitionStatus.tone === 'success' ? 'text-green-400' : imageRecognitionStatus.tone === 'error' ? 'text-red-400' : 'text-zinc-400')} aria-live="polite">{imageRecognitionStatus.message}</span>}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1">
          <label className={cn('flex items-center gap-2 text-sm', isVerifiedForCurrentSelection ? 'text-zinc-300' : 'text-zinc-500')}>
            <input type="checkbox" checked={polishDictation} disabled={!isVerifiedForCurrentSelection} onChange={(event) => setPolishDictation(event.target.checked)} className="accent-yellow-500 disabled:cursor-not-allowed disabled:opacity-50" />
            Polish dictation with AI before review
          </label>
          <SettingInfoButton settingName={settingHelp.polishDictation.title} onOpen={() => setActiveHelp(settingHelp.polishDictation)} />
        </div>
        <div className="mt-3 flex items-center gap-1">
          <label className={cn('flex items-center gap-2 text-sm', isVerifiedForCurrentSelection ? 'text-zinc-300' : 'text-zinc-500')}>
            <input type="checkbox" checked={aiBlockNameSummary} disabled={!isVerifiedForCurrentSelection} onChange={(event) => setAiBlockNameSummary(event.target.checked)} className="accent-yellow-500 disabled:cursor-not-allowed disabled:opacity-50" />
            Note-block AI name summary
          </label>
          <SettingInfoButton settingName={settingHelp.aiBlockNameSummary.title} onOpen={() => setActiveHelp(settingHelp.aiBlockNameSummary)} />
        </div>
      </fieldset>
      <fieldset className="mt-6 border-t border-white/10 pt-4">
        <legend className="text-sm font-medium text-zinc-200">Google Calendar</legend>
        <p className="mt-2 text-xs text-zinc-500">Off by default. Only verified Prognotic items can be sent to Google; imported Google events require validation locally.</p>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={googleEnabled} onChange={(event) => setGoogleEnabled(event.target.checked)} className="accent-yellow-500" />
          Enable Google Calendar sync
        </label>

        {settings.googleCalendar.hasOAuthClient && !showGoogleOAuthFields && (
          <button type="button" onClick={() => setShowGoogleOAuthFields(true)} className="mt-3 text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300">Replace OAuth app configuration</button>
        )}
        {showGoogleOAuthFields && (
          <div className="mt-3 rounded-md border border-white/10 bg-zinc-950/30 p-3">
            <p className="text-xs text-zinc-400">Configure a Google Cloud Desktop OAuth client. These values are encrypted with Electron safeStorage; packaged environment credentials are also supported.</p>
            <label htmlFor="google-client-id" className="mt-2 block text-xs text-zinc-500">OAuth client ID</label>
            <input id="google-client-id" value={googleClientId} onChange={(event) => setGoogleClientId(event.target.value)} autoComplete="off" className="mt-1 w-full rounded-md border border-zinc-600 bg-transparent px-2 py-1 text-sm outline-none caret-yellow-500" />
            <label htmlFor="google-client-secret" className="mt-2 block text-xs text-zinc-500">OAuth client secret (optional for Desktop clients)</label>
            <input id="google-client-secret" type="password" value={googleClientSecret} onChange={(event) => setGoogleClientSecret(event.target.value)} autoComplete="off" className="mt-1 w-full rounded-md border border-zinc-600 bg-transparent px-2 py-1 text-sm outline-none caret-yellow-500" />
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {settings.googleCalendar.isConnected ? (
            <button type="button" disabled={isGoogleWorking} onClick={() => { void handleGoogleDisconnect() }} className="rounded-md border border-red-500/40 px-2 py-1 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50">Disconnect</button>
          ) : (
            <button type="button" disabled={isGoogleWorking || (!settings.googleCalendar.hasOAuthClient && !googleClientId.trim())} onClick={() => { void handleGoogleConnect() }} className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-50">Connect Google</button>
          )}
          {settings.googleCalendar.connectedEmail && <span className="text-xs text-zinc-400">{settings.googleCalendar.connectedEmail}</span>}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <label className={cn('flex items-center gap-2 rounded-md border border-white/10 px-2 py-2 text-sm', !googleEnabled && 'text-zinc-600')}>
            <input type="checkbox" checked={googlePushEnabled} disabled={!googleEnabled} onChange={(event) => setGooglePushEnabled(event.target.checked)} className="accent-yellow-500" />
            Prognotic → Google
          </label>
          <label className={cn('flex items-center gap-2 rounded-md border border-white/10 px-2 py-2 text-sm', !googleEnabled && 'text-zinc-600')}>
            <input type="checkbox" checked={googlePullEnabled} disabled={!googleEnabled} onChange={(event) => setGooglePullEnabled(event.target.checked)} className="accent-yellow-500" />
            Google → Prognotic
          </label>
        </div>

        <div className="mt-3">
          <label htmlFor="google-auto-sync" className="text-xs text-zinc-500">Automatic sync interval</label>
          <select id="google-auto-sync" value={googleAutoSyncMinutes} disabled={!googleEnabled} onChange={(event) => setGoogleAutoSyncMinutes(Number(event.target.value))} className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm disabled:text-zinc-600">
            <option value={0}>Manual only</option>
            <option value={15}>Every 15 minutes</option>
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every hour</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={isGoogleWorking || !googleEnabled || !settings.googleCalendar.isConnected || (!googlePushEnabled && !googlePullEnabled)} onClick={() => { void handleGoogleSync() }} className="rounded-md border border-zinc-500 px-2 py-1 text-sm hover:bg-zinc-700 disabled:opacity-40">{isGoogleWorking ? 'Working…' : 'Sync now'}</button>
          {settings.googleCalendar.lastSyncAt && <span className="text-xs text-zinc-500">Last sync {new Intl.DateTimeFormat(window.context.locale, { dateStyle: 'short', timeStyle: 'short' }).format(settings.googleCalendar.lastSyncAt)}</span>}
        </div>
        {(googleStatus || settings.googleCalendar.lastSyncMessage) && (
          <p className={cn('mt-2 text-xs', googleStatus?.tone === 'error' || (!googleStatus && settings.googleCalendar.lastSyncStatus === 'error') ? 'text-red-400' : googleStatus?.tone === 'success' ? 'text-green-400' : 'text-zinc-400')} role="status">
            {googleStatus?.message ?? settings.googleCalendar.lastSyncMessage}
          </p>
        )}
      </fieldset>
      <fieldset className="mt-6 border-t border-white/10 pt-4">
        <legend className="text-sm font-medium text-zinc-200">Plugins</legend>
        <p className="mt-2 text-xs text-zinc-500">Browse folders installed in your local vault, enable them, and edit their configuration.</p>
        <button data-tour="settings-plugins" type="button" onClick={() => setIsPluginManagerOpen(true)} className="mt-2 rounded-md border border-zinc-400/50 px-2 py-1 text-sm hover:bg-zinc-600/50">Manage plugins</button>
      </fieldset>
      <div className="mt-6 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => { startTour(); onClose() }}
          className="rounded-md border border-zinc-400/50 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-600/50"
        >
          Restart tour
        </button>
        <p className="mt-1 text-xs text-zinc-500">Replay the onboarding walkthrough from the beginning.</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-zinc-400/50 px-2 py-1 text-sm hover:bg-zinc-600/50">Cancel</button>
        <button data-tour="settings-save" type="button" onClick={() => void handleSave()} className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm hover:bg-yellow-500/20">Save</button>
      </div>
    </div>
    {activeHelp && <SettingInfoModal title={activeHelp.title} body={activeHelp.body} onClose={() => setActiveHelp(null)} />}
    {isPluginManagerOpen && <PluginManagerModal onClose={() => setIsPluginManagerOpen(false)} />}
  </div>
}
