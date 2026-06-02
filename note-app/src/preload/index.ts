
import { contextBridge } from 'electron'


if (!process.contextIsolated) {
  throw new Error('Context Isolation must be enabled in the main process!')
}

try {
  // Expose protected methods that allow the renderer process to use
  // the ipcRenderer without exposing the entire object
  contextBridge.exposeInMainWorld('context', {
    locale: navigator.language
  })
} catch (error) {
  console.error('Failed to expose context bridge:', error)
}