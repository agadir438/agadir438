/**
 * Serveur multi-utilisateurs de la plateforme « Suivi logs Splunk ».
 * Aucune dépendance : Node.js >= 18 suffit.
 *
 *   node server/server.js            -> http://localhost:8080
 *   PORT=3000 DATA_FILE=/srv/db.json node server/server.js
 *
 * API :
 *   GET  /api/state            -> { version, updatedAt, updatedBy, state }
 *   GET  /api/version          -> { version, updatedAt, updatedBy }
 *   PUT  /api/state            body { baseVersion, user, state } -> 200 | 409 (conflit)
 *   GET  /excel/...            -> classeur Excel de suivi
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(ROOT, 'data', 'db.json'));
const SAMPLE_FILE = path.join(ROOT, 'data', 'sample_data.json');
const STATIC = { '/': path.join(ROOT, 'platform'), '/excel/': path.join(ROOT, 'excel') };
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.txt': 'text/plain; charset=utf-8',
};

function load() {
  if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const state = JSON.parse(fs.readFileSync(SAMPLE_FILE, 'utf8'));
  return { version: 1, updatedAt: new Date().toISOString(), updatedBy: 'initialisation', state };
}
let db = load();

function persist() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
  // sauvegarde quotidienne
  const bdir = path.join(path.dirname(DATA_FILE), 'backups');
  fs.mkdirSync(bdir, { recursive: true });
  const bfile = path.join(bdir, `db-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(bfile, JSON.stringify(db));
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('payload trop volumineux')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  let base = STATIC['/'], rel = urlPath;
  if (urlPath.startsWith('/excel/')) { base = STATIC['/excel/']; rel = urlPath.slice('/excel'.length); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(base, '.' + decodeURIComponent(rel));
  if (!file.startsWith(base + path.sep) && file !== base) { res.writeHead(403); return res.end('Interdit'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': MIME['.txt'] }); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/version' && req.method === 'GET') {
      return send(res, 200, { version: db.version, updatedAt: db.updatedAt, updatedBy: db.updatedBy });
    }
    if (url.pathname === '/api/state' && req.method === 'GET') return send(res, 200, db);
    if (url.pathname === '/api/state' && req.method === 'PUT') {
      const body = JSON.parse(await readBody(req));
      if (!body || typeof body.state !== 'object' || !Array.isArray(body.state.streams)) return send(res, 400, { error: 'état invalide' });
      if (body.baseVersion !== db.version && !body.force) return send(res, 409, { error: 'conflit', ...db });
      db = { version: db.version + 1, updatedAt: new Date().toISOString(), updatedBy: String(body.user || 'inconnu').slice(0, 80), state: body.state };
      persist();
      return send(res, 200, { version: db.version, updatedAt: db.updatedAt, updatedBy: db.updatedBy });
    }
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'route inconnue' });
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Plateforme Suivi logs Splunk : http://localhost:${PORT}`);
    console.log(`Données partagées : ${DATA_FILE}`);
  });
}
module.exports = server;
