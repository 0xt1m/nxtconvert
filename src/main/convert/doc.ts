import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import mammoth from 'mammoth'
import { marked } from 'marked'
import type { DocPlan, DocStep, HtmlReader, HtmlWriter } from '@shared/formats'
import { run, tools } from '../tools'
import { htmlToPdf, htmlToText } from '../render'
import { throwIfAborted, type Job, type Output } from './util'

const escape = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** A plain readable page around converted content; `base` makes relative images resolve. */
function page(title: string, body: string, baseDir: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(title)}</title>
<base href="${pathToFileURL(baseDir).href}/">
<style>
  @page { margin: 22mm 20mm; }
  body { font: 11pt/1.55 Georgia, "Times New Roman", serif; color: #141518; max-width: 46em; margin: 0 auto; }
  h1, h2, h3, h4 { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.25; }
  img { max-width: 100%; height: auto; }
  pre, code { font: 9.5pt/1.5 ui-monospace, Menlo, Consolas, monospace; }
  pre { white-space: pre-wrap; word-wrap: break-word; }
  table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 4px 8px; }
  .page-break { break-after: page; }
</style></head><body>
${body}
</body></html>`
}

function textToHtml(text: string): string {
  return text
    .split('\f')
    .map((pg) => pg.split(/\n\s*\n/).map((p) => p.trim() && `<p>${escape(p.trim()).replace(/\n/g, '<br>')}</p>`).join('\n'))
    .join('\n<div class="page-break"></div>\n')
}

/** LibreOffice in its own throwaway profile, so parallel jobs and an open LibreOffice don't collide. */
async function soffice(job: Job, input: string, to: string, outDir: string): Promise<string> {
  const target = { txt: 'txt:Text (encoded):UTF8', html: 'html:XHTML Writer File:UTF8', docx: 'docx:MS Word 2007 XML' }[to] ?? to
  const profile = pathToFileURL(join(job.tmp, 'lo-profile')).href
  const args = [`-env:UserInstallation=${profile}`, '--headless', '--norestore', '--nolockcheck']
  // HTML opens in Writer/Web by default, which can't export office formats.
  if (extname(input).toLowerCase() === '.html') args.push('--infilter=HTML (StarWriter)')
  args.push('--convert-to', target, '--outdir', outDir, input)
  await run(tools().soffice!, args, { signal: job.signal })
  const produced = join(outDir, basename(input, extname(input)) + '.' + to)
  await readFile(produced).catch(() => { throw new Error('LibreOffice produced nothing (unsupported codec)') })
  return produced
}

async function pandoc(job: Job, input: string, to: string, out: string): Promise<void> {
  const args = [input, '-o', out]
  if (to === 'txt') args.push('-t', 'plain')
  if (to === 'html') args.push('-s', '--embed-resources')
  if (to === 'epub') args.push('--metadata', `title=${job.base}`)
  if (extname(input).toLowerCase() === '.md') args.push('-f', 'markdown')
  await run(tools().pandoc!, args, { signal: job.signal, cwd: dirname(job.src) })
}

/** Source → an HTML file on disk. */
async function readHtml(job: Job, reader: HtmlReader): Promise<string> {
  const out = join(job.tmp, 'intermediate.html')
  const base = dirname(job.src)
  switch (reader) {
    case 'read':
      return job.src
    case 'txt':
      await writeFile(out, page(job.base, textToHtml(await readFile(job.src, 'utf8')), base))
      return out
    case 'md':
      await writeFile(out, page(job.base, await marked.parse(await readFile(job.src, 'utf8')), base))
      return out
    case 'mammoth': {
      const { value } = await mammoth.convertToHtml({ path: job.src })
      await writeFile(out, page(job.base, value, base))
      return out
    }
    case 'pdftotext': {
      const txt = join(job.tmp, 'intermediate.txt')
      await run(tools().pdftotext!, ['-enc', 'UTF-8', job.src, txt], { signal: job.signal })
      await writeFile(out, page(job.base, textToHtml(await readFile(txt, 'utf8')), base))
      return out
    }
    case 'pandoc':
      await pandoc(job, job.src, 'html', out)
      return out
    case 'soffice':
      return soffice(job, job.src, 'html', join(job.tmp, 'lo-html'))
  }
}

/** HTML file → the target, written to `out`. */
async function writeHtml(job: Job, html: string, writer: HtmlWriter, to: string, out: string): Promise<string> {
  switch (writer) {
    case 'write':
      await writeFile(out, await readFile(html))
      return out
    case 'text':
      await writeFile(out, await htmlToText(html, job.signal))
      return out
    case 'print':
      await writeFile(out, await htmlToPdf(html, job.signal))
      return out
    case 'pandoc':
      await pandoc(job, html, to, out)
      return out
    case 'soffice':
      return soffice(job, html, to, join(job.tmp, 'lo-out'))
  }
}

async function runStep(job: Job, step: DocStep, to: string): Promise<string> {
  const out = join(job.tmp, `out.${to}`)
  switch (step.engine) {
    case 'soffice':
      return soffice(job, job.src, to, join(job.tmp, 'lo-out'))
    case 'pandoc':
      await pandoc(job, job.src, to, out)
      return out
    case 'pdftotext':
      await run(tools().pdftotext!, ['-enc', 'UTF-8', '-layout', job.src, out], { signal: job.signal })
      return out
    case 'html': {
      const html = await readHtml(job, step.reader)
      job.progress(50)
      throwIfAborted(job.signal)
      return writeHtml(job, html, step.writer, to, out)
    }
  }
}

export async function convertDoc(job: Job, plan: DocPlan): Promise<Output> {
  job.progress(10)
  if (!plan.pages) {
    const out = await runStep(job, plan.step!, job.to)
    job.progress(100)
    return out
  }

  const pdf = plan.step ? await runStep(job, plan.step, 'pdf') : job.src
  job.progress(60)
  throwIfAborted(job.signal)

  const pagesDir = join(job.tmp, 'pages')
  await mkdir(pagesDir)
  const fmt = plan.pages === 'png' ? ['-png'] : ['-jpeg', '-jpegopt', `quality=${job.settings.imageQuality}`]
  await run(tools().pdftoppm!, ['-r', '150', ...fmt, pdf, join(pagesDir, job.base)], { signal: job.signal })
  const files = (await readdir(pagesDir)).sort().map((f) => join(pagesDir, f))
  job.progress(100)
  return files.length === 1 ? files[0] : files
}
