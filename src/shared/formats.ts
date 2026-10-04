// What nxtconvert accepts and offers, and which engine turns one format into another.
// Pure functions only: the renderer uses them to draw targets, the main process to run jobs.

export type Kind = 'image' | 'video' | 'audio' | 'doc'

export interface Format {
  ext: string
  note: string
}

/** External tools found on this computer. Everything else ships inside the app. */
export interface Caps {
  platform: string
  /** macOS `sips`: reads and writes HEIC. */
  sips: boolean
  pandoc: boolean
  soffice: boolean
  /** Poppler's pdftoppm + pdftotext. */
  poppler: boolean
}

export interface Target extends Format {
  available: boolean
  /** Why it is unavailable, three words or fewer. */
  reason?: string
}

// Picker order from the design system; cross-category targets sit at the end.
export const FORMATS: Record<Kind, Format[]> = {
  image: [
    { ext: 'jpg', note: 'Photos' }, { ext: 'png', note: 'Lossless' }, { ext: 'webp', note: 'Web' },
    { ext: 'avif', note: 'Smallest' }, { ext: 'heic', note: 'Apple' }, { ext: 'gif', note: 'Animated' },
    { ext: 'tiff', note: 'Print' }, { ext: 'bmp', note: 'Raw' }, { ext: 'ico', note: 'Icons' }, { ext: 'pdf', note: 'Document' }
  ],
  video: [
    { ext: 'mp4', note: 'H.264' }, { ext: 'mov', note: 'Apple' }, { ext: 'webm', note: 'Web' },
    { ext: 'mkv', note: 'Matroska' }, { ext: 'avi', note: 'Legacy' }, { ext: 'gif', note: 'Animated' },
    { ext: 'mp3', note: 'Audio only' }
  ],
  audio: [
    { ext: 'mp3', note: 'Universal' }, { ext: 'wav', note: 'Lossless' }, { ext: 'flac', note: 'Lossless' },
    { ext: 'aac', note: 'Compact' }, { ext: 'm4a', note: 'Apple' }, { ext: 'ogg', note: 'Vorbis' }, { ext: 'opus', note: 'Voice' }
  ],
  doc: [
    { ext: 'pdf', note: 'Portable' }, { ext: 'docx', note: 'Word' }, { ext: 'odt', note: 'OpenDoc' },
    { ext: 'rtf', note: 'Rich text' }, { ext: 'txt', note: 'Plain' }, { ext: 'html', note: 'Web' },
    { ext: 'epub', note: 'E-book' }, { ext: 'png', note: 'Per page' }, { ext: 'jpg', note: 'Per page' }
  ]
}

const KIND_OF: Record<string, Kind> = {
  jpg: 'image', png: 'image', webp: 'image', avif: 'image', heic: 'image', gif: 'image', tiff: 'image',
  bmp: 'image', ico: 'image', svg: 'image',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', m4a: 'audio', ogg: 'audio', opus: 'audio',
  pdf: 'doc', docx: 'doc', doc: 'doc', odt: 'doc', rtf: 'doc', txt: 'doc', html: 'doc', md: 'doc', epub: 'doc'
}

const ALIASES: Record<string, string> = { jpeg: 'jpg', jfif: 'jpg', tif: 'tiff', heif: 'heic', htm: 'html', markdown: 'md', oga: 'ogg' }

/** Lowercase extension without the dot, with aliases folded (JPEG → jpg). */
export function normalizeExt(ext: string): string {
  const e = String(ext || '').toLowerCase().replace(/^\./, '')
  return ALIASES[e] ?? e
}

export function extOf(path: string): string {
  const m = /\.([^./\\]+)$/.exec(path)
  return m ? normalizeExt(m[1]) : ''
}

export function kindOf(ext: string): Kind | 'any' {
  return KIND_OF[normalizeExt(ext)] ?? 'any'
}

// ---------- Images ----------

const SHARP_IN = new Set(['jpg', 'png', 'webp', 'avif', 'gif', 'tiff', 'svg'])
const SHARP_OUT = new Set(['jpg', 'png', 'webp', 'avif', 'gif', 'tiff'])

export type ImageDecoder = 'sharp' | 'sips' | 'heic-wasm' | 'ffmpeg'
export type ImageEncoder = 'sharp' | 'bmp' | 'ico' | 'pdf' | 'sips'

export interface ImagePlan { engine: 'image'; decode: ImageDecoder; encode: ImageEncoder }

function planImage(from: string, to: string, caps: Caps): ImagePlan | string {
  let decode: ImageDecoder
  if (SHARP_IN.has(from)) decode = 'sharp'
  else if (from === 'heic') decode = caps.sips ? 'sips' : 'heic-wasm'
  else if (from === 'bmp' || from === 'ico') decode = 'ffmpeg'
  else return 'Unsupported format'

  let encode: ImageEncoder
  if (SHARP_OUT.has(to)) encode = 'sharp'
  else if (to === 'bmp' || to === 'ico' || to === 'pdf') encode = to
  else if (to === 'heic') {
    if (!caps.sips) return 'No HEIC encoder'
    encode = 'sips'
  } else return 'Unsupported format'
  return { engine: 'image', decode, encode }
}

// ---------- Video and audio ----------

