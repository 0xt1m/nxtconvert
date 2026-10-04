import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { FORMATS } from '@shared/formats'
import type { ConvertRequest, Environment, Platform, Settings } from '@shared/types'
import { capabilities } from './tools'
import { getSettings, saveSettings } from './settings'
import { probe } from './probe'
import { cancel, convert } from './convert'
import { attachUpdaterWindow, setupUpdater } from './updater'

const PLATFORM: Platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux'
const isMac = PLATFORM === 'mac'

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 960,
    height: 600,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'nxtconvert',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1012' : '#f4f4f1',
    // macOS keeps its real traffic lights, placed inside our 44px title bar.
    // Windows and Linux are frameless; the title bar draws their caption buttons.
    ...(isMac ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 16, y: 16 } } : { frame: false }),
    icon: isMac ? undefined : join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })
  win.once('ready-to-show', () => win?.show())
  attachUpdaterWindow(win)
  win.on('closed', () => { win = null })

  // Dropping a file outside the drop handlers must never navigate the app away.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

const send = (cmd: string): void => win?.webContents.send('command', cmd)

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Add files…', accelerator: 'CmdOrCtrl+O', click: () => send('add-files') },
        { label: 'Convert', accelerator: 'CmdOrCtrl+Enter', click: () => send('convert') },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload', visible: !app.isPackaged },
        { role: 'toggleDevTools', visible: !app.isPackaged },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(): void {
  ipcMain.handle('environment', (): Environment => ({ platform: PLATFORM, caps: capabilities(), settings: getSettings() }))

  ipcMain.handle('pick-files', async () => {
    const extensions = [...new Set(Object.values(FORMATS).flat().map((f) => f.ext)
      .concat(['jpeg', 'tif', 'heif', 'svg', 'm4v', 'htm', 'md', 'doc']))]
    const r = await dialog.showOpenDialog(win!, {
      title: 'Add files',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Supported files', extensions }, { name: 'All files', extensions: ['*'] }]
    })
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle('pick-folder', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Save to',
      defaultPath: getSettings().outputDir,
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('probe', (_e, paths: string[]) =>
    Promise.all(paths.map((p) => probe(p).catch(() => null))).then((all) => all.filter(Boolean)))

  ipcMain.handle('convert', (e, req: ConvertRequest) =>
    convert(req, (progress) => { if (!e.sender.isDestroyed()) e.sender.send('progress', { id: req.id, progress }) }))

  ipcMain.handle('cancel', (_e, id: string) => cancel(id))
  ipcMain.handle('reveal', (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('open-folder', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('save-settings', (_e, patch: Partial<Settings>) => saveSettings(patch))

  ipcMain.on('window', (_e, action: string) => {
    if (!win) return
    if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize()
    else if (action === 'close') win.close()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
  app.whenReady().then(() => {
    app.setAppUserModelId('app.nxtconvert')
    // Packaged apps get their icon from the bundle; in dev, replace Electron's in the Dock.
    if (isMac && !app.isPackaged) app.dock?.setIcon(join(__dirname, '../../resources/icon-mac.png'))
    registerIpc()
    buildMenu()
    setupUpdater()
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
  app.on('window-all-closed', () => { if (!isMac) app.quit() })
}
