const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const cache = require('../cache');
const config = require('../config');
const {
  h,
  HttpError,
  toId,
  requireAuth,
  requireRole,
  logActivity,
  dashboardKey,
  invalidateDashboard,
  randomColor,
} = require('../util');

const router = express.Router();
router.use(requireAuth);

/* ---------- Dashboard (cached in Redis) ---------- */

async function buildDashboard(ws) {
  const [stats, upcoming, projects, activity] = await Promise.all([
    db.query(
      `SELECT
         (SELECT count(*) FROM projects WHERE workspace_id = $1)::int AS projects,
         (SELECT count(*) FROM users WHERE workspace_id = $1)::int AS members,
         count(*)::int AS tasks,
         count(*) FILTER (WHERE status = 'todo')::int AS todo,
         count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
         count(*) FILTER (WHERE status = 'review')::int AS review,
         count(*) FILTER (WHERE status = 'done')::int AS done,
         count(*) FILTER (WHERE status <> 'done' AND priority = 'low')::int AS p_low,
         count(*) FILTER (WHERE status <> 'done' AND priority = 'medium')::int AS p_medium,
         count(*) FILTER (WHERE status <> 'done' AND priority = 'high')::int AS p_high,
         count(*) FILTER (WHERE status <> 'done' AND priority = 'urgent')::int AS p_urgent,
         count(*) FILTER (WHERE status <> 'done' AND due_date < CURRENT_DATE)::int AS overdue,
         count(*) FILTER (WHERE status = 'done' AND updated_at > now() - interval '7 days')::int AS done_week
       FROM tasks WHERE workspace_id = $1`,
      [ws]
    ),
    db.query(
      `SELECT t.id, t.title, t.due_date, t.priority, t.status, p.name AS project_name, p.color AS project_color,
              u.name AS assignee_name, u.avatar_color AS assignee_color
         FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id
        WHERE t.workspace_id = $1 AND t.status <> 'done' AND t.due_date IS NOT NULL
        ORDER BY t.due_date ASC LIMIT 6`,
      [ws]
    ),
    db.query(
      `SELECT p.id, p.name, p.color, count(t.id)::int AS total,
              count(t.id) FILTER (WHERE t.status = 'done')::int AS done
         FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.workspace_id = $1 GROUP BY p.id ORDER BY p.created_at DESC LIMIT 5`,
      [ws]
    ),
    db.query(
      `SELECT a.id, a.action, a.created_at, u.name AS user_name, u.avatar_color
         FROM activity a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.workspace_id = $1 ORDER BY a.created_at DESC LIMIT 8`,
      [ws]
    ),
  ]);

  const s = stats.rows[0];
  return {
    stats: {
      projects: s.projects,
      members: s.members,
      tasks: s.tasks,
      in_progress: s.in_progress,
      done: s.done,
      overdue: s.overdue,
      done_week: s.done_week,
      completion_rate: s.tasks ? Math.round((s.done / s.tasks) * 100) : 0,
    },
    by_status: { todo: s.todo, in_progress: s.in_progress, review: s.review, done: s.done },
    by_priority: { urgent: s.p_urgent, high: s.p_high, medium: s.p_medium, low: s.p_low },
    upcoming: upcoming.rows,
    projects: projects.rows,
    activity: activity.rows,
    generated_at: new Date().toISOString(),
  };
}

router.get(
  '/dashboard',
  h(async (req, res) => {
    const key = dashboardKey(req.user.workspace_id);
    const cached = await cache.getJSON(key);
    if (cached) return res.json({ ...cached, cached: true });

    const data = await buildDashboard(req.user.workspace_id);
    await cache.setJSON(key, data, config.dashboardTtl);
    res.json({ ...data, cached: false });
  })
);

router.get(
  '/activity',
  h(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '30', 10) || 30, 100);
    const { rows } = await db.query(
      `SELECT a.id, a.action, a.created_at, u.name AS user_name, u.avatar_color
         FROM activity a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.workspace_id = $1 ORDER BY a.created_at DESC LIMIT $2`,
      [req.user.workspace_id, limit]
    );
    res.json({ activity: rows });
  })
);

/* ---------- Workspace settings ---------- */

const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

