import { BrowserWindow, session } from 'electron'
import { pathToFileURL } from 'node:url'

const PARTITION = 'nxtconvert-render'
let sealed = false

/** Documents render offline: anything that isn't a local file is refused. */
function offlineSession(): Electron.Session {
  const s = session.fromPartition(PARTITION)
  if (!sealed) {
    s.webRequest.onBeforeRequest((details, cb) => {
      cb({ cancel: !/^(file|data|blob|about|devtools):/.test(details.url) })
    })
    s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
    sealed = true
  }
  return s
}

async function withPage<T>(htmlPath: string, javascript: boolean, signal: AbortSignal, fn: (win: BrowserWindow) => Promise<T>): Promise<T> {
  const win = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1400,
    webPreferences: { session: offlineSession(), sandbox: true, contextIsolation: true, javascript, offscreen: false }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  const abort = (): void => { if (!win.isDestroyed()) win.destroy() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    await win.loadURL(pathToFileURL(htmlPath).href)
    return await fn(win)
  } finally {
    signal.removeEventListener('abort', abort)
    if (!win.isDestroyed()) win.destroy()
  }
}

export function htmlToPdf(htmlPath: string, signal: AbortSignal): Promise<Buffer> {
  return withPage(htmlPath, false, signal, (win) =>
    win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', preferCSSPageSize: true }))
}

export function htmlToText(htmlPath: string, signal: AbortSignal): Promise<string> {
  // Scripts stay off; Electron still runs our own extraction in an isolated world.
  return withPage(htmlPath, false, signal, (win) =>
    win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: 'document.body ? document.body.innerText : ""' }]) as Promise<string>)
}
