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
