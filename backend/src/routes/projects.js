const express = require('express');
const db = require('../db');
const { h, HttpError, toId, requireAuth, logActivity, invalidateDashboard } = require('../util');

const router = express.Router();
router.use(requireAuth);

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const PROJECT_SELECT = `
  SELECT p.*, u.name AS created_by_name,
         count(t.id)::int AS total_tasks,
         count(t.id) FILTER (WHERE t.status = 'done')::int AS done_tasks,
         count(t.id) FILTER (WHERE t.status <> 'done' AND t.due_date < CURRENT_DATE)::int AS overdue_tasks
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    LEFT JOIN users u ON u.id = p.created_by`;

async function getProject(id, wsId) {
  const { rows } = await db.query(`${PROJECT_SELECT} WHERE p.id = $1 AND p.workspace_id = $2 GROUP BY p.id, u.name`, [id, wsId]);
  if (!rows.length) throw new HttpError(404, 'Project not found');
  return rows[0];
}

router.get(
  '/',
  h(async (req, res) => {
    const { rows } = await db.query(
      `${PROJECT_SELECT} WHERE p.workspace_id = $1 GROUP BY p.id, u.name ORDER BY p.created_at DESC`,
      [req.user.workspace_id]
    );
    res.json({ projects: rows });
  })
);

router.post(
  '/',
  h(async (req, res) => {
    const ws = req.user.workspace_id;
    const { name, description = '', color = '#6366f1' } = req.body || {};
    if (!name?.trim()) throw new HttpError(400, 'Project name is required');
    if (!COLOR_RE.test(color)) throw new HttpError(400, 'Invalid color');

    const { rows } = await db.query(
      'INSERT INTO projects (workspace_id, name, description, color, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [ws, name.trim(), String(description).trim(), color, req.user.id]
    );
    await logActivity(ws, req.user.id, `created project "${name.trim()}"`);
    await invalidateDashboard(ws);
    res.status(201).json({ project: await getProject(rows[0].id, ws) });
  })
);

router.patch(
  '/:id',
  h(async (req, res) => {
    const ws = req.user.workspace_id;
    const id = toId(req.params.id);
    const current = await getProject(id, ws);
    const { name = current.name, description = current.description, color = current.color } = req.body || {};
    if (!String(name).trim()) throw new HttpError(400, 'Project name is required');
    if (!COLOR_RE.test(color)) throw new HttpError(400, 'Invalid color');

    await db.query('UPDATE projects SET name = $1, description = $2, color = $3 WHERE id = $4 AND workspace_id = $5', [
      String(name).trim(),
      String(description).trim(),
      color,
      id,
      ws,
    ]);
    await logActivity(ws, req.user.id, `updated project "${String(name).trim()}"`);
    await invalidateDashboard(ws);
    res.json({ project: await getProject(id, ws) });
  })
);

router.delete(
  '/:id',
  h(async (req, res) => {
    const ws = req.user.workspace_id;
    const id = toId(req.params.id);
    const project = await getProject(id, ws);
    if (req.user.role === 'member' && project.created_by !== req.user.id)
      throw new HttpError(403, 'Only admins or the project creator can delete this project');

    await db.query('DELETE FROM projects WHERE id = $1 AND workspace_id = $2', [id, ws]);
    await logActivity(ws, req.user.id, `deleted project "${project.name}"`);
    await invalidateDashboard(ws);
    res.status(204).end();
  })
);

module.exports = router;
