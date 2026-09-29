const { createClient } = require('redis');
const config = require('./config');

// Redis is an accelerator, not a hard dependency: every helper degrades
// gracefully (cache miss / no rate limit) when Redis is unreachable.
const client = createClient({
  url: config.redisUrl,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 3000) },
});

let lastErrorLog = 0;
client.on('error', (e) => {
  if (Date.now() - lastErrorLog > 10000) {
    console.error('[redis] error:', e.message);
    lastErrorLog = Date.now();
  }
});
client.on('ready', () => console.log('[redis] connected'));

const ready = () => client.isReady;

function connect() {
  client.connect().catch((e) => console.error('[redis] connect failed:', e.message));
}

async function getJSON(key) {
  if (!ready()) return null;
  try {
    const v = await client.get(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

async function setJSON(key, value, ttlSeconds) {
  if (!ready()) return;
  try {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch {
    /* ignore */
  }
}

async function del(...keys) {
  if (!ready()) return;
  try {
    await client.del(keys);
  } catch {
    /* ignore */
  }
}

// Fixed-window rate limiter.
async function rateLimit(key, limit, windowSeconds) {
  if (!ready()) return { allowed: true, remaining: limit };
  try {
    const k = `rl:${key}`;
    const n = await client.incr(k);
    if (n === 1) await client.expire(k, windowSeconds);
    return { allowed: n <= limit, remaining: Math.max(0, limit - n) };
  } catch {
    return { allowed: true, remaining: limit };
  }
}

async function ping() {
  if (!ready()) return false;
  try {
    return (await client.ping()) === 'PONG';
  } catch {
    return false;
  }
}

async function info() {
  if (!ready()) return null;
  const raw = await client.info();
  const map = {};
  raw.split('\r\n').forEach((line) => {
    const i = line.indexOf(':');
    if (i > 0 && !line.startsWith('#')) map[line.slice(0, i)] = line.slice(i + 1);
  });
  return {
    version: map.redis_version,
    used_memory: map.used_memory_human,
    connected_clients: Number(map.connected_clients),
    aof_enabled: map.aof_enabled === '1',
    last_save: map.rdb_last_save_time ? new Date(Number(map.rdb_last_save_time) * 1000).toISOString() : null,
    keys: await client.dbSize(),
    uptime_seconds: Number(map.uptime_in_seconds),
  };
}

async function quit() {
  if (client.isOpen) await client.quit().catch(() => {});
}

module.exports = { client, connect, getJSON, setJSON, del, rateLimit, ping, info, quit };
