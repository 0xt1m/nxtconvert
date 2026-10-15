// End-to-end check: makes a sample file of every source format, then runs every conversion this
// computer supports through the real converters. Run with `npm test`; exits non-zero on any failure.
import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { FORMATS, kindOf, planFor, targetsFor } from '@shared/formats'
import { capabilities, FFMPEG } from './tools'
import { saveSettings } from './settings'
import { probe } from './probe'
import { convert } from './convert'
import { convertImage } from './convert/image'
import { MAX_RASTER_EDGE, vectorOutputSize } from '@shared/vector'
import { getSettings } from './settings'
import { mkdtemp } from 'node:fs/promises'

const root = mkdtempSync(join(tmpdir(), 'nxtconvert-smoke-'))
app.setPath('userData', join(root, 'user'))

/** A minimal valid .docx, written with Python's zipfile so the test needs nothing extra. */
function makeDocx(path: string): void {
  const files: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Quarterly report</w:t></w:r></w:p><w:p><w:r><w:t>Everything stays on this computer.</w:t></w:r></w:p></w:body></w:document>'
  }
  const py = `import zipfile,json,sys\nz=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)\nfor k,v in json.loads(sys.argv[2]).items(): z.writestr(k,v)\nz.close()`
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', py, path, JSON.stringify(files)])
}

