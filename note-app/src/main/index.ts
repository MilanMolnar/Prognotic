import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, BrowserWindowConstructorOptions, clipboard, ipcMain, session, shell, systemPreferences } from 'electron'
import { join } from 'path'
import { assistantDisplayName } from '@shared/constants'
import icon from '../../resources/icon.png?asset'
import { acknowledgeBlockInGoal, appendToBlock, applyBlockRouting, applyNewGoalRouting, createBlock, createGoal, deleteBlock, deleteBlockIfEmpty, deleteGoal, getAssistantConversations, getBlocks, getGoals, getSettings, readBlock, renameGoal, saveAssistantConversations, setCredential, setGoogleOAuthClientCredentials, setSettings, updateBlockCategories, writeBlock } from './lib'
import { toggleMacDictation } from './dictation/macos'
import { toggleWindowsDictation } from './dictation/windows'
import { transcribeAudio } from './dictation/wisprflow'
import { AcknowledgeBlockInGoal, AppendToBlock, ApplyBlockRouting, ApplyNewGoalRouting, BackfillCalendar, CallPluginHost, CancelAssistantStream, ClassifyBlock, ClearCredential, ConfigureGoogleCalendar, ConnectGoogleCalendar, CreateBlock, CreateGeneratedPlugin, CreateGlossaryEntry, CreateGoal, DeleteBlock, DeleteBlockIfEmpty, DeleteCalendarItem, DeleteGlossaryEntry, DeleteGoal, DisconnectGoogleCalendar, ExtractCalendarForBlock, GetAssistantConversations, GetBlocks, GetCalendarItems, GetGlossaryEntries, GetGoals, GetLlmModels, GetPlugins, GetSettings, InterviewPluginWizard, OpenPluginsFolder, ParseDocument as ParseDocumentIpc, PolishTranscript, ReadBlock, RecognizeImage as RecognizeImageIpc, RemovePlugin, RenameGoal, ResolveCalendarItem, RunInlineAction, RunPluginCommand, SaveAssistantConversations, SetCredential, SetPluginConfig, SetPluginEnabled, SetSettings, StartAssistantStream, SummarizeBlockName, SummarizeDocument as SummarizeDocumentIpc, SyncGoogleCalendar, TestImageRecognitionConnection, TestLlmConnection, TranscribeAudio, UpdateBlockCategories, UpdateCalendarItem, UpdateGlossaryEntry, ValidateCalendarItem, WriteBlock, WriteClipboardText } from '@shared/types'
import { classifyBlock, listModels, polishTranscript, recognizeImage, runInlineAction, streamAssistant, summarizeBlockName, summarizeDocument, testConnection, testImageRecognitionConnection } from './llm/router'
import { callPluginHost, ensurePluginsDirectory, initializePlugins, refreshPluginCatalog, removePlugin, runPluginCommand, setPluginConfig, setPluginEnabled } from './plugins'
import { createGeneratedPlugin, interviewPluginWizard } from './plugins/wizard'
import { parseDocumentLocally } from './documents'
import { backfillCalendarFromVault, deleteCalendarItem, extractCalendarForBlock, getCalendarItems, resolveCalendarItem, updateCalendarItem, validateCalendarItem } from './calendar/service'
import { connectGoogleCalendar, disconnectGoogleCalendar, syncGoogleCalendar } from './calendar/google'
import { createGlossaryEntry, deleteGlossaryEntry, getGlossaryEntries, updateGlossaryEntry } from './glossary/store'

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
    width: 1500,
    height: 900,
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
    try {
      const target = new URL(details.url)
      if (target.protocol === 'https:' || target.protocol === 'http:') {
        void shell.openExternal(target.toString())
      }
    } catch {
      // Malformed and unsupported URLs stay blocked inside the sandbox.
    }
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

  try {
    await initializePlugins()
  } catch (error) {
    console.error('Could not initialize plugins.', error)
  }

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
  ipcMain.handle('applyNewGoalRouting', (_, ...args: Parameters<ApplyNewGoalRouting>) => applyNewGoalRouting(...args))
  ipcMain.handle('acknowledgeBlockInGoal', (_, ...args: Parameters<AcknowledgeBlockInGoal>) => acknowledgeBlockInGoal(...args))
  ipcMain.handle('appendToBlock', (_, ...args: Parameters<AppendToBlock>) => appendToBlock(...args))
  ipcMain.handle('deleteBlock', (_, ...args: Parameters<DeleteBlock>) => deleteBlock(...args))
  ipcMain.handle('deleteBlockIfEmpty', (_, ...args: Parameters<DeleteBlockIfEmpty>) => deleteBlockIfEmpty(...args))
  ipcMain.handle('getSettings', (_, ...args: Parameters<GetSettings>) => getSettings(...args))
  ipcMain.handle('setSettings', (_, ...args: Parameters<SetSettings>) => setSettings(...args))
  ipcMain.handle('setCredential', (_, ...args: Parameters<SetCredential>) => setCredential(...args))
  ipcMain.handle('clearCredential', (_, name: Parameters<ClearCredential>[0]) => setCredential(name, ''))
  ipcMain.handle('getCalendarItems', (_, ...args: Parameters<GetCalendarItems>) => getCalendarItems(...args))
  ipcMain.handle('backfillCalendar', (_, ...args: Parameters<BackfillCalendar>) => backfillCalendarFromVault(...args))
  ipcMain.handle('extractCalendarForBlock', async (_, ...args: Parameters<ExtractCalendarForBlock>) => {
    try { return await extractCalendarForBlock(...args) }
    catch (error) {
      return {
        items: await getCalendarItems(),
        usedAi: false,
        warning: error instanceof Error ? error.message : 'Calendar extraction failed.'
      }
    }
  })
  ipcMain.handle('validateCalendarItem', (_, ...args: Parameters<ValidateCalendarItem>) => validateCalendarItem(...args))
  ipcMain.handle('resolveCalendarItem', (_, ...args: Parameters<ResolveCalendarItem>) => resolveCalendarItem(...args))
  ipcMain.handle('updateCalendarItem', (_, ...args: Parameters<UpdateCalendarItem>) => updateCalendarItem(...args))
  ipcMain.handle('deleteCalendarItem', (_, ...args: Parameters<DeleteCalendarItem>) => deleteCalendarItem(...args))
  ipcMain.handle('configureGoogleCalendar', (_, ...args: Parameters<ConfigureGoogleCalendar>) => setGoogleOAuthClientCredentials(...args))
  ipcMain.handle('connectGoogleCalendar', (_, ...args: Parameters<ConnectGoogleCalendar>) => connectGoogleCalendar(...args))
  ipcMain.handle('disconnectGoogleCalendar', (_, ...args: Parameters<DisconnectGoogleCalendar>) => disconnectGoogleCalendar(...args))
  ipcMain.handle('syncGoogleCalendar', (_, ...args: Parameters<SyncGoogleCalendar>) => syncGoogleCalendar(...args))
  ipcMain.handle('getGlossaryEntries', (_, ...args: Parameters<GetGlossaryEntries>) => getGlossaryEntries(...args))
  ipcMain.handle('createGlossaryEntry', (_, ...args: Parameters<CreateGlossaryEntry>) => createGlossaryEntry(...args))
  ipcMain.handle('updateGlossaryEntry', (_, ...args: Parameters<UpdateGlossaryEntry>) => updateGlossaryEntry(...args))
  ipcMain.handle('deleteGlossaryEntry', (_, ...args: Parameters<DeleteGlossaryEntry>) => deleteGlossaryEntry(...args))
  ipcMain.handle('getGoals', (_, ...args: Parameters<GetGoals>) => getGoals(...args))
  ipcMain.handle('createGoal', (_, ...args: Parameters<CreateGoal>) => createGoal(...args))
  ipcMain.handle('renameGoal', (_, ...args: Parameters<RenameGoal>) => renameGoal(...args))
  ipcMain.handle('deleteGoal', (_, ...args: Parameters<DeleteGoal>) => deleteGoal(...args))
  ipcMain.handle('transcribeAudio', (_, ...args: Parameters<TranscribeAudio>) => transcribeAudio(...args))
  ipcMain.handle('toggleWindowsDictation', (event) => toggleWindowsDictation(event.sender))
  ipcMain.handle('toggleMacDictation', (event) => toggleMacDictation(event.sender))
  ipcMain.handle('writeClipboardText', (_, text: Parameters<WriteClipboardText>[0]) => {
    if (typeof text !== 'string') throw new TypeError('Clipboard text must be a string.')
    clipboard.writeText(text)
  })
  ipcMain.handle('getLlmModels', async (_, ...args: Parameters<GetLlmModels>) => {
    try { return { models: await listModels(...args) } } catch (error) { return { error: error instanceof Error ? error.message : 'Could not load models.' } }
  })
  ipcMain.handle('testLlmConnection', async (): Promise<Awaited<ReturnType<TestLlmConnection>>> => {
    try {
      const verifiedConnection = await testConnection()
      const latest = await getSettings()
      await setSettings({ llm: { ...latest.llm, verifiedConnection } })
      return { ok: true }
    } catch (error) {
      try {
        const latest = await getSettings()
        await setSettings({ llm: { ...latest.llm, verifiedConnection: undefined } })
      } catch {
        // Preserve the connection-test error if verification invalidation fails.
      }
      return { ok: false, error: error instanceof Error ? error.message : 'Connection test failed.' }
    }
  })
  ipcMain.handle('testImageRecognitionConnection', async (): Promise<Awaited<ReturnType<TestImageRecognitionConnection>>> => {
    try {
      const verifiedImageRecognitionConnection = await testImageRecognitionConnection()
      const latest = await getSettings()
      await setSettings({ llm: { ...latest.llm, verifiedImageRecognitionConnection } })
      return { ok: true }
    } catch (error) {
      try {
        const latest = await getSettings()
        await setSettings({ llm: { ...latest.llm, verifiedImageRecognitionConnection: undefined } })
      } catch {
        // Preserve the connection-test error if verification invalidation fails.
      }
      return { ok: false, error: error instanceof Error ? error.message : 'Image connection test failed.' }
    }
  })
  ipcMain.handle('recognizeImage', async (_, ...args: Parameters<RecognizeImageIpc>): Promise<Awaited<ReturnType<RecognizeImageIpc>>> => {
    try { return { text: await recognizeImage(...args) } }
    catch (error) { return { error: error instanceof Error ? error.message : 'Image recognition failed.' } }
  })
  ipcMain.handle('parseDocument', async (_, ...args: Parameters<ParseDocumentIpc>): Promise<Awaited<ReturnType<ParseDocumentIpc>>> => {
    try { return await parseDocumentLocally(...args) }
    catch (error) { return { error: error instanceof Error ? error.message : 'Document parsing failed.' } }
  })
  ipcMain.handle('summarizeDocument', async (_, ...args: Parameters<SummarizeDocumentIpc>): Promise<Awaited<ReturnType<SummarizeDocumentIpc>>> => {
    try { return await summarizeDocument(...args) }
    catch (error) { return { error: error instanceof Error ? error.message : 'Document summarization failed.' } }
  })
  ipcMain.handle('startAssistantStream', async (event, requestId: Parameters<StartAssistantStream>[0], message: Parameters<StartAssistantStream>[1], history: Parameters<StartAssistantStream>[2], scope: Parameters<StartAssistantStream>[3], selection: Parameters<StartAssistantStream>[4]) => {
    if (assistantStreams.has(requestId)) return { ok: false, error: `A ${assistantDisplayName} request with this id is already running.` }
    const controller = new AbortController()
    assistantStreams.set(requestId, controller)
    void streamAssistant(message, history, scope, selection, { signal: controller.signal, onToken: (text) => event.sender.send('assistantStreamEvent', { requestId, type: 'token', text }) })
      .then(({ citedBlockIds, citedBlockCategoryIds, readGoalLabels }) => event.sender.send('assistantStreamEvent', { requestId, type: 'done', citedBlockIds, citedBlockCategoryIds, readGoalLabels }))
      .catch((error) => { if (!controller.signal.aborted) event.sender.send('assistantStreamEvent', { requestId, type: 'error', message: error instanceof Error ? error.message : `${assistantDisplayName} request failed.` }) })
      .finally(() => assistantStreams.delete(requestId))
    return { ok: true }
  })
  ipcMain.handle('cancelAssistantStream', (_, ...args: Parameters<CancelAssistantStream>) => { assistantStreams.get(args[0])?.abort(); assistantStreams.delete(args[0]) })
  ipcMain.handle('classifyBlock', async (_, ...args: Parameters<ClassifyBlock>) => {
    try { return { block: await classifyBlock(...args) } }
    catch (error) { return { block: null, error: error instanceof Error ? error.message : 'Could not classify this note.' } }
  })
  ipcMain.handle('summarizeBlockName', async (_, ...args: Parameters<SummarizeBlockName>) => {
    try { return { block: await summarizeBlockName(...args) } }
    catch (error) { return { block: null, error: error instanceof Error ? error.message : 'Could not name this note.' } }
  })
  ipcMain.handle('runInlineAction', async (_, ...args: Parameters<RunInlineAction>) => { try { return { text: await runInlineAction(...args) } } catch (error) { return { error: error instanceof Error ? error.message : 'AI action failed.' } } })
  ipcMain.handle('polishTranscript', async (_, ...args: Parameters<PolishTranscript>) => { try { return { text: await polishTranscript(...args) } } catch (error) { return { error: error instanceof Error ? error.message : 'Transcript cleanup failed.' } } })
  ipcMain.handle('getAssistantConversations', (_, ...args: Parameters<GetAssistantConversations>) => getAssistantConversations(...args))
  ipcMain.handle('saveAssistantConversations', (_, ...args: Parameters<SaveAssistantConversations>) => saveAssistantConversations(...args))
  ipcMain.handle('getPlugins', (_, ...args: Parameters<GetPlugins>) => refreshPluginCatalog(...args))
  ipcMain.handle('setPluginEnabled', (_, ...args: Parameters<SetPluginEnabled>) => setPluginEnabled(...args))
  ipcMain.handle('setPluginConfig', (_, ...args: Parameters<SetPluginConfig>) => setPluginConfig(...args))
  ipcMain.handle('removePlugin', (_, ...args: Parameters<RemovePlugin>) => removePlugin(...args))
  ipcMain.handle('openPluginsFolder', async (): Promise<Awaited<ReturnType<OpenPluginsFolder>>> => {
    try {
      const error = await shell.openPath(await ensurePluginsDirectory())
      return error ? { ok: false, error: 'Could not open the plugins folder.' } : { ok: true }
    } catch {
      return { ok: false, error: 'Could not open the plugins folder.' }
    }
  })
  ipcMain.handle('runPluginCommand', (_, ...args: Parameters<RunPluginCommand>) => runPluginCommand(...args))
  ipcMain.handle('callPluginHost', (_, ...args: Parameters<CallPluginHost>) => callPluginHost(...args))
  ipcMain.handle('interviewPluginWizard', (_, ...args: Parameters<InterviewPluginWizard>) => interviewPluginWizard(...args))
  ipcMain.handle('createGeneratedPlugin', (_, ...args: Parameters<CreateGeneratedPlugin>) => createGeneratedPlugin(...args))

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
