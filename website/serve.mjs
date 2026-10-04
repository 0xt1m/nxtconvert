// Serves website/dist locally: `npm run site:dev` (builds first). Not used in production.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('dist/', import.meta.url))
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' }
const port = Number(process.env.PORT) || 4173

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(root, path)
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*' })
    res.end(await readFile(file))
  } catch {
    res.writeHead(404, { 'Content-Type': types['.html'] })
    res.end(await readFile(join(root, '404.html')).catch(() => 'Not found'))
  }
}).listen(port, () => console.log(`nxtconvert website on http://localhost:${port}/`))
