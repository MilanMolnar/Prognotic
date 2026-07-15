import { AcknowledgeBlockInGoal, AppendToBlock, ApplyBlockRouting, ApplyNewGoalRouting, BackfillCalendar, CallPluginHost, CancelAssistantStream, ClassifyBlock, ClearCredential, ConfigureGoogleCalendar, ConnectGoogleCalendar, CreateBlock, CreateGeneratedPlugin, CreateGlossaryEntry, CreateGoal, DeleteBlock, DeleteBlockIfEmpty, DeleteCalendarItem, DeleteGlossaryEntry, DeleteGoal, DisconnectGoogleCalendar, ExtractCalendarForBlock, GetAssistantConversations, GetBlocks, GetCalendarItems, GetGlossaryEntries, GetGoals, GetLlmModels, GetLlmUsageSummary, GetPlugins, GetSettings, InterviewPluginWizard, OnAssistantStreamEvent, OpenPluginsFolder, ParseDocument, PolishTranscript, ReadBlock, RecognizeImage, RemovePlugin, RenameGoal, ResolveCalendarItem, RunInlineAction, RunPluginCommand, SaveAssistantConversations, SetCredential, SetPluginConfig, SetPluginEnabled, SetSettings, StartAssistantStream, SummarizeBlockName, SummarizeDocument, SyncGoogleCalendar, TestImageRecognitionConnection, TestLlmConnection, ToggleMacDictation, TranscribeAudio, UpdateBlockCategories, UpdateCalendarItem, UpdateGlossaryEntry, ValidateCalendarItem, WriteBlock, WriteClipboardText } from '@shared/types'
import { contextBridge, ipcRenderer } from 'electron'


if (!process.contextIsolated) {
  throw new Error('Context Isolation must be enabled in the main process!')
}

