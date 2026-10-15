// DXF (CAD drawings) to SVG, and SVG to DXF. Both directions stay vectors; turning a DXF into
// pixels goes DXF → SVG → the regular image pipeline.
import { Helper } from 'dxf'
import { XMLParser } from 'fast-xml-parser'
import svgpath from 'svgpath'

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const num = (n: number): string => String(Math.round(n * 1e4) / 1e4)

// ---------- DXF → SVG ----------

/** $INSUNITS codes we can express in SVG, as millimetres per drawing unit. */
const MM_PER_UNIT: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 }
const PX_PER_MM = 96 / 25.4

export interface DxfSvg {
  svg: string
  /** Size in CSS pixels at 96 dpi: the drawing's "original size" for Settings → Vector size. */
  width: number
  height: number
}

/** MTEXT carries inline formatting codes; keep the words and line breaks. */
function plainMText(s: string): string {
  return s
    .replace(/\\P/g, '\n')
    .replace(/\\[ACFHQTWcfhqtw][^;]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/\\S([^;]*?)[#^/]([^;]*);/g, '$1/$2')
    .replace(/[{}]/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±')
}

type BlockTransform = { scaleX?: number; scaleY?: number; rotation?: number; x?: number; y?: number; extrusionZ?: number }

/** Places a point inside nested block inserts (scale, rotate, move), innermost first, as the dxf library does. */
function applyTransforms(point: [number, number], transforms: BlockTransform[]): [number, number] {
  let [x, y] = point
  for (const t of transforms) {
    if (t.scaleX) x *= t.scaleX
    if (t.scaleY) y *= t.scaleY
    if (t.rotation) {
      const a = (t.rotation * Math.PI) / 180
      ;[x, y] = [x * Math.cos(a) - y * Math.sin(a), y * Math.cos(a) + x * Math.sin(a)]
    }
    if (t.x) x += t.x
    if (t.y) y += t.y
    if (t.extrusionZ === -1) x = -x
  }
  return [x, y]
}

interface TextEntity {
  type: 'TEXT' | 'MTEXT'
  x: number
  y: number
  string?: string
  textHeight?: number
  nominalTextHeight?: number
  rotation?: number
  hAlign?: number
  x2?: number
  y2?: number
  attachmentPoint?: number
  xAxisX?: number
  xAxisY?: number
  transforms?: BlockTransform[]
}

/** TEXT and MTEXT as SVG <text>, in the library's flipped coordinate space (y up). */
function textElement(t: TextEntity): { svg: string; x: number; y: number; w: number; h: number } | null {
  const raw = t.type === 'MTEXT' ? plainMText(t.string ?? '') : (t.string ?? '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±')
  if (!raw.trim()) return null
  const transforms = t.transforms ?? []
  const scale = transforms.reduce((s, tr) => s * Math.abs(tr.scaleY ?? 1), 1)
  const h = (t.type === 'MTEXT' ? t.nominalTextHeight : t.textHeight) ?? 2.5
  const size = h * scale
  // Aligned TEXT anchors on the second point; MTEXT anchors on its attachment point.
  const useSecond = t.type === 'TEXT' && (t.hAlign ?? 0) > 0 && t.x2 !== undefined
  const [x, y] = applyTransforms([useSecond ? t.x2! : t.x, useSecond ? t.y2! : t.y], transforms)
  let rotation = t.rotation ?? (t.xAxisX !== undefined ? (Math.atan2(t.xAxisY ?? 0, t.xAxisX) * 180) / Math.PI : 0)
  rotation += transforms.reduce((r, tr) => r + (tr.rotation ?? 0), 0)
  const col = t.type === 'MTEXT' ? ((t.attachmentPoint ?? 1) - 1) % 3 : Math.min(t.hAlign ?? 0, 2)
  const anchor = ['start', 'middle', 'end'][col]
  const row = t.type === 'MTEXT' ? Math.floor(((t.attachmentPoint ?? 1) - 1) / 3) : 2
  const lines = raw.split('\n')
  // Top of the first line relative to the anchor, for top, middle and bottom alignment.
  const block = size + (lines.length - 1) * size * 1.4
  const top = [0, -block / 2, -block][row]
  const tspans = lines.map((line, i) => `<tspan x="0" y="${num(top + i * size * 1.4)}">${esc(line)}</tspan>`).join('')
  // Outside the y-flip: place at (x, -y), rotate counter-clockwise like CAD.
  const svg = `<text transform="translate(${num(x)} ${num(-y)}) rotate(${num(-rotation)})" font-size="${num(size)}" text-anchor="${anchor}" dominant-baseline="hanging" fill="#000" stroke="none" font-family="Helvetica, Arial, sans-serif">${tspans}</text>`
  const longest = Math.max(...lines.map((l) => l.length))
  return { svg, x, y, w: longest * size * 0.6, h: lines.length * size * 1.4 }
}

/**
 * Renders a DXF drawing as SVG with real dimensions: millimetres or inches when the file
 * says which ($INSUNITS), otherwise drawing units as pixels. Text is included.
 * `sizeIn: 'px'` writes the same size as CSS pixels (96 dpi), for turning into an image.
 */
export function dxfToSvg(dxfText: string, sizeIn: 'real' | 'px' = 'real'): DxfSvg {
  const helper = new Helper(dxfText)
  const base = helper.toSVG()
  const vb = /viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)"/.exec(base)
  let [vx, vy, vw, vh] = vb ? vb.slice(1).map(Number) : [0, 0, 0, 0]

  const texts = (helper.denormalised as unknown as TextEntity[])
    .filter((e) => e.type === 'TEXT' || e.type === 'MTEXT')
    .map(textElement)
    .filter((t): t is NonNullable<typeof t> => t !== null)
  for (const t of texts) {
    const minX = Math.min(vx, t.x), maxX = Math.max(vx + vw, t.x + t.w)
    const minY = Math.min(vy, -t.y - t.h), maxY = Math.max(vy + vh, -t.y + t.h)
    vx = minX; vy = minY; vw = maxX - minX; vh = maxY - minY
  }
  if (!(vw > 0 && vh > 0)) throw new Error('Empty drawing: nothing to convert (damaged file)')

  // Margin of 2% so strokes on the edge aren't cut off.
  const pad = Math.max(vw, vh) * 0.02
  vx -= pad; vy -= pad; vw += pad * 2; vh += pad * 2

  const header = (helper.parsed as { header?: { insUnits?: number; measurement?: number } }).header ?? {}
  const mmPerUnit = MM_PER_UNIT[header.insUnits ?? -1]
  let width: number, height: number, cssW: string, cssH: string
  if (mmPerUnit) {
    width = vw * mmPerUnit * PX_PER_MM
    height = vh * mmPerUnit * PX_PER_MM
    cssW = `${num(vw * mmPerUnit)}mm`
    cssH = `${num(vh * mmPerUnit)}mm`
  } else {
    width = vw
    height = vh
    cssW = num(vw)
    cssH = num(vh)
  }
  // Unitless drawings can be any scale; keep the pixel size sensible.
  const longest = Math.max(width, height)
  if (!mmPerUnit && (longest < 256 || longest > 4096)) {
    const k = 1024 / longest
    width *= k
    height *= k
    cssW = num(width)
    cssH = num(height)
  }

  // For rasterising, give the size in pixels so every tool measures the same number.
  const pxW = Math.max(1, Math.round(width)), pxH = Math.max(1, Math.round(height))
  if (sizeIn === 'px') { cssW = String(pxW); cssH = String(pxH) }
  const svg = base
    .replace(/viewBox="[^"]*"/, `viewBox="${num(vx)} ${num(vy)} ${num(vw)} ${num(vh)}"`)
    .replace('width="100%" height="100%"', `width="${cssW}" height="${cssH}"`)
    .replace('</svg>', `  <g>${texts.map((t) => t.svg).join('\n    ')}</g>\n</svg>`)
  return { svg, width: pxW, height: pxH }
}

// ---------- SVG → DXF ----------

type Point = [number, number]
type Shape = { kind: 'poly'; points: Point[]; closed: boolean; color: number } | { kind: 'circle'; c: Point; r: number; color: number }

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', lime: '#00ff00', blue: '#0000ff',
  yellow: '#ffff00', cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', gray: '#808080',
  grey: '#808080', silver: '#c0c0c0', orange: '#ffa500', purple: '#800080', navy: '#000080', maroon: '#800000'
}
/** AutoCAD colour index 1–9: the colours laser cutters and CAM tools map to operations. */
const ACI: [number, number, number, number][] = [
  [1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255],
  [7, 0, 0, 0], [8, 128, 128, 128], [9, 192, 192, 192]
]

function parseColor(value: string | undefined): [number, number, number] | null {
  if (!value || value === 'none' || value.startsWith('url(')) return null
  let v = value.trim().toLowerCase()
  v = NAMED[v] ?? v
  let m = /^#([0-9a-f]{3})$/.exec(v)
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number]
  m = /^#([0-9a-f]{6})/.exec(v)
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number]
  m = /^rgba?\(\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?/.exec(v)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  return [0, 0, 0]
}

