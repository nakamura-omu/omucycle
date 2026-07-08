import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const projectsRoutes = new Hono();

// グループの「Inbox」プロジェクトを取得 or 自動生成
// IT素人が「とりあえず」タスクを書けるよう、未分類プロジェクトを ensure する
projectsRoutes.post('/groups/:groupId/ensure-inbox', (c) => {
  const db = getDb();
  const groupId = c.req.param('groupId');
  const user = c.get('currentUser') as { id: string } | undefined;
  if (!user) return c.json({ error: 'Not authenticated' }, 401);

  const existing = db.prepare(
    `SELECT * FROM projects WHERE group_id = ? AND slug = 'inbox' LIMIT 1`
  ).get(groupId) as any;
  if (existing) return c.json(existing);

  const id = uuidv4();
  db.prepare(`
    INSERT INTO projects (id, group_id, name, slug, icon, color, created_by)
    VALUES (?, ?, '未分類', 'inbox', '📥', '#94a3b8', ?)
  `).run(id, groupId, user.id);

  return c.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id), 201);
});

// プロジェクト詳細
projectsRoutes.get('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const project = db.prepare(`
    SELECT p.*, g.slug as group_slug, g.name as group_name
    FROM projects p
    JOIN groups g ON p.group_id = g.id
    WHERE p.id = ?
  `).get(id);
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'not_started' THEN 1 ELSE 0 END) as not_started
    FROM tasks WHERE project_id = ?
  `).get(id);

  return c.json({ ...project, stats });
});

// プロジェクト作成
projectsRoutes.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { group_id, name, slug, prefix, description, icon, color, parent_project_id, created_by } = body;

  if (!group_id || !name || !slug || !created_by) {
    return c.json({ error: 'group_id, name, slug, created_by are required' }, 400);
  }

  const id = uuidv4();
  try {
    db.prepare(`
      INSERT INTO projects (id, group_id, parent_project_id, name, slug, prefix,
                            description, icon, color, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, group_id, parent_project_id ?? null, name, slug, prefix ?? null,
           description ?? null, icon ?? null, color ?? null, created_by);
    return c.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id), 201);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'slug already exists in this group' }, 409);
    }
    throw error;
  }
});

// プロジェクト更新
projectsRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const allowed = ['name', 'slug', 'prefix', 'description', 'icon', 'color', 'archived', 'parent_project_id', 'sort_order'];
  const updates: string[] = [];
  const params: any[] = [];

  for (const f of allowed) {
    if (body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(body[f]);
    }
  }
  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);

  updates.push("updated_at = datetime('now')");
  params.push(id);

  try {
    const result = db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    if (result.changes === 0) return c.json({ error: 'Project not found' }, 404);
    return c.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'slug already exists' }, 409);
    }
    throw error;
  }
});

projectsRoutes.delete('/:id', (c) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(c.req.param('id'));
  if (result.changes === 0) return c.json({ error: 'Project not found' }, 404);
  return c.json({ success: true });
});

// プロジェクトのタスク一覧
projectsRoutes.get('/:id/tasks', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const cycleId = c.req.query('cycle_id');
  const status = c.req.query('status');
  const noCycle = c.req.query('no_cycle') === 'true';

  let query = `
    SELECT t.*, u.name as assignee_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.project_id = ?
  `;
  const params: any[] = [id];
  if (cycleId) { query += ' AND t.cycle_id = ?'; params.push(cycleId); }
  if (noCycle) query += ' AND t.cycle_id IS NULL';
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  query += ' ORDER BY t.sort_order ASC, t.due_date ASC';
  return c.json(db.prepare(query).all(...params));
});

// プロジェクトのサイクル一覧
projectsRoutes.get('/:id/cycles', (c) => {
  const db = getDb();
  return c.json(db.prepare(`
    SELECT * FROM cycles WHERE project_id = ?
    ORDER BY start_date ASC
  `).all(c.req.param('id')));
});

// プロジェクトメンバー
projectsRoutes.get('/:id/members', (c) => {
  const db = getDb();
  return c.json(db.prepare(`
    SELECT u.id, u.email, u.name, pm.role
    FROM project_members pm
    JOIN users u ON pm.user_id = u.id
    WHERE pm.project_id = ?
  `).all(c.req.param('id')));
});

projectsRoutes.post('/:id/members', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { user_id, role = 'member' } = body;
  if (!user_id) return c.json({ error: 'user_id is required' }, 400);
  try {
    db.prepare(`INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`)
      .run(c.req.param('id'), user_id, role);
    return c.json({ success: true }, 201);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return c.json({ error: 'Already a member' }, 409);
    }
    throw error;
  }
});

projectsRoutes.delete('/:id/members/:userId', (c) => {
  const db = getDb();
  const result = db.prepare(`DELETE FROM project_members WHERE project_id = ? AND user_id = ?`)
    .run(c.req.param('id'), c.req.param('userId'));
  if (result.changes === 0) return c.json({ error: 'Member not found' }, 404);
  return c.json({ success: true });
});
