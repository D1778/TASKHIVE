const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const cache = require('../cache');
const { sendPasswordResetEmail } = require('../email');
const { h, HttpError, signToken, requireAuth, randomColor } = require('../util');

const router = express.Router();

const USER_FIELDS = 'u.id, u.workspace_id, u.name, u.email, u.role, u.avatar_color, u.created_at';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadSession(userId) {
  const { rows } = await db.query(
    `SELECT ${USER_FIELDS}, w.name AS ws_name, w.logo AS ws_logo, w.created_at AS ws_created_at
       FROM users u JOIN workspaces w ON w.id = u.workspace_id WHERE u.id = $1`,
    [userId]
  );
  if (!rows.length) return null;
  const { ws_name, ws_logo, ws_created_at, ...user } = rows[0];
  return { user, workspace: { id: user.workspace_id, name: ws_name, logo: ws_logo, created_at: ws_created_at } };
}

router.post(
  '/register',
  h(async (req, res) => {
    const rl = await cache.rateLimit(`register:${req.ip}`, 10, 3600);
    if (!rl.allowed) throw new HttpError(429, 'Too many sign-up attempts. Please try again later.');

    const { name, email, password, workspace } = req.body || {};
    if (!name?.trim() || !email?.trim() || !password || !workspace?.trim())
      throw new HttpError(400, 'All fields are required');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

    const normalizedEmail = email.trim().toLowerCase();
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const exists = await client.query('SELECT 1 FROM users WHERE email = $1', [normalizedEmail]);
      if (exists.rowCount) throw new HttpError(409, 'An account with this email already exists');

      const ws = await client.query('INSERT INTO workspaces (name) VALUES ($1) RETURNING id', [workspace.trim()]);
      const wsId = ws.rows[0].id;
      const hash = await bcrypt.hash(password, 10);
      const u = await client.query(
        `INSERT INTO users (workspace_id, name, email, password_hash, role, avatar_color)
         VALUES ($1, $2, $3, $4, 'owner', $5) RETURNING id`,
        [wsId, name.trim(), normalizedEmail, hash, randomColor()]
      );
      const userId = u.rows[0].id;
      await client.query('COMMIT');

      const session = await loadSession(userId);
      res.status(201).json({ token: signToken(session.user), ...session });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  })
);

router.post(
  '/login',
  h(async (req, res) => {
    const rl = await cache.rateLimit(`login:${req.ip}`, 20, 900);
    if (!rl.allowed) throw new HttpError(429, 'Too many login attempts. Please wait 15 minutes.');

    const { email, password } = req.body || {};
    if (!email || !password) throw new HttpError(400, 'Email and password are required');

    const { rows } = await db.query('SELECT id, password_hash FROM users WHERE email = $1', [
      String(email).trim().toLowerCase(),
    ]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash)))
      throw new HttpError(401, 'Invalid email or password');

    const session = await loadSession(rows[0].id);
    res.json({ token: signToken(session.user), ...session });
  })
);

router.post(
  '/forgot-password',
  h(async (req, res) => {
    const rl = await cache.rateLimit(`forgot:${req.ip}`, 10, 900);
    if (!rl.allowed) throw new HttpError(429, 'Too many reset attempts. Please wait 15 minutes.');

    const { email } = req.body || {};
    if (!email || !EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address');

    const normalizedEmail = email.trim().toLowerCase();
    const { rows } = await db.query('SELECT id, name, email FROM users WHERE email = $1', [normalizedEmail]);

    if (!rows.length) {
      return res.json({
        message: 'If an account exists with that email, a new temporary password has been sent to it.',
      });
    }

    const user = rows[0];
    const tempPassword = 'th_' + crypto.randomBytes(4).toString('hex');
    const hash = await bcrypt.hash(tempPassword, 10);

    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);

    const result = await sendPasswordResetEmail(user.email, user.name, tempPassword);

    res.json({
      message: `A temporary password has been sent to ${user.email}. Please check your inbox.`,
    });
  })
);

router.get(
  '/me',
  requireAuth,
  h(async (req, res) => {
    const session = await loadSession(req.user.id);
    if (!session) throw new HttpError(401, 'Account no longer exists');
    res.json(session);
  })
);

module.exports = router;
