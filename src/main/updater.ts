import { app, ipcMain, net, shell, type BrowserWindow } from 'electron'
import electronUpdater, { type UpdateInfo } from 'electron-updater'
import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UpdateState } from '@shared/types'

// electron-updater is CommonJS; its named exports don't survive ESM interop.
const { autoUpdater } = electronUpdater

/** Where people download by hand when the app can't install an update itself. */
export const RELEASES_URL = 'https://nxtconvert.com/#download'

let win: BrowserWindow | null = null
let state: UpdateState = { state: 'idle' }
let enabled = false
let checked = false
/** Errors before the person chose to update are kept quiet: offline, rate limits, no releases yet. */
let userInitiated = false

function set(next: UpdateState): void {
  state = next
  if (win && !win.isDestroyed()) win.webContents.send('update', state)
}

/** GitHub release notes arrive as HTML; the panel shows plain text. */
function notesText(info: UpdateInfo): string | undefined {
  const raw = Array.isArray(info.releaseNotes) ? info.releaseNotes.map((n) => n.note ?? '').join('\n\n') : info.releaseNotes
  if (!raw) return undefined
  return raw
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2000)
}

/**
 * macOS installs updates only into an app signed with a Developer ID (Squirrel.Mac checks it).
 * Unsigned or ad-hoc signed Mac builds send people to the download page instead.
 */
let installable: Promise<boolean> | null = null
function canInstall(): Promise<boolean> {
  if (process.platform !== 'darwin' || !app.isPackaged) return Promise.resolve(true)
  installable ??= new Promise((resolve) => {
    const bundle = join(app.getPath('exe'), '..', '..', '..')
    execFile('/usr/bin/codesign', ['-dv', '--verbose=2', bundle], (_err, _out, stderr) =>
      resolve(/Authority=Developer ID Application/.test(stderr)))
  })
  return installable
}

async function check(): Promise<void> {
  if (!enabled || checked || !net.isOnline()) return
  checked = true
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    checked = false // try again the next time the connection comes back
    console.warn('[update] check failed:', (err as Error).message)
  }
}

/** The window that shows update offers; checks once its page has loaded. */
export function attachUpdaterWindow(window: BrowserWindow): void {
  win = window
  window.webContents.once('did-finish-load', () => void check())
}

/** Once per launch, before the first window. */
export function setupUpdater(): void {
  // The window always asks; a dev build just never has anything to report.
  ipcMain.handle('update:state', () => state)
  ipcMain.handle('update:check', () => check())
  ipcMain.handle('update:download', async () => {
    userInitiated = true
    set({ state: 'downloading', version: state.version, current: app.getVersion(), percent: 0 })
    await autoUpdater.downloadUpdate().catch(() => {}) // reported through the 'error' event
  })
  ipcMain.handle('update:install', () => {
    // Close the window first so macOS and Windows don't wait on it.
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  })
  ipcMain.handle('update:open-page', () => shell.openExternal(RELEASES_URL))

  // A dev build can be pointed at a local feed to try the whole flow (see README, Releasing).
  // Never in a packaged app: an environment variable mustn't be able to redirect real updates.
  const testFeed = app.isPackaged ? undefined : process.env.NXT_UPDATE_FEED
  if (!app.isPackaged && !testFeed) return
  if (testFeed) {
    // Dev builds read the feed from a config file rather than the packaged app-update.yml.
    const config = join(app.getPath('temp'), 'nxtconvert-dev-app-update.yml')
    writeFileSync(config, `provider: generic\nurl: ${testFeed}\nupdaterCacheDirName: nxtconvert-updater-test\n`)
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.updateConfigPath = config
  }
  enabled = true

  autoUpdater.autoDownload = false // ask first
  autoUpdater.autoInstallOnAppQuit = true // a downloaded update installs on the next quit if not now
  autoUpdater.logger = null

  autoUpdater.on('update-available', async (info) =>
    set({ state: 'available', version: info.version, current: app.getVersion(), notes: notesText(info), canInstall: await canInstall() }))
  autoUpdater.on('download-progress', (p) =>
    set({ state: 'downloading', version: state.version, current: app.getVersion(), percent: p.percent }))
  autoUpdater.on('update-downloaded', (info) =>
    set({ state: 'ready', version: info.version, current: app.getVersion() }))
  autoUpdater.on('error', (err) => {
    console.warn('[update]', err?.message ?? err)
    // macOS only installs updates into a signed app; offer the download page instead.
    if (userInitiated) set({ state: 'error', version: state.version, current: app.getVersion() })
  })
}