export interface AvPlan { engine: 'ffmpeg' }

// ---------- Documents ----------

/** How a document is read into HTML when no direct converter is used. */
export type HtmlReader = 'read' | 'txt' | 'md' | 'mammoth' | 'pdftotext' | 'pandoc' | 'soffice'
/** How HTML is written out to the target. */
export type HtmlWriter = 'write' | 'text' | 'print' | 'pandoc' | 'soffice'

export type DocStep =
  | { engine: 'soffice' }
  | { engine: 'pandoc' }
  | { engine: 'pdftotext' }
  | { engine: 'html'; reader: HtmlReader; writer: HtmlWriter }

export interface DocPlan {
  engine: 'doc'
  /** Converts the source into `to`, or into PDF when `pages` follows. */
  step: DocStep | null
  /** Rasterise a PDF into one image per page. */
  pages?: 'png' | 'jpg'
}

const OFFICE = new Set(['docx', 'doc', 'odt', 'rtf'])
const SOFFICE_OUT = new Set(['pdf', 'docx', 'odt', 'rtf', 'txt', 'html', 'epub'])
const PANDOC_IN = new Set(['docx', 'odt', 'rtf', 'epub', 'html', 'md'])
const PANDOC_OUT = new Set(['docx', 'odt', 'rtf', 'epub', 'html', 'txt'])

function htmlReader(from: string, caps: Caps): HtmlReader | null {
  if (from === 'html') return 'read'
  if (from === 'txt') return 'txt'
  if (from === 'md') return 'md'
  if (from === 'docx') return 'mammoth'
  if (from === 'pdf') return caps.poppler ? 'pdftotext' : null
  if (caps.pandoc && PANDOC_IN.has(from)) return 'pandoc'
  if (caps.soffice && (OFFICE.has(from))) return 'soffice'
  return null
}

function htmlWriter(to: string, caps: Caps): HtmlWriter | null {
  if (to === 'html') return 'write'
  if (to === 'txt') return 'text'
  if (to === 'pdf') return 'print'
  if (caps.pandoc && PANDOC_OUT.has(to)) return 'pandoc'
  if (caps.soffice && SOFFICE_OUT.has(to)) return 'soffice'
  return null
}

/** Best single step from `from` to `to`: direct office engines first, then via HTML. */
function docStep(from: string, to: string, caps: Caps): DocStep | string {
  if (caps.soffice && OFFICE.has(from) && SOFFICE_OUT.has(to)) return { engine: 'soffice' }
  if (from === 'pdf' && to === 'txt') return caps.poppler ? { engine: 'pdftotext' } : 'Needs Poppler'
  if (caps.pandoc && PANDOC_IN.has(from) && PANDOC_OUT.has(to) && to !== 'html') return { engine: 'pandoc' }
  const reader = htmlReader(from, caps)
  if (!reader) return from === 'pdf' ? 'Needs Poppler' : from === 'epub' ? 'Needs Pandoc' : 'Needs LibreOffice'
  const writer = htmlWriter(to, caps)
  if (!writer) return to === 'epub' ? 'Needs Pandoc' : 'Needs LibreOffice'
  return { engine: 'html', reader, writer }
}

function planDoc(from: string, to: string, caps: Caps): DocPlan | string {
  if (to === 'png' || to === 'jpg') {
    if (!caps.poppler) return 'Needs Poppler'
    if (from === 'pdf') return { engine: 'doc', step: null, pages: to }
    const step = docStep(from, 'pdf', caps)
    return typeof step === 'string' ? step : { engine: 'doc', step, pages: to }
  }
  const step = docStep(from, to, caps)
  return typeof step === 'string' ? step : { engine: 'doc', step }
}

// ---------- Routing ----------

export type Plan = ImagePlan | AvPlan | DocPlan

/** The plan for one conversion, or a short reason it can't run here. */
export function planFor(fromExt: string, toExt: string, caps: Caps): Plan | string {
  const from = normalizeExt(fromExt), to = normalizeExt(toExt)
  const kind = kindOf(from)
  if (kind === 'any') return 'Unsupported format'
  if (!FORMATS[kind].some((f) => f.ext === to)) return 'Unsupported format'
  if (from === to) return 'Same format'
  if (kind === 'image') return planImage(from, to, caps)
  if (kind === 'video' || kind === 'audio') return { engine: 'ffmpeg' }
  return planDoc(from, to, caps)
}

/** Every format in the source's category except itself, each marked available or not. */
export function targetsFor(fromExt: string, caps: Caps): Target[] {
  const from = normalizeExt(fromExt), kind = kindOf(from)
  if (kind === 'any') return []
  return FORMATS[kind]
    .filter((f) => f.ext !== from)
    .map((f) => {
      const plan = planFor(from, f.ext, caps)
      return typeof plan === 'string' ? { ...f, available: false, reason: plan } : { ...f, available: true }
    })
}

/** The target a new file starts on: the last one used for this extension, else the first available. */
export function defaultTarget(fromExt: string, caps: Caps, preferred?: Record<string, string>): string | undefined {
  const targets = targetsFor(fromExt, caps).filter((t) => t.available)
  const pref = preferred?.[normalizeExt(fromExt)]
  return targets.find((t) => t.ext === pref)?.ext ?? targets[0]?.ext
}
