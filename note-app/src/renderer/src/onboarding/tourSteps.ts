import type { LlmProvider } from '@shared/models'
import { onboardingEvents } from './events'
import { hasTourSampleBlock } from './tourLogic'
import type { TourChoice, TourExternalLink, TourStep } from './types'

const providerLinks = {
  gemini: { label: 'Get a Gemini API key', href: 'https://aistudio.google.com/apikey' },
  openai: { label: 'Get an OpenAI API key', href: 'https://platform.openai.com/api-keys' },
  anthropic: { label: 'Get an Anthropic API key', href: 'https://console.anthropic.com/settings/keys' },
  local: { label: 'Open LM Studio', href: 'https://lmstudio.ai/' }
} satisfies Record<LlmProvider, TourExternalLink>

const skipAiSetup: TourChoice = {
  id: 'skip-ai-setup',
  label: 'Skip AI setup',
  branch: { aiSetupChoice: 'no' },
  tone: 'secondary'
}

const aiStep = (step: TourStep): TourStep => {
  const stepWhen = step.when
  const stepOnEnter = step.onEnter
  return {
    ...step,
    when: (context) => context.aiSetupChoice === 'yes' && (stepWhen?.(context) ?? true),
    onEnter: (controls, context) => {
      controls.openSettingsModal()
      stepOnEnter?.(controls, context)
    },
    secondaryActions: [skipAiSetup]
  }
}