/** Nearest AutoCAD colour; black and white both become 7, which CAD shows as the contrasting colour. */
function aci(rgb: [number, number, number] | null): number {
  if (!rgb) return 7
  if (rgb.every((c) => c > 230)) return 7
  let best = 7, dist = Infinity
  for (const [n, r, g, b] of ACI) {
    const d = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2
    if (d < dist) { dist = d; best = n }
  }
  return best
}

/** Length in px from an SVG length ("10mm", "2in", "300"). */
function toPx(value: string | undefined): number | null {
  if (!value) return null
  const m = /^\s*([-\d.e+]+)\s*(px|mm|cm|in|pt|pc|%)?\s*$/i.exec(value)
  if (!m || m[2] === '%') return null
  const n = Number(m[1])
  const per: Record<string, number> = { px: 1, mm: PX_PER_MM, cm: PX_PER_MM * 10, in: 96, pt: 96 / 72, pc: 16 }
  return n * per[(m[2] ?? 'px').toLowerCase()]
}

function styleOf(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (attrs.style ?? '').split(';')) {
    const [k, v] = part.split(':').map((s) => s?.trim())
    if (k && v) out[k] = v
  }
  return out
}

/** Every geometric element as path data, in its own coordinates. */
function elementPath(tag: string, a: Record<string, string>): string | null {
  const n = (k: string, d = 0): number => Number.parseFloat(a[k] ?? '') || d
  switch (tag) {
    case 'path': return a.d ?? null
    case 'line': return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`
    case 'polyline':
    case 'polygon': {
      const nums = (a.points ?? '').trim().split(/[\s,]+/).map(Number).filter((v) => !Number.isNaN(v))
      if (nums.length < 4) return null
      let d = `M${nums[0]} ${nums[1]}`
      for (let i = 2; i + 1 < nums.length; i += 2) d += `L${nums[i]} ${nums[i + 1]}`
      return tag === 'polygon' ? d + 'Z' : d
    }
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height')
      if (w <= 0 || h <= 0) return null
      const rx = Math.min(n('rx', n('ry')), w / 2), ry = Math.min(n('ry', rx), h / 2)
      if (!rx) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
        `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
    }
    case 'circle':
    case 'ellipse': {
      const cx = n('cx'), cy = n('cy')
      const rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry')
      if (rx <= 0 || ry <= 0) return null
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
    }
  }
  return null
}

