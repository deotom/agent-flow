/**
 * Static file server for the pre-built webview assets.
 * Serves index.html, index.js, and index.css from app/dist/webview/.
 */
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'

const WEBVIEW_DIR = path.join(__dirname, 'webview')

const HTML_SHELL = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Flow</title>
  <link rel="stylesheet" href="/index.css">
  <style>html, body { height: 100%; margin: 0; padding: 0; }</style>
</head>
<body class="font-sans antialiased" style="background: #0a0a1a;">
  <div id="root" style="height: 100%;"></div>
  <script src="/index.js"></script>
</body>
</html>`

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}
const IMMUTABLE_EXTENSIONS = new Set(['.webp', '.png', '.svg'])

export function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = (req.url || '/').split('?')[0]

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML_SHELL)
    return
  }

  if (url.includes('..') || url.includes('\\')) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  // Only serve known root-level asset files from the webview directory
  const basename = path.basename(url)
  if (url !== `/${basename}`) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const ext = path.extname(basename)
  const mime = MIME_TYPES[ext]

  if (!mime) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const webviewRoot = path.resolve(WEBVIEW_DIR)
  const filePath = path.resolve(webviewRoot, basename)

  // Prevent path traversal
  if (!filePath.startsWith(webviewRoot + path.sep)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  try {
    const content = fs.readFileSync(filePath)
    const headers: Record<string, string> = { 'Content-Type': mime }
    if (IMMUTABLE_EXTENSIONS.has(ext)) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    }
    res.writeHead(200, headers)
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}
