import { useCalendarActions, useI18n, useOnboarding, useOnboardingActions, useSettings, useSettingsActions } from '@renderer/context'
import type { Translate } from '@renderer/i18n'
import { cn, formatEstimatedUsd } from '@renderer/utils'
import { assistantDisplayName, maxGlossaryKeyLengthLimit, minGlossaryKeyLengthLimit } from '@shared/constants'
import { clampGlossaryKeyMaxLength } from '@shared/glossary'
import { isImageRecognitionSelectionVerified, isLlmSelectionVerified } from '@shared/llmSettings'
import { LlmUsageSummary } from '@shared/llmUsage'
import { DictationMode, LlmProvider, LlmUsageResetInterval, UiLocale } from '@shared/models'
import { LlmModel } from '@shared/types'
import { filterVisionModels, isImageRecognitionAvailable } from '@shared/vision'
import { JSX, useEffect, useId, useMemo, useState } from 'react'
import { LuCheck, LuX } from 'react-icons/lu'
import { dispatchOnboardingEvent, onboardingEvents } from '@renderer/onboarding/events'
import { resolveTourTargetSelectors } from '@renderer/onboarding/tourLogic'
import { ExperimentalBadge } from './ExperimentalBadge'
import { LlmUsageModal } from './LlmUsageModal'
import { PluginManagerModal } from './PluginManagerModal'
import { SettingInfoButton } from './SettingInfoButton'
import { SettingInfoModal } from './SettingInfoModal'

export type SettingsModalProps = {
  initialSection?: SettingsSection
  onClose: () => void
}

type SettingHelp = { title: string; body: string }
type DictationOption = { mode: DictationMode; label: string; description: string; help: SettingHelp }
type Status = { message: string; tone: 'neutral' | 'success' | 'error' }

export type SettingsSection =
  | 'general'
  | 'dictation'
  | 'ai-connection'
  | 'ai-models'
  | 'ai-features'
  | 'ai-usage'
  | 'calendar'
  | 'plugins'
  | 'help'

// Every panel stays mounted (hidden with CSS) so tour selectors always
// resolve, but the tour engine only anchors to visible elements — this map
// switches the active section to reveal the panel a tour step targets.
const tourTargetSections: Record<string, SettingsSection> = {
  'settings-providers': 'ai-connection',
  'provider-gemini': 'ai-connection',
  'provider-openai': 'ai-connection',
  'provider-anthropic': 'ai-connection',
  'provider-local': 'ai-connection',
  'lm-studio-url': 'ai-connection',
  'llm-credential': 'ai-connection',
  'settings-refresh-models': 'ai-connection',
  'settings-active-model': 'ai-connection',
  'settings-test-connection': 'ai-connection',
  'settings-plugin-model': 'ai-models',
  'settings-image-model': 'ai-models',
  'settings-test-image': 'ai-models',
  'settings-plugins': 'plugins'
}

const dataTourKeyPattern = /^\[data-tour="([^"\\]+)"\]$/

const dictationOptionsForPlatform = (platform: NodeJS.Platform, t: Translate): DictationOption[] => {
  const native: DictationOption[] = platform === 'win32'
    ? [{
        mode: 'windows',
        label: t('settings.help.windows.title'),
        description: t('settings.help.windows.description'),
        help: {
          title: t('settings.help.windows.title'),
          body: t('settings.help.windows.body')
        }
      }]
    : platform === 'darwin'
      ? [{
          mode: 'macos',
          label: t('settings.help.macos.title'),
          description: t('settings.help.macos.description'),
          help: {
            title: t('settings.help.macos.title'),
            body: t('settings.help.macos.body')
          }
        }]
      : []
  return [
    ...native,
    {
      mode: 'whisprflow',
      label: 'Wispr Flow',
      description: t('settings.help.wispr.description'),
      help: {
        title: 'Wispr Flow',
        body: t('settings.help.wispr.body')
      }
    }
  ]
}

const providerMetadata: { provider: LlmProvider; label: string }[] = [
  {
    provider: 'gemini',
    label: 'Google Gemini'
  },
  {
    provider: 'openai',
    label: 'OpenAI'
  },
  {
    provider: 'anthropic',
    label: 'Claude'
  },
  {
    provider: 'local',
    label: 'LM Studio'
  }
]

const keyStatus = (provider: LlmProvider, settings: ReturnType<typeof useSettings>['settings']): boolean => ({
  gemini: settings.hasGeminiApiKey,
  openai: settings.hasOpenaiApiKey,
  anthropic: settings.hasAnthropicApiKey,
  local: settings.hasLocalApiToken
}[provider])

