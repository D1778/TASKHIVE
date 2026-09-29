const { Pool, types } = require('pg');
const config = require('./config');

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts).
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ ...config.db, max: 10, idleTimeoutMillis: 30000 });
pool.on('error', (e) => console.error('[db] pool error:', e.message));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workspaces (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  logo        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  workspace_id  INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  avatar_color  TEXT NOT NULL DEFAULT '#6366f1',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id            SERIAL PRIMARY KEY,
  workspace_id  INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  color         TEXT NOT NULL DEFAULT '#6366f1',
  created_by    INT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id            SERIAL PRIMARY KEY,
  workspace_id  INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  priority      TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assignee_id   INT REFERENCES users(id) ON DELETE SET NULL,
  due_date      DATE,
  created_by    INT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity (
  id            SERIAL PRIMARY KEY,
  workspace_id  INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       INT REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_ws      ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_ws   ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ws      ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assign  ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_activity_ws   ON activity(workspace_id, created_at DESC);
`;

const query = (text, params) => pool.query(text, params);

async function waitForDb(retries = 30) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('[db] connected to PostgreSQL at', `${config.db.host}:${config.db.port}`);
      return;
    } catch (e) {
      console.log(`[db] waiting for database (${i}/${retries}): ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Database unavailable');
}

async function migrate() {
  await pool.query(SCHEMA);
  console.log('[db] schema ready');
}

async function ping() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

module.exports = { pool, query, waitForDb, migrate, ping };
