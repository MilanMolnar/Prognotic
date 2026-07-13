import type { LlmProvider } from '@shared/models'
import { onboardingEvents } from './events'
import { findTourSampleBlock, hasTourSampleBlock } from './tourLogic'
import type {
  TourChoice,
  TourExternalLink,
  TourStep,
  TourTarget
} from './types'

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

const escapedAttributeValue = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')

const sampleBlockTarget: TourTarget = (context) => {
  const sample = findTourSampleBlock(context)
  return sample
    ? `[data-block-id="${escapedAttributeValue(sample.id)}"]`
    : ['newest-block', 'block-feed']
}

const sampleBlockDragTarget: TourTarget = (context) => {
  const sample = findTourSampleBlock(context)
  return sample
    ? `[data-block-id="${escapedAttributeValue(sample.id)}"] [data-tour="block-drag-handle"]`
    : 'block-drag-handle'
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
    body: 'Goals organize related note blocks. Let\'s create your first one.',
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
    body: 'A goal is a view of its note blocks. One block can belong to several goals without duplicating its Markdown file.',
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
    body: 'Click Settings to configure capture, dictation, AI, integrations, and plugins.',
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
    body: 'The note-block window controls how long related captures stay together. This screen also chooses dictation, AI connections, calendar sync, and installed plugins.',
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
    body: 'AI adds goal routing, the assistant, image text recognition, document summaries, and the plugin wizard. You can configure it later.',
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
    body: 'Gemini, OpenAI, and Claude use their cloud APIs. LM Studio uses a model loaded on this computer through its local server.',
    target: 'settings-providers',
    placement: 'right',
    arrow: true,
    advance: 'next',
    highlight: 5
  }),
  aiStep({
    id: 'ai-key-link',
    section: 'AI setup',
    title: (context) => context.selectedProvider === 'local' ? 'Start LM Studio' : 'Get an API key',
    body: (context) => context.selectedProvider === 'local'
      ? 'Start LM Studio, load a model, and enable its local server. A bearer token is optional unless that server requires one.'
      : 'Use the provider link below to create a key, then return to Prognotic. Provider accounts, billing, and key permissions are managed by that provider.',
    target: (context) => `provider-${context.selectedProvider}`,
    placement: 'right',
    arrow: true,
    advance: 'next',
    externalLink: (context) => providerLinks[context.selectedProvider],
    highlight: 4
  }),
  aiStep({
    id: 'ai-credential',
    section: 'AI setup',
    title: 'Enter the connection details',
    body: (context) => context.selectedProvider === 'local'
      ? 'Confirm the loopback URL and enter a token only when your LM Studio server requires one.'
      : 'Paste the selected provider’s API key here. Prognotic encrypts it with Electron safeStorage and never returns the saved value to the renderer.',
    target: (context) => context.selectedProvider === 'local'
      ? ['lm-studio-url', 'llm-credential']
      : 'llm-credential',
    placement: 'right',
    arrow: true,
    advance: 'next',
    highlight: 4
  }),
  aiStep({
    id: 'ai-refresh-models',
    section: 'AI setup',
    title: 'Refresh available models',
    body: 'Refresh models saves the current connection fields and loads the provider’s current model list. For LM Studio, only loaded LLM instances appear.',
    target: 'settings-refresh-models',
    placement: 'right',
    arrow: true,
    advance: 'next',
    highlight: 4
  }),
  aiStep({
    id: 'ai-active-model',
    section: 'AI setup',
    title: 'Select the active model',
    body: 'The active model is the global default for note routing, the assistant, inline actions, document summaries, and other optional AI workflows.',
    target: 'settings-active-model',
    placement: 'right',
    arrow: true,
    advance: 'next',
    highlight: 4
  }),
  aiStep({
    id: 'ai-test-connection',
    section: 'AI setup',
    title: 'Test the active model',
    body: 'Test connection verifies this exact provider and model pair. A green check means it is ready; changing either selection requires another test.',
    target: 'settings-test-connection',
    placement: 'right',
    arrow: true,
    advance: 'next',
    highlight: 5
  }),
  aiStep({
    id: 'ai-plugin-model',
    section: 'AI setup',
    title: 'Choose the Plugin Wizard model',
    body: 'The AI Plugin Wizard uses the active model by default. You can select a separate model here while keeping the same provider and credential.',
    target: 'settings-plugin-model',
    placement: 'right',
    arrow: true,
    advance: 'next',
    highlight: 5
  }),
  aiStep({
    id: 'ai-image-model',
    section: 'AI setup',
    title: 'Select and test image recognition',
    body: (context) => context.hasVisionModel
      ? 'Choose a vision-capable model, then run Test image recognition. The image capture button appears only after this separate model test succeeds.'
      : 'After refreshing, choose a vision-capable model here and run Test image recognition. Providers without an available vision model leave this optional feature disabled.',
    target: 'settings-image-model',
    placement: 'right',
    arrow: true,
    advance: 'next',
    highlight: 5
  }),
  {
    id: 'ai-mention',
    section: 'AI setup',
    title: 'AI stays optional',
    body: 'Local capture, goals, plugins, and native dictation work without an AI connection. You can return to Settings whenever you want routing, summaries, image recognition, or assistant features.',
    placement: 'right',
    arrow: false,
    advance: 'next',
    when: (context) => context.aiSetupChoice === 'no',
    onEnter: (controls) => controls.openSettingsModal()
  },
  {
    id: 'plugins-open',
    section: 'Plugins',
    title: 'Open the Plugin Manager',
    body: 'Click Manage plugins to see the plugins installed in your local vault.',
    target: 'settings-plugins',
    placement: 'right',
    arrow: true,
    advance: 'click-target',
    highlight: 5,
    onEnter: (controls) => controls.openSettingsModal()
  },
  {
    id: 'plugins-dietary',
    section: 'Plugins',
    title: 'A plugin is already included',
    body: 'Dietary is Prognotic’s bundled example plugin. It demonstrates a goal-like feed, structured meal entry, plugin configuration, and host AI actions.',
    target: ['plugin-dietary', 'plugin-list'],
    placement: 'left',
    arrow: true,
    advance: 'next',
    allowBack: false,
    highlight: 5
  },
  {
    id: 'plugins-enable',
    section: 'Plugins',
    title: 'Enable or disable a plugin',
    body: 'Enabled plugins appear in the sidebar. Disabling one hides its view without deleting its folder, configuration, or note blocks.',
    target: ['plugin-dietary-enabled', 'plugin-dietary'],
    placement: 'left',
    arrow: true,
    advance: 'next',
    highlight: 4
  },
  {
    id: 'plugins-delete',
    section: 'Plugins',
    title: 'Remove an installed plugin',
    body: 'Remove deletes the plugin folder after confirmation, but its existing note blocks remain in the vault. You do not need to remove Dietary during the tour.',
    target: ['plugin-dietary-delete', 'plugin-dietary'],
    placement: 'left',
    arrow: true,
    advance: 'next',
    highlight: 4
  },
  {
    id: 'plugins-browse',
    section: 'Plugins',
    title: 'Browse and refresh plugins',
    body: 'The folder controls copy or open the local plugin path. Refresh scans that folder after you add or change a plugin.',
    target: 'plugin-browse',
    placement: 'bottom',
    arrow: true,
    advance: 'next',
    highlight: 4
  },
  {
    id: 'plugins-exit',
    section: 'Plugins',
    title: 'Return to Settings',
    body: 'Click the close button to leave the Plugin Manager and continue saving Settings.',
    target: 'plugin-close',
    placement: 'left',
    arrow: true,
    advance: 'click-target',
    allowBack: false,
    highlight: 5,
    onExit: (controls) => controls.closePluginManager()
  },
  {
    id: 'settings-save',
    section: 'Settings',
    title: 'Save your settings',
    body: 'Save applies the draft. You can reopen Settings from the sidebar at any time.',
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
    title: 'Open your Work goal',
    body: 'Click Work so the next capture is stored in that goal.',
    target: 'work-goal',
    placement: 'right',
    arrow: true,
    advance: 'click-target',
    when: (context) => context.workGoalId !== null,
    allowBack: false,
    highlight: 5,
    onEnter: (controls) => controls.ensureLeftPanelOpen()
  },
  {
    id: 'capture-modes',
    section: 'Capture',
    title: 'Switch capture layouts',
    body: (context) => context.settings.captureMode === 'chat'
      ? 'Click Natural. It puts writing at the top and collapses saved blocks below; Chat keeps the feed above a send bar.'
      : 'Click Chat. It keeps the feed above a send bar; Natural puts writing at the top and collapses saved blocks below.',
    target: (context) => `capture-mode-${context.settings.captureMode === 'chat' ? 'natural' : 'chat'}`,
    placement: 'bottom',
    arrow: true,
    advance: 'click-target',
    highlight: 5
  },
  {
    id: 'capture-dictation',
    section: 'Capture tools',
    title: 'Capture by voice',
    body: 'The mic uses native operating-system dictation or Wispr Flow, depending on Settings. Its tooltip reports when the selected option is unavailable.',
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
      ? 'The image button extracts printed or handwritten text from a screenshot or image into the capture editor for review.'
      : 'The image button appears after a vision model passes its separate Settings test. It can extract printed or handwritten text for review.',
    target: (context) => context.imageRecognitionReady ? 'image-recognition' : 'capture-tools',
    placement: 'top',
    arrow: true,
    advance: 'next',
    highlight: 5
  },
  {
    id: 'capture-document',
    section: 'Capture tools',
    title: 'Import or summarize a document',
    body: 'The document button imports text from a supported file. You can insert the extracted text or, with verified AI, review and insert a generated summary.',
    target: 'document-capture',
    placement: 'top',
    arrow: true,
    advance: 'next',
    highlight: 5
  },
  {
    id: 'capture-sample',
    section: 'Capture tools',
    title: 'Add a sample note',
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
    body: (context) => `Related captures stay together while the ${context.settings.blockWindowMinutes}-minute block window is open. A block is one Markdown file that can appear in multiple goals.`,
    target: sampleBlockTarget,
    placement: 'top',
    arrow: true,
    advance: 'next',
    highlight: 5
  },
  {
    id: 'block-context-menu',
    section: 'Note blocks',
    title: 'Open a block’s context menu',
    body: 'Right-click the sample note block. Its quick actions work on the full block.',
    target: sampleBlockTarget,
    placement: 'top',
    arrow: true,
    advance: 'event',
    event: onboardingEvents.blockContextMenuOpened,
    highlight: 5
  },
  {
    id: 'block-send-research',
    section: 'Note blocks',
    title: 'Send the block to Research',
    body: 'Click Send to research. The same Markdown block will be added to Research while it remains in Work.',
    target: 'block-send-to-research',
    placement: 'right',
    arrow: true,
    advance: 'event',
    event: onboardingEvents.blockSentToResearch,
    allowBack: false,
    highlight: 5
  },
  {
    id: 'research-select',
    section: 'Note blocks',
    title: 'Open Research',
    body: 'Click Research to see the same block from that system goal.',
    target: 'research-goal',
    placement: 'right',
    arrow: true,
    advance: 'click-target',
    allowBack: false,
    highlight: 5,
    onEnter: (controls) => controls.ensureLeftPanelOpen()
  },
  {
    id: 'block-drag-quick',
    section: 'Move and copy',
    title: 'Drag the block to Quick Note',
    body: 'Hold the block’s drag handle, then drag and release it over Quick Note in the sidebar.',
    target: sampleBlockDragTarget,
    placement: 'top',
    arrow: true,
    advance: 'event',
    event: onboardingEvents.blockDroppedToQuickNotes,
    highlight: 5,
    onEnter: (controls) => controls.ensureLeftPanelOpen()
  },
  {
    id: 'block-move-choice',
    section: 'Move and copy',
    title: 'Choose Move or Copy only',
    body: 'Move keeps the block only in Quick Note. Copy only keeps it in Quick Note and its existing goals. Choose either option to continue.',
    target: 'block-move-dialog',
    placement: 'right',
    arrow: true,
    advance: 'event',
    event: onboardingEvents.blockMoveChoiceCompleted,
    allowBack: false,
    highlight: 6
  },
  {
    id: 'quick-notes-select',
    section: 'Move and copy',
    title: 'Open Quick Note',
    body: 'Click Quick Note to find the block at its new destination.',
    target: 'quick-notes-goal',
    placement: 'right',
    arrow: true,
    advance: 'click-target',
    allowBack: false,
    highlight: 5,
    onEnter: (controls) => controls.ensureLeftPanelOpen()
  },
  {
    id: 'block-drag-assistant',
    section: 'Assistant',
    title: 'Add the block to assistant context',
    body: 'Hold the drag handle again, then drop the block anywhere on the Assistant panel. Prognotic opens the panel automatically for this step.',
    target: sampleBlockDragTarget,
    placement: 'top',
    arrow: true,
    advance: 'event',
    event: onboardingEvents.blockAttachedToAssistant,
    allowBack: false,
    highlight: 5,
    onEnter: (controls) => controls.ensureRightPanelOpen()
  },
  {
    id: 'assistant-overview',
    section: 'Assistant',
    title: 'Your note-aware assistant',
    body: 'The dragged block now appears above the composer as explicit context. Goal and Time filter retrieved notes; Model chooses the conversation model; Mode switches between Note Chat, Research, and Search. Nothing is sent until you press Send, so this tour makes no AI request.',
    target: 'chat-panel',
    placement: 'left',
    arrow: true,
    advance: 'next',
    allowBack: false,
    highlight: 4,
    onEnter: (controls) => controls.ensureRightPanelOpen()
  },
  {
    id: 'complete',
    section: 'Complete',
    title: 'You’re ready',
    body: 'You have created a goal, reviewed capture tools, moved one note across goals, and attached it to assistant context. Welcome to Prognotic.',
    placement: 'right',
    arrow: false,
    advance: 'next',
    primaryLabel: 'Finish tour',
    allowBack: false
  }
]
