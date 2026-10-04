import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, rename, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolError } from '../tools'
import type { Settings } from '@shared/types'

export interface Job {
  src: string
  from: string
  to: string
  /** Base name of the source without its extension. */
  base: string
  /** A private temp folder; converters write their output here. */
  tmp: string
  settings: Settings
  signal: AbortSignal
  progress(p: number): void
}

/** What a converter produced inside `job.tmp`: one file, or one file per page. */
export type Output = string | string[]

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'nxtconvert-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** `name.ext`, or `name (1).ext`, `name (2).ext`… so nothing is overwritten. */
export function uniquePath(dir: string, base: string, ext = ''): string {
  const dot = ext ? `.${ext}` : ''
  let p = join(dir, base + dot)
  for (let i = 1; existsSync(p); i++) p = join(dir, `${base} (${i})${dot}`)
  return p
}

export async function move(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (err) {
    // Temp and output folders can sit on different volumes.
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyFile(from, to)
    await unlink(from)
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new ToolError('Cancelled', '', true)
}

/** Turn whatever went wrong into three words or fewer for the row. */
export function friendlyError(err: unknown, to: string): string {
  const e = err as Partial<ToolError & NodeJS.ErrnoException>
  if (e?.cancelled) return 'Cancelled'
  const text = `${e?.message ?? err} ${e?.stderr ?? ''}`
  if (e?.code === 'ENOENT' && /open|stat|access/.test(text)) return 'File not found'
  if (e?.code === 'ENOSPC' || /No space left/i.test(text)) return 'Disk full'
  if (e?.code === 'EACCES' || e?.code === 'EPERM' || /Permission denied/i.test(text)) return 'Permission denied'
  if (/password|encrypt/i.test(text)) return 'Password protected'
  if (/matches no streams|does not contain any stream|Output file .* does not contain/i.test(text)) {
    return ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus'].includes(to) ? 'No audio track' : 'No video track'
  }
  if (/pixel limit|too large/i.test(text)) return 'Image too large'
  if (/unsupported image format|Unknown encoder|Decoder .*not found|unsupported codec|No decoder|not supported/i.test(text)) {
    return 'Unsupported codec'
  }
  if (/Invalid data found|corrupt|damaged|premature end|bad header|truncated|Syntax Error/i.test(text)) return 'Damaged file'
  return 'Conversion failed'
}
