import { AppendToBlock, CreateBlock, CreateGoal, DeleteBlock, GetBlocks, GetGoals, GetSettings, ReadBlock, SetSettings, WriteBlock } from '@shared/types'
import { contextBridge, ipcRenderer } from 'electron'


if (!process.contextIsolated) {
  throw new Error('Context Isolation must be enabled in the main process!')
}

try {
  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  contextBridge.exposeInMainWorld('context', {
    locale: navigator.language,

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
    appendToBlock: (...args: Parameters<AppendToBlock>) => {
      return ipcRenderer.invoke('appendToBlock', ...args)
    },
    deleteBlock: (...args: Parameters<DeleteBlock>) => {
      return ipcRenderer.invoke('deleteBlock', ...args)
    },
    getSettings: (...args: Parameters<GetSettings>) => {
      return ipcRenderer.invoke('getSettings', ...args)
    },
    setSettings: (...args: Parameters<SetSettings>) => {
      return ipcRenderer.invoke('setSettings', ...args)
    },
    getGoals: (...args: Parameters<GetGoals>) => {
      return ipcRenderer.invoke('getGoals', ...args)
    },
    createGoal: (...args: Parameters<CreateGoal>) => {
      return ipcRenderer.invoke('createGoal', ...args)
    },
  })
} catch (error) {
  console.error('Failed to expose context bridge:', error)
}
