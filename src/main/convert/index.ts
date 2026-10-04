import { shell } from 'electron'
import { basename, extname, join } from 'node:path'
import { extOf, planFor } from '@shared/formats'
import type { ConvertRequest, ConvertResult } from '@shared/types'
import { capabilities } from '../tools'
import { getSettings } from '../settings'
import { convertImage } from './image'
import { convertAv } from './av'
import { convertDoc } from './doc'
import { ensureDir, friendlyError, move, uniquePath, withTempDir, type Job, type Output } from './util'

const running = new Map<string, AbortController>()

export function cancel(id: string): void {
  running.get(id)?.abort()
}

/** Move what a converter produced into the output folder without overwriting anything. */
async function deliver(output: Output, outDir: string, base: string, to: string): Promise<string> {
  await ensureDir(outDir)
  if (typeof output === 'string') {
    const dest = uniquePath(outDir, base, to)
    await move(output, dest)
    return dest
  }
  // One image per page: they go together in a folder named after the source.
  const dir = uniquePath(outDir, base)
  await ensureDir(dir)
  for (const file of output) await move(file, join(dir, basename(file)))
  return dir
}

export async function convert(req: ConvertRequest, onProgress: (p: number) => void): Promise<ConvertResult> {
  const settings = getSettings()
  const from = extOf(req.path)
  const plan = planFor(from, req.to, capabilities())
  if (typeof plan === 'string') return { ok: false, error: plan }

  const controller = new AbortController()
  running.set(req.id, controller)
  let last = -1
  try {
    const output = await withTempDir(async (tmp) => {
      const job: Job = {
        src: req.path,
        from,
        to: req.to,
        base: basename(req.path, extname(req.path)),
        tmp,
        settings,
        signal: controller.signal,
        progress: (p) => {
          const r = Math.round(p)
          if (r !== last) onProgress((last = r))
        }
      }
      const produced = plan.engine === 'image' ? await convertImage(job, plan)
        : plan.engine === 'ffmpeg' ? await convertAv(job)
        : await convertDoc(job, plan)
      return deliver(produced, settings.outputDir, job.base, req.to)
    })
    if (!settings.keepOriginals) await shell.trashItem(req.path).catch(() => {})
    return { ok: true, output }
  } catch (err) {
    if (!controller.signal.aborted) console.error(`[convert] ${req.path} → ${req.to}`, err)
    return { ok: false, error: friendlyError(err, req.to), cancelled: controller.signal.aborted }
  } finally {
    running.delete(req.id)
  }
}
