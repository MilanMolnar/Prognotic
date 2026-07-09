import { AppendToBlock, ApplyBlockRouting, CancelAssistantStream, ClassifyBlock, ClearCredential, CreateBlock, CreateGoal, DeleteBlock, DeleteBlockIfEmpty, DeleteGoal, GetAssistantConversations, GetBlocks, GetGoals, GetLlmModels, GetSettings, OnAssistantStreamEvent, PolishTranscript, ReadBlock, RenameGoal, RunInlineAction, SaveAssistantConversations, SetCredential, SetSettings, StartAssistantStream, TestLlmConnection, TranscribeAudio, UpdateBlockCategories, WriteBlock } from '@shared/types'
import { contextBridge, ipcRenderer } from 'electron'


if (!process.contextIsolated) {
  throw new Error('Context Isolation must be enabled in the main process!')
}

try {
  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  contextBridge.exposeInMainWorld('context', {
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
    getLlmModels: (...args: Parameters<GetLlmModels>) => ipcRenderer.invoke('getLlmModels', ...args),
    testLlmConnection: (...args: Parameters<TestLlmConnection>) => ipcRenderer.invoke('testLlmConnection', ...args),
    startAssistantStream: (...args: Parameters<StartAssistantStream>) => ipcRenderer.invoke('startAssistantStream', ...args),
    cancelAssistantStream: (...args: Parameters<CancelAssistantStream>) => ipcRenderer.invoke('cancelAssistantStream', ...args),
    onAssistantStreamEvent: (callback: Parameters<OnAssistantStreamEvent>[0]) => {
      const listener = (_: Electron.IpcRendererEvent, event: Parameters<Parameters<OnAssistantStreamEvent>[0]>[0]): void => callback(event)
      ipcRenderer.on('assistantStreamEvent', listener)
      return () => ipcRenderer.removeListener('assistantStreamEvent', listener)
    },
    classifyBlock: (...args: Parameters<ClassifyBlock>) => ipcRenderer.invoke('classifyBlock', ...args),
    runInlineAction: (...args: Parameters<RunInlineAction>) => ipcRenderer.invoke('runInlineAction', ...args),
    polishTranscript: (...args: Parameters<PolishTranscript>) => ipcRenderer.invoke('polishTranscript', ...args),
    getAssistantConversations: (...args: Parameters<GetAssistantConversations>) => ipcRenderer.invoke('getAssistantConversations', ...args),
    saveAssistantConversations: (...args: Parameters<SaveAssistantConversations>) => ipcRenderer.invoke('saveAssistantConversations', ...args),
  })
} catch (error) {
  console.error('Failed to expose context bridge:', error)
}
