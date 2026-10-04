import { join } from 'node:path'
import { kindOf } from '@shared/formats'
import type { Settings } from '@shared/types'
import { FFMPEG, run } from '../tools'
import { probeMedia } from '../probe'
import type { Job, Output } from './util'

const X264_CRF = { high: 18, balanced: 23, small: 28 }
const VP9_CRF = { high: 24, balanced: 32, small: 38 }
const MPEG4_Q = { high: 2, balanced: 4, small: 7 }

/** Scale filter that caps the height and keeps both edges even (H.264 needs that). */
function scale(s: Settings): string {
  const h = s.videoMaxHeight > 0 ? `trunc(min(ih\\,${s.videoMaxHeight})/2)*2` : 'trunc(ih/2)*2'
  return `scale=-2:${h}`
}

function codecArgs(to: string, fromVideo: boolean, s: Settings): string[] {
  const abr = `${s.audioBitrate}k`
  const audioOnly = ['-vn', '-map', '0:a:0']
  switch (to) {
    case 'mp4':
    case 'mov':
    case 'mkv':
      return ['-map', '0:v:0', '-map', '0:a:0?', '-vf', scale(s), '-c:v', 'libx264', '-preset', 'medium',
        '-crf', String(X264_CRF[s.videoQuality]), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', abr,
        ...(to === 'mkv' ? [] : ['-movflags', '+faststart'])]
    case 'webm':
      return ['-map', '0:v:0', '-map', '0:a:0?', '-vf', scale(s), '-c:v', 'libvpx-vp9', '-crf', String(VP9_CRF[s.videoQuality]),
        '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', abr]
    case 'avi':
      return ['-map', '0:v:0', '-map', '0:a:0?', '-vf', scale(s), '-c:v', 'mpeg4', '-vtag', 'xvid',
        '-q:v', String(MPEG4_Q[s.videoQuality]), '-c:a', 'libmp3lame', '-b:a', abr]
    case 'gif': {
      // GIFs get big fast: 12 fps, at most 480 px tall, one palette per clip.
      const h = Math.min(480, s.videoMaxHeight || 480)
      return ['-filter_complex',
        `[0:v]fps=12,scale=-1:min(ih\\,${h}):flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
        '-an', '-loop', '0']
    }
    case 'mp3':
      return [...audioOnly, '-c:a', 'libmp3lame', '-b:a', abr]
    case 'wav':
      return [...audioOnly, '-c:a', 'pcm_s16le']
    case 'flac':
      return [...audioOnly, '-c:a', 'flac']
    case 'aac':
    case 'm4a':
      return [...audioOnly, '-c:a', 'aac', '-b:a', abr]
    case 'ogg':
      return [...audioOnly, '-c:a', 'libvorbis', '-b:a', abr]
    case 'opus':
      return [...audioOnly, '-c:a', 'libopus', '-b:a', `${Math.min(s.audioBitrate, 256)}k`]
  }
  throw new Error(`No ffmpeg recipe for ${to} (from video: ${fromVideo})`)
}

export async function convertAv(job: Job): Promise<Output> {
  const out = join(job.tmp, `out.${job.to}`)
  const { duration } = await probeMedia(job.src).catch(() => ({ duration: 0 }))
  const args = [
    '-hide_banner', '-nostdin', '-y', '-i', job.src,
    ...codecArgs(job.to, kindOf(job.from) === 'video', job.settings),
    ...(job.settings.stripMetadata ? ['-map_metadata', '-1'] : []),
    '-progress', 'pipe:1', '-nostats', out
  ]
  let pending = ''
  await run(FFMPEG, args, {
    signal: job.signal,
    onStdout: (chunk) => {
      if (!duration) return
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line)
        if (m) job.progress(Math.min(99, (Number(m[1]) / 1e6 / duration) * 100))
      }
    }
  })
  job.progress(100)
  return out
}