try {
  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  contextBridge.exposeInMainWorld('context', {
    // OS locale only; renderer UI copy and formatting follow settings.uiLocale.
    locale: navigator.language,
    platform: process.platform,

    getBlocks: (...args: Parameters<GetBlocks>) => {
      return ipcRenderer.invoke('getBlocks', ...args)
    },
    readBlock: (...args: Parameters<ReadBlock>) => {
      return ipcRenderer.invoke('readBlock', ...args)
    },
    writeBlock: (...args: Parameters<WriteBlock>) => {
      return ipcRenderer.invoke('writeBlock', ...args)
    },
    createBlock: (...args: Parameters<CreateBlock>) => {
      return ipcRenderer.invoke('createBlock', ...args)
    },
    updateBlockCategories: (...args: Parameters<UpdateBlockCategories>) => {
      return ipcRenderer.invoke('updateBlockCategories', ...args)
    },
    applyBlockRouting: (...args: Parameters<ApplyBlockRouting>) => ipcRenderer.invoke('applyBlockRouting', ...args),
    applyNewGoalRouting: (...args: Parameters<ApplyNewGoalRouting>) => ipcRenderer.invoke('applyNewGoalRouting', ...args),
    acknowledgeBlockInGoal: (...args: Parameters<AcknowledgeBlockInGoal>) => ipcRenderer.invoke('acknowledgeBlockInGoal', ...args),
    appendToBlock: (...args: Parameters<AppendToBlock>) => {
      return ipcRenderer.invoke('appendToBlock', ...args)
    },
    deleteBlock: (...args: Parameters<DeleteBlock>) => {
      return ipcRenderer.invoke('deleteBlock', ...args)
    },
    deleteBlockIfEmpty: (...args: Parameters<DeleteBlockIfEmpty>) => {
      return ipcRenderer.invoke('deleteBlockIfEmpty', ...args)
    },
    getSettings: (...args: Parameters<GetSettings>) => {
      return ipcRenderer.invoke('getSettings', ...args)
    },
    setSettings: (...args: Parameters<SetSettings>) => {
      return ipcRenderer.invoke('setSettings', ...args)
    },
    setCredential: (...args: Parameters<SetCredential>) => ipcRenderer.invoke('setCredential', ...args),
    clearCredential: (...args: Parameters<ClearCredential>) => ipcRenderer.invoke('clearCredential', ...args),
    getCalendarItems: (...args: Parameters<GetCalendarItems>) => ipcRenderer.invoke('getCalendarItems', ...args),
    backfillCalendar: (...args: Parameters<BackfillCalendar>) => ipcRenderer.invoke('backfillCalendar', ...args),
    extractCalendarForBlock: (...args: Parameters<ExtractCalendarForBlock>) => ipcRenderer.invoke('extractCalendarForBlock', ...args),
    validateCalendarItem: (...args: Parameters<ValidateCalendarItem>) => ipcRenderer.invoke('validateCalendarItem', ...args),
    resolveCalendarItem: (...args: Parameters<ResolveCalendarItem>) => ipcRenderer.invoke('resolveCalendarItem', ...args),
    updateCalendarItem: (...args: Parameters<UpdateCalendarItem>) => ipcRenderer.invoke('updateCalendarItem', ...args),
    deleteCalendarItem: (...args: Parameters<DeleteCalendarItem>) => ipcRenderer.invoke('deleteCalendarItem', ...args),
    configureGoogleCalendar: (...args: Parameters<ConfigureGoogleCalendar>) => ipcRenderer.invoke('configureGoogleCalendar', ...args),
    connectGoogleCalendar: (...args: Parameters<ConnectGoogleCalendar>) => ipcRenderer.invoke('connectGoogleCalendar', ...args),
    disconnectGoogleCalendar: (...args: Parameters<DisconnectGoogleCalendar>) => ipcRenderer.invoke('disconnectGoogleCalendar', ...args),
    syncGoogleCalendar: (...args: Parameters<SyncGoogleCalendar>) => ipcRenderer.invoke('syncGoogleCalendar', ...args),
    getGlossaryEntries: (...args: Parameters<GetGlossaryEntries>) => ipcRenderer.invoke('getGlossaryEntries', ...args),
    createGlossaryEntry: (...args: Parameters<CreateGlossaryEntry>) => ipcRenderer.invoke('createGlossaryEntry', ...args),
    updateGlossaryEntry: (...args: Parameters<UpdateGlossaryEntry>) => ipcRenderer.invoke('updateGlossaryEntry', ...args),
    deleteGlossaryEntry: (...args: Parameters<DeleteGlossaryEntry>) => ipcRenderer.invoke('deleteGlossaryEntry', ...args),
    getGoals: (...args: Parameters<GetGoals>) => {
      return ipcRenderer.invoke('getGoals', ...args)
    },
    createGoal: (...args: Parameters<CreateGoal>) => {
      return ipcRenderer.invoke('createGoal', ...args)
    },
    renameGoal: (...args: Parameters<RenameGoal>) => ipcRenderer.invoke('renameGoal', ...args),
    deleteGoal: (...args: Parameters<DeleteGoal>) => ipcRenderer.invoke('deleteGoal', ...args),
    transcribeAudio: (...args: Parameters<TranscribeAudio>) => {
      return ipcRenderer.invoke('transcribeAudio', ...args)
    },
    toggleWindowsDictation: () => {
      return ipcRenderer.invoke('toggleWindowsDictation')
    },
    toggleMacDictation: (...args: Parameters<ToggleMacDictation>) => {
      return ipcRenderer.invoke('toggleMacDictation', ...args)
    },
    writeClipboardText: (...args: Parameters<WriteClipboardText>) => ipcRenderer.invoke('writeClipboardText', ...args),
    getLlmModels: (...args: Parameters<GetLlmModels>) => ipcRenderer.invoke('getLlmModels', ...args),
    getLlmUsageSummary: (...args: Parameters<GetLlmUsageSummary>) => ipcRenderer.invoke('getLlmUsageSummary', ...args),
    testLlmConnection: (...args: Parameters<TestLlmConnection>) => ipcRenderer.invoke('testLlmConnection', ...args),
    testImageRecognitionConnection: (...args: Parameters<TestImageRecognitionConnection>) => ipcRenderer.invoke('testImageRecognitionConnection', ...args),
    recognizeImage: (...args: Parameters<RecognizeImage>) => ipcRenderer.invoke('recognizeImage', ...args),
    parseDocument: (...args: Parameters<ParseDocument>) => ipcRenderer.invoke('parseDocument', ...args),
    summarizeDocument: (...args: Parameters<SummarizeDocument>) => ipcRenderer.invoke('summarizeDocument', ...args),
    startAssistantStream: (...args: Parameters<StartAssistantStream>) => ipcRenderer.invoke('startAssistantStream', ...args),
    cancelAssistantStream: (...args: Parameters<CancelAssistantStream>) => ipcRenderer.invoke('cancelAssistantStream', ...args),
    onAssistantStreamEvent: (callback: Parameters<OnAssistantStreamEvent>[0]) => {
      const listener = (_: Electron.IpcRendererEvent, event: Parameters<Parameters<OnAssistantStreamEvent>[0]>[0]): void => callback(event)
      ipcRenderer.on('assistantStreamEvent', listener)
      return () => ipcRenderer.removeListener('assistantStreamEvent', listener)
    },
    classifyBlock: (...args: Parameters<ClassifyBlock>) => ipcRenderer.invoke('classifyBlock', ...args),
    summarizeBlockName: (...args: Parameters<SummarizeBlockName>) => ipcRenderer.invoke('summarizeBlockName', ...args),
    runInlineAction: (...args: Parameters<RunInlineAction>) => ipcRenderer.invoke('runInlineAction', ...args),
    polishTranscript: (...args: Parameters<PolishTranscript>) => ipcRenderer.invoke('polishTranscript', ...args),
    getAssistantConversations: (...args: Parameters<GetAssistantConversations>) => ipcRenderer.invoke('getAssistantConversations', ...args),
    saveAssistantConversations: (...args: Parameters<SaveAssistantConversations>) => ipcRenderer.invoke('saveAssistantConversations', ...args),
    getPlugins: (...args: Parameters<GetPlugins>) => ipcRenderer.invoke('getPlugins', ...args),
    setPluginEnabled: (...args: Parameters<SetPluginEnabled>) => ipcRenderer.invoke('setPluginEnabled', ...args),
    setPluginConfig: (...args: Parameters<SetPluginConfig>) => ipcRenderer.invoke('setPluginConfig', ...args),
    removePlugin: (...args: Parameters<RemovePlugin>) => ipcRenderer.invoke('removePlugin', ...args),
    openPluginsFolder: (...args: Parameters<OpenPluginsFolder>) => ipcRenderer.invoke('openPluginsFolder', ...args),
    runPluginCommand: (...args: Parameters<RunPluginCommand>) => ipcRenderer.invoke('runPluginCommand', ...args),
    callPluginHost: (...args: Parameters<CallPluginHost>) => ipcRenderer.invoke('callPluginHost', ...args),
    interviewPluginWizard: (...args: Parameters<InterviewPluginWizard>) => ipcRenderer.invoke('interviewPluginWizard', ...args),
    createGeneratedPlugin: (...args: Parameters<CreateGeneratedPlugin>) => ipcRenderer.invoke('createGeneratedPlugin', ...args),
  })
} catch (error) {
  console.error('Failed to expose context bridge:', error)
}
