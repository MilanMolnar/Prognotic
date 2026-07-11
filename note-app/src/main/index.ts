import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, BrowserWindowConstructorOptions, ipcMain, session, shell, systemPreferences } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { acknowledgeBlockInGoal, appendToBlock, applyBlockRouting, createBlock, createGoal, deleteBlock, deleteBlockIfEmpty, deleteGoal, getAssistantConversations, getBlocks, getGoals, getSettings, readBlock, renameGoal, saveAssistantConversations, setCredential, setSettings, updateBlockCategories, writeBlock } from './lib'
import { toggleWindowsDictation } from './dictation/windows'
import { transcribeAudio } from './dictation/wisprflow'
import { AcknowledgeBlockInGoal, AppendToBlock, ApplyBlockRouting, CancelAssistantStream, ClassifyBlock, ClearCredential, CreateBlock, CreateGoal, DeleteBlock, DeleteBlockIfEmpty, DeleteGoal, GetAssistantConversations, GetBlocks, GetGoals, GetLlmModels, GetSettings, PolishTranscript, ReadBlock, RenameGoal, RunInlineAction, SaveAssistantConversations, SetCredential, SetSettings, StartAssistantStream, TestLlmConnection, TranscribeAudio, UpdateBlockCategories, WriteBlock } from '@shared/types'
import { classifyBlock, listModels, polishTranscript, runInlineAction, streamAssistant, testConnection } from './llm/router'

const assistantStreams = new Map<string, AbortController>()

