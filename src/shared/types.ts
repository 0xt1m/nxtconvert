import type { Caps } from './formats'

export type Platform = 'mac' | 'windows' | 'linux'

export interface Settings {
  outputDir: string
  keepOriginals: boolean
  /** 1–100, used by JPG, WEBP, AVIF and HEIC. */
  imageQuality: number
  /** Pixel size for SVG and other vector images: "2x" scales the drawing, "1024" is a width in px. */
  vectorSize: string
  stripMetadata: boolean
  /** Longest video edge in output height, 0 = keep the original. */
  videoMaxHeight: number
  videoQuality: 'high' | 'balanced' | 'small'
  /** kbit/s for lossy audio. */
  audioBitrate: number
  openFolderWhenDone: boolean
  /** Last target picked per source extension. */
  preferredTargets: Record<string, string>
}

export interface Environment {
  platform: Platform
  caps: Caps
  settings: Settings
}

export interface FileInfo {
  path: string
  name: string
  ext: string
  size: number
  /** "4.2 MB · 3024 × 4032" */
  meta: string
  /** A vector image's own size; the output size depends on Settings → Vector size. */
  vector?: { width: number; height: number }
}

export interface ConvertRequest {
  id: string
  path: string
  to: string
}

export type ConvertResult =
  | { ok: true; output: string }
  | { ok: false; error: string; cancelled?: boolean }

export interface ProgressEvent {
  id: string
  /** 0–100 */
  progress: number
}

export interface UpdateState {
  state: 'idle' | 'available' | 'downloading' | 'ready' | 'error'
  /** The new version. */
  version?: string
  /** The running version. */
  current?: string
  /** Release notes as plain text. */
  notes?: string
  /** 0–100 while downloading. */
  percent?: number
  /** False on an unsigned Mac build: offer the download page instead of installing. */
  canInstall?: boolean
}

export interface NxtApi {
  environment(): Promise<Environment>
  pathForFile(file: File): string
  pickFiles(): Promise<string[]>
  pickFolder(): Promise<string | null>
  probe(paths: string[]): Promise<FileInfo[]>
  convert(req: ConvertRequest): Promise<ConvertResult>
  cancel(id: string): Promise<void>
  onProgress(cb: (e: ProgressEvent) => void): () => void
  /** Menu commands from the main process ("add-files", "convert", "settings"). */
  onCommand(cb: (cmd: string) => void): () => void
  reveal(path: string): Promise<void>
  openFolder(path: string): Promise<void>
  saveSettings(patch: Partial<Settings>): Promise<Settings>
  windowControl(action: 'minimize' | 'maximize' | 'close'): void
  update: {
    state(): Promise<UpdateState>
    /** Check now, if online and not checked yet this session. */
    check(): Promise<void>
    download(): Promise<void>
    install(): Promise<void>
    openPage(): Promise<void>
    onChange(cb: (s: UpdateState) => void): () => void
  }
}

declare global {
  interface Window {
    nxt: NxtApi
  }
}
