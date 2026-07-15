import { ElectronAPI } from '@electron-toolkit/preload'
import { AcknowledgeBlockInGoal, AppendToBlock, ApplyBlockRouting, ApplyNewGoalRouting, BackfillCalendar, CallPluginHost, CancelAssistantStream, ClassifyBlock, ClearCredential, ConfigureGoogleCalendar, ConnectGoogleCalendar, CreateBlock, CreateGeneratedPlugin, CreateGlossaryEntry, CreateGoal, DeleteBlock, DeleteBlockIfEmpty, DeleteCalendarItem, DeleteGlossaryEntry, DeleteGoal, DisconnectGoogleCalendar, ExtractCalendarForBlock, GetAssistantConversations, GetBlocks, GetCalendarItems, GetGlossaryEntries, GetGoals, GetLlmModels, GetPlugins, GetSettings, InterviewPluginWizard, OnAssistantStreamEvent, OpenPluginsFolder, ParseDocument, PolishTranscript, ReadBlock, RecognizeImage, RemovePlugin, RenameGoal, ResolveCalendarItem, RunInlineAction, RunPluginCommand, SaveAssistantConversations, SetCredential, SetPluginConfig, SetPluginEnabled, SetSettings, StartAssistantStream, SummarizeBlockName, SummarizeDocument, SyncGoogleCalendar, TestImageRecognitionConnection, TestLlmConnection, ToggleMacDictation, ToggleWindowsDictation, TranscribeAudio, UpdateBlockCategories, UpdateCalendarItem, UpdateGlossaryEntry, ValidateCalendarItem, WriteBlock, WriteClipboardText } from '@shared/types'

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
      getCalendarItems: GetCalendarItems
      backfillCalendar: BackfillCalendar
      extractCalendarForBlock: ExtractCalendarForBlock
      validateCalendarItem: ValidateCalendarItem
      resolveCalendarItem: ResolveCalendarItem
      updateCalendarItem: UpdateCalendarItem
      deleteCalendarItem: DeleteCalendarItem
      configureGoogleCalendar: ConfigureGoogleCalendar
      connectGoogleCalendar: ConnectGoogleCalendar
      disconnectGoogleCalendar: DisconnectGoogleCalendar
      syncGoogleCalendar: SyncGoogleCalendar
      getGlossaryEntries: GetGlossaryEntries
      createGlossaryEntry: CreateGlossaryEntry
      updateGlossaryEntry: UpdateGlossaryEntry
      deleteGlossaryEntry: DeleteGlossaryEntry
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
      parseDocument: ParseDocument
      summarizeDocument: SummarizeDocument
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
      interviewPluginWizard: InterviewPluginWizard
      createGeneratedPlugin: CreateGeneratedPlugin
    }
  }
}
