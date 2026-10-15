import { BrowserWindow, session } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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

/**
 * A drawing as a one-page vector PDF at its own size, so lines stay sharp at any zoom and a
 * drawing measured in millimetres prints at its real size.
 */
export async function svgToPdf(svgPath: string, tmp: string, signal: AbortSignal): Promise<Buffer> {
  const page = join(tmp, 'drawing-page.html')
  await writeFile(page, `<!doctype html><meta charset="utf-8"><style>html, body { margin: 0 } img { display: block }</style>` +
    `<img src="${pathToFileURL(svgPath).href}">`)
  return withPage(page, false, signal, async (win) => {
    // The browser engine reads the drawing's own units (mm, in, px) into CSS pixels at 96 per inch.
    const [w, h] = await win.webContents.executeJavaScriptInIsolatedWorld(999, [{
      code: 'document.images[0].decode().catch(() => {}).then(() => [document.images[0].naturalWidth || 300, document.images[0].naturalHeight || 150])'
    }]) as [number, number]
    await win.webContents.insertCSS(`img { width: ${w}px; height: ${h}px }`)
    return win.webContents.printToPDF({
      printBackground: true,
      pageSize: { width: w / 96, height: h / 96 },
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
  })
}

export function htmlToText(htmlPath: string, signal: AbortSignal): Promise<string> {
  // Scripts stay off; Electron still runs our own extraction in an isolated world.
  return withPage(htmlPath, false, signal, (win) =>
    win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: 'document.body ? document.body.innerText : ""' }]) as Promise<string>)
}
