// Runs the end-to-end conversion test inside Electron (see src/main/smoke.ts).
import { spawnSync } from 'node:child_process'
import electron from 'electron'

// Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, which would start plain Node instead.
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
// CI Linux runners can't use Chromium's sandbox (no unprivileged user namespaces).
const args = process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []
const r = spawnSync(electron, [...args, 'out/main/smoke.js'], { stdio: 'inherit', env })
process.exit(r.status ?? 1)