/** Points along a cubic Bézier, enough that chords stay within `tol` of the curve. */
function cubic(p0: Point, p1: Point, p2: Point, p3: Point, tol: number, out: Point[]): void {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1])
  const steps = Math.min(256, Math.max(4, Math.ceil(Math.sqrt(len / tol))))
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ])
  }
}

/** Path data → polylines (one per subpath) in final coordinates. */
function flatten(d: string, transform: string, tol: number): { points: Point[]; closed: boolean }[] {
  const subpaths: { points: Point[]; closed: boolean }[] = []
  let cur: Point[] = [], start: Point = [0, 0], last: Point = [0, 0]
  const end = (closed: boolean): void => {
    if (cur.length > 1) subpaths.push({ points: cur, closed })
    cur = []
  }
  svgpath(d).transform(transform).abs().unarc().unshort().iterate((seg) => {
    const [cmd, ...v] = seg as [string, ...number[]]
    switch (cmd) {
      case 'M': end(false); last = start = [v[0], v[1]]; cur = [last]; break
      case 'L': last = [v[0], v[1]]; cur.push(last); break
      case 'H': last = [v[0], last[1]]; cur.push(last); break
      case 'V': last = [last[0], v[0]]; cur.push(last); break
      case 'C': cubic(last, [v[0], v[1]], [v[2], v[3]], [v[4], v[5]], tol, cur); last = [v[4], v[5]]; break
      case 'Q': {
        // Elevate the quadratic to a cubic.
        const c1: Point = [last[0] + (2 / 3) * (v[0] - last[0]), last[1] + (2 / 3) * (v[1] - last[1])]
        const c2: Point = [v[2] + (2 / 3) * (v[0] - v[2]), v[3] + (2 / 3) * (v[1] - v[3])]
        cubic(last, c1, c2, [v[2], v[3]], tol, cur); last = [v[2], v[3]]; break
      }
      case 'Z': case 'z': end(true); last = start; cur = [start]; break
    }
  })
  end(false)
  return subpaths
}

