// HTTP layer: a tiny router on node:http. Serves the REST API and the static web UI.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { validateCoverage } = require('./validate');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const MAX_BODY = 32 * 1024;

function send(res, status, data) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' }); // path traversal guard
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function createApp(repo, { log = () => {} } = {}) {
  async function handle(req, res) {
    const { pathname, searchParams } = new URL(req.url, 'http://localhost');
    const started = Date.now();
    res.on('finish', () => log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`));

    try {
      if (pathname === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true });

      if (pathname === '/api/coverage' && req.method === 'GET') {
        const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200);
        const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);
        const tier = Number(searchParams.get('tier')) || undefined;
        return send(res, 200, repo.list({
          campaign: searchParams.get('campaign') || undefined,
          sentiment: searchParams.get('sentiment') || undefined,
          q: searchParams.get('q')?.trim() || undefined,
          tier, limit, offset,
        }));
      }

      if (pathname === '/api/coverage' && req.method === 'POST') {
        const result = validateCoverage(await readJson(req));
        if (!result.ok) return send(res, 422, { error: 'Validation failed', fields: result.errors });
        const existing = repo.findByUrlKey(result.value.url_key);
        if (existing) return send(res, 409, { error: 'This article is already logged', existing });
        return send(res, 201, repo.create(result.value));
      }

      const match = pathname.match(/^\/api\/coverage\/(\d+)$/);
      if (match && req.method === 'DELETE') {
        return repo.remove(Number(match[1])) ? send(res, 204) : send(res, 404, { error: 'Not found' });
      }

      if (pathname === '/api/summary' && req.method === 'GET') {
        return send(res, 200, repo.summary({ campaign: searchParams.get('campaign') || undefined }));
      }

      if (pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
      if (req.method === 'GET') return serveStatic(req, res, pathname);
      return send(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      if (err.status) return send(res, err.status, { error: err.message });
      log(`ERROR ${err.stack}`);
      return send(res, 500, { error: 'Something went wrong' });
    }
  }

  return http.createServer(handle);
}

module.exports = { createApp };
