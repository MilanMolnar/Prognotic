import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, BrowserWindowConstructorOptions, ipcMain, session, shell, systemPreferences } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { appendToBlock, createBlock, createGoal, deleteBlock, deleteBlockIfEmpty, getBlocks, getGoals, getSettings, readBlock, setSettings, updateBlockCategories, writeBlock } from './lib'
import { toggleWindowsDictation } from './dictation/windows'
import { transcribeAudio } from './dictation/wisprflow'
import { AppendToBlock, CreateBlock, CreateGoal, DeleteBlock, DeleteBlockIfEmpty, GetBlocks, GetGoals, GetSettings, ReadBlock, SetSettings, TranscribeAudio, UpdateBlockCategories, WriteBlock } from '@shared/types'

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
    width: 900,
    height: 670,
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
  ipcMain.handle('appendToBlock', (_, ...args: Parameters<AppendToBlock>) => appendToBlock(...args))
  ipcMain.handle('deleteBlock', (_, ...args: Parameters<DeleteBlock>) => deleteBlock(...args))
  ipcMain.handle('deleteBlockIfEmpty', (_, ...args: Parameters<DeleteBlockIfEmpty>) => deleteBlockIfEmpty(...args))
  ipcMain.handle('getSettings', (_, ...args: Parameters<GetSettings>) => getSettings(...args))
  ipcMain.handle('setSettings', (_, ...args: Parameters<SetSettings>) => setSettings(...args))
  ipcMain.handle('getGoals', (_, ...args: Parameters<GetGoals>) => getGoals(...args))
  ipcMain.handle('createGoal', (_, ...args: Parameters<CreateGoal>) => createGoal(...args))
  ipcMain.handle('transcribeAudio', (_, ...args: Parameters<TranscribeAudio>) => transcribeAudio(...args))
  ipcMain.handle('toggleWindowsDictation', (event) => toggleWindowsDictation(event.sender))

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