/** A circle that survives its transform as a circle (no skew or uneven scale), else null. */
function transformedCircle(a: Record<string, string>, transform: string): { c: Point; r: number } | null {
  const cx = Number.parseFloat(a.cx ?? '0') || 0, cy = Number.parseFloat(a.cy ?? '0') || 0, r = Number.parseFloat(a.r ?? '0') || 0
  if (r <= 0) return null
  const pts: Point[] = []
  svgpath(`M${cx} ${cy}M${cx + r} ${cy}M${cx} ${cy + r}`).transform(transform).abs().iterate((s) => { pts.push([s[1] as number, s[2] as number]) })
  const [c, px, py] = pts
  const rx = Math.hypot(px[0] - c[0], px[1] - c[1]), ry = Math.hypot(py[0] - c[0], py[1] - c[1])
  const dot = (px[0] - c[0]) * (py[0] - c[0]) + (px[1] - c[1]) * (py[1] - c[1])
  return Math.abs(rx - ry) < 1e-6 * Math.max(rx, 1) && Math.abs(dot) < 1e-6 * rx * ry ? { c, r: rx } : null
}

type XmlNode = Record<string, unknown> & { ':@'?: Record<string, string> }
const SKIP = new Set(['defs', 'clipPath', 'mask', 'symbol', 'marker', 'pattern', 'linearGradient', 'radialGradient', 'style', 'title', 'desc', 'metadata', 'text', 'image', 'foreignObject', 'script'])

/**
 * Converts SVG to DXF R12 in millimetres (96 px per inch, as browsers and Inkscape use).
 * Circles stay circles; everything else becomes polylines. Text and images are skipped.
 */
