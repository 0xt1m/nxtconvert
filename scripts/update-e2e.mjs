// Drives an installed nxtconvert through an in-app update, the way a person would: wait for the
// offer, click Update, then Restart now. Used by .github/workflows/update-check.yml.
// Usage: node scripts/update-e2e.mjs <devtools port>
const port = process.argv[2] ?? '9222'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let target
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page') } catch { /* not up yet */ }
  if (!target) await sleep(500)
}
if (!target) { console.log('RESULT: app window never appeared'); process.exit(1) }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m.result) })
ws.addEventListener('close', () => { console.log('app closed (installing the update)'); process.exit(0) })
const evaluate = (expression) => new Promise((resolve) => {
  const i = ++id
  pending.set(i, (res) => resolve(res?.result?.value))
  ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
})
const panel = () => evaluate(`document.querySelector('.app-update')?.innerText.replace(/\\n+/g, ' | ') ?? null`)
const click = (label) => evaluate(`[...document.querySelectorAll('.app-update button')].find((b) => b.textContent === ${JSON.stringify(label)})?.click()`)
const waitFor = async (re, seconds) => {
  let p = null
  for (let i = 0; i < seconds * 2; i++) { p = await panel(); if (re.test(p ?? '')) return p; await sleep(500) }
  return p
}

console.log('offer:', await waitFor(/Update available/, 90))
await click('Update')
const downloaded = await waitFor(/Ready to install|failed/, 600)
console.log('after download:', downloaded)
if (!/Ready to install/.test(downloaded ?? '')) { console.log('RESULT: download failed'); process.exit(1) }
await click('Restart now')
const after = await waitFor(/failed/, 60)
console.log('RESULT: still open after Restart now:', after)
process.exit(1)
