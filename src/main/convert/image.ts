import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import sharp, { type Sharp, type SharpOptions } from 'sharp'
import { PDFDocument } from 'pdf-lib'
import type { ImagePlan } from '@shared/formats'
import { FFMPEG, run, tools, ToolError } from '../tools'
import { throwIfAborted, type Job, type Output } from './util'
import heicWorkerPath from './heic.worker?modulePath'

/** Decoded pixels handed straight to sharp, with no intermediate file. */
interface RawPixels {
  pixels: Buffer
  width: number
  height: number
  channels: 3 | 4
}

type Input = string | RawPixels

/** A sharp pipeline for any input. */
function open(input: Input, options: SharpOptions = {}): Sharp {
  if (typeof input === 'string') return sharp(input, options)
  const { pixels, width, height, channels } = input
  return sharp(pixels, { ...options, raw: { width, height, channels } })
}

/** Decodes HEIC in a worker thread (see heic.worker.ts); cancelling stops the worker. */
async function decodeHeic(file: string, signal: AbortSignal): Promise<RawPixels> {
  const buffer = await readFile(file)
  return new Promise((resolve, reject) => {
    const worker = new Worker(heicWorkerPath, { workerData: buffer })
    const abort = (): void => {
      void worker.terminate()
      reject(new ToolError('Cancelled', '', true))
    }
    signal.addEventListener('abort', abort, { once: true })
    const done = (): void => {
      signal.removeEventListener('abort', abort)
      void worker.terminate()
    }
    worker.once('message', (m: { width: number; height: number; channels: 3 | 4; pixels: Uint8Array } | { error: string }) => {
      done()
      if ('error' in m) return reject(new Error(m.error))
      resolve({ pixels: Buffer.from(m.pixels.buffer, m.pixels.byteOffset, m.pixels.byteLength), width: m.width, height: m.height, channels: m.channels })
    })
    worker.once('error', (err) => { done(); reject(err) })
  })
}

/** Bring any source into something sharp can read. */
async function decode(job: Job, plan: ImagePlan): Promise<Input> {
  switch (plan.decode) {
    case 'sharp':
      return job.src
    case 'sips': {
      const out = join(job.tmp, 'decoded.png')
      await run(tools().sips!, ['-s', 'format', 'png', job.src, '--out', out], { signal: job.signal })
      return out
    }
    case 'heic-wasm':
      return decodeHeic(job.src, job.signal)
    case 'ffmpeg': {
      const out = join(job.tmp, 'decoded.png')
      await run(FFMPEG, ['-hide_banner', '-nostdin', '-y', '-i', job.src, '-frames:v', '1', out], { signal: job.signal })
      return out
    }
  }
}

function pipeline(input: Input, job: Job, animated = false): Sharp {
  let img = open(input, { animated }).rotate()
  if (!job.settings.stripMetadata) img = img.keepMetadata()
  return img
}

export async function convertImage(job: Job, plan: ImagePlan): Promise<Output> {
  const q = job.settings.imageQuality
  const out = join(job.tmp, `out.${job.to}`)

  const input = await decode(job, plan)
  job.progress(35)
  throwIfAborted(job.signal)

  switch (plan.encode) {
    case 'sharp': {
      const animated = (job.from === 'gif' || job.from === 'webp') && (job.to === 'gif' || job.to === 'webp')
      const img = pipeline(input, job, animated)
      // mozjpeg makes files ~13% smaller but encodes ~12× slower; spend that only when asked for small files.
      if (job.to === 'jpg') await img.flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: q <= 75 }).toFile(out)
      else if (job.to === 'png') await img.png({ compressionLevel: 8 }).toFile(out)
      else if (job.to === 'webp') await img.webp({ quality: q }).toFile(out)
      // AVIF looks as good as JPEG at a much lower quality number.
      else if (job.to === 'avif') await img.avif({ quality: Math.max(30, q - 25) }).toFile(out)
      else if (job.to === 'gif') await img.gif().toFile(out)
      else if (job.to === 'tiff') await img.tiff({ compression: 'lzw' }).toFile(out)
      break
    }
    case 'bmp': {
      const { data, info } = await pipeline(input, job).flatten({ background: '#ffffff' }).removeAlpha().raw()
        .toBuffer({ resolveWithObject: true })
      await writeFile(out, encodeBmp(data, info.width, info.height))
      break
    }
    case 'ico':
      await writeFile(out, await encodeIco(input))
      break
    case 'pdf':
      await writeFile(out, await encodePdf(input))
      break
    case 'sips': {
      let file = input
      if (typeof file !== 'string' || plan.decode !== 'sharp') {
        file = join(job.tmp, 'oriented.png')
        await open(input).rotate().png().toFile(file)
      }
      await run(tools().sips!, ['-s', 'format', 'heic', '-s', 'formatOptions', String(q), file, '--out', out], { signal: job.signal })
      break
    }
  }
  job.progress(100)
  return out
}

/** 24-bit bottom-up BMP from packed RGB. */
export function encodeBmp(rgb: Buffer, width: number, height: number): Buffer {
  const stride = Math.ceil((width * 3) / 4) * 4
  const size = 54 + stride * height
  const buf = Buffer.alloc(size)
  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(size, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(stride * height, 34)
  buf.writeInt32LE(2835, 38) // 72 dpi
  buf.writeInt32LE(2835, 42)
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * stride
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 3, d = row + x * 3
      buf[d] = rgb[s + 2]
      buf[d + 1] = rgb[s + 1]
      buf[d + 2] = rgb[s]
    }
  }
  return buf
}

/** Multi-size ICO with PNG-compressed entries, square and padded with transparency. */
async function encodeIco(input: Input): Promise<Buffer> {
  const meta = await open(input).metadata()
  const longest = Math.max(meta.width ?? 256, meta.height ?? 256)
  const sizes = [16, 24, 32, 48, 64, 128, 256].filter((s) => s <= Math.max(16, longest))
  const pngs = await Promise.all(sizes.map((s) =>
    open(input).rotate().resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()))

  const header = Buffer.alloc(6 + 16 * sizes.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  sizes.forEach((s, i) => {
    const e = 6 + i * 16
    header.writeUInt8(s >= 256 ? 0 : s, e)
    header.writeUInt8(s >= 256 ? 0 : s, e + 1)
    header.writeUInt16LE(1, e + 4) // colour planes
    header.writeUInt16LE(32, e + 6) // bits per pixel
    header.writeUInt32LE(pngs[i].length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += pngs[i].length
  })
  return Buffer.concat([header, ...pngs])
}

/** One page sized to the image at 96 dpi. */
async function encodePdf(input: Input): Promise<Buffer> {
  const img = open(input).rotate()
  const meta = await img.metadata()
  const doc = await PDFDocument.create()
  const embedded = meta.hasAlpha
    ? await doc.embedPng(await img.png().toBuffer())
    : await doc.embedJpg(await img.jpeg({ quality: 92 }).toBuffer())
  const w = embedded.width * 0.75, h = embedded.height * 0.75
  doc.addPage([w, h]).drawImage(embedded, { x: 0, y: 0, width: w, height: h })
  return Buffer.from(await doc.save())
}