export function svgToDxf(svgText: string): { dxf: string; entities: number } {
  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', allowBooleanAttributes: true, processEntities: true })
  const doc = parser.parse(svgText) as XmlNode[]
  const svgNode = doc.find((n) => 'svg' in n)
  if (!svgNode) throw new Error('Not an SVG file (unsupported format)')
  const rootAttrs = svgNode[':@'] ?? {}

  // Map the viewBox onto the document's physical size, then px → mm.
  const vb = (rootAttrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number)
  const hasVb = vb.length === 4 && vb.every((v) => Number.isFinite(v)) && vb[2] > 0 && vb[3] > 0
  const wPx = toPx(rootAttrs.width) ?? (hasVb ? vb[2] : 300)
  const hPx = toPx(rootAttrs.height) ?? (hasVb ? vb[3] : 150)
  const sx = hasVb ? wPx / vb[2] : 1, sy = hasVb ? hPx / vb[3] : 1
  const s = Math.min(sx, sy) // preserveAspectRatio="xMidYMid meet", the default
  const rootTransform = hasVb ? `scale(${s}) translate(${-vb[0]} ${-vb[1]})` : ''
  const mm = 25.4 / 96
  const tol = 0.05 / mm // curves within 0.05 mm of the true shape

  const shapes: Shape[] = []
  const walk = (nodes: XmlNode[], transform: string, inherited: Record<string, string>): void => {
    for (const node of nodes) {
      const tag = Object.keys(node).find((k) => k !== ':@')
      if (!tag || tag === '#text' || SKIP.has(tag)) continue
      const a = node[':@'] ?? {}
      const style = { ...inherited, ...pick(a), ...styleOf(a) }
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const t = `${transform} ${a.transform ?? ''}`.trim()
      const color = aci(parseColor(style.stroke && style.stroke !== 'none' ? style.stroke : style.fill ?? '#000'))
      if (tag === 'g' || tag === 'svg' || tag === 'a' || tag === 'switch') {
        walk((node[tag] as XmlNode[]) ?? [], tag === 'svg' ? transform : t, style)
        continue
      }
      if (tag === 'circle') {
        const c = transformedCircle(a, t)
        if (c) { shapes.push({ kind: 'circle', c: c.c, r: c.r, color }); continue }
      }
      const d = elementPath(tag, a)
      if (!d) continue
      for (const sp of flatten(d, t, tol)) shapes.push({ kind: 'poly', points: sp.points, closed: sp.closed, color })
    }
  }
  walk((svgNode.svg as XmlNode[]) ?? [], rootTransform, {})
  if (!shapes.length) throw new Error('No shapes to convert (unsupported format)')

  // SVG y grows downwards, CAD y upwards: flip around the page height, then px → mm.
  const X = (x: number): number => x * mm
  const Y = (y: number): number => (hPx - y) * mm
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grow = (x: number, y: number): void => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }

  const out: string[] = []
  const g = (code: number, value: string | number): void => { out.push(String(code), typeof value === 'number' ? num(value) : value) }
  for (const sh of shapes) {
    if (sh.kind === 'circle') {
      const x = X(sh.c[0]), y = Y(sh.c[1]), r = sh.r * mm
      grow(x - r, y - r); grow(x + r, y + r)
      g(0, 'CIRCLE'); g(8, '0'); g(62, String(sh.color)); g(10, x); g(20, y); g(30, 0); g(40, r)
    } else if (sh.points.length === 2 && !sh.closed) {
      const [[x1, y1], [x2, y2]] = sh.points.map(([x, y]) => [X(x), Y(y)])
      grow(x1, y1); grow(x2, y2)
      g(0, 'LINE'); g(8, '0'); g(62, String(sh.color)); g(10, x1); g(20, y1); g(30, 0); g(11, x2); g(21, y2); g(31, 0)
    } else {
      // A closed subpath repeats its start point; the closed flag already joins it.
      const pts = sh.closed && sh.points.length > 2 && Math.hypot(sh.points[0][0] - sh.points.at(-1)![0], sh.points[0][1] - sh.points.at(-1)![1]) < 1e-9
        ? sh.points.slice(0, -1) : sh.points
      g(0, 'POLYLINE'); g(8, '0'); g(62, String(sh.color)); g(66, '1'); g(10, 0); g(20, 0); g(30, 0); g(70, sh.closed ? '1' : '0')
      for (const [px, py] of pts) {
        const x = X(px), y = Y(py)
        grow(x, y)
        g(0, 'VERTEX'); g(8, '0'); g(10, x); g(20, y); g(30, 0)
      }
      g(0, 'SEQEND'); g(8, '0')
    }
  }

  const head: string[] = []
  const h = (code: number, value: string | number): void => { head.push(String(code), typeof value === 'number' ? num(value) : value) }
  h(0, 'SECTION'); h(2, 'HEADER')
  h(9, '$ACADVER'); h(1, 'AC1009')
  h(9, '$INSUNITS'); h(70, '4') // millimetres
  h(9, '$MEASUREMENT'); h(70, '1') // metric
  h(9, '$EXTMIN'); h(10, minX); h(20, minY); h(30, 0)
  h(9, '$EXTMAX'); h(10, maxX); h(20, maxY); h(30, 0)
  h(0, 'ENDSEC')
  h(0, 'SECTION'); h(2, 'ENTITIES')
  const dxf = [...head, ...out, '0', 'ENDSEC', '0', 'EOF', ''].join('\r\n')
  return { dxf, entities: shapes.length }
}

/** Presentation attributes that inherit (stroke="red" as well as style="stroke:red"). */
function pick(a: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of ['stroke', 'fill', 'display', 'visibility']) if (a[k] !== undefined) out[k] = a[k]
  return out
}
