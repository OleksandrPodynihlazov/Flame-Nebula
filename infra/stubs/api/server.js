// Placeholder api for the deploy skeleton; replaced by ./api.
// Node built-ins only, no dependencies.
'use strict';

const http = require('node:http');
const net = require('node:net');

const VERSION = process.env.APP_VERSION || 'dev';
const PORT = Number(process.env.PORT || 3000);
const DB_TIMEOUT_MS = 2000;

function dbTarget() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return { host: url.hostname, port: Number(url.port || 5432) };
  } catch (err) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), msg: 'invalid DATABASE_URL', error: err.message }));
    return null;
  }
}

const DB = dbTarget();

function checkDb() {
  return new Promise((resolve) => {
    if (!DB) return resolve(false);
    const socket = net.connect({ host: DB.host, port: DB.port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(DB_TIMEOUT_MS, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

async function handle(req, res) {
  const path = new URL(req.url, 'http://localhost').pathname;

  if (req.method === 'GET' && path === '/api/health') {
    const dbOk = await checkDb();
    return sendJson(res, dbOk ? 200 : 503, {
      status: dbOk ? 'ok' : 'degraded',
      version: VERSION,
      db: dbOk ? 'ok' : 'down',
    });
  }

  return sendJson(res, 404, { error: `not found: ${path}` });
}

const server = http.createServer((req, res) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.url,
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
    }));
  });
  handle(req, res).catch((err) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), msg: 'handler error', path: req.url, error: err.message }));
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    else res.end();
  });
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg: 'api stub listening', version: VERSION, port: PORT }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg: 'shutting down', signal }));
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
