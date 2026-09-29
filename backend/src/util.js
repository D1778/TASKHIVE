const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const cache = require('./cache');

const STATUSES = ['todo', 'in_progress', 'review', 'done'];
const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', review: 'In Review', done: 'Done' };
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#3b82f6'];

// Wraps async route handlers so rejected promises reach the error middleware.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const toId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id');
  return n;
};

const signToken = (u) =>
  jwt.sign({ id: u.id, workspace_id: u.workspace_id, role: u.role }, config.jwtSecret, {
    expiresIn: config.jwtExpires,
  });

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission for this action' });

async function logActivity(workspaceId, userId, action) {
  await db.query('INSERT INTO activity (workspace_id, user_id, action) VALUES ($1, $2, $3)', [workspaceId, userId, action]);
}

const dashboardKey = (wsId) => `dashboard:${wsId}`;
const invalidateDashboard = (wsId) => cache.del(dashboardKey(wsId));

const randomColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

module.exports = {
  STATUSES,
  STATUS_LABELS,
  PRIORITIES,
  h,
  HttpError,
  toId,
  signToken,
  requireAuth,
  requireRole,
  logActivity,
  dashboardKey,
  invalidateDashboard,
  randomColor,
};
