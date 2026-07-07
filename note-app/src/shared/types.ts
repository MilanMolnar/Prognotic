import { AppSettings, BlockMeta, Goal, NoteContent } from "./models";

export type GetBlocks = () => Promise<BlockMeta[]>
export type ReadBlock = (id: BlockMeta['id']) => Promise<NoteContent>
export type WriteBlock = (id: BlockMeta['id'], content: NoteContent) => Promise<BlockMeta | null>
export type CreateBlock = (content: NoteContent, categories: BlockMeta['categories']) => Promise<BlockMeta>
export type UpdateBlockCategories = (id: BlockMeta['id'], categories: BlockMeta['categories']) => Promise<BlockMeta | null>
export type AppendToBlock = (id: BlockMeta['id'], text: string) => Promise<BlockMeta | null>
export type DeleteBlock = (id: BlockMeta['id']) => Promise<boolean>
// Silent cleanup: deletes the block only if its markdown is blank (trimmed
// empty), checked atomically under the index lock — no confirmation dialog.
export type DeleteBlockIfEmpty = (id: BlockMeta['id']) => Promise<boolean>
export type GetSettings = () => Promise<AppSettings>
export type SetSettings = (patch: Partial<AppSettings>) => Promise<AppSettings>
export type GetGoals = () => Promise<Goal[]>
export type CreateGoal = (name: string, description: string) => Promise<Goal>
// Wispr Flow: the renderer records and converts the take to 16 kHz PCM WAV;
// main calls the Wispr Flow API with the key from settings.json — the key
// never travels over this channel.
export type TranscriptionResult = { text: string; error?: never } | { error: string; text?: never }
export type TranscribeAudio = (audio: ArrayBuffer) => Promise<TranscriptionResult>
// Windows dictation: main sends Win+H to toggle system voice typing.
export type ToggleWindowsDictation = () => Promise<{ ok: boolean; error?: string }>