async function fixtures(dir: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true })
  const out: string[] = []
  const f = (name: string): string => { const p = join(dir, name); out.push(p); return p }
  const ff = (args: string[]): void => { execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args]) }

  const base = await sharp({ create: { width: 640, height: 427, channels: 4, background: { r: 212, g: 255, b: 58, alpha: 0.9 } } })
    .composite([{ input: Buffer.from('<svg width="640" height="427"><circle cx="320" cy="213" r="150" fill="#0b5fa3"/></svg>') }])
    .png().toBuffer()
  const photo = sharp(base)
  await photo.clone().png().toFile(f('sample.png'))
  await photo.clone().flatten().jpeg().toFile(f('sample.jpg'))
  await photo.clone().webp().toFile(f('sample.webp'))
  await photo.clone().avif().toFile(f('sample.avif'))
  await photo.clone().gif().toFile(f('sample.gif'))
  await photo.clone().tiff().toFile(f('sample.tiff'))
  writeFileSync(f('sample.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#d4ff3a"/></svg>')
  // A CAD drawing in millimetres: two layers, a reused block (once scaled 2×), text and a note.
  writeFileSync(f('sample.dxf'), [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '2',
    '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'CUT', '70', '0', '62', '1', '6', 'CONTINUOUS', '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'BOLT', '70', '0', '10', '0', '20', '0', '30', '0',
    '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '30', '0', '40', '3', '0', 'ENDBLK', '8', '0', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LINE', '8', '0', '10', '0', '20', '-10', '30', '0', '11', '200', '21', '-10', '31', '0',
    '0', 'LWPOLYLINE', '8', 'CUT', '90', '4', '70', '1', '10', '0', '20', '0', '10', '200', '20', '0', '10', '200', '20', '120', '10', '0', '20', '120',
    '0', 'CIRCLE', '8', '0', '10', '100', '20', '60', '30', '0', '40', '30',
    '0', 'ARC', '8', '0', '10', '100', '20', '60', '30', '0', '40', '45', '50', '0', '51', '180',
    '0', 'INSERT', '8', '0', '2', 'BOLT', '10', '20', '20', '20', '30', '0',
    '0', 'INSERT', '8', '0', '2', 'BOLT', '10', '180', '20', '20', '30', '0', '41', '2', '42', '2',
    '0', 'TEXT', '8', '0', '10', '10', '20', '100', '30', '0', '40', '8', '1', 'PLATE A',
    '0', 'MTEXT', '8', '0', '10', '120', '20', '110', '30', '0', '40', '5', '71', '1', '1', 'Line one\\PLine two',
    '0', 'ENDSEC', '0', 'EOF', ''
  ].join('\n'))
  ff(['-i', join(dir, 'sample.png'), f('sample.bmp')])
  await photo.clone().resize(64, 64).png().toFile(join(dir, 'icon.png'))
  ff(['-i', join(dir, 'icon.png'), f('sample.ico')])
  if (capabilities().sips) execFileSync('/usr/bin/sips', ['-s', 'format', 'heic', join(dir, 'sample.jpg'), '--out', f('sample.heic')])

  ff(['-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f('sample.mp4')])
  ff(['-i', join(dir, 'sample.mp4'), '-c', 'copy', f('sample.mov')])
  ff(['-i', join(dir, 'sample.mp4'), '-c', 'copy', f('sample.mkv')])
  ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', f('sample.wav')])
  ff(['-i', join(dir, 'sample.wav'), f('sample.mp3')])
  ff(['-i', join(dir, 'sample.wav'), f('sample.flac')])
  ff(['-i', join(dir, 'sample.wav'), '-c:a', 'libopus', f('sample.opus')])

  writeFileSync(f('sample.txt'), 'Quarterly report\n\nEverything stays on this computer.\nSecond line.\n')
  writeFileSync(f('sample.md'), '# Quarterly report\n\n- One\n- Two\n\n**Everything** stays on this computer.\n')
  writeFileSync(f('sample.html'), '<!doctype html><title>Report</title><h1>Quarterly report</h1><p>Everything stays on this computer.</p>')
  makeDocx(f('sample.docx'))
  return out
}

async function main(): Promise<void> {
  const caps = capabilities()
  console.log('capabilities', caps)
  const outDir = join(root, 'out')
  mkdirSync(outDir)
  await saveSettings({ outputDir: outDir, keepOriginals: true })

  const sources = await fixtures(join(root, 'in'))
  // PDF sources come from our own TXT → PDF, which also checks the print path.
  const pdf = await convert({ id: 'pdf', path: join(root, 'in', 'sample.txt'), to: 'pdf' }, () => {})
  if (pdf.ok) sources.push(pdf.output)

  let failed = 0, passed = 0, skipped = 0
  for (const src of sources) {
    const info = await probe(src)
    console.log(`\n${info.name}  (${info.meta})`)
    for (const t of targetsFor(info.ext, caps)) {
      if (!t.available) { skipped++; console.log(`  -  ${t.ext.padEnd(5)} ${t.reason}`); continue }
      const started = Date.now()
      let last = 0
      const res = await convert({ id: `${info.name}-${t.ext}`, path: src, to: t.ext }, (p) => { last = p })
      const ms = Date.now() - started
      if (res.ok && statSync(res.output).size > 0 && last === 100) {
        passed++
        console.log(`  ok ${t.ext.padEnd(5)} ${ms}ms`)
      } else {
        failed++
        console.log(`  XX ${t.ext.padEnd(5)} ${res.ok ? `progress ended at ${last}` : res.error}`)
      }
    }
  }

  // Every format in the lists is reachable from somewhere, so nothing in the UI is dead.
  for (const [kind, list] of Object.entries(FORMATS)) {
    for (const f of list) {
      const reachable = sources.some((s) => kindOf(s.split('.').pop()!) === kind && typeof planFor(s.split('.').pop()!, f.ext, caps) !== 'string')
      if (!reachable) console.log(`note: no sample reaches ${kind} → ${f.ext}`)
    }
  }

  // DXF and SVG ↔ DXF: sizes, text, units, and that a written DXF reads back with the same shapes.
  {
    const { Helper } = await import('dxf')
    const { svgToDxf, dxfToSvg } = await import('./convert/cad')
    const fs = await import('node:fs')
    const check = (ok: boolean, label: string, detail = ''): void => {
      if (ok) { passed++; console.log(`ok ${label}`) } else { failed++; console.log(`XX ${label} ${detail}`) }
    }
    const dxfFile = join(root, 'in', 'sample.dxf')
    const info = await probe(dxfFile)
    check(/2\d\d × 1\d\d mm/.test(info.meta) && !!info.vector, `dxf probe: ${info.meta}`, JSON.stringify(info.vector))

    const asSvg = await convert({ id: 'dxf-svg', path: dxfFile, to: 'svg' }, () => {})
    const svgText = asSvg.ok ? fs.readFileSync(asSvg.output, 'utf8') : ''
    check(/width="[\d.]+mm"/.test(svgText) && svgText.includes('PLATE A') && svgText.includes('Line two'), 'dxf → svg keeps mm size and text')
    check((svgText.match(/<circle/g) ?? []).length >= 3, 'dxf → svg draws circles from blocks', `${(svgText.match(/<circle/g) ?? []).length} circles`)

    await saveSettings({ vectorSize: '1024' })
    const asPng = await convert({ id: 'dxf-png', path: dxfFile, to: 'png' }, () => {})
    const png = asPng.ok ? await sharp(asPng.output).metadata() : null
    const want = vectorOutputSize(info.vector!.width, info.vector!.height, '1024')
    check(png?.width === want.width && png?.height === want.height, `dxf → png at vector size ${png?.width}×${png?.height}`, `want ${want.width}×${want.height}`)
    // Lines must actually be drawn: a blank image would still have the right size.
    const stats = asPng.ok ? await sharp(asPng.output).flatten({ background: '#fff' }).greyscale().stats() : null
    check(!!stats && stats.channels[0].min < 50, 'dxf → png has visible lines')
    await saveSettings({ vectorSize: '1x' })

    const asPdf = await convert({ id: 'dxf-pdf', path: dxfFile, to: 'pdf' }, () => {})
    const pdfBytes = asPdf.ok ? fs.readFileSync(asPdf.output) : Buffer.alloc(0)
    // A vector PDF draws paths; a rasterised one would embed an image instead.
    check(asPdf.ok && !pdfBytes.includes('/Subtype /Image') && !pdfBytes.includes('/Subtype/Image'), 'dxf → pdf stays vector')
    const { PDFDocument } = await import('pdf-lib')
    const page = asPdf.ok ? (await PDFDocument.load(pdfBytes)).getPage(0).getSize() : { width: 0, height: 0 }
    const mmW = (page.width / 72) * 25.4
    check(mmW > 200 && mmW < 260, `dxf → pdf page is drawing size (${Math.round(mmW)} mm wide)`)

    // SVG → DXF with transforms, units, rounded corners, curves and colours.
    const svgIn = join(root, 'in', 'shapes.svg')
    fs.writeFileSync(svgIn, `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 200 100">
      <g transform="translate(10 10)" stroke="#ff0000" fill="none">
        <rect x="0" y="0" width="80" height="40" rx="5"/>
        <circle cx="120" cy="20" r="15" stroke="blue"/>
        <g transform="scale(2 1)"><circle cx="60" cy="60" r="5"/></g>
        <path d="M0 60 C 20 40, 40 80, 60 60 S 100 40, 120 60 Q 140 80 160 60 A 10 10 0 0 1 180 60"/>
        <polygon points="150,70 170,90 130,90" style="stroke:#00ff00"/>
        <line x1="0" y1="85" x2="100" y2="85"/>
        <text x="0" y="0">ignored</text>
      </g>
    </svg>`)
    const { dxf, entities } = svgToDxf(fs.readFileSync(svgIn, 'utf8'))
    check(entities === 6, `svg → dxf shape count ${entities}`, 'want 6: rect, circle, stretched circle, path, polygon, line (text skipped)')
    const back = new Helper(dxf).denormalised as { type: string; r?: number; colorNumber?: number }[]
    const circles = back.filter((e) => e.type === 'CIRCLE')
    check(circles.length === 1 && Math.abs((circles[0].r ?? 0) - 7.5) < 0.01, `svg → dxf keeps true circles in mm (r=${circles[0]?.r})`, JSON.stringify(circles))
    const colors = new Set(back.map((e) => e.colorNumber))
    check(colors.has(1) && colors.has(5) && colors.has(3), `svg → dxf maps colours to CAD colours ${[...colors].join(',')}`)
    const reread = dxfToSvg(dxf)
    check(/width="(9\d|10\d)(\.\d+)?mm"/.test(reread.svg), 'svg → dxf → svg keeps the 100 mm width', /width="[^"]*"/.exec(reread.svg)?.[0])
    const viaApp = await convert({ id: 'svg-dxf', path: svgIn, to: 'dxf' }, () => {})
    check(viaApp.ok && fs.readFileSync(viaApp.output, 'utf8').includes('AC1009'), 'svg → dxf through the app writes R12')
  }

  // SVG → pixels at Settings → Vector size, matching the size the row promises.
  const svg = join(root, 'in', 'sample.svg') // 64 × 64
  for (const [setting, to, expect] of [['1x', 'png', 64], ['4x', 'png', 256], ['1024', 'jpg', 1024], ['3x', 'webp', 192], ['2x', 'pdf', 0]] as const) {
    await saveSettings({ vectorSize: setting })
    const res = await convert({ id: `svg-${setting}`, path: svg, to }, () => {})
    let got = 'failed'
    if (res.ok && to !== 'pdf') { const m = await sharp(res.output).metadata(); got = `${m.width}×${m.height}` }
    else if (res.ok) got = 'ok'
    const want = to === 'pdf' ? 'ok' : `${expect}×${expect}`
    if (got === want && (to === 'pdf' || vectorOutputSize(64, 64, setting).width === expect)) { passed++; console.log(`ok svg ${setting} → ${to} ${got}`) }
    else { failed++; console.log(`XX svg ${setting} → ${to}: got ${got}, want ${want}`) }
  }
  // Icons need 256 px even when the setting is "Original size".
  await saveSettings({ vectorSize: '1x' })
  const ico = await convert({ id: 'svg-ico', path: svg, to: 'ico' }, () => {})
  const icoBuf = ico.ok ? (await import('node:fs')).readFileSync(ico.output) : Buffer.alloc(0)
  const icoHas256 = icoBuf.length > 6 && Array.from({ length: icoBuf.readUInt16LE(4) }, (_, i) => icoBuf[6 + i * 16]).includes(0)
  if (icoHas256) { passed++; console.log('ok svg → ico includes 256 px') } else { failed++; console.log('XX svg → ico is missing the 256 px size') }
  // Huge requests are capped, not attempted.
  const capped = vectorOutputSize(8000, 4000, '4x')
  if (capped.width === MAX_RASTER_EDGE && capped.height === MAX_RASTER_EDGE / 2) { passed++; console.log(`ok vector size cap ${capped.width}×${capped.height}`) }
  else { failed++; console.log('XX vector size cap', capped) }

  // The WebAssembly HEIC decoder (Windows and Linux) runs here too, even on a Mac that has sips.
  // NXT_HEIC_SAMPLE=<photo.heic> times it on a real-size photo.
  const heic = process.env.NXT_HEIC_SAMPLE || join(root, 'in', 'sample.heic')
  if (statSync(heic, { throwIfNoEntry: false })) {
    const run = async (id: string, signal = new AbortController().signal): Promise<{ ms: number; out: string }> => {
      const tmp = await mkdtemp(join(root, `heic-${id}-`))
      const started = Date.now()
      const out = await convertImage({ src: heic, from: 'heic', to: 'jpg', base: 'heic', tmp, settings: getSettings(), signal, progress: () => {} },
        { engine: 'image', decode: 'heic-wasm', encode: 'sharp' }) as string
      return { ms: Date.now() - started, out }
    }
    try {
      const one = await run('one')
      const [src, out] = await Promise.all([sharp(heic).metadata().catch(() => null), sharp(one.out).metadata()])
      const sizeOk = !src?.width || (src.width === out.width && src.height === out.height)
      const t0 = Date.now()
      await Promise.all([run('a'), run('b')])
      const pair = Date.now() - t0
      if (sizeOk) { passed++; console.log(`\nok heic (wasm worker) → jpg  ${out.width}×${out.height}  one ${one.ms}ms, two at once ${pair}ms`) }
      else { failed++; console.log(`\nXX heic (wasm worker) size ${out.width}×${out.height} vs ${src?.width}×${src?.height}`) }
      const controller = new AbortController()
      const pending = run('cancel', controller.signal).then(() => 'finished', (e) => (e.cancelled ? 'cancelled' : e.message))
      setTimeout(() => controller.abort(), 5)
      const outcome = await pending
      if (outcome === 'cancelled') { passed++; console.log('ok heic cancel') } else { failed++; console.log('XX heic cancel:', outcome) }
    } catch (err) {
      failed++
      console.log('XX heic (wasm worker)', err)
    }
  }

  // Cancelling a long encode stops it and reports it as cancelled.
  const longVideo = join(root, 'in', 'long.mp4')
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=60:size=1280x720:rate=30', '-c:v', 'libx264', '-preset', 'ultrafast', longVideo])
  const { cancel } = await import('./convert')
  const pending = convert({ id: 'cancel-me', path: longVideo, to: 'webm' }, () => {})
  setTimeout(() => cancel('cancel-me'), 800)
  const cancelled = await pending
  if (!cancelled.ok && cancelled.cancelled) { passed++; console.log('\nok cancel') } else { failed++; console.log('\nXX cancel', cancelled) }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} unavailable on this computer\nfiles in ${root}`)
  app.exit(failed ? 1 : 0)
}

// Hidden render windows come and go; without this Electron quits when the first one closes.
app.on('window-all-closed', () => {})
app.whenReady().then(main).catch((err) => { console.error(err); app.exit(1) })
