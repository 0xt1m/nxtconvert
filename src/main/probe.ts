import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { extOf, kindOf } from '@shared/formats'
import type { FileInfo } from '@shared/types'
import { FFMPEG, run, tools, ToolError } from './tools'

export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1000, i = 0
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++ }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

/** Duration and video height, read from ffmpeg's own description of the input. */
export async function probeMedia(path: string): Promise<{ duration: number; height?: number }> {
  // With no output file ffmpeg prints the input's details and exits non-zero; that's expected.
  const stderr = await run(FFMPEG, ['-hide_banner', '-nostdin', '-i', path])
    .then((r) => r.stderr, (err: ToolError) => err.stderr)
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
  const video = stderr.split('\n').find((l) => /Stream #.*: Video:/.test(l) && !/attached pic/.test(l))
  const size = video && /, (\d{2,5})x(\d{2,5})[\s,]/.exec(video)
  return {
    duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
    height: size ? Number(size[2]) : undefined
  }
}

async function imageSize(path: string, ext: string): Promise<[number, number] | null> {
  try {
    const m = await sharp(path).metadata()
    if (!m.width || !m.height) return null
    return (m.orientation ?? 1) >= 5 ? [m.height, m.width] : [m.width, m.height]
  } catch {
    if (ext === 'heic' && tools().sips) {
      const { stdout } = await run(tools().sips!, ['-g', 'pixelWidth', '-g', 'pixelHeight', path])
      const w = /pixelWidth: (\d+)/.exec(stdout), h = /pixelHeight: (\d+)/.exec(stdout)
      if (w && h) return [Number(w[1]), Number(h[1])]
    }
    return null
  }
}

/** Size plus whatever describes the file best: dimensions, duration or pages. */
export async function probe(path: string): Promise<FileInfo> {
  const ext = extOf(path)
  const { size } = await stat(path)
  const parts = [formatSize(size)]
  let vector: FileInfo['vector']
  try {
    const kind = kindOf(ext)
    if (kind === 'image') {
      const dims = await imageSize(path, ext)
      if (dims) parts.push(`${dims[0]} × ${dims[1]}`)
      if (dims && ext === 'svg') vector = { width: dims[0], height: dims[1] }
    } else if (kind === 'video' || kind === 'audio') {
      const { duration, height } = await probeMedia(path)
      if (kind === 'video' && height) parts.push(`${height}p`)
      if (duration) parts.push(formatDuration(duration))
    } else if (ext === 'pdf' && size < 200e6) {
      const doc = await PDFDocument.load(await readFile(path), { ignoreEncryption: true, updateMetadata: false })
      const n = doc.getPageCount()
      parts.push(`${n} ${n === 1 ? 'page' : 'pages'}`)
    }
  } catch {
    // Metadata is a nicety; the size alone is fine.
  }
  return { path, name: basename(path), ext, size, meta: parts.join(' · '), vector }
}
