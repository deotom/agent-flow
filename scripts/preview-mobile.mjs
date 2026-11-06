import http from 'node:http'
import { readFile } from 'node:fs/promises'
const root = new URL('../mobile/', import.meta.url)
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', webmanifest: 'application/manifest+json' }
http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html'
  if (!name.split('/').every(part => /^[a-zA-Z0-9_.-]+$/.test(part) && part !== '.' && part !== '..')) { res.writeHead(404).end(); return }
  try {
    const body = await readFile(new URL(name, root))
    res.writeHead(200, { 'Content-Type': types[name.split('.').pop()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body)
  } catch { res.writeHead(404).end() }
}).listen(4178, '127.0.0.1', () => console.log('Mobile preview: http://127.0.0.1:4178'))
