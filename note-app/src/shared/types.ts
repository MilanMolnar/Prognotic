import { AppSettings, AssistantConversation, AssistantGoalMode, BlockMeta, Goal, LlmCredentialName, LlmProvider, NoteContent } from "./models";

export type GetBlocks = () => Promise<BlockMeta[]>
export type ReadBlock = (id: BlockMeta['id']) => Promise<NoteContent>
export type WriteBlock = (id: BlockMeta['id'], content: NoteContent) => Promise<BlockMeta | null>
export type CreateBlock = (content: NoteContent, categories: BlockMeta['categories']) => Promise<BlockMeta>
export type UpdateBlockCategories = (id: BlockMeta['id'], categories: BlockMeta['categories']) => Promise<BlockMeta | null>
export type ApplyBlockRouting = (id: BlockMeta['id'], goalId: string) => Promise<BlockMeta | null>
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
export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type LlmModel = { id: string; label: string; contextWindow?: number }
export type LlmModelsResult = { models: LlmModel[]; error?: never } | { models?: never; error: string }
export type GetLlmModels = (provider: LlmProvider) => Promise<LlmModelsResult>
export type TestLlmConnection = () => Promise<{ ok: boolean; error?: string }>
export type AssistantScope = {
    goalMode: AssistantGoalMode
    openGoalId?: string | null
    goalIds?: string[]
    from?: number
    to?: number
}
export type AssistantModelSelection = { provider: LlmProvider; model: string }
export type StartAssistantStream = (requestId: string, message: string, history: LlmMessage[], scope: AssistantScope, selection?: AssistantModelSelection) => Promise<{ ok: boolean; error?: string }>
export type CancelAssistantStream = (requestId: string) => Promise<void>
export type AssistantStreamEvent = { requestId: string; type: 'token'; text: string } | { requestId: string; type: 'done'; citedBlockIds: string[]; readGoalLabels: string[] } | { requestId: string; type: 'error'; message: string }
export type OnAssistantStreamEvent = (callback: (event: AssistantStreamEvent) => void) => () => void
export type ClassifyBlockResult = { block: BlockMeta | null; error?: string }
export type ClassifyBlock = (blockId: string) => Promise<ClassifyBlockResult>
export type RunInlineAction = (actionId: 'translate' | 'explain', text: string, blockId?: string) => Promise<{ text: string; error?: never } | { error: string; text?: never }>
export type PolishTranscript = (text: string) => Promise<{ text: string; error?: never } | { error: string; text?: never }>
export type GetAssistantConversations = () => Promise<AssistantConversation[]>
export type SaveAssistantConversations = (conversations: AssistantConversation[]) => Promise<void>
