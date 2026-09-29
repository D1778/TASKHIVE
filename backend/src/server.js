const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const db = require('./db');
const cache = require('./cache');

const app = express();
app.set('trust proxy', 1); // behind the nginx reverse proxy
app.disable('x-powered-by');
// CSP is off because the SPA uses an inline theme script (matches the nginx setup).
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '600kb' })); // room for a base64 company logo

// Access log is written to a named volume so it survives container re-creation.
fs.mkdirSync(config.logDir, { recursive: true });
const accessLog = fs.createWriteStream(path.join(config.logDir, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: accessLog }));
app.use(morgan('dev', { skip: (req) => req.path === '/api/health' }));

app.get('/api/health', async (req, res) => {
  const [dbOk, cacheOk] = await Promise.all([db.ping(), cache.ping()]);
  res.status(dbOk ? 200 : 503).json({
    status: dbOk && cacheOk ? 'ok' : dbOk ? 'degraded' : 'down',
    services: { api: 'up', database: dbOk ? 'up' : 'down', cache: cacheOk ? 'up' : 'down' },
    hostname: os.hostname(),
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api', require('./routes/workspace'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// Without Docker/nginx, the API can serve the frontend itself: set STATIC_DIR=../frontend/public.
if (process.env.STATIC_DIR) {
  const staticDir = path.resolve(process.env.STATIC_DIR);
  app.use(express.static(staticDir));
  console.log(`[api] serving frontend from ${staticDir}`);
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.code === '23505') return res.status(409).json({ error: 'A record with these details already exists' });
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await db.waitForDb();
  await db.migrate();
  cache.connect();
  const server = app.listen(config.port, '0.0.0.0', () =>
    console.log(`[api] TaskHive API listening on :${config.port} (host ${os.hostname()})`)
  );

  const shutdown = async (signal) => {
    console.log(`[api] ${signal} received, shutting down gracefully`);
    server.close(async () => {
      await Promise.allSettled([db.pool.end(), cache.quit()]);
      accessLog.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((e) => {
  console.error('[api] failed to start:', e.message);
  process.exit(1);
});
