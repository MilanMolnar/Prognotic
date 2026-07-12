import { AppSettings, AssistantConversation, AssistantGoalMode, AssistantMode, BlockMeta, Goal, LlmCredentialName, LlmProvider, NoteContent } from "./models";
import { OpenPluginsFolderResult, PluginCatalog, PluginCommandInput, PluginCommandResult, PluginConfig, PluginHostCallResult, PluginHostRequest, PluginMutationResult } from './plugins'
import type { SupportedImageMimeType } from './vision'

export type GetBlocks = () => Promise<BlockMeta[]>
export type ReadBlock = (id: BlockMeta['id']) => Promise<NoteContent>
export type WriteBlock = (id: BlockMeta['id'], content: NoteContent) => Promise<BlockMeta | null>
export type CreateBlock = (content: NoteContent, categories: BlockMeta['categories']) => Promise<BlockMeta>
export type UpdateBlockCategories = (id: BlockMeta['id'], categories: BlockMeta['categories']) => Promise<BlockMeta | null>
export type ApplyBlockRouting = (id: BlockMeta['id'], goalId: string) => Promise<BlockMeta | null>
export type ApplyNewGoalRoutingResult = { goal: Goal; block: BlockMeta }
export type ApplyNewGoalRouting = (id: BlockMeta['id']) => Promise<ApplyNewGoalRoutingResult | null>
export type AcknowledgeBlockInGoal = (id: BlockMeta['id'], goalId: string) => Promise<BlockMeta | null>
export type AppendToBlock = (id: BlockMeta['id'], text: string) => Promise<BlockMeta | null>
export type DeleteBlock = (id: BlockMeta['id']) => Promise<boolean>
// Silent cleanup: deletes the block only if its markdown is blank (trimmed
// empty), checked atomically under the index lock — no confirmation dialog.
export type DeleteBlockIfEmpty = (id: BlockMeta['id']) => Promise<boolean>
export type GetSettings = () => Promise<AppSettings>
export type SetSettings = (patch: Partial<AppSettings>) => Promise<AppSettings>
export type SetCredential = (name: LlmCredentialName, value: string) => Promise<AppSettings>
export type ClearCredential = (name: LlmCredentialName) => Promise<AppSettings>
export type GetGoals = () => Promise<Goal[]>
export type CreateGoal = (name: string, description: string, routingHints?: string) => Promise<Goal>
export type RenameGoal = (id: Goal['id'], name: string, description: string, routingHints?: string) => Promise<Goal | null>
export type DeleteGoal = (id: Goal['id']) => Promise<boolean>
// Wispr Flow: the renderer records and converts the take to 16 kHz PCM WAV;
// main calls the Wispr Flow API with the key from settings.json — the key
// never travels over this channel.
export type TranscriptionResult = { text: string; error?: never } | { error: string; text?: never }
export type TranscribeAudio = (audio: ArrayBuffer) => Promise<TranscriptionResult>
// Windows dictation: main sends Win+H to toggle system voice typing.
export type ToggleWindowsDictation = () => Promise<{ ok: boolean; error?: string }>
// macOS dictation: main sends Fn-D to toggle system Dictation.
export type ToggleMacDictation = () => Promise<{ ok: boolean; error?: string }>
export type WriteClipboardText = (text: string) => Promise<void>
export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type LlmModel = { id: string; label: string; contextWindow?: number; vision?: boolean }
export type LlmModelsResult = { models: LlmModel[]; error?: never } | { models?: never; error: string }
export type GetLlmModels = (provider: LlmProvider) => Promise<LlmModelsResult>
export type TestLlmConnection = () => Promise<{ ok: boolean; error?: string }>
export type ImageRecognitionInput = {
    imageBytes: ArrayBuffer
    mimeType: SupportedImageMimeType
    language: string
    containsHandwriting: boolean
}
export type ImageRecognitionResult = { text: string; error?: never } | { error: string; text?: never }
export type RecognizeImage = (input: ImageRecognitionInput) => Promise<ImageRecognitionResult>
export type TestImageRecognitionConnection = () => Promise<{ ok: boolean; error?: string }>
export type AssistantScope = {
    mode: AssistantMode
    goalMode: AssistantGoalMode
    openGoalId?: string | null
    goalIds?: string[]
    // Explicit composer context; main validates ids and loads these blocks
    // in full even when the retrieval scope would exclude them.
    attachedBlockIds?: string[]
    from?: number
    to?: number
}
export type AssistantModelSelection = { provider: LlmProvider; model: string }
export type StartAssistantStream = (requestId: string, message: string, history: LlmMessage[], scope: AssistantScope, selection?: AssistantModelSelection) => Promise<{ ok: boolean; error?: string }>
export type CancelAssistantStream = (requestId: string) => Promise<void>
export type AssistantStreamEvent = { requestId: string; type: 'token'; text: string } | { requestId: string; type: 'done'; citedBlockIds: string[]; citedBlockCategoryIds: Record<string, string | null>; readGoalLabels: string[] } | { requestId: string; type: 'error'; message: string }
export type OnAssistantStreamEvent = (callback: (event: AssistantStreamEvent) => void) => () => void
export type ClassifyBlockResult = { block: BlockMeta | null; error?: string }
export type ClassifyBlock = (blockId: string) => Promise<ClassifyBlockResult>
export type SummarizeBlockNameResult = { block: BlockMeta | null; error?: string }
export type SummarizeBlockName = (blockId: string) => Promise<SummarizeBlockNameResult>
export type RunInlineAction = (actionId: 'translate' | 'explain', text: string, blockId?: string) => Promise<{ text: string; error?: never } | { error: string; text?: never }>
export type PolishTranscript = (text: string) => Promise<{ text: string; error?: never } | { error: string; text?: never }>
export type GetAssistantConversations = () => Promise<AssistantConversation[]>
export type SaveAssistantConversations = (conversations: AssistantConversation[]) => Promise<void>
export type GetPlugins = () => Promise<PluginCatalog>
export type SetPluginEnabled = (pluginId: string, enabled: boolean) => Promise<PluginMutationResult>
export type SetPluginConfig = (pluginId: string, config: PluginConfig) => Promise<PluginMutationResult>
export type RemovePlugin = (folderName: string) => Promise<PluginMutationResult>
export type OpenPluginsFolder = () => Promise<OpenPluginsFolderResult>
export type RunPluginCommand = (pluginId: string, command: string, input: PluginCommandInput) => Promise<PluginCommandResult>
export type CallPluginHost = (pluginId: string, request: PluginHostRequest) => Promise<PluginHostCallResult>