// Tour orchestration is intentionally data-only: add or reorder steps here,
// and add a matching data-tour key only when the target is new. Engine changes
// are unnecessary unless a new primitive (beyond targets, predicates, choices,
// events, or lifecycle callbacks) is genuinely needed.
export const tourSteps: readonly TourStep[] = [
  {
    id: 'goals-new',
    section: 'Goals',
    title: 'Create a goal',
    body: 'Goals organize notes by topic. Let\'s create your first one.',
    target: 'new-goal',
    placement: 'right',
    arrow: true,
    advance: 'click-target',
    skip: (context) => context.workGoalId !== null,
    highlight: 6,
    onEnter: (controls) => controls.ensureLeftPanelOpen()
  },
  {
    id: 'goals-create-work',
    section: 'Goals',
    title: 'Name it Work',
    body: 'Name sets the topic; description and routing hints help AI sort later. Create “Work” with a description such as “work tasks and reminders.”',
    target: 'goal-dialog',
    placement: 'right',
    arrow: true,
    advance: 'next',
    skip: (context) => context.workGoalId !== null,
    interactive: (context) => context.workGoalId !== null,
    autoAdvanceWhenSatisfied: true,
    highlight: 8,
    onEnter: (controls) => controls.openGoalDialog(),
    onExit: (controls) => controls.closeGoalDialog()
  },
  {
    id: 'goals-work',
    section: 'Goals',
    title: 'Your Work goal',
    body: 'Notes captured while this goal is selected stay here.',
    target: 'work-goal',
    placement: 'right',
    arrow: true,
    advance: 'next',
    when: (context) => context.workGoalId !== null,
    highlight: 4,
    onEnter: (controls) => controls.ensureLeftPanelOpen()
  },
  {
    id: 'settings-open',
    section: 'Settings',
    title: 'Open Settings',
    body: 'Settings control capture behavior, dictation, AI, and plugins.',
    target: 'settings',
    placement: 'right',
    arrow: true,
    advance: 'click-target',
    highlight: 6,
    onEnter: (controls) => controls.ensureLeftPanelOpen()
  },
  {
    id: 'settings-overview',
    section: 'Settings',
    title: 'One place for app behavior',
    body: 'Set the note-block window and dictation mode here, then optionally connect AI and manage plugins.',
    placement: 'right',
    arrow: false,
    advance: 'next',
    allowBack: false,
    onEnter: (controls) => controls.openSettingsModal()
  },
  {
    id: 'settings-ai-choice',
    section: 'Settings',
    title: 'Set up AI now?',
    body: 'AI adds goal routing, the assistant, image text recognition, and the plugin wizard. You can configure it later.',
    placement: 'right',
    arrow: false,
    advance: 'next',
    choices: [
      { id: 'setup-ai', label: 'Set up AI now', branch: { aiSetupChoice: 'yes' }, tone: 'primary' },
      { id: 'mention-ai', label: 'Skip AI setup', branch: { aiSetupChoice: 'no' }, tone: 'secondary' }
    ],
    onEnter: (controls) => controls.openSettingsModal()
  },
  aiStep({
    id: 'ai-providers',
    section: 'AI setup',
    title: 'Choose a provider',
    body: 'Gemini, OpenAI, and Claude use their cloud APIs. LM Studio runs a loaded model through its local server.',
    target: 'settings-providers',
    placement: 'right',
    arrow: true,
    advance: 'next',
    highlight: 5
  }),
  aiStep({
    id: 'ai-key-link',
    section: 'AI setup',
    title: (context) => context.selectedProvider === 'local' ? 'Start LM Studio' : 'Get a provider key',
    body: (context) => context.selectedProvider === 'local'
      ? 'Start the local server and load a model. A bearer token is optional unless your server requires one.'
      : 'Create an API key with the selected provider, then return here. Prognotic stores it with Electron safeStorage.',
    target: (context) => `provider-${context.selectedProvider}`,
    placement: 'right',
    arrow: true,
    advance: 'next',
    skip: (context) => context.aiVerified,
    externalLink: (context) => providerLinks[context.selectedProvider],
    highlight: 4
  }),
  aiStep({
    id: 'ai-credential',
    section: 'AI setup',
    title: 'Enter the connection details',
    body: (context) => context.selectedProvider === 'local'
      ? 'Confirm the loopback URL and add a token only if LM Studio requires one.'
      : 'Paste the API key here. The renderer never receives the saved value again.',
    target: (context) => context.selectedProvider === 'local'
      ? ['lm-studio-url', 'llm-credential']
      : 'llm-credential',
    placement: 'right',
    arrow: true,
    advance: 'next',
    skip: (context) => context.aiVerified,
    highlight: 4
  }),
  aiStep({
    id: 'ai-refresh-models',
    section: 'AI setup',
    title: 'Load available models',
    body: 'Refresh models saves the current connection fields and asks the provider what is available.',
    target: 'settings-refresh-models',
    placement: 'right',
    arrow: true,
    advance: 'next',
    skip: (context) => context.aiVerified,
    highlight: 4
  }),
  aiStep({
    id: 'ai-active-model',
    section: 'AI setup',
    title: 'Choose the active model',
    body: 'This model powers routing, assistant defaults, inline actions, and optional AI features.',
    target: 'settings-active-model',
    placement: 'right',
    arrow: true,
    advance: 'next',
    skip: (context) => context.aiVerified,
    highlight: 4
  }),
  aiStep({
    id: 'ai-test-connection',
    section: 'AI setup',
    title: 'Test the connection',
    body: 'A green check means this exact provider and model pair is ready.',
    target: 'settings-test-connection',
    placement: 'right',
    arrow: true,
    advance: 'next',
    skip: (context) => context.aiVerified,
    highlight: 5
  }),
  aiStep({
    id: 'ai-test-image',
    section: 'AI setup',
    title: 'Optional image recognition',
    body: 'Test a vision model to turn handwritten notes or article screenshots into capture text.',
    target: 'settings-test-image',
    placement: 'right',
    arrow: true,
    advance: 'next',
    skip: (context) => !context.hasVisionModel || context.imageRecognitionReady,
    highlight: 5
  }),
  {
    id: 'ai-mention',
    section: 'AI setup',
    title: 'AI stays optional',
    body: 'When connected, AI can route notes, power the assistant, read images, and guide plugin creation. None of that is required for local capture.',
    placement: 'right',
    arrow: false,
    advance: 'next',
    when: (context) => context.aiSetupChoice === 'no',
    onEnter: (controls) => controls.openSettingsModal()
  },
  {
    id: 'plugins-manage',
    section: 'Plugins',
    title: 'Extend Prognotic',
    body: 'Manage plugins opens local note feeds from ~/NoteMark/plugins/. Enable, disable, and configure them there.',
    target: 'settings-plugins',
    placement: 'right',
    arrow: true,
    advance: 'next',
    highlight: 5,
    onEnter: (controls) => controls.openSettingsModal(),
    onExit: (controls) => controls.closePluginManager()
  },
  {
    id: 'settings-save',
    section: 'Settings',
    title: 'Save your settings',
    body: 'Save applies the draft. You can reopen Settings from the sidebar anytime.',
    target: 'settings-save',
    placement: 'right',
    arrow: true,
    advance: 'event',
    event: onboardingEvents.settingsSaved,
    primaryLabel: 'Save settings to continue',
    allowBack: false,
    highlight: 5,
    onEnter: (controls) => controls.openSettingsModal(),
    onExit: (controls) => {
      controls.closePluginManager()
      controls.closeSettingsModal()
      controls.clearSelectedBlock()
      controls.selectCategory(null)
    }
  },
  {
    id: 'work-select',
    section: 'Capture',
    title: 'Open Work',
    body: 'Select Work so the next capture is stored in that goal.',
    target: 'work-goal',
    placement: 'right',
    arrow: true,
    advance: 'next',
    when: (context) => context.workGoalId !== null,
    interactive: (context) => context.selectedCategory === context.workGoalId,
    autoAdvanceWhenSatisfied: true,
    allowBack: false,
    highlight: 5,
    onEnter: (controls) => controls.ensureLeftPanelOpen()
  },
  {
    id: 'capture-modes',
    section: 'Capture',
    title: 'Two capture layouts',
    body: 'Chat keeps a feed above a send bar. Natural puts writing at the top with collapsed blocks below; both use the same notes.',
    target: 'capture-mode-toggle',
    placement: 'bottom',
    arrow: true,
    advance: 'next',
    highlight: 5
  },
  {
    id: 'assistant-panel',
    section: 'Capture',
    title: 'Your note assistant',
    body: (context) => context.aiVerified
      ? 'Use Note Chat for your notes, Research for questions and sources, or Search for direct retrieval.'
      : 'Note Chat, Research, and Search live here. Connect AI in Settings before asking the assistant.',
    target: 'chat-panel',
    placement: 'left',
    arrow: true,
    advance: 'next',
    highlight: 4,
    onEnter: (controls) => controls.ensureRightPanelOpen()
  },
  {
    id: 'capture-dictation',
    section: 'Capture tools',
    title: 'Capture by voice',
    body: 'The mic uses native OS dictation or Wispr Flow, depending on Settings. Neither requires an AI provider.',
    target: 'dictation',
    placement: 'top',
    arrow: true,
    advance: 'next',
    highlight: 5
  },
  {
    id: 'capture-image',
    section: 'Capture tools',
    title: 'Capture text from images',
    body: (context) => context.imageRecognitionReady
      ? 'Use the image button to extract text from handwriting or screenshots into the capture editor.'
      : 'Image capture appears after a vision model passes its Settings test. It can read handwriting and screenshots into the editor.',
    target: (context) => context.imageRecognitionReady ? 'image-recognition' : 'capture-tools',
    placement: 'top',
    arrow: true,
    advance: 'next',
    highlight: 5
  },
  {
    id: 'capture-sample',
    section: 'Capture tools',
    title: 'Capture a sample note',
    body: (context) => context.settings.captureMode === 'chat'
      ? 'Type “I need to contact HR about my PTO next week” (or a paraphrase), then send it.'
      : 'Write “I need to contact HR about my PTO next week” (or a paraphrase). Natural capture saves after a short pause.',
    target: 'capture-input',
    placement: 'top',
    arrow: true,
    advance: 'next',
    interactive: hasTourSampleBlock,
    autoAdvanceWhenSatisfied: true,
    highlight: 6,
    continueAfterMs: 14_000
  },
  {
    id: 'capture-blocks',
    section: 'Note blocks',
    title: 'Captures become note blocks',
    body: (context) => `Related captures stay together while the ${context.settings.blockWindowMinutes}-minute block window is open. Blocks can hold tasks, links, and snippets; configured AI can name and route them.`,
    target: ['newest-block', 'block-feed'],
    placement: 'top',
    arrow: true,
    advance: 'next',
    highlight: 5
  },
  {
    id: 'complete',
    section: 'Complete',
    title: 'You\'re ready',
    body: 'Capture freely and let your goals grow with your work. Welcome to Prognotic.',
    placement: 'right',
    arrow: false,
    advance: 'next',
    primaryLabel: 'Finish tour',
    allowBack: false
  }
]
