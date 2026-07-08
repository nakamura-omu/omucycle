import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const usersRoutes = new Hono();

usersRoutes.get('/', (c) => {
  const db = getDb();
  return c.json(db.prepare(`
    SELECT id, email, name, auth_type, created_at, updated_at
    FROM users ORDER BY created_at DESC
  `).all());
});

usersRoutes.get('/:id', (c) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, email, name, auth_type, created_at, updated_at FROM users WHERE id = ?
  `).get(c.req.param('id'));
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json(user);
});

usersRoutes.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { email, name, auth_type = 'guest' } = body;
  if (!email || !name) return c.json({ error: 'email and name are required' }, 400);

  const id = uuidv4();
  try {
    db.prepare(`INSERT INTO users (id, email, name, auth_type) VALUES (?, ?, ?, ?)`)
      .run(id, email, name, auth_type);
    return c.json(db.prepare('SELECT * FROM users WHERE id = ?').get(id), 201);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'Email already exists' }, 409);
    }
    throw error;
  }
});

usersRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { name } = body;
  if (!name) return c.json({ error: 'name is required' }, 400);

  const result = db.prepare(`UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(name, id);
  if (result.changes === 0) return c.json({ error: 'User not found' }, 404);
  return c.json(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
});

// ユーザーのグループ一覧（未読バッジ付き）
// 自分のインボックス（個人スペースの My プロジェクト + その中のタスク）
usersRoutes.get('/me/inbox', (c) => {
  const user = c.get('currentUser') as { id: string; name: string } | undefined;
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const ensure = (globalThis as any).__ensurePersonalSpace as ((id: string, name: string) => any) | undefined;
  if (!ensure) return c.json({ error: 'ensurePersonalSpace not registered' }, 500);
  const ids = ensure(user.id, user.name);

  const db = getDb();
  const project = db.prepare(`
    SELECT p.*, g.slug as group_slug FROM projects p
    JOIN groups g ON p.group_id = g.id
    WHERE p.id = ?
  `).get(ids.projectId);
  const tasks = db.prepare(`
    SELECT t.*, u.name as assignee_name,
           p.name as project_name, p.slug as project_slug, p.prefix as project_prefix,
           g.slug as group_slug
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN projects p ON t.project_id = p.id
    JOIN groups g ON t.group_id = g.id
    WHERE t.project_id = ?
    ORDER BY
      CASE t.status WHEN 'completed' THEN 1 ELSE 0 END,
      t.sort_order ASC,
      t.created_at ASC
  `).all(ids.projectId);

  return c.json({ project, tasks });
});

usersRoutes.get('/:id/groups', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const groups = db.prepare(`
    SELECT g.*, gm.role, gm.joined_at,
           (SELECT COUNT(*) FROM notifications n
            WHERE n.user_id = ? AND n.group_id = g.id AND n.read_at IS NULL) as unread_count,
           (SELECT COUNT(*) FROM tasks t
            WHERE t.group_id = g.id
              AND t.status != 'completed'
              AND (t.assignee_id = ? OR t.assignee_ids LIKE ?)) as my_active_tasks
    FROM groups g
    JOIN group_memberships gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
    ORDER BY gm.joined_at DESC
  `).all(id, id, `%"${id}"%`, id);

  return c.json(groups);
});

// ユーザーのタスク横断一覧
usersRoutes.get('/:id/tasks', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const status = c.req.query('status');
  const groupId = c.req.query('group_id');
  const priority = c.req.query('priority');
  const hideCompleted = c.req.query('hide_completed') === 'true';

  let query = `
    SELECT t.*, g.name as group_name, g.slug as group_slug,
           p.name as project_name, p.slug as project_slug, p.prefix as project_prefix
    FROM tasks t
    JOIN groups g ON t.group_id = g.id
    JOIN projects p ON t.project_id = p.id
    WHERE (t.assignee_id = ? OR (t.assignee_ids IS NOT NULL AND t.assignee_ids LIKE ?))
  `;
  const params: any[] = [id, `%"${id}"%`];

  if (hideCompleted) {
    query += ` AND t.status != 'completed'`;
  }
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (groupId) { query += ' AND t.group_id = ?'; params.push(groupId); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }

  query += ` ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC, t.priority DESC`;
  return c.json(db.prepare(query).all(...params));
});
