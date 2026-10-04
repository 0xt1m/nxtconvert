import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import type { Caps } from '@shared/formats'

/** Binaries inside app.asar can't be executed; electron-builder unpacks them next to it. */
function unpacked(p: string): string {
  return p.replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked')
}

export const FFMPEG = unpacked(ffmpegStatic as unknown as string)

const EXE = process.platform === 'win32' ? '.exe' : ''

// GUI apps on macOS don't inherit the shell PATH, so also look where package managers install.
const EXTRA_DIRS: Record<string, string[]> = {
  darwin: ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/Applications/LibreOffice.app/Contents/MacOS'],
  linux: ['/usr/bin', '/usr/local/bin', '/snap/bin', '/opt/libreoffice/program'],
  win32: [
    'C:\\Program Files\\LibreOffice\\program',
    'C:\\Program Files (x86)\\LibreOffice\\program',
    join(process.env.LOCALAPPDATA ?? '', 'Pandoc'),
    'C:\\Program Files\\Pandoc',
    // Poppler from Scoop, Chocolatey or a manual unzip.
    join(process.env.USERPROFILE ?? '', 'scoop', 'shims'),
    'C:\\ProgramData\\chocolatey\\bin',
    'C:\\Program Files\\poppler\\Library\\bin',
    'C:\\Program Files\\poppler\\bin'
  ]
}

function which(name: string): string | null {
  const dirs = [...(process.env.PATH ?? '').split(delimiter), ...(EXTRA_DIRS[process.platform] ?? [])]
  for (const dir of dirs) {
    if (!dir) continue
    const p = join(dir, name + EXE)
    if (existsSync(p)) return p
  }
  return null
}

export interface ToolPaths {
  sips: string | null
  pandoc: string | null
  soffice: string | null
  pdftoppm: string | null
  pdftotext: string | null
}

let cached: ToolPaths | null = null

export function tools(): ToolPaths {
  if (!cached) {
    cached = {
      sips: process.platform === 'darwin' && existsSync('/usr/bin/sips') ? '/usr/bin/sips' : null,
      pandoc: which('pandoc'),
      soffice: which('soffice'),
      pdftoppm: which('pdftoppm'),
      pdftotext: which('pdftotext')
    }
  }
  return cached
}

export function capabilities(): Caps {
  const t = tools()
  return {
    platform: process.platform,
    sips: !!t.sips,
    pandoc: !!t.pandoc,
    soffice: !!t.soffice,
    poppler: !!(t.pdftoppm && t.pdftotext)
  }
}

export class ToolError extends Error {
  constructor(message: string, readonly stderr = '', readonly cancelled = false) {
    super(message)
  }
}

export interface RunOptions {
  signal?: AbortSignal
  onStdout?: (chunk: string) => void
  cwd?: string
}

/** Run a tool to completion. Rejects with its stderr on a non-zero exit. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new ToolError('Cancelled', '', true))
    const child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true })
    let stdout = '', stderr = ''
    const abort = (): void => { child.kill('SIGKILL') }
    opts.signal?.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (d: Buffer) => {
      const s = d.toString()
      stdout += s
      opts.onStdout?.(s)
    })
    child.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-16000) })
    child.on('error', (err) => {
      opts.signal?.removeEventListener('abort', abort)
      reject(new ToolError(err.message))
    })
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', abort)
      if (opts.signal?.aborted) reject(new ToolError('Cancelled', stderr, true))
      else if (code === 0) resolve({ stdout, stderr })
      else reject(new ToolError(`${cmd} exited with ${code}`, stderr))
    })
  })
}
