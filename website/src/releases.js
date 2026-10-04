// Turns GitHub's releases list into what the page shows. Used by the build and in the browser.

/** Installer files, one per platform. Update files (.zip, .yml, .blockmap) aren't downloads people chose. */
export const PLATFORMS = {
  mac: { test: /\.dmg$/i, label: 'macOS', button: 'Download for Mac', note: 'Apple silicon, macOS 12 or later' },
  windows: { test: /\.exe$/i, label: 'Windows', button: 'Download for Windows', note: 'Windows 10 and 11, 64-bit' },
  appimage: { test: /\.AppImage$/i, label: 'Linux', button: 'Download AppImage', note: 'Any 64-bit distribution' },
  deb: { test: /\.deb$/i, label: 'Linux (.deb)', button: 'Download .deb', note: 'Debian, Ubuntu, Mint' }
}

const isInstaller = (name) => Object.values(PLATFORMS).some((p) => p.test.test(name))

/** Total installer downloads across all releases, plus the newest release's files. */
export function summarize(releases) {
  const published = releases.filter((r) => !r.draft)
  let downloads = 0
  for (const r of published) for (const a of r.assets ?? []) if (isInstaller(a.name)) downloads += a.download_count ?? 0
  const latest = published.find((r) => !r.prerelease) ?? null
  const assets = {}
  if (latest) {
    for (const [id, p] of Object.entries(PLATFORMS)) {
      const a = latest.assets.find((x) => p.test.test(x.name))
      if (a) assets[id] = { url: a.browser_download_url, size: a.size, name: a.name }
    }
  }
  return {
    downloads,
    version: latest ? latest.tag_name.replace(/^v/, '') : null,
    date: latest ? latest.published_at : null,
    assets
  }
}

export const formatCount = (n) => new Intl.NumberFormat('en').format(n)

export function formatSize(bytes) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}

export function apiUrl(repo) {
  return `https://api.github.com/repos/${repo}/releases?per_page=100`
}
