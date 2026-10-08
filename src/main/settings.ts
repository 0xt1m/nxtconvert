import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Settings } from '@shared/types'

const file = (): string => join(app.getPath('userData'), 'settings.json')

function defaults(): Settings {
  return {
    outputDir: join(app.getPath('downloads'), 'nxtconvert'),
    keepOriginals: true,
    imageQuality: 85,
    vectorSize: '1x',
    stripMetadata: false,
    videoMaxHeight: 0,
    videoQuality: 'balanced',
    audioBitrate: 192,
    openFolderWhenDone: false,
    preferredTargets: {}
  }
}

let current: Settings | null = null

export function getSettings(): Settings {
  if (!current) {
    let saved: Partial<Settings> = {}
    try {
      saved = JSON.parse(readFileSync(file(), 'utf8'))
    } catch {
      // First launch or unreadable file: start from defaults.
    }
    current = { ...defaults(), ...saved }
  }
  return current
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  current = { ...getSettings(), ...patch }
  await mkdir(dirname(file()), { recursive: true })
  await writeFile(file(), JSON.stringify(current, null, 2))
  return current
}
