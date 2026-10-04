// Builds the static website into website/dist: `npm run site:build`.
// Pages come from the app's own format table, so the site never claims a conversion the app can't do.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { FORMATS, kindOf, planFor } from '../src/shared/formats.ts'
import config from './site.config.mjs'
import { FAQ, FORMAT_INFO, PAIRS, SETTINGS_NOTE } from './content.mjs'
import { PLATFORMS, apiUrl, formatCount, formatSize, summarize } from './src/releases.js'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const DIST = here('dist/')
const SITE = config.siteUrl.replace(/\/$/, '')
const REPO = config.releasesRepo
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`
const TODAY = new Date().toISOString().slice(0, 10)

/** Only what ships inside the app: landing pages must work with no extra tools installed. */
const BUILT_IN = { platform: 'linux', sips: false, pandoc: false, soffice: false, poppler: false }

const KIND_LABEL = { image: 'Images', video: 'Video', audio: 'Audio', doc: 'Documents' }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const slug = (p) => `${p.from}-to-${p.to}`
const name = (ext) => FORMAT_INFO[ext]?.name ?? ext.toUpperCase()

// ---------- Release data ----------

async function releaseData() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'nxtconvert-site' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  try {
    const res = await fetch(apiUrl(REPO), { headers })
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    return summarize(await res.json())
  } catch (err) {
    console.warn(`! No release data (${err.message}); download buttons point at the releases page.`)
    return { downloads: 0, version: null, date: null, assets: {} }
  }
}

// ---------- Pieces ----------

const ICON = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  stack: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  free: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>'
}
const icon = (n, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`
const MARK = `<svg width="20" height="18" viewBox="112 112 296 264" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M136 112h160a24 24 0 0 1 24 24v160a24 24 0 0 1-24 24H136a24 24 0 0 1-24-24V136a24 24 0 0 1 24-24z M316 192a92 92 0 1 1 0 184a92 92 0 1 1 0-184z"/></svg>`

const badge = (ext, href) => {
  const cls = `badge k-${kindOf(ext) === 'any' ? 'doc' : kindOf(ext)}`
  return href ? `<a class="${cls}" href="${href}">${esc(name(ext))}</a>` : `<span class="${cls}">${esc(name(ext))}</span>`
}

/** All four installers; the visitor's OS is moved first and made primary by site.js. */
function downloadButtons(rel) {
  return `<div class="dl" data-dl-group>${Object.entries(PLATFORMS).map(([id, p], i) =>
    `<a class="btn${i === 0 ? ' btn-primary' : ''}" data-dl="${id}" href="${esc(rel.release.assets[id]?.url ?? RELEASES_PAGE)}">${esc(p.button)}</a>`).join('')}</div>`
}

function facts(rel) {
  const r = rel.release
  return `<p class="facts">
    <span>Free</span>
    <span>macOS · Windows · Linux</span>
    ${r.version ? `<span>Version <b data-version>${esc(r.version)}</b></span>` : ''}
    <span data-downloads-wrap${r.downloads > 0 ? '' : ' hidden'}><b data-downloads>${formatCount(r.downloads)}</b> downloads</span>
  </p>`
}

function layout({ rel, path, title, description, body, jsonLd = [], image = 'assets/og.png' }) {
  const url = `${SITE}/${path}`
  const r = rel.prefix
  return `<!doctype html>
<html lang="en" data-repo="${esc(REPO)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0f1012" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f4f4f1" media="(prefers-color-scheme: light)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="nxtconvert">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/${image}">
<link rel="icon" href="${r}assets/icon.svg" type="image/svg+xml">
<link rel="icon" href="${r}assets/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${r}assets/apple-touch-icon.png">
<link rel="preload" href="${r}fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${r}styles.css">
<link rel="sitemap" type="application/xml" href="${SITE}/sitemap.xml">
${jsonLd.map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="wrap">
  <a class="brand" href="${r || './'}" aria-label="nxtconvert home">${MARK}<div><span>nxt</span>convert</div></a>
  <nav class="site-nav" aria-label="Main">
    <a href="${r}#features">Features</a><a href="${r}#formats">Formats</a><a href="${r}convert/">Conversions</a><a href="${r}#faq">FAQ</a><a href="${r}#developer">Developer</a>
  </nav>
  <a class="btn btn-sm" href="${r}#download">Download</a>
</div></header>
<main id="main">
${body}
</main>
<footer class="site-footer"><div class="wrap">
  <span>© ${new Date().getFullYear()} ${esc(config.developer.name)} · nxtconvert</span>
  <nav aria-label="Footer">
    <a href="${r}#download">Download</a><a href="${r}convert/">All conversions</a><a href="${r}#faq">FAQ</a>
    <a href="https://github.com/${esc(REPO)}/releases">Release notes</a><a href="https://github.com/${esc(REPO)}/issues">Report a problem</a>
  </nav>
</div></footer>
<script type="module" src="${r}site.js"></script>
</body>
</html>
`
}

