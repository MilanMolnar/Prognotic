import { ElectronAPI } from '@electron-toolkit/preload'
import { AppendToBlock, CreateBlock, CreateGoal, DeleteBlock, GetBlocks, GetGoals, GetSettings, ReadBlock, SetSettings, WriteBlock } from '@shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    context: {
      locale: string
      getBlocks: GetBlocks
      readBlock: ReadBlock
      writeBlock: WriteBlock
      createBlock: CreateBlock
      appendToBlock: AppendToBlock
      deleteBlock: DeleteBlock
      getSettings: GetSettings
      setSettings: SetSettings
      getGoals: GetGoals
      createGoal: CreateGoal
    }
  }
}
