const express = require('express');
const db = require('../db');
const {
  h,
  HttpError,
  toId,
  requireAuth,
  logActivity,
  invalidateDashboard,
  STATUSES,
  STATUS_LABELS,
  PRIORITIES,
} = require('../util');

const router = express.Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TASK_SELECT = `
  SELECT t.*, p.name AS project_name, p.color AS project_color,
         u.name AS assignee_name, u.avatar_color AS assignee_color
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_id`;

const ORDER = `ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                        t.due_date ASC NULLS LAST, t.id DESC`;

async function getTask(id, wsId) {
  const { rows } = await db.query(`${TASK_SELECT} WHERE t.id = $1 AND t.workspace_id = $2`, [id, wsId]);
  if (!rows.length) throw new HttpError(404, 'Task not found');
  return rows[0];
}

async function assertProject(projectId, wsId) {
  const { rowCount } = await db.query('SELECT 1 FROM projects WHERE id = $1 AND workspace_id = $2', [projectId, wsId]);
  if (!rowCount) throw new HttpError(400, 'Invalid project');
}

async function assertMember(userId, wsId) {
  const { rowCount } = await db.query('SELECT 1 FROM users WHERE id = $1 AND workspace_id = $2', [userId, wsId]);
  if (!rowCount) throw new HttpError(400, 'Assignee is not a member of this workspace');
}

// Normalises and validates a (partial) task payload.
async function parseTaskInput(body, wsId, partial) {
  const out = {};
  if (!partial || body.title !== undefined) {
    if (!String(body.title ?? '').trim()) throw new HttpError(400, 'Task title is required');
    out.title = String(body.title).trim();
  }
  if (body.description !== undefined) out.description = String(body.description ?? '').trim();
  if (!partial || body.project_id !== undefined) {
    out.project_id = toId(body.project_id);
    await assertProject(out.project_id, wsId);
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Invalid status');
    out.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) throw new HttpError(400, 'Invalid priority');
    out.priority = body.priority;
  }
  if (body.assignee_id !== undefined) {
    out.assignee_id = body.assignee_id === null || body.assignee_id === '' ? null : toId(body.assignee_id);
    if (out.assignee_id) await assertMember(out.assignee_id, wsId);
  }
  if (body.due_date !== undefined) {
    out.due_date = body.due_date ? String(body.due_date) : null;
    if (out.due_date && !DATE_RE.test(out.due_date)) throw new HttpError(400, 'Invalid due date');
  }
  return out;
}

router.get(
  '/',
  h(async (req, res) => {
    const params = [req.user.workspace_id];
    const where = ['t.workspace_id = $1'];
    const { project_id, status, assignee_id } = req.query;

    if (project_id && project_id !== 'all') {
      params.push(toId(project_id));
      where.push(`t.project_id = $${params.length}`);
    }
    if (status) {
      if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
      params.push(status);
      where.push(`t.status = $${params.length}`);
    }
    if (assignee_id) {
      params.push(assignee_id === 'me' ? req.user.id : toId(assignee_id));
      where.push(`t.assignee_id = $${params.length}`);
    }

    const { rows } = await db.query(`${TASK_SELECT} WHERE ${where.join(' AND ')} ${ORDER}`, params);
    res.json({ tasks: rows });
  })
);

router.post(
  '/',
  h(async (req, res) => {
    const ws = req.user.workspace_id;
    const input = await parseTaskInput(req.body || {}, ws, false);
    const { rows } = await db.query(
      `INSERT INTO tasks (workspace_id, project_id, title, description, status, priority, assignee_id, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        ws,
        input.project_id,
        input.title,
        input.description ?? '',
        input.status ?? 'todo',
        input.priority ?? 'medium',
        input.assignee_id ?? null,
        input.due_date ?? null,
        req.user.id,
      ]
    );
    await logActivity(ws, req.user.id, `created task "${input.title}"`);
    await invalidateDashboard(ws);
    res.status(201).json({ task: await getTask(rows[0].id, ws) });
  })
);

router.patch(
  '/:id',
  h(async (req, res) => {
    const ws = req.user.workspace_id;
    const id = toId(req.params.id);
    const before = await getTask(id, ws);
    const input = await parseTaskInput(req.body || {}, ws, true);

    const keys = Object.keys(input);
    if (!keys.length) throw new HttpError(400, 'Nothing to update');
    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    await db.query(
      `UPDATE tasks SET ${sets.join(', ')}, updated_at = now() WHERE id = $${keys.length + 1} AND workspace_id = $${keys.length + 2}`,
      [...keys.map((k) => input[k]), id, ws]
    );

    const after = await getTask(id, ws);
    let action = `updated task "${after.title}"`;
    if (input.status && input.status !== before.status) {
      action = input.status === 'done' ? `completed task "${after.title}"` : `moved "${after.title}" to ${STATUS_LABELS[input.status]}`;
    }
    await logActivity(ws, req.user.id, action);
    await invalidateDashboard(ws);
    res.json({ task: after });
  })
);

router.delete(
  '/:id',
  h(async (req, res) => {
    const ws = req.user.workspace_id;
    const id = toId(req.params.id);
    const task = await getTask(id, ws);
    await db.query('DELETE FROM tasks WHERE id = $1 AND workspace_id = $2', [id, ws]);
    await logActivity(ws, req.user.id, `deleted task "${task.title}"`);
    await invalidateDashboard(ws);
    res.status(204).end();
  })
);

module.exports = router;
