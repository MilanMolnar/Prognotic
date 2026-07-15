import { assistantDisplayName } from '@shared/constants'
import type { LlmProvider } from '@shared/models'
import type { Translate, TranslationKey } from '@renderer/i18n'
import { resolveTourCopy } from './tourLogic'
import type { TourRuntimeContext, TourStep } from './types'

type LocalizedTourCopy = {
  section: string
  title: string
  body: string
  primaryLabel: string
}

const sectionKeys: Record<string, TranslationKey> = {
  Goals: 'onboarding.section.goals',
  Settings: 'onboarding.section.settings',
  'AI setup': 'onboarding.section.aiSetup',
  Plugins: 'onboarding.section.plugins',
  Capture: 'onboarding.section.capture',
  'Capture tools': 'onboarding.section.captureTools',
  'Note blocks': 'onboarding.section.noteBlocks',
  'Move and copy': 'onboarding.section.moveCopy',
  [assistantDisplayName]: 'onboarding.section.assistant',
  Complete: 'onboarding.section.complete'
}

const staticStepKeys: Record<string, { title: TranslationKey; body: TranslationKey }> = {
  'goals-new': {
    title: 'onboarding.step.goalsNew.title',
    body: 'onboarding.step.goalsNew.body'
  },
  'goals-create-work': {
    title: 'onboarding.step.goalsCreateWork.title',
    body: 'onboarding.step.goalsCreateWork.body'
  },
  'goals-work': {
    title: 'onboarding.step.goalsWork.title',
    body: 'onboarding.step.goalsWork.body'
  },
  'settings-open': {
    title: 'onboarding.step.settingsOpen.title',
    body: 'onboarding.step.settingsOpen.body'
  },
  'settings-overview': {
    title: 'onboarding.step.settingsOverview.title',
    body: 'onboarding.step.settingsOverview.body'
  },
  'settings-ai-choice': {
    title: 'onboarding.step.settingsAiChoice.title',
    body: 'onboarding.step.settingsAiChoice.body'
  },
  'ai-providers': {
    title: 'onboarding.step.aiProviders.title',
    body: 'onboarding.step.aiProviders.body'
  },
  'ai-refresh-models': {
    title: 'onboarding.step.aiRefreshModels.title',
    body: 'onboarding.step.aiRefreshModels.body'
  },
  'ai-active-model': {
    title: 'onboarding.step.aiActiveModel.title',
    body: 'onboarding.step.aiActiveModel.body'
  },
  'ai-test-connection': {
    title: 'onboarding.step.aiTestConnection.title',
    body: 'onboarding.step.aiTestConnection.body'
  },
  'ai-plugin-model': {
    title: 'onboarding.step.aiPluginModel.title',
    body: 'onboarding.step.aiPluginModel.body'
  },
  'ai-mention': {
    title: 'onboarding.step.aiMention.title',
    body: 'onboarding.step.aiMention.body'
  },
  'plugins-open': {
    title: 'onboarding.step.pluginsOpen.title',
    body: 'onboarding.step.pluginsOpen.body'
  },
  'plugins-dietary': {
    title: 'onboarding.step.pluginsDietary.title',
    body: 'onboarding.step.pluginsDietary.body'
  },
  'plugins-enable': {
    title: 'onboarding.step.pluginsEnable.title',
    body: 'onboarding.step.pluginsEnable.body'
  },
  'plugins-delete': {
    title: 'onboarding.step.pluginsDelete.title',
    body: 'onboarding.step.pluginsDelete.body'
  },
  'plugins-browse': {
    title: 'onboarding.step.pluginsBrowse.title',
    body: 'onboarding.step.pluginsBrowse.body'
  },
  'plugins-exit': {
    title: 'onboarding.step.pluginsExit.title',
    body: 'onboarding.step.pluginsExit.body'
  },
  'settings-save': {
    title: 'onboarding.step.settingsSave.title',
    body: 'onboarding.step.settingsSave.body'
  },
  'work-select': {
    title: 'onboarding.step.workSelect.title',
    body: 'onboarding.step.workSelect.body'
  },
  'capture-dictation': {
    title: 'onboarding.step.captureDictation.title',
    body: 'onboarding.step.captureDictation.body'
  },
  'capture-document': {
    title: 'onboarding.step.captureDocument.title',
    body: 'onboarding.step.captureDocument.body'
  },
  'block-context-menu': {
    title: 'onboarding.step.blockContextMenu.title',
    body: 'onboarding.step.blockContextMenu.body'
  },
  'block-send-research': {
    title: 'onboarding.step.blockSendResearch.title',
    body: 'onboarding.step.blockSendResearch.body'
  },
  'research-select': {
    title: 'onboarding.step.researchSelect.title',
    body: 'onboarding.step.researchSelect.body'
  },
  'block-drag-quick': {
    title: 'onboarding.step.blockDragQuick.title',
    body: 'onboarding.step.blockDragQuick.body'
  },
  'block-move-choice': {
    title: 'onboarding.step.blockMoveChoice.title',
    body: 'onboarding.step.blockMoveChoice.body'
  },
  'quick-notes-select': {
    title: 'onboarding.step.quickNotesSelect.title',
    body: 'onboarding.step.quickNotesSelect.body'
  },
  'block-drag-assistant': {
    title: 'onboarding.step.blockDragAssistant.title',
    body: 'onboarding.step.blockDragAssistant.body'
  },
  'assistant-overview': {
    title: 'onboarding.step.assistantOverview.title',
    body: 'onboarding.step.assistantOverview.body'
  },
  complete: {
    title: 'onboarding.step.complete.title',
    body: 'onboarding.step.complete.body'
  }
}

