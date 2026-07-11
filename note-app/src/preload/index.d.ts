import { ElectronAPI } from '@electron-toolkit/preload'
import { AcknowledgeBlockInGoal, AppendToBlock, ApplyBlockRouting, ApplyNewGoalRouting, CancelAssistantStream, ClassifyBlock, ClearCredential, CreateBlock, CreateGoal, DeleteBlock, DeleteBlockIfEmpty, DeleteGoal, GetAssistantConversations, GetBlocks, GetGoals, GetLlmModels, GetSettings, OnAssistantStreamEvent, PolishTranscript, ReadBlock, RenameGoal, RunInlineAction, SaveAssistantConversations, SetCredential, SetSettings, StartAssistantStream, TestLlmConnection, ToggleWindowsDictation, TranscribeAudio, UpdateBlockCategories, WriteBlock } from '@shared/types'

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
      applyBlockRouting: ApplyBlockRouting
      applyNewGoalRouting: ApplyNewGoalRouting
      acknowledgeBlockInGoal: AcknowledgeBlockInGoal
      appendToBlock: AppendToBlock
      deleteBlock: DeleteBlock
      deleteBlockIfEmpty: DeleteBlockIfEmpty
      getSettings: GetSettings
      setSettings: SetSettings
      setCredential: SetCredential
      clearCredential: ClearCredential
      getGoals: GetGoals
      createGoal: CreateGoal
      renameGoal: RenameGoal
      deleteGoal: DeleteGoal
      transcribeAudio: TranscribeAudio
      toggleWindowsDictation: ToggleWindowsDictation
      getLlmModels: GetLlmModels
      testLlmConnection: TestLlmConnection
      startAssistantStream: StartAssistantStream
      cancelAssistantStream: CancelAssistantStream
      onAssistantStreamEvent: OnAssistantStreamEvent
      classifyBlock: ClassifyBlock
      runInlineAction: RunInlineAction
      polishTranscript: PolishTranscript
      getAssistantConversations: GetAssistantConversations
      saveAssistantConversations: SaveAssistantConversations
    }
  }
}