// Update name and/or logo. `logo: null` removes the logo.
router.patch(
  '/workspace',
  requireRole('owner', 'admin'),
  h(async (req, res) => {
    const ws = req.user.workspace_id;
    const body = req.body || {};
    const sets = [];
    const params = [];

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) throw new HttpError(400, 'Workspace name is required');
      if (name.length > 80) throw new HttpError(400, 'Workspace name is too long');
      params.push(name);
      sets.push(`name = $${params.length}`);
    }
    if (body.logo !== undefined) {
      if (body.logo !== null) {
        if (typeof body.logo !== 'string' || !LOGO_RE.test(body.logo)) throw new HttpError(400, 'Logo must be a PNG, JPEG or WebP image');
        if (body.logo.length > config.maxLogoChars) throw new HttpError(413, 'Logo image is too large');
      }
      params.push(body.logo);
      sets.push(`logo = $${params.length}`);
    }
    if (!sets.length) throw new HttpError(400, 'Nothing to update');

    const before = (await db.query('SELECT name FROM workspaces WHERE id = $1', [ws])).rows[0];
    params.push(ws);
    const { rows } = await db.query(
      `UPDATE workspaces SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id, name, logo, created_at`,
      params
    );
    if (body.name !== undefined && rows[0].name !== before.name)
      await logActivity(ws, req.user.id, `renamed the workspace to "${rows[0].name}"`);
    if (body.logo !== undefined)
      await logActivity(ws, req.user.id, body.logo ? 'updated the company logo' : 'removed the company logo');
    await invalidateDashboard(ws);
    res.json({ workspace: rows[0] });
  })
);

/* ---------- Team ---------- */

router.get(
  '/team',
  h(async (req, res) => {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.avatar_color, u.created_at,
              count(t.id) FILTER (WHERE t.status <> 'done')::int AS open_tasks,
              count(t.id) FILTER (WHERE t.status = 'done')::int AS done_tasks
         FROM users u LEFT JOIN tasks t ON t.assignee_id = u.id
        WHERE u.workspace_id = $1
        GROUP BY u.id
        ORDER BY (u.role = 'owner') DESC, (u.role = 'admin') DESC, u.created_at ASC`,
      [req.user.workspace_id]
    );
    res.json({ members: rows });
  })
);

router.post(
  '/team',
  requireRole('owner', 'admin'),
  h(async (req, res) => {
    const ws = req.user.workspace_id;
    const { name, email, role = 'member' } = req.body || {};
    let { password } = req.body || {};
    if (!name?.trim() || !email?.trim()) throw new HttpError(400, 'Name and email are required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address');
    if (!['admin', 'member'].includes(role)) throw new HttpError(400, 'Invalid role');
    if (role === 'admin' && req.user.role !== 'owner') throw new HttpError(403, 'Only the owner can add admins');
    if (password && password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

    const generated = !password;
    if (generated) password = crypto.randomBytes(6).toString('base64url');
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (workspace_id, name, email, password_hash, role, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, avatar_color, created_at`,
      [ws, name.trim(), email.trim().toLowerCase(), hash, role, randomColor()]
    );
    await logActivity(ws, req.user.id, `added ${name.trim()} to the team as ${role}`);
    await invalidateDashboard(ws);
    res.status(201).json({ member: { ...rows[0], open_tasks: 0, done_tasks: 0 }, temp_password: generated ? password : null });
  })
);

router.delete(
  '/team/:id',
  requireRole('owner'),
  h(async (req, res) => {
    const ws = req.user.workspace_id;
    const id = toId(req.params.id);
    if (id === req.user.id) throw new HttpError(400, 'You cannot remove yourself');
    const { rows } = await db.query('DELETE FROM users WHERE id = $1 AND workspace_id = $2 AND role <> $3 RETURNING name', [
      id,
      ws,
      'owner',
    ]);
    if (!rows.length) throw new HttpError(404, 'Member not found');
    await logActivity(ws, req.user.id, `removed ${rows[0].name} from the team`);
    await invalidateDashboard(ws);
    res.status(204).end();
  })
);

/* ---------- System status (infrastructure introspection) ---------- */

router.get(
  '/system',
  h(async (req, res) => {
    const ws = req.user.workspace_id;
    const [version, size, counts, redisInfo] = await Promise.all([
      db.query('SHOW server_version'),
      db.query('SELECT pg_size_pretty(pg_database_size(current_database())) AS size'),
      db.query(
        `SELECT (SELECT count(*) FROM projects WHERE workspace_id = $1)::int AS projects,
                (SELECT count(*) FROM tasks    WHERE workspace_id = $1)::int AS tasks,
                (SELECT count(*) FROM users    WHERE workspace_id = $1)::int AS users,
                (SELECT count(*) FROM activity WHERE workspace_id = $1)::int AS activity`,
        [ws]
      ),
      cache.info().catch(() => null),
    ]);

    let logSize = 0;
    try {
      logSize = fs.statSync(path.join(config.logDir, 'access.log')).size;
    } catch {
      /* no log yet */
    }

    const interfaces = Object.entries(os.networkInterfaces())
      .flatMap(([name, addrs]) => addrs.filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, address: a.address })));

    res.json({
      api: {
        hostname: os.hostname(),
        node: process.version,
        uptime_seconds: Math.round(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        interfaces,
      },
      database: {
        host: config.db.host,
        version: version.rows[0].server_version,
        size: size.rows[0].size,
        rows: counts.rows[0],
      },
      cache: redisInfo,
      logs: { dir: config.logDir, access_log_bytes: logSize },
    });
  })
);

module.exports = router;
