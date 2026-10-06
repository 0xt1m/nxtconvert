# Releasing

Installers and update files are published to the public
[nxtconvert-releases](https://github.com/0xt1m/nxtconvert-releases) repository. Installed apps check its
latest release when they start.

## Publishing a version

1. Set `"version"` in `package.json` (for example `0.2.0`) and add a `## 0.2.0` section to
   [CHANGELOG.md](../CHANGELOG.md). These notes are shown in the app's update panel.
2. Commit, then tag and push:

   ```sh
   git tag v0.2.0
   git push origin main v0.2.0
   ```

3. The [release workflow](../.github/workflows/release.yml) checks that the tag matches the version, runs
   the tests on macOS, Windows and Linux, uploads the installers to a draft release and publishes it once
   every build has succeeded. The [website workflow](../.github/workflows/website.yml) then rebuilds
   nxtconvert.com with the new download links.

## Repository secrets

| Secret | Purpose |
| --- | --- |
| `RELEASES_TOKEN` | Fine-grained token with *Contents: read and write* on the releases repository |
| `MAC_CERTIFICATE` | Base64-encoded `.p12` export of a *Developer ID Application* certificate |
| `MAC_CERTIFICATE_PASSWORD` | Password of that `.p12` file |
| `APPLE_ID` | Apple account used for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that account |
| `APPLE_TEAM_ID` | Apple developer team ID |

Without the macOS secrets the Mac build is unsigned: it runs after the user allows it in System Settings,
and updates go through the download page instead of installing automatically.

## How updates install

| Platform | Installs updates itself |
| --- | --- |
| Windows | Yes |
| Linux AppImage | Yes |
| Linux `.deb` | Yes, after asking for the administrator password |
| macOS | When the build is signed and notarized; otherwise the app opens the download page |

To try the update panel in a development build, serve a folder containing a `latest-mac.yml`
(`latest.yml` on Windows, `latest-linux.yml` on Linux) and the file it names, then run:

```sh
NXT_UPDATE_FEED=http://127.0.0.1:8765/ npm run dev
```

The override is ignored in packaged builds.

## Website

`website/` builds the static site at nxtconvert.com, including a page for each popular conversion listed
in `website/content.mjs`. Site settings live in `website/site.config.mjs`.

```sh
npm run site:dev     # build and serve on http://localhost:4173
npm run site:build   # build into website/dist
```

The website workflow publishes `website/dist` to the `gh-pages` branch of the releases repository on every
change to the site, after each release, and every six hours to refresh the download count.
