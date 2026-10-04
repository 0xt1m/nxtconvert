<img src="logo/nxtconvert-icon.svg" width="72" alt="">

# nxtconvert

Drop a file in, pick a format, press Convert. Images, video, audio and documents, converted on this computer. Nothing is uploaded.

Desktop app for macOS, Windows and Linux (Electron + React + TypeScript). The interface follows the
[nxtconvert design system](https://claude.ai/artifact/5KGFwgySrhrrr8uaKrZzSM): one window, two states (an empty drop zone and a queue), with the title bar drawn for each platform.

## Develop

```sh
npm install
npm run dev        # app with hot reload
npm test           # builds, then runs every conversion this computer supports, end to end
npm run typecheck
npm run dist       # installer for the current OS: .dmg + .zip, .exe (NSIS), or AppImage + .deb
```

Build each installer on its own OS, because sharp and ffmpeg install native binaries for the machine
that runs `npm install`. `.github/workflows/build.yml` tests and packages on all three for every push.

## What converts to what

| From | To | Engine |
| --- | --- | --- |
| JPG, PNG, WEBP, AVIF, GIF, TIFF, SVG, BMP, ICO, HEIC | JPG, PNG, WEBP, AVIF, GIF, TIFF, BMP, ICO, PDF | sharp (libvips), built in |
| any image | HEIC | macOS only (`sips`) |
| MP4, MOV, WEBM, MKV, AVI, M4V | MP4, MOV, WEBM, MKV, AVI, GIF, MP3 | ffmpeg, built in |
| MP3, WAV, FLAC, AAC, M4A, OGG, OPUS | each other | ffmpeg, built in |
| TXT, MD, HTML, DOCX | PDF, HTML, TXT | built in (mammoth, marked, Chromium print) |
| DOCX, DOC, ODT, RTF, HTML, … | DOCX, ODT, RTF, EPUB | LibreOffice or Pandoc, if installed |
| PDF | TXT, HTML, PNG/JPG (one per page) | Poppler, if installed |

Optional tools are found on `PATH` and in their usual install folders. Each one adds formats, listed under
Settings → Converters on this computer. A format that can't be reached stays in the menu, disabled, with the
reason ("Needs LibreOffice").

## Layout

```
src/shared/formats.ts     format lists and the routing table (which engine handles which pair)
src/main/convert/         image.ts, av.ts, doc.ts; index.ts runs a job and delivers the output
src/main/tools.ts         bundled ffmpeg, optional tool discovery, process runner
src/main/render.ts        offline hidden windows for HTML → PDF / text
src/main/updater.ts       update check on launch, download, restart to install
src/main/smoke.ts         the end-to-end test behind `npm test`
src/renderer/src/         the window: App.tsx, Settings.tsx, Update.tsx, components/ui.tsx (design-system components)
src/renderer/src/styles/  tokens.css (generated from the design system's tokens.json), components.css, app.css
```

Output goes to `Downloads/nxtconvert` by default (Change in the footer) and never overwrites a file:
`name (1).jpg`. When **Keep originals** is off, sources go to the Trash or Recycle Bin, not deleted outright.

## Updates

When the app opens and is online, it checks the latest release in the public
[0xt1m/nxtconvert-releases](https://github.com/0xt1m/nxtconvert-releases) repo (offline at launch: it checks
when the connection returns). If there's a newer version, a panel under the title bar shows the release notes
and offers **Update**: it downloads with progress, then offers **Restart now** (or installs on the next quit).
Errors are silent until someone chooses to update. Then the panel falls back to the download page.

| Platform | Installs updates itself |
| --- | --- |
| Windows (NSIS) | Yes. Unsigned builds work, but SmartScreen warns on first install. |
| Linux AppImage | Yes |
| Linux .deb | Yes, asking for the admin password |
| macOS | Only when signed with a Developer ID and notarized. Unsigned builds show **Download**, which opens the release page. |

The source repo stays private; only installers and `latest*.yml` update files go to the public releases repo.

### One-time setup

1. Create the public repo `0xt1m/nxtconvert-releases`, with a README so it has a first commit.
2. Create a fine-grained token with **Contents: read and write** on that repo only, and add it to this
   repo's Actions secrets as `RELEASES_TOKEN`.
3. For macOS updates, also add `MAC_CERTIFICATE` (base64 .p12 of a "Developer ID Application" certificate),
   `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Without them the
   Mac build ships unsigned. It still works, but users have to right-click and choose Open the first time, and
   updates go through the download page.

### Releasing a version

1. Bump `"version"` in `package.json` (for example `0.2.0`) and add a `## 0.2.0` section to `CHANGELOG.md`.
   Those notes appear in the app's update panel.
2. Commit, then tag and push: `git tag v0.2.0 && git push origin main v0.2.0`.
3. `.github/workflows/release.yml` checks that the tag matches the version, runs the tests on all three
   systems, uploads the installers to a draft release, and publishes it once every build has succeeded.
   Installed apps offer it the next time they open.

To try the update panel locally, serve a folder containing a `latest-mac.yml` (or `latest.yml` /
`latest-linux.yml`) and the file it names, then run `NXT_UPDATE_FEED=http://127.0.0.1:8765/ npm run dev`. The
override only works in dev builds.

## Website

`website/` is the product site: a homepage with downloads, FAQ and a developer section, plus a landing page
per popular conversion ("HEIC to JPG", "MOV to MP4" and so on, listed in `website/content.mjs`). Every
landing page is checked at build time against the app's own format table, so the site never promises a
conversion the app can't do out of the box.

```sh
npm run site:dev     # build and serve on http://localhost:4173
npm run site:build   # build into website/dist
```

- **Settings:** `website/site.config.mjs` holds the site URL, an optional custom domain, and your developer
  name, bio and links.
- **Download buttons:** they link straight to the latest release's installers. The visitor's OS is
  highlighted first.
- **Download count:** the total of installer downloads (.dmg, .exe, .AppImage, .deb) across all releases,
  from GitHub's own counters. Update files aren't counted, but Windows auto-updates download the .exe, so
  they are. The count is baked into the pages at build time and refreshed in the browser.
- **SEO:** each page gets a unique title and description, a canonical URL, Open Graph and Twitter cards,
  and structured data (SoftwareApplication, FAQPage, HowTo, BreadcrumbList). The build also writes
  `sitemap.xml` and `robots.txt`. Pages are static and light: no tracking, no cookies, about 9 KB of HTML each.

### Publishing

`.github/workflows/website.yml` builds the site and pushes it to the `gh-pages` branch of the public
releases repo. It runs on changes, after each release, and every 6 hours to refresh the count. Then:

1. In `0xt1m/nxtconvert-releases` → Settings → Pages, set the source to the `gh-pages` branch.
   The site is then at https://0xt1m.github.io/nxtconvert-releases/.
2. Add the site to [Google Search Console](https://search.google.com/search-console) and
   [Bing Webmaster Tools](https://www.bing.com/webmasters) and submit `sitemap.xml`. This is the step that
   gets the pages indexed quickly.
3. Optional: a custom domain ranks and reads better. Set `customDomain` and `siteUrl` in
   `site.config.mjs`, then point the domain's DNS at GitHub Pages.

Screenshots in `website/assets` are real renders of the app. Retake them when the interface changes.