function softwareLd(rel, description) {
  const r = rel.release
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'nxtconvert',
    description,
    applicationCategory: 'UtilitiesApplication',
    applicationSubCategory: 'File converter',
    operatingSystem: 'macOS 12+, Windows 10, Windows 11, Linux',
    url: `${SITE}/`,
    downloadUrl: `${SITE}/#download`,
    image: `${SITE}/assets/icon.svg`,
    screenshot: `${SITE}/assets/app-queue-dark.webp`,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Person', name: config.developer.name, url: config.developer.github },
    ...(r.version ? { softwareVersion: r.version } : {}),
    ...(r.date ? { datePublished: r.date.slice(0, 10) } : {}),
    ...(r.downloads > 0 ? {
      interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/DownloadAction', userInteractionCount: r.downloads }
    } : {})
  }
}

// ---------- Home ----------

function homePage(release) {
  const rel = { prefix: '', release }
  const description = 'Free, lightweight file converter for Mac, Windows and Linux. Convert images, video, audio and documents offline: no uploads, no ads, no account.'

  const features = [
    ['lock', 'Your files stay with you', 'Everything converts on your computer. Nothing is uploaded, and it works with no internet connection at all.'],
    ['window', 'One small window', 'Drop files in, pick a format, press Convert. No accounts, no ads, no clutter.'],
    ['stack', 'Batches of anything', 'Mix photos, videos, songs and documents in one queue and set each target, or set them all at once.'],
    ['bolt', 'Fast native engines', 'Built on libvips for images and FFmpeg for video and audio, the same engines professional tools use.'],
    ['free', 'Free, no limits', 'No file size caps, no watermarks, no daily quotas, no trial.'],
    ['refresh', 'Keeps itself current', 'Checks for new versions when it opens and asks before installing anything.']
  ]

  const kinds = Object.keys(FORMATS).map((k) => {
    const exts = [...new Set(FORMATS[k].map((f) => f.ext).concat(k === 'image' ? ['svg'] : k === 'doc' ? ['md'] : []))]
      .filter((e) => kindOf(e) === k)
    return `<div class="card"><p class="kind-head">${esc(KIND_LABEL[k])}</p><div class="badges">${exts.map((e) => badge(e)).join('')}</div></div>`
  }).join('')

  const popular = PAIRS.slice(0, 16)
  const assetRow = (id) => {
    const p = PLATFORMS[id], a = release.assets[id]
    return `<tr><td><b>${esc(p.label)}</b></td><td class="muted hide-sm">${esc(p.note)}</td>
      <td class="num muted" data-size="${id}">${a ? formatSize(a.size) : ''}</td>
      <td><a class="btn btn-sm" data-dl="${id}" href="${esc(a?.url ?? RELEASES_PAGE)}">Download</a></td></tr>`
  }

  const dev = config.developer
  const body = `
<div class="hero"><div class="wrap">
  <h1>The <em>lightweight</em> file converter that works offline</h1>
  <p class="lede">Convert images, video, audio and documents on your Mac, Windows or Linux computer. Drop files in, pick a format, done. No uploads, no ads, no account.</p>
  ${downloadButtons(rel)}
  ${facts(rel)}
  <div class="shot">
    <img class="shot-dark" src="assets/app-queue-dark.webp" width="1600" height="1000" alt="nxtconvert converting a HEIC photo to JPG, a PNG to AVIF, a MOV video to MP4 and a WAV recording to MP3 in one queue" fetchpriority="high">
    <img class="shot-light" src="assets/app-empty-light.webp" width="1600" height="1000" alt="nxtconvert's empty window: drop files to convert, or browse" loading="lazy">
  </div>
</div></div>

<section id="features"><div class="wrap">
  <h2>A converter that does one thing well</h2>
  <p class="sub">Most converters want your files on their server, your email in their list, or a subscription. nxtconvert is a small app that converts files on your own machine.</p>
  <div class="grid grid-3">${features.map(([i, h, p]) => `<div class="card">${icon(i)}<h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div>
</div></section>

<section id="formats"><div class="wrap">
  <h2>Every format you actually use</h2>
  <p class="sub">30 formats across images, video, audio and documents, including iPhone HEIC photos, AVIF and WebP for the web, and FLAC for music.</p>
  <div class="grid">${kinds}</div>
  <h3 class="kind-head" style="margin-top:40px">Popular conversions</h3>
  <ul class="pairs">${popular.map((p) => `<li><a href="convert/${slug(p)}/">${badge(p.from)}<span class="arrow">→</span>${badge(p.to)}</a></li>`).join('')}</ul>
  <p class="more"><a class="btn btn-sm" href="convert/">All ${PAIRS.length} conversion guides</a></p>
</div></section>

<section id="how"><div class="wrap">
  <h2>How it works</h2>
  <p class="sub">Three steps, the same for every kind of file.</p>
  <ol class="steps">
    <li><b>Drop your files</b><span>Drag files onto the window or click Browse files. Mix any types you like.</span></li>
    <li><b>Pick a format</b><span>Choose a target for each file, or set a whole category at once. Formats that can’t be reached are greyed out with the reason.</span></li>
    <li><b>Convert</b><span>Files are saved to Downloads/nxtconvert, or a folder you choose. Originals are never overwritten.</span></li>
  </ol>
</div></section>

<section id="download"><div class="wrap">
  <h2>Download nxtconvert</h2>
  <p class="sub">Free for macOS, Windows and Linux.${release.version ? ` Latest version: <b data-version>${esc(release.version)}</b>.` : ''}</p>
  <table class="downloads">
    <thead><tr><th>System</th><th class="hide-sm">Works on</th><th>Size</th><th><span class="skip">Download</span></th></tr></thead>
    <tbody>${Object.keys(PLATFORMS).map(assetRow).join('')}</tbody>
  </table>
  <p class="fineprint">Downloads come straight from <a href="https://github.com/${esc(REPO)}/releases">GitHub Releases</a>. Optional extras: install <a href="https://www.libreoffice.org/download/">LibreOffice</a> or <a href="https://pandoc.org/installing.html">Pandoc</a> for ODT, RTF and EPUB, and <a href="https://poppler.freedesktop.org/">Poppler</a> to turn PDF pages into images or text.</p>
</div></section>

<section id="faq" class="faq"><div class="wrap">
  <h2>Questions</h2>
  <p class="sub">Short answers to what people ask most.</p>
  ${FAQ.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n  ')}
</div></section>

<section id="developer"><div class="wrap">
  <h2>Developer</h2>
  <p class="sub">Who makes nxtconvert.</p>
  <div class="dev">
    <img src="${esc(dev.avatar)}" width="96" height="96" alt="" loading="lazy">
    <div>
      <h3>${esc(dev.name)}</h3>
      <p>${esc(dev.bio)}</p>
      <div class="links">
        <a class="btn btn-sm" href="${esc(dev.github)}">GitHub</a>
        <a class="btn btn-sm" href="https://github.com/${esc(REPO)}/issues">Report a problem</a>
        <a class="btn btn-sm" href="https://github.com/${esc(REPO)}/releases">Release notes</a>
        ${(dev.links ?? []).map((l) => `<a class="btn btn-sm" href="${esc(l.url)}">${esc(l.label)}</a>`).join('')}
      </div>
    </div>
  </div>
  <p class="credits">Built with <a href="https://www.electronjs.org/">Electron</a>, <a href="https://react.dev/">React</a>,
    <a href="https://www.libvips.org/">libvips</a> (via sharp), <a href="https://ffmpeg.org/">FFmpeg</a>,
    <a href="https://github.com/mwilliamson/mammoth.js">mammoth</a> and <a href="https://vercel.com/font">Geist</a>. FFmpeg and libvips are distributed under their own open-source licences.</p>
</div></section>
`

  const jsonLd = [
    softwareLd(rel, description),
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'nxtconvert', url: `${SITE}/` },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
  ]
  return layout({ rel, path: '', title: 'nxtconvert: Free Lightweight File Converter That Works Offline', description, body, jsonLd })
}

// ---------- Conversion pages ----------

function pairPage(pair, release) {
  const rel = { prefix: '../../', release }
  const F = FORMAT_INFO[pair.from], T = FORMAT_INFO[pair.to], kind = kindOf(pair.from)
  const title = `${F.name} to ${T.name} Converter: Free & Offline | nxtconvert`
  const description = `Convert ${F.name} to ${T.name} free on Mac, Windows or Linux. nxtconvert works offline: no upload, no file size limit, no watermark, batches in one click.`
  const opening = pair.blurb ?? `Turn ${F.long}s into ${T.long}s on your own computer, one file or hundreds at a time.`
  const related = PAIRS.filter((p) => p !== pair && (p.from === pair.from || p.to === pair.to)).slice(0, 8)
  const steps = [
    ['Download nxtconvert', 'It’s free for macOS, Windows and Linux. Install it like any other app.'],
    [`Add your ${F.name} files`, `Drag them onto the window, or click Browse files. You can add as many as you like.`],
    [`Choose ${T.name}`, `Pick ${T.name} in the format menu next to each file, or use “Set all to” for the whole batch.`],
    ['Convert', `Press Convert. Your ${T.name} files appear in Downloads/nxtconvert, and the originals stay untouched.`]
  ]

  const body = `
<div class="wrap page">
  <ol class="crumbs"><li><a href="../../">Home</a></li><li><a href="../">Conversions</a></li><li aria-current="page">${esc(F.name)} to ${esc(T.name)}</li></ol>
  <div class="hero">
    <div class="convert-badges">${badge(pair.from)}<span class="arrow">→</span>${badge(pair.to)}</div>
    <h1>Convert ${esc(F.name)} to ${esc(T.name)} offline, for free</h1>
    <p class="lede">${esc(opening)} No upload, no file size limit, no watermark.</p>
    ${downloadButtons(rel)}
    ${facts(rel)}
  </div>
  <div class="prose">
    <h2>How to convert ${esc(F.name)} to ${esc(T.name)}</h2>
    <ol class="steps">${steps.map(([b, s]) => `<li><b>${esc(b)}</b><span>${esc(s)}</span></li>`).join('')}</ol>

    <h2>${esc(F.name)} and ${esc(T.name)}</h2>
    <p>${esc(F.about)}</p>
    <p>${esc(T.about)}</p>
    <p>${esc(SETTINGS_NOTE[kind])}</p>

    <h2>Why convert on your computer?</h2>
    <p>Online converters upload your ${esc(F.name)} files to someone else’s server, limit file sizes and often add queues or watermarks. nxtconvert does the work locally with the same engines professional tools use, so it’s private, works offline and handles large files and big batches.</p>
  </div>
  ${related.length ? `<h2>Related conversions</h2><ul class="pairs" style="margin-bottom:64px">${related.map((p) =>
    `<li><a href="../${slug(p)}/">${badge(p.from)}<span class="arrow">→</span>${badge(p.to)}</a></li>`).join('')}</ul>` : ''}
</div>
`
  const url = `${SITE}/convert/${slug(pair)}/`
  const jsonLd = [
    softwareLd(rel, description),
    {
      '@context': 'https://schema.org', '@type': 'HowTo', name: `How to convert ${F.name} to ${T.name}`,
      totalTime: 'PT1M', tool: { '@type': 'HowToTool', name: 'nxtconvert' },
      step: steps.map(([n, t], i) => ({ '@type': 'HowToStep', position: i + 1, name: n, text: t }))
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Conversions', item: `${SITE}/convert/` },
        { '@type': 'ListItem', position: 3, name: `${F.name} to ${T.name}`, item: url }
      ]
    }
  ]
  return layout({ rel, path: `convert/${slug(pair)}/`, title, description, body, jsonLd })
}

function convertIndex(release) {
  const rel = { prefix: '../', release }
  const groups = Object.keys(KIND_LABEL).map((k) => {
    const list = PAIRS.filter((p) => kindOf(p.from) === k)
    return list.length ? `<h2>${esc(KIND_LABEL[k])}</h2><ul class="pairs" style="margin-bottom:40px">${list.map((p) =>
      `<li><a href="${slug(p)}/">${badge(p.from)}<span class="arrow">→</span>${badge(p.to)}</a></li>`).join('')}</ul>` : ''
  }).join('')
  const body = `
<div class="wrap page">
  <ol class="crumbs"><li><a href="../">Home</a></li><li aria-current="page">Conversions</li></ol>
  <div class="hero">
    <h1>File conversion guides</h1>
    <p class="lede">Step-by-step guides for the conversions people search for most. Every one works offline in nxtconvert, free.</p>
    ${downloadButtons(rel)}
  </div>
  ${groups}
</div>
`
  const description = 'Free offline guides: convert HEIC to JPG, MOV to MP4, WAV to MP3, DOCX to PDF and more on Mac, Windows and Linux with nxtconvert.'
  return layout({ rel, path: 'convert/', title: 'Free Offline File Conversion Guides | nxtconvert', description, body })
}

function notFound(release) {
  // Served for any missing path at any depth, so links are absolute.
  const html = layout({
    rel: { prefix: `${SITE}/`, release }, path: '404.html', title: 'Page not found | nxtconvert',
    description: 'This page doesn’t exist.',
    body: `<div class="hero"><div class="wrap"><h1>Page not found</h1><p class="lede">That page doesn’t exist, but the converter does.</p>${downloadButtons({ prefix: `${SITE}/`, release })}</div></div>`
  })
  return html.replace('<meta name="robots" content="index, follow, max-image-preview:large">', '<meta name="robots" content="noindex">')
}

// ---------- Build ----------

async function main() {
  // Guard: a landing page for a conversion the app can't do out of the box would mislead.
  for (const p of PAIRS) {
    const plan = planFor(p.from, p.to, BUILT_IN)
    if (typeof plan === 'string') throw new Error(`${p.from} → ${p.to} isn't built in (${plan}); remove it from PAIRS`)
    if (!FORMAT_INFO[p.from] || !FORMAT_INFO[p.to]) throw new Error(`Missing FORMAT_INFO for ${p.from} or ${p.to}`)
  }

  const release = await releaseData()
  await rm(DIST, { recursive: true, force: true })
  await mkdir(here('dist/fonts'), { recursive: true })

  const pages = [['index.html', homePage(release)], ['convert/index.html', convertIndex(release)], ['404.html', notFound(release)]]
  for (const p of PAIRS) pages.push([`convert/${slug(p)}/index.html`, pairPage(p, release)])
  for (const [file, html] of pages) {
    await mkdir(here(`dist/${file}`).replace(/[^/\\]+$/, ''), { recursive: true })
    await writeFile(here(`dist/${file}`), html)
  }

  const urls = ['', 'convert/', ...PAIRS.map((p) => `convert/${slug(p)}/`)]
  await writeFile(here('dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}/${u}</loc><lastmod>${TODAY}</lastmod><priority>${u === '' ? '1.0' : u === 'convert/' ? '0.8' : '0.7'}</priority></url>`).join('\n')}
</urlset>
`)
  await writeFile(here('dist/robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)
  await writeFile(here('dist/.nojekyll'), '')
  if (config.customDomain) await writeFile(here('dist/CNAME'), `${config.customDomain}\n`)

  await cp(here('assets'), here('dist/assets'), { recursive: true })
  for (const f of ['styles.css', 'site.js', 'releases.js']) await cp(here(`src/${f}`), here(`dist/${f}`))
  const fonts = here('../node_modules/@fontsource-variable/')
  await cp(`${fonts}geist/files/geist-latin-wght-normal.woff2`, here('dist/fonts/geist.woff2'))
  await cp(`${fonts}geist-mono/files/geist-mono-latin-wght-normal.woff2`, here('dist/fonts/geist-mono.woff2'))

  const size = (await Promise.all(pages.map(([f]) => readFile(here(`dist/${f}`))))).reduce((n, b) => n + b.length, 0)
  console.log(`Built ${pages.length} pages (${Math.round(size / 1024)} KB of HTML) into website/dist for ${SITE}`)
  console.log(`Release: ${release.version ?? 'none yet'} · ${formatCount(release.downloads)} downloads`)
}

await main()