const platformWindowOptions = (): BrowserWindowConstructorOptions => {
  if (process.platform === 'darwin') {
    // NOTE (macOS vibrancy): do NOT set `backgroundColor` here. Setting any
    // backgroundColor (even fully transparent like '#00000000') makes Electron
    // treat the window as non-transparent and disables the vibrancy material,
    // rendering a solid window. See electron/electron#32007 and #31461.
    return {
      frame: false,
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'active',
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 15, y: 10 }
    }
  }

  if (process.platform === 'win32') {
    return {
      backgroundMaterial: 'acrylic',
      backgroundColor: '#00000000',
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#ffffff',
        height: 32
      }
    }
  }

  return {}
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1170,
    height: 870,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    center: true,
    title: 'Note App',
    ...platformWindowOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  if (process.platform === 'darwin') {
    await systemPreferences.askForMediaAccess('microphone')
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media'
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  ipcMain.handle('getBlocks', (_, ...args: Parameters<GetBlocks>) => getBlocks(...args))
  ipcMain.handle('readBlock', (_, ...args: Parameters<ReadBlock>) => readBlock(...args))
  ipcMain.handle('writeBlock', (_, ...args: Parameters<WriteBlock>) => writeBlock(...args))
  ipcMain.handle('createBlock', (_, ...args: Parameters<CreateBlock>) => createBlock(...args))
  ipcMain.handle('updateBlockCategories', (_, ...args: Parameters<UpdateBlockCategories>) => updateBlockCategories(...args))
  ipcMain.handle('applyBlockRouting', (_, ...args: Parameters<ApplyBlockRouting>) => applyBlockRouting(...args))
  ipcMain.handle('acknowledgeBlockInGoal', (_, ...args: Parameters<AcknowledgeBlockInGoal>) => acknowledgeBlockInGoal(...args))
  ipcMain.handle('appendToBlock', (_, ...args: Parameters<AppendToBlock>) => appendToBlock(...args))
  ipcMain.handle('deleteBlock', (_, ...args: Parameters<DeleteBlock>) => deleteBlock(...args))
  ipcMain.handle('deleteBlockIfEmpty', (_, ...args: Parameters<DeleteBlockIfEmpty>) => deleteBlockIfEmpty(...args))
  ipcMain.handle('getSettings', (_, ...args: Parameters<GetSettings>) => getSettings(...args))
  ipcMain.handle('setSettings', (_, ...args: Parameters<SetSettings>) => setSettings(...args))
  ipcMain.handle('setCredential', (_, ...args: Parameters<SetCredential>) => setCredential(...args))
  ipcMain.handle('clearCredential', (_, name: Parameters<ClearCredential>[0]) => setCredential(name, ''))
  ipcMain.handle('getGoals', (_, ...args: Parameters<GetGoals>) => getGoals(...args))
  ipcMain.handle('createGoal', (_, ...args: Parameters<CreateGoal>) => createGoal(...args))
  ipcMain.handle('renameGoal', (_, ...args: Parameters<RenameGoal>) => renameGoal(...args))
  ipcMain.handle('deleteGoal', (_, ...args: Parameters<DeleteGoal>) => deleteGoal(...args))
  ipcMain.handle('transcribeAudio', (_, ...args: Parameters<TranscribeAudio>) => transcribeAudio(...args))
  ipcMain.handle('toggleWindowsDictation', (event) => toggleWindowsDictation(event.sender))
  ipcMain.handle('getLlmModels', async (_, ...args: Parameters<GetLlmModels>) => {
    try { return { models: await listModels(...args) } } catch (error) { return { error: error instanceof Error ? error.message : 'Could not load models.' } }
  })
  ipcMain.handle('testLlmConnection', async (): Promise<Awaited<ReturnType<TestLlmConnection>>> => {
    try { await testConnection(); return { ok: true } } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Connection test failed.' } }
  })
  ipcMain.handle('startAssistantStream', async (event, requestId: Parameters<StartAssistantStream>[0], message: Parameters<StartAssistantStream>[1], history: Parameters<StartAssistantStream>[2], scope: Parameters<StartAssistantStream>[3], selection: Parameters<StartAssistantStream>[4]) => {
    if (assistantStreams.has(requestId)) return { ok: false, error: 'An assistant request with this id is already running.' }
    const controller = new AbortController()
    assistantStreams.set(requestId, controller)
    void streamAssistant(message, history, scope, selection, { signal: controller.signal, onToken: (text) => event.sender.send('assistantStreamEvent', { requestId, type: 'token', text }) })
      .then(({ citedBlockIds, readGoalLabels }) => event.sender.send('assistantStreamEvent', { requestId, type: 'done', citedBlockIds, readGoalLabels }))
      .catch((error) => { if (!controller.signal.aborted) event.sender.send('assistantStreamEvent', { requestId, type: 'error', message: error instanceof Error ? error.message : 'Assistant request failed.' }) })
      .finally(() => assistantStreams.delete(requestId))
    return { ok: true }
  })
  ipcMain.handle('cancelAssistantStream', (_, ...args: Parameters<CancelAssistantStream>) => { assistantStreams.get(args[0])?.abort(); assistantStreams.delete(args[0]) })
  ipcMain.handle('classifyBlock', async (_, ...args: Parameters<ClassifyBlock>) => {
    try { return { block: await classifyBlock(...args) } }
    catch (error) { return { block: null, error: error instanceof Error ? error.message : 'Could not classify this note.' } }
  })
  ipcMain.handle('runInlineAction', async (_, ...args: Parameters<RunInlineAction>) => { try { return { text: await runInlineAction(...args) } } catch (error) { return { error: error instanceof Error ? error.message : 'AI action failed.' } } })
  ipcMain.handle('polishTranscript', async (_, ...args: Parameters<PolishTranscript>) => { try { return { text: await polishTranscript(...args) } } catch (error) { return { error: error instanceof Error ? error.message : 'Transcript cleanup failed.' } } })
  ipcMain.handle('getAssistantConversations', (_, ...args: Parameters<GetAssistantConversations>) => getAssistantConversations(...args))
  ipcMain.handle('saveAssistantConversations', (_, ...args: Parameters<SaveAssistantConversations>) => saveAssistantConversations(...args))

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