const dynamicStepCopy = (
  step: TourStep,
  runtime: TourRuntimeContext,
  t: Translate
): { title: string; body: string } | null => {
  switch (step.id) {
    case 'ai-key-link':
      return runtime.selectedProvider === 'local'
        ? {
            title: t('onboarding.step.aiKeyLink.localTitle'),
            body: t('onboarding.step.aiKeyLink.localBody')
          }
        : {
            title: t('onboarding.step.aiKeyLink.cloudTitle'),
            body: t('onboarding.step.aiKeyLink.cloudBody')
          }
    case 'ai-credential':
      return {
        title: t('onboarding.step.aiCredential.title'),
        body: t(runtime.selectedProvider === 'local'
          ? 'onboarding.step.aiCredential.localBody'
          : 'onboarding.step.aiCredential.cloudBody')
      }
    case 'ai-image-model':
      return {
        title: t('onboarding.step.aiImageModel.title'),
        body: t(runtime.hasVisionModel
          ? 'onboarding.step.aiImageModel.readyBody'
          : 'onboarding.step.aiImageModel.unavailableBody')
      }
    case 'capture-modes':
      return {
        title: t('onboarding.step.captureModes.title'),
        body: t(runtime.settings.captureMode === 'chat'
          ? 'onboarding.step.captureModes.chatBody'
          : 'onboarding.step.captureModes.naturalBody')
      }
    case 'capture-image':
      return {
        title: t('onboarding.step.captureImage.title'),
        body: t(runtime.imageRecognitionReady
          ? 'onboarding.step.captureImage.readyBody'
          : 'onboarding.step.captureImage.unavailableBody')
      }
    case 'capture-sample':
      return {
        title: t('onboarding.step.captureSample.title'),
        body: t(runtime.settings.captureMode === 'chat'
          ? 'onboarding.step.captureSample.chatBody'
          : 'onboarding.step.captureSample.naturalBody')
      }
    case 'capture-blocks':
      return {
        title: t('onboarding.step.captureBlocks.title'),
        body: t('onboarding.step.captureBlocks.body', {
          minutes: runtime.settings.blockWindowMinutes
        })
      }
    default:
      return null
  }
}

export const localizeTourStep = (
  step: TourStep,
  runtime: TourRuntimeContext,
  t: Translate
): LocalizedTourCopy => {
  const dynamicCopy = dynamicStepCopy(step, runtime, t)
  const staticKeys = staticStepKeys[step.id]
  const params = { assistant: assistantDisplayName }
  const title = dynamicCopy?.title ?? (staticKeys
    ? t(staticKeys.title, params)
    : resolveTourCopy(step.title, runtime))
  const body = dynamicCopy?.body ?? (staticKeys
    ? t(staticKeys.body, params)
    : resolveTourCopy(step.body, runtime))

  const primaryLabel = step.id === 'settings-save'
    ? t('onboarding.action.saveSettings')
    : step.id === 'complete'
      ? t('onboarding.action.finish')
      : t('common.next')
  const sectionKey = sectionKeys[step.section]

  return {
    section: sectionKey ? t(sectionKey) : step.section,
    title,
    body,
    primaryLabel
  }
}

export const localizeTourChoice = (choiceId: string, fallback: string, t: Translate): string => {
  if (choiceId === 'setup-ai') return t('onboarding.action.setupAi')
  if (choiceId === 'mention-ai' || choiceId === 'skip-ai-setup') {
    return t('onboarding.action.skipAi')
  }
  return fallback
}

export const localizeTourLink = (
  provider: LlmProvider,
  fallback: string,
  t: Translate
): string => {
  const keys: Record<LlmProvider, TranslationKey> = {
    gemini: 'onboarding.link.gemini',
    openai: 'onboarding.link.openai',
    anthropic: 'onboarding.link.anthropic',
    local: 'onboarding.link.local'
  }
  return t(keys[provider]) || fallback
}
