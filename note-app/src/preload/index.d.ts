import { ElectronAPI } from '@electron-toolkit/preload'
import { AcknowledgeBlockInGoal, AppendToBlock, ApplyBlockRouting, ApplyNewGoalRouting, CallPluginHost, CancelAssistantStream, ClassifyBlock, ClearCredential, CreateBlock, CreateGoal, DeleteBlock, DeleteBlockIfEmpty, DeleteGoal, GetAssistantConversations, GetBlocks, GetGoals, GetLlmModels, GetPlugins, GetSettings, OnAssistantStreamEvent, OpenPluginsFolder, PolishTranscript, ReadBlock, RecognizeImage, RemovePlugin, RenameGoal, RunInlineAction, RunPluginCommand, SaveAssistantConversations, SetCredential, SetPluginConfig, SetPluginEnabled, SetSettings, StartAssistantStream, SummarizeBlockName, TestImageRecognitionConnection, TestLlmConnection, ToggleMacDictation, ToggleWindowsDictation, TranscribeAudio, UpdateBlockCategories, WriteBlock, WriteClipboardText } from '@shared/types'

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
      toggleMacDictation: ToggleMacDictation
      writeClipboardText: WriteClipboardText
      getLlmModels: GetLlmModels
      testLlmConnection: TestLlmConnection
      testImageRecognitionConnection: TestImageRecognitionConnection
      recognizeImage: RecognizeImage
      startAssistantStream: StartAssistantStream
      cancelAssistantStream: CancelAssistantStream
      onAssistantStreamEvent: OnAssistantStreamEvent
      classifyBlock: ClassifyBlock
      summarizeBlockName: SummarizeBlockName
      runInlineAction: RunInlineAction
      polishTranscript: PolishTranscript
      getAssistantConversations: GetAssistantConversations
      saveAssistantConversations: SaveAssistantConversations
      getPlugins: GetPlugins
      setPluginEnabled: SetPluginEnabled
      setPluginConfig: SetPluginConfig
      removePlugin: RemovePlugin
      openPluginsFolder: OpenPluginsFolder
      runPluginCommand: RunPluginCommand
      callPluginHost: CallPluginHost
    }
  }
}