export const SettingsModal = ({ initialSection = 'general', onClose }: SettingsModalProps): JSX.Element => {
  const { settings } = useSettings()
  const { formatDateTime, t } = useI18n()
  const { updateSettings } = useSettingsActions()
  const { startTour } = useOnboardingActions()
  const { currentStep: tourStep, phase: tourPhase, runtime: tourRuntime } = useOnboarding()
  const { configureGoogle, connectGoogle, disconnectGoogle, syncGoogleNow } = useCalendarActions()
  const titleId = useId()
  const settingHelp = {
    noteBlockWindow: { title: t('settings.help.blockWindow.title'), body: t('settings.help.blockWindow.body') },
    glossaryKeyMax: { title: t('settings.help.glossaryKeyMax.title'), body: t('settings.help.glossaryKeyMax.body') },
    dictationMode: { title: t('settings.help.dictation.title'), body: t('settings.help.dictation.body') },
    wisprKey: { title: t('settings.help.wisprKey.title'), body: t('settings.help.wisprKey.body') },
    aiProvider: { title: t('settings.help.aiProvider.title'), body: t('settings.help.aiProvider.body') },
    aiAssistant: { title: t('settings.help.aiAssistant.title'), body: t('settings.help.aiAssistant.body') },
    localUrl: { title: t('settings.localUrl'), body: t('settings.help.localUrl.body') },
    refreshModels: { title: t('settings.help.refreshModels.title'), body: t('settings.help.refreshModels.body') },
    activeModel: { title: t('settings.help.activeModel.title'), body: t('settings.help.activeModel.body') },
    pluginWizardModel: { title: t('settings.help.pluginWizardModel.title'), body: t('settings.help.pluginWizardModel.body') },
    testConnection: { title: t('settings.help.testConnection.title'), body: t('settings.help.testConnection.body') },
    imageRecognitionModel: { title: t('settings.help.imageModel.title'), body: t('settings.help.imageModel.body') },
    testImageRecognition: { title: t('settings.help.testImage.title'), body: t('settings.help.testImage.body') },
    polishDictation: { title: t('settings.help.polish.title'), body: t('settings.help.polish.body') },
    aiBlockNameSummary: { title: t('settings.help.aiBlockName.title'), body: t('settings.help.aiBlockName.body') }
  } satisfies Record<string, SettingHelp>
  const dictationOptions = dictationOptionsForPlatform(window.context.platform, t)
  const providerOptions = providerMetadata.map((option) => {
    const label = option.provider === 'local' ? t('settings.provider.local') : option.label
    return {
      ...option,
      label,
      help: {
        title: label,
        body: option.provider === 'gemini'
          ? t('settings.help.gemini')
          : option.provider === 'openai'
            ? t('settings.help.openai')
            : option.provider === 'anthropic'
              ? t('settings.help.anthropic')
              : t('settings.help.local')
      }
    }
  })
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection)
  const [uiLocale, setUiLocale] = useState<UiLocale>(settings.uiLocale)
  const [blockWindowMinutes, setBlockWindowMinutes] = useState(String(settings.blockWindowMinutes))
  const [glossaryKeyMaxLength, setGlossaryKeyMaxLength] = useState(String(settings.glossaryKeyMaxLength))
  const [dictationMode, setDictationMode] = useState<DictationMode>(settings.dictationMode)
  const [provider, setProvider] = useState<LlmProvider>(settings.llm.provider)
  const [model, setModel] = useState(settings.llm.model)
  const [pluginWizardModel, setPluginWizardModel] = useState(settings.llm.pluginWizardModel)
  const [imageRecognitionModel, setImageRecognitionModel] = useState(settings.llm.imageRecognitionModel)
  const [localBaseUrl, setLocalBaseUrl] = useState(settings.llm.localBaseUrl)
  const [polishDictation, setPolishDictation] = useState(settings.llm.polishDictation)
  const [aiBlockNameSummary, setAiBlockNameSummary] = useState(settings.llm.aiBlockNameSummary)
  const [usageBudgetEnabled, setUsageBudgetEnabled] = useState(settings.llm.usageBudget.enabled)
  const [usageLimitUsd, setUsageLimitUsd] = useState(String(settings.llm.usageBudget.limitUsd))
  const [usageResetInterval, setUsageResetInterval] = useState<LlmUsageResetInterval>(settings.llm.usageBudget.resetInterval)
  const [usageResetDays, setUsageResetDays] = useState(String(settings.llm.usageBudget.resetDays))
  const [usageYellowThreshold, setUsageYellowThreshold] = useState(String(settings.llm.usageBudget.thresholds.yellow))
  const [usageRedThreshold, setUsageRedThreshold] = useState(String(settings.llm.usageBudget.thresholds.red))
  const [usageCriticalThreshold, setUsageCriticalThreshold] = useState(String(settings.llm.usageBudget.thresholds.critical))
  const [usagePeriodStartedAt, setUsagePeriodStartedAt] = useState(settings.llm.usageBudget.periodStartedAt)
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
  const [usageSummary, setUsageSummary] = useState<LlmUsageSummary | null>(null)
  const [isUsageDetailsOpen, setIsUsageDetailsOpen] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(settings.googleCalendar.enabled)
  const [googlePushEnabled, setGooglePushEnabled] = useState(settings.googleCalendar.pushEnabled)
  const [googlePullEnabled, setGooglePullEnabled] = useState(settings.googleCalendar.pullEnabled)
  const [googleAutoSyncMinutes, setGoogleAutoSyncMinutes] = useState(settings.googleCalendar.autoSyncMinutes)
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleClientSecret, setGoogleClientSecret] = useState('')
  const [showGoogleOAuthFields, setShowGoogleOAuthFields] = useState(!settings.googleCalendar.hasOAuthClient)
  const [googleStatus, setGoogleStatus] = useState<Status | null>(null)
  const [isGoogleWorking, setIsGoogleWorking] = useState(false)

  const parsedUsageLimitUsd = Number(usageLimitUsd)
  const usageLimitValid = usageLimitUsd.trim() === '' || Number.isFinite(parsedUsageLimitUsd) && parsedUsageLimitUsd >= 0
  const parsedUsageResetDays = Number(usageResetDays)
  const usageResetDaysValid = usageResetDays.trim() !== '' && Number.isInteger(parsedUsageResetDays) && parsedUsageResetDays >= 1
  const enteredUsageThresholds = {
    yellow: Number(usageYellowThreshold),
    red: Number(usageRedThreshold),
    critical: Number(usageCriticalThreshold)
  }
  const usageThresholdsValid = [usageYellowThreshold, usageRedThreshold, usageCriticalThreshold].every((value) => value.trim() !== '') &&
    Object.values(enteredUsageThresholds).every((value) => Number.isInteger(value) && value >= 0 && value <= 100) &&
    enteredUsageThresholds.yellow < enteredUsageThresholds.red &&
    enteredUsageThresholds.red < enteredUsageThresholds.critical
  const draftUsageBudget = {
    enabled: usageBudgetEnabled,
    limitUsd: usageLimitValid
      ? Math.round(Math.max(0, parsedUsageLimitUsd || 0) * 100) / 100
      : settings.llm.usageBudget.limitUsd,
    resetInterval: usageResetInterval,
    resetDays: usageResetDaysValid ? parsedUsageResetDays : settings.llm.usageBudget.resetDays,
    thresholds: usageThresholdsValid ? enteredUsageThresholds : settings.llm.usageBudget.thresholds,
    periodStartedAt: usagePeriodStartedAt
  }
  const usageBudgetDraftValid = !usageBudgetEnabled || (
    usageLimitValid &&
    usageThresholdsValid &&
    (usageResetInterval !== 'days' || usageResetDaysValid)
  )
  const draftLlm = {
    provider,
    model,
    pluginWizardModel,
    imageRecognitionModel,
    localBaseUrl,
    polishDictation,
    aiBlockNameSummary,
    usageBudget: draftUsageBudget,
    verifiedConnection: settings.llm.verifiedConnection,
    verifiedImageRecognitionConnection: settings.llm.verifiedImageRecognitionConnection
  }
  const draftLlmForConnection = {
    ...draftLlm,
    // Refresh/test actions must persist the provider selection for main, but
    // budget edits still belong to the modal's explicit Save action.
    usageBudget: settings.llm.usageBudget
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
    ? t('settings.localToken')
    : t('settings.providerKey', { provider: providerOptions.find((item) => item.provider === provider)?.label ?? provider })
  const credentialHelp: SettingHelp = {
    title: credentialLabel,
    body: provider === 'local'
      ? t('settings.help.localToken')
      : t('settings.help.cloudKey')
  }
  const persistedGoogleStatus: Status | null = settings.googleCalendar.lastSyncMessage
    ? settings.googleCalendar.lastSyncStatus === 'error'
      ? { message: t('settings.error.googleSync'), tone: 'error' }
      : settings.googleCalendar.lastSyncStatus === 'success'
        ? { message: t('settings.googleSynced'), tone: 'success' }
        : {
            message: settings.googleCalendar.isConnected
              ? t('settings.googleConnected')
              : t('settings.googleDisconnected'),
            tone: 'neutral'
          }
    : null
  const displayedGoogleStatus = googleStatus ?? persistedGoogleStatus

  const navGroups: { heading?: string; items: { section: SettingsSection; label: string }[] }[] = [
    {
      items: [
        { section: 'general', label: t('settings.nav.general') },
        { section: 'dictation', label: t('settings.dictation') }
      ]
    },
    {
      heading: t('settings.nav.ai'),
      items: [
        { section: 'ai-connection', label: t('settings.nav.aiConnection') },
        { section: 'ai-models', label: t('settings.nav.aiModels') },
        { section: 'ai-features', label: t('settings.nav.aiFeatures') },
        { section: 'ai-usage', label: t('settings.nav.aiUsage') }
      ]
    },
    {
      items: [
        { section: 'calendar', label: t('settings.googleCalendar') },
        { section: 'plugins', label: t('navigation.plugins') },
        { section: 'help', label: t('settings.nav.help') }
      ]
    }
  ]

  // Section that hosts the active tour step's target, or null when the tour
  // is inactive or targets something outside this modal.
  const tourSection = useMemo<SettingsSection | null>(() => {
    if (tourPhase !== 'tour' || !tourStep) return null
    for (const selector of resolveTourTargetSelectors(tourStep.target, tourRuntime)) {
      const key = dataTourKeyPattern.exec(selector)?.[1]
      const section = key ? tourTargetSections[key] : undefined
      if (section) return section
    }
    return null
  }, [tourPhase, tourRuntime, tourStep])

  // Jump only when the tour advances to a step anchored in another panel;
  // manual navigation between steps is left alone.
  useEffect(() => {
    if (tourSection) setActiveSection(tourSection)
  }, [tourSection])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && activeHelp === null && !isPluginManagerOpen && !isUsageDetailsOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeHelp, isPluginManagerOpen, isUsageDetailsOpen, onClose])

  // Refreshed each time Settings opens, so usage from AI calls made since the
  // last visit is reflected without restarting the app.
  useEffect(() => {
    let cancelled = false
    window.context.getLlmUsageSummary()
      .then((summary) => { if (!cancelled) setUsageSummary(summary) })
      .catch(() => { /* The usage row keeps its $0.00 placeholder. */ })
    return () => { cancelled = true }
  }, [])

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
      await updateSettings({ llm: draftLlmForConnection })
      if (apiKey.trim()) {
        await window.context.setCredential(provider, apiKey)
        await updateSettings({})
      }
      const result = await window.context.getLlmModels(provider)
      if ('error' in result) {
        setModels([])
        setStatus({ message: t('settings.error.models'), tone: 'error' })
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
    } catch {
      setModels([])
      setStatus({ message: t('settings.error.models'), tone: 'error' })
    } finally {
      setIsLoadingModels(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!usageBudgetDraftValid) {
      setActiveSection('ai-usage')
      return
    }
    const parsed = Math.round(Number(blockWindowMinutes))
    const minutes = Number.isFinite(parsed) && parsed >= 1 ? parsed : settings.blockWindowMinutes
    const parsedGlossaryMax = Math.round(Number(glossaryKeyMaxLength))
    const glossaryMax = Number.isFinite(parsedGlossaryMax) && glossaryKeyMaxLength.trim() !== ''
      ? clampGlossaryKeyMaxLength(parsedGlossaryMax)
      : settings.glossaryKeyMaxLength
    if (googleClientId.trim()) {
      const configured = await configureGoogle(googleClientId, googleClientSecret)
      if (!configured.ok) {
        setGoogleStatus({ message: t('settings.error.googleConfig'), tone: 'error' })
        return
      }
    }
    await updateSettings({
      uiLocale,
      blockWindowMinutes: minutes,
      glossaryKeyMaxLength: glossaryMax,
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
    setGoogleStatus({ message: t('settings.googleOpening'), tone: 'neutral' })
    try {
      if (googleClientId.trim()) {
        const configured = await configureGoogle(googleClientId, googleClientSecret)
        if (!configured.ok) {
          setGoogleStatus({ message: t('settings.error.googleConfig'), tone: 'error' })
          return
        }
      }
      const result = await connectGoogle()
      setGoogleStatus(result.ok
        ? { message: t('settings.googleConnected'), tone: 'success' }
        : { message: t('settings.error.googleConnect'), tone: 'error' })
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
        ? { message: t('settings.googleDisconnected'), tone: 'success' }
        : { message: t('settings.error.googleDisconnect'), tone: 'error' })
      if (result.ok) setGoogleEnabled(false)
    } finally {
      setIsGoogleWorking(false)
    }
  }

  const handleGoogleSync = async (): Promise<void> => {
    if (isGoogleWorking) return
    setIsGoogleWorking(true)
    setGoogleStatus({ message: t('settings.googleSyncing'), tone: 'neutral' })
    try {
      await updateSettings({ googleCalendar: draftGoogleCalendar })
      const result = await syncGoogleNow()
      setGoogleStatus(result.ok
        ? { message: t('settings.googleSynced'), tone: 'success' }
        : { message: t('settings.error.googleSync'), tone: 'error' })
    } finally {
      setIsGoogleWorking(false)
    }
  }

  const testConnection = async (): Promise<void> => {
    if (!model || isTesting) return
    setIsTesting(true)
    setStatus({ message: t('settings.connectionTesting'), tone: 'neutral' })
    try {
      await updateSettings({ llm: draftLlmForConnection })
      if (apiKey.trim()) {
        await window.context.setCredential(provider, apiKey)
        await updateSettings({})
      }
      const result = await window.context.testLlmConnection()
      // The main process persists or clears verification as part of the test;
      // refresh renderer settings without changing the saved checkbox values.
      await updateSettings({})
      setStatus(result.ok
        ? { message: t('settings.connectionSucceeded'), tone: 'success' }
        : { message: t('settings.connectionFailed'), tone: 'error' })
    } catch {
      try {
        await updateSettings({})
      } catch {
        // Keep the original test failure visible if settings refresh also fails.
      }
      setStatus({ message: t('settings.connectionFailed'), tone: 'error' })
    } finally {
      setIsTesting(false)
    }
  }

  const testImageRecognition = async (): Promise<void> => {
    if (!imageRecognitionModel || isTestingImageRecognition || !isImageRecognitionAvailableForDraft) return
    setIsTestingImageRecognition(true)
    setImageRecognitionStatus({ message: t('settings.imageTesting'), tone: 'neutral' })
    try {
      await updateSettings({ llm: draftLlmForConnection })
      if (apiKey.trim()) {
        await window.context.setCredential(provider, apiKey)
        await updateSettings({})
      }
      const result = await window.context.testImageRecognitionConnection()
      await updateSettings({})
      setImageRecognitionStatus(result.ok
        ? { message: t('settings.imageSucceeded'), tone: 'success' }
        : { message: t('settings.imageFailed'), tone: 'error' })
    } catch {
      try {
        await updateSettings({})
      } catch {
        // Keep the original test failure visible if settings refresh also fails.
      }
      setImageRecognitionStatus({
        message: t('settings.imageFailed'),
        tone: 'error'
      })
    } finally {
      setIsTestingImageRecognition(false)
    }
  }

  // Backdrop clicks are intentionally inert: long drafts are only dismissed
  // through the explicit Close, Cancel, or Save controls.
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 id={titleId} className="font-bold">{t('settings.title')}</h2>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
        >
          <LuX className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav aria-label={t('settings.title')} className="w-40 shrink-0 overflow-y-auto border-r border-white/10 p-2 sm:w-48">
          {navGroups.map((group, groupIndex) => <div key={group.heading ?? groupIndex}>
            {group.heading && <p className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{group.heading}</p>}
            {group.items.map((item) => <button
              key={item.section}
              type="button"
              onClick={() => setActiveSection(item.section)}
              aria-current={activeSection === item.section ? 'page' : undefined}
              className={cn(
                'mt-0.5 block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                group.heading && 'pl-4',
                activeSection === item.section
                  ? 'bg-yellow-500/10 text-yellow-200'
                  : 'text-zinc-300 hover:bg-zinc-700/50'
              )}
            >
              {item.label}
            </button>)}
          </div>)}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <section className={cn(activeSection !== 'general' && 'hidden')}>
            <h3 className="text-sm font-medium text-zinc-200">{t('settings.nav.general')}</h3>
            <div className="mt-3">
              <div className="flex items-center gap-1 text-sm text-zinc-300">
                <label htmlFor="ui-language">{t('settings.language')}</label>
                <SettingInfoButton
                  settingName={t('settings.language')}
                  onOpen={() => setActiveHelp({ title: t('settings.language'), body: t('settings.languageHelp') })}
                />
              </div>
              <select
                id="ui-language"
                value={uiLocale}
                onChange={(event) => setUiLocale(event.target.value as UiLocale)}
                className="mt-1 w-full rounded-md border border-zinc-400/50 bg-zinc-900 px-2 py-1 outline-none"
              >
                <option value="en">{t('settings.language.en')}</option>
                <option value="hu">{t('settings.language.hu')}</option>
              </select>
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-1 text-sm text-zinc-300">
                <label htmlFor="block-window-minutes">{t('settings.noteWindow')}</label>
                <SettingInfoButton settingName={settingHelp.noteBlockWindow.title} onOpen={() => setActiveHelp(settingHelp.noteBlockWindow)} />
              </div>
              <input id="block-window-minutes" type="number" min={1} value={blockWindowMinutes} onChange={(event) => setBlockWindowMinutes(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-1 text-sm text-zinc-300">
                <label htmlFor="glossary-key-max-length">{t('settings.glossaryKeyMax')}</label>
                <SettingInfoButton settingName={settingHelp.glossaryKeyMax.title} onOpen={() => setActiveHelp(settingHelp.glossaryKeyMax)} />
              </div>
              <input id="glossary-key-max-length" type="number" min={minGlossaryKeyLengthLimit} max={maxGlossaryKeyLengthLimit} value={glossaryKeyMaxLength} onChange={(event) => setGlossaryKeyMaxLength(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
              <p className="mt-1 text-xs text-zinc-500">{t('settings.glossaryKeyMaxHelp', { min: minGlossaryKeyLengthLimit, max: maxGlossaryKeyLengthLimit })}</p>
            </div>
          </section>

          <div className={cn(activeSection !== 'dictation' && 'hidden')}>
            <fieldset>
              <legend className="text-sm font-medium text-zinc-200">
                <span className="inline-flex items-center gap-1">{t('settings.dictation')}
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
              <div className="flex items-center gap-1 text-sm text-zinc-300"><label htmlFor="wispr-api-key">{t('settings.wisprKey')}</label><SettingInfoButton settingName={settingHelp.wisprKey.title} onOpen={() => setActiveHelp(settingHelp.wisprKey)} />{settings.hasWhisprflowApiKey && <span className="text-xs text-zinc-500">{t('common.configured')}</span>}</div>
              <input id="wispr-api-key" type="password" value={wisprKey} onChange={(event) => setWisprKey(event.target.value)} placeholder={t('settings.replaceApiKey')} autoComplete="off" className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
            </div>}
          </div>

          <fieldset className={cn(activeSection !== 'ai-connection' && 'hidden')}>
            <legend className="text-sm font-medium text-zinc-200"><span className="inline-flex items-center gap-1">{assistantDisplayName} — {t('settings.nav.aiConnection')}<SettingInfoButton settingName={settingHelp.aiAssistant.title} onOpen={() => setActiveHelp(settingHelp.aiAssistant)} /></span></legend>
            <div className="mt-2 flex items-center gap-1 text-sm text-zinc-300">{t('settings.aiProvider')}<SettingInfoButton settingName={settingHelp.aiProvider.title} onOpen={() => setActiveHelp(settingHelp.aiProvider)} /></div>
            <div data-tour="settings-providers" className="mt-2 grid grid-cols-2 gap-2">{providerOptions.map((option) => <div data-tour={`provider-${option.provider}`} key={option.provider} className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm', provider === option.provider ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-zinc-400/30')}>
              <input id={`provider-${option.provider}`} type="radio" name="llmProvider" checked={provider === option.provider} onChange={() => { setProvider(option.provider); setModels([]); setModel(''); setPluginWizardModel(''); setImageRecognitionModel(''); setStatus(null); setImageRecognitionStatus(null) }} className="accent-yellow-500" />
              <label htmlFor={`provider-${option.provider}`} className="min-w-0 cursor-pointer truncate text-zinc-200">{option.label}</label>
              <SettingInfoButton settingName={option.help.title} onOpen={() => setActiveHelp(option.help)} />
            </div>)}</div>
            {provider === 'local' && <div className="mt-3">
              <div className="flex items-center gap-1 text-sm text-zinc-300"><label htmlFor="lm-studio-url">{t('settings.localUrl')}</label><SettingInfoButton settingName={settingHelp.localUrl.title} onOpen={() => setActiveHelp(settingHelp.localUrl)} /></div>
              <input id="lm-studio-url" data-tour="lm-studio-url" value={localBaseUrl} onChange={(event) => setLocalBaseUrl(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
            </div>}
            <div className="mt-3">
              <div className="flex items-center gap-1 text-sm text-zinc-300"><label htmlFor="llm-api-key">{credentialLabel}</label><SettingInfoButton settingName={credentialHelp.title} onOpen={() => setActiveHelp(credentialHelp)} />{keyStatus(provider, settings) && <span className="text-xs text-zinc-500">{t('common.configured')}</span>}</div>
              <input id="llm-api-key" data-tour="llm-credential" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={t('settings.replaceCredential')} autoComplete="off" className="mt-1 w-full rounded-md border border-zinc-400/50 bg-transparent px-2 py-1 outline-none caret-yellow-500" />
            </div>
            <div className="mt-3 flex items-center gap-1">
              <button data-tour="settings-refresh-models" type="button" onClick={() => void refreshModels()} disabled={isLoadingModels} className="rounded-md border border-zinc-400/50 px-2 py-1 text-sm hover:bg-zinc-600/50 disabled:cursor-not-allowed disabled:opacity-40">{isLoadingModels ? t('common.loading') : t('settings.refreshModels')}</button>
              <SettingInfoButton settingName={settingHelp.refreshModels.title} onOpen={() => setActiveHelp(settingHelp.refreshModels)} />
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-1 text-sm text-zinc-300"><label htmlFor="active-model">{t('settings.activeModel')}</label><SettingInfoButton settingName={settingHelp.activeModel.title} onOpen={() => setActiveHelp(settingHelp.activeModel)} /></div>
              <select id="active-model" data-tour="settings-active-model" value={model} onChange={(event) => { setModel(event.target.value); setStatus(null) }} className="mt-1 w-full rounded-md border border-zinc-400/50 bg-zinc-900 px-2 py-1 outline-none">
                {!model && <option value="">{t('settings.refreshFirst')}</option>}
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
                {isTesting ? t('settings.testing') : t('settings.testConnection')}
              </button>
              <SettingInfoButton settingName={settingHelp.testConnection.title} onOpen={() => setActiveHelp(settingHelp.testConnection)} />
              {status && <span className={cn('text-xs', status.tone === 'success' ? 'text-green-400' : status.tone === 'error' ? 'text-red-400' : 'text-zinc-400')} aria-live="polite">{status.message}</span>}
            </div>
          </fieldset>

          <section className={cn(activeSection !== 'ai-models' && 'hidden')}>
            <h3 className="text-sm font-medium text-zinc-200">{assistantDisplayName} — {t('settings.nav.aiModels')}</h3>
            <div data-tour="settings-plugin-model" className="mt-3">
              <div className="flex items-center gap-1 text-sm text-zinc-300">
                <label htmlFor="plugin-wizard-model">{t('settings.pluginWizardModel')}</label>
                <SettingInfoButton settingName={settingHelp.pluginWizardModel.title} onOpen={() => setActiveHelp(settingHelp.pluginWizardModel)} />
              </div>
              <select
                id="plugin-wizard-model"
                value={pluginWizardModel}
                onChange={(event) => setPluginWizardModel(event.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-400/50 bg-zinc-900 px-2 py-1 outline-none"
              >
                <option value="">{model ? t('settings.activeModelOption', { model: models.find((item) => item.id === model)?.label ?? model }) : t('settings.activeModel')}</option>
                {pluginWizardModel && !models.some((item) => item.id === pluginWizardModel) && <option value={pluginWizardModel}>{pluginWizardModel}</option>}
                {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-zinc-500">{t('settings.pluginWizardModelHelp')}</p>
            </div>
            <div data-tour="settings-image-model" className="mt-4 border-t border-white/10 pt-3">
              <div className={cn('flex items-center gap-1 text-sm', isImageRecognitionAvailableForDraft ? 'text-zinc-300' : 'text-zinc-500')}>
                <label htmlFor="image-recognition-model">{t('settings.imageModel')}</label>
                <SettingInfoButton settingName={settingHelp.imageRecognitionModel.title} onOpen={() => setActiveHelp(settingHelp.imageRecognitionModel)} />
              </div>
              <select
                id="image-recognition-model"
                value={imageRecognitionModel}
                disabled={!isImageRecognitionAvailableForDraft}
                onChange={(event) => { setImageRecognitionModel(event.target.value); setImageRecognitionStatus(null) }}
                className="mt-1 w-full rounded-md border border-zinc-400/50 bg-zinc-900 px-2 py-1 outline-none disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-600"
              >
                {!imageRecognitionModel && <option value="">{isImageRecognitionAvailableForDraft ? t('settings.refreshFirst') : t('settings.noVisionModel')}</option>}
                {canKeepCurrentImageModel && !visionModels.some((item) => item.id === imageRecognitionModel) && <option value={imageRecognitionModel}>{imageRecognitionModel}</option>}
                {visionModels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-zinc-500">
                {provider === 'local'
                  ? isImageRecognitionAvailableForDraft
                    ? t('settings.visionLocalReady')
                    : t('settings.visionLocalUnavailable')
                  : t('settings.visionCloud')}
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
                  {isTestingImageRecognition ? t('settings.testing') : t('settings.testImage')}
                </button>
                <SettingInfoButton settingName={settingHelp.testImageRecognition.title} onOpen={() => setActiveHelp(settingHelp.testImageRecognition)} />
                {imageRecognitionStatus && <span className={cn('text-xs', imageRecognitionStatus.tone === 'success' ? 'text-green-400' : imageRecognitionStatus.tone === 'error' ? 'text-red-400' : 'text-zinc-400')} aria-live="polite">{imageRecognitionStatus.message}</span>}
              </div>
            </div>
          </section>

          <section className={cn(activeSection !== 'ai-features' && 'hidden')}>
            <h3 className="text-sm font-medium text-zinc-200">{assistantDisplayName} — {t('settings.nav.aiFeatures')}</h3>
            <div className="mt-3 flex items-center gap-1">
              <label className={cn('flex items-center gap-2 text-sm', isVerifiedForCurrentSelection ? 'text-zinc-300' : 'text-zinc-500')}>
                <input type="checkbox" checked={polishDictation} disabled={!isVerifiedForCurrentSelection} onChange={(event) => setPolishDictation(event.target.checked)} className="accent-yellow-500 disabled:cursor-not-allowed disabled:opacity-50" />
                {t('settings.polishDictation')}
              </label>
              <SettingInfoButton settingName={settingHelp.polishDictation.title} onOpen={() => setActiveHelp(settingHelp.polishDictation)} />
            </div>
            <div className="mt-3 flex items-center gap-1">
              <label className={cn('flex items-center gap-2 text-sm', isVerifiedForCurrentSelection ? 'text-zinc-300' : 'text-zinc-500')}>
                <input type="checkbox" checked={aiBlockNameSummary} disabled={!isVerifiedForCurrentSelection} onChange={(event) => setAiBlockNameSummary(event.target.checked)} className="accent-yellow-500 disabled:cursor-not-allowed disabled:opacity-50" />
                {t('settings.aiBlockName')}
              </label>
              <SettingInfoButton settingName={settingHelp.aiBlockNameSummary.title} onOpen={() => setActiveHelp(settingHelp.aiBlockNameSummary)} />
            </div>
          </section>

          <section className={cn(activeSection !== 'ai-usage' && 'hidden')}>
            <h3 className="text-sm font-medium text-zinc-200">{assistantDisplayName} — {t('settings.nav.aiUsage')}</h3>
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                <span>{t('settings.aiUsage', { amount: formatEstimatedUsd(usageSummary?.totalEstimatedUsd ?? 0) })}</span>
                <button
                  type="button"
                  onClick={() => setIsUsageDetailsOpen(true)}
                  className="text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300"
                >
                  {t('settings.aiUsageDetails')}
                </button>
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                {t('settings.aiUsageCurrentPeriod', { amount: formatEstimatedUsd(usageSummary?.currentPeriod?.estimatedUsd ?? 0) })}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{t('settings.aiUsageEstimate')}</p>
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={usageBudgetEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked
                    setUsageBudgetEnabled(enabled)
                    if (enabled && usageResetInterval === 'days') setUsagePeriodStartedAt(Date.now())
                  }}
                  className="accent-yellow-500"
                />
                {t('settings.aiBudgetEnable')}
              </label>

              <div className={cn('mt-4 rounded-md border border-white/10 bg-zinc-950/30 p-3', !usageBudgetEnabled && 'opacity-50')} aria-disabled={!usageBudgetEnabled}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor="ai-budget-limit" className="text-xs text-zinc-400">
                    {t('settings.aiBudgetLimit')}
                    <input
                      id="ai-budget-limit"
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      disabled={!usageBudgetEnabled}
                      value={usageLimitUsd}
                      onChange={(event) => setUsageLimitUsd(event.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 outline-none caret-yellow-500 disabled:cursor-not-allowed"
                    />
                  </label>
                  <label htmlFor="ai-budget-reset" className="text-xs text-zinc-400">
                    {t('settings.aiBudgetResetInterval')}
                    <select
                      id="ai-budget-reset"
                      disabled={!usageBudgetEnabled}
                      value={usageResetInterval}
                      onChange={(event) => {
                        const interval = event.target.value as LlmUsageResetInterval
                        setUsageResetInterval(interval)
                        if (interval === 'days') setUsagePeriodStartedAt(Date.now())
                      }}
                      className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 disabled:cursor-not-allowed"
                    >
                      <option value="forever">{t('settings.aiBudgetForever')}</option>
                      <option value="monthly">{t('settings.aiBudgetMonthly')}</option>
                      <option value="yearly">{t('settings.aiBudgetYearly')}</option>
                      <option value="days">{t('settings.aiBudgetCustomDays')}</option>
                    </select>
                  </label>
                </div>

                {usageResetInterval === 'days' && <label htmlFor="ai-budget-days" className="mt-3 block text-xs text-zinc-400">
                  {t('settings.aiBudgetDays')}
                  <input
                    id="ai-budget-days"
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    disabled={!usageBudgetEnabled}
                    value={usageResetDays}
                    onChange={(event) => { setUsageResetDays(event.target.value); setUsagePeriodStartedAt(Date.now()) }}
                    className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 outline-none caret-yellow-500 disabled:cursor-not-allowed"
                  />
                </label>}

                <fieldset className="mt-4" disabled={!usageBudgetEnabled}>
                  <legend className="text-xs font-medium text-zinc-300">{t('settings.aiBudgetThresholds')}</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label htmlFor="ai-budget-yellow" className="text-xs text-zinc-400">
                      {t('settings.aiBudgetYellow')}
                      <input id="ai-budget-yellow" type="number" min={0} max={100} step={1} value={usageYellowThreshold} onChange={(event) => setUsageYellowThreshold(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 outline-none caret-yellow-500 disabled:cursor-not-allowed" />
                    </label>
                    <label htmlFor="ai-budget-red" className="text-xs text-zinc-400">
                      {t('settings.aiBudgetRed')}
                      <input id="ai-budget-red" type="number" min={0} max={100} step={1} value={usageRedThreshold} onChange={(event) => setUsageRedThreshold(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 outline-none caret-yellow-500 disabled:cursor-not-allowed" />
                    </label>
                    <label htmlFor="ai-budget-critical" className="text-xs text-zinc-400">
                      {t('settings.aiBudgetCritical')}
                      <input id="ai-budget-critical" type="number" min={0} max={100} step={1} value={usageCriticalThreshold} onChange={(event) => setUsageCriticalThreshold(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 outline-none caret-yellow-500 disabled:cursor-not-allowed" />
                    </label>
                  </div>
                </fieldset>

                {usageBudgetEnabled && !usageLimitValid && <p className="mt-2 text-xs text-red-400" role="alert">{t('settings.aiBudgetLimitError')}</p>}
                {usageBudgetEnabled && usageResetInterval === 'days' && !usageResetDaysValid && <p className="mt-2 text-xs text-red-400" role="alert">{t('settings.aiBudgetDaysError')}</p>}
                {usageBudgetEnabled && !usageThresholdsValid && <p className="mt-2 text-xs text-red-400" role="alert">{t('settings.aiBudgetThresholdError')}</p>}
              </div>
              <p className="mt-2 text-xs text-zinc-500">{t('settings.aiBudgetHelp')}</p>
            </div>
          </section>

          <section className={cn(activeSection !== 'calendar' && 'hidden')}>
            <h3 className="text-sm font-medium text-zinc-200">{t('settings.googleCalendar')}</h3>
            <p className="mt-2 text-xs text-zinc-500">{t('settings.googleIntro')}</p>
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={googleEnabled} onChange={(event) => setGoogleEnabled(event.target.checked)} className="accent-yellow-500" />
              {t('settings.googleEnable')}
            </label>

            {settings.googleCalendar.hasOAuthClient && !showGoogleOAuthFields && (
              <button type="button" onClick={() => setShowGoogleOAuthFields(true)} className="mt-3 text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300">{t('settings.googleReplaceOAuth')}</button>
            )}
            {showGoogleOAuthFields && (
              <div className="mt-3 rounded-md border border-white/10 bg-zinc-950/30 p-3">
                <p className="text-xs text-zinc-400">{t('settings.googleOAuthIntro')}</p>
                <label htmlFor="google-client-id" className="mt-2 block text-xs text-zinc-500">{t('settings.googleClientId')}</label>
                <input id="google-client-id" value={googleClientId} onChange={(event) => setGoogleClientId(event.target.value)} autoComplete="off" className="mt-1 w-full rounded-md border border-zinc-600 bg-transparent px-2 py-1 text-sm outline-none caret-yellow-500" />
                <label htmlFor="google-client-secret" className="mt-2 block text-xs text-zinc-500">{t('settings.googleClientSecret')}</label>
                <input id="google-client-secret" type="password" value={googleClientSecret} onChange={(event) => setGoogleClientSecret(event.target.value)} autoComplete="off" className="mt-1 w-full rounded-md border border-zinc-600 bg-transparent px-2 py-1 text-sm outline-none caret-yellow-500" />
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {settings.googleCalendar.isConnected ? (
                <button type="button" disabled={isGoogleWorking} onClick={() => { void handleGoogleDisconnect() }} className="rounded-md border border-red-500/40 px-2 py-1 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50">{t('settings.googleDisconnect')}</button>
              ) : (
                <button type="button" disabled={isGoogleWorking || (!settings.googleCalendar.hasOAuthClient && !googleClientId.trim())} onClick={() => { void handleGoogleConnect() }} className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-50">{t('settings.googleConnect')}</button>
              )}
              {settings.googleCalendar.connectedEmail && <span className="text-xs text-zinc-400">{settings.googleCalendar.connectedEmail}</span>}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <label className={cn('flex items-center gap-2 rounded-md border border-white/10 px-2 py-2 text-sm', !googleEnabled && 'text-zinc-600')}>
                <input type="checkbox" checked={googlePushEnabled} disabled={!googleEnabled} onChange={(event) => setGooglePushEnabled(event.target.checked)} className="accent-yellow-500" />
                {t('settings.googlePush')}
              </label>
              <label className={cn('flex items-center gap-2 rounded-md border border-white/10 px-2 py-2 text-sm', !googleEnabled && 'text-zinc-600')}>
                <input type="checkbox" checked={googlePullEnabled} disabled={!googleEnabled} onChange={(event) => setGooglePullEnabled(event.target.checked)} className="accent-yellow-500" />
                {t('settings.googlePull')}
              </label>
            </div>

            <div className="mt-3">
              <label htmlFor="google-auto-sync" className="text-xs text-zinc-500">{t('settings.googleInterval')}</label>
              <select id="google-auto-sync" value={googleAutoSyncMinutes} disabled={!googleEnabled} onChange={(event) => setGoogleAutoSyncMinutes(Number(event.target.value))} className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm disabled:text-zinc-600">
                <option value={0}>{t('settings.googleManual')}</option>
                <option value={15}>{t('settings.googleEvery15')}</option>
                <option value={30}>{t('settings.googleEvery30')}</option>
                <option value={60}>{t('settings.googleEveryHour')}</option>
              </select>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={isGoogleWorking || !googleEnabled || !settings.googleCalendar.isConnected || (!googlePushEnabled && !googlePullEnabled)} onClick={() => { void handleGoogleSync() }} className="rounded-md border border-zinc-500 px-2 py-1 text-sm hover:bg-zinc-700 disabled:opacity-40">{isGoogleWorking ? t('common.working') : t('settings.googleSyncNow')}</button>
              {settings.googleCalendar.lastSyncAt && <span className="text-xs text-zinc-500">{t('settings.googleLastSync', { date: formatDateTime(settings.googleCalendar.lastSyncAt) })}</span>}
            </div>
            {displayedGoogleStatus && (
              <p className={cn('mt-2 text-xs', displayedGoogleStatus.tone === 'error' ? 'text-red-400' : displayedGoogleStatus.tone === 'success' ? 'text-green-400' : 'text-zinc-400')} role="status">
                {displayedGoogleStatus.message}
              </p>
            )}
          </section>

          <section className={cn(activeSection !== 'plugins' && 'hidden')}>
            <h3 className="text-sm font-medium text-zinc-200"><span className="inline-flex items-center gap-1.5">{t('navigation.plugins')} <ExperimentalBadge /></span></h3>
            <p className="mt-2 text-xs text-zinc-500">{t('settings.pluginsIntro')}</p>
            <button data-tour="settings-plugins" type="button" onClick={() => setIsPluginManagerOpen(true)} className="mt-2 rounded-md border border-zinc-400/50 px-2 py-1 text-sm hover:bg-zinc-600/50">{t('settings.managePlugins')}</button>
          </section>

          <section className={cn(activeSection !== 'help' && 'hidden')}>
            <h3 className="text-sm font-medium text-zinc-200">{t('settings.nav.help')}</h3>
            <button
              type="button"
              onClick={() => { startTour(); onClose() }}
              className="mt-3 rounded-md border border-zinc-400/50 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-600/50"
            >
              {t('settings.restartTour')}
            </button>
            <p className="mt-1 text-xs text-zinc-500">{t('settings.restartTourHelp')}</p>
          </section>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
        <button type="button" onClick={onClose} className="rounded-md border border-zinc-400/50 px-2 py-1 text-sm hover:bg-zinc-600/50">{t('common.cancel')}</button>
        <button data-tour="settings-save" type="button" disabled={!usageBudgetDraftValid} onClick={() => void handleSave()} className="rounded-md border border-yellow-500/50 px-2 py-1 text-sm hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-40">{t('common.save')}</button>
      </div>
    </div>
    {activeHelp && <SettingInfoModal title={activeHelp.title} body={activeHelp.body} onClose={() => setActiveHelp(null)} />}
    {isUsageDetailsOpen && <LlmUsageModal
      summary={usageSummary ?? { totalEstimatedUsd: 0, buckets: [] }}
      onClose={() => setIsUsageDetailsOpen(false)}
    />}
    {isPluginManagerOpen && <PluginManagerModal onClose={() => setIsPluginManagerOpen(false)} />}
  </div>
}
