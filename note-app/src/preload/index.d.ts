import { ElectronAPI } from '@electron-toolkit/preload'
import { AppendToBlock, CreateBlock, CreateGoal, DeleteBlock, DeleteBlockIfEmpty, GetBlocks, GetGoals, GetSettings, ReadBlock, SetSettings, ToggleWindowsDictation, TranscribeAudio, UpdateBlockCategories, WriteBlock } from '@shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    context: {
      locale: string
      platform: NodeJS.Platform
      getBlocks: GetBlocks
      readBlock: ReadBlock
      writeBlock: WriteBlock
      createBlock: CreateBlock
      updateBlockCategories: UpdateBlockCategories
      appendToBlock: AppendToBlock
      deleteBlock: DeleteBlock
      deleteBlockIfEmpty: DeleteBlockIfEmpty
      getSettings: GetSettings
      setSettings: SetSettings
      getGoals: GetGoals
      createGoal: CreateGoal
      transcribeAudio: TranscribeAudio
      toggleWindowsDictation: ToggleWindowsDictation
    }
  }
}
