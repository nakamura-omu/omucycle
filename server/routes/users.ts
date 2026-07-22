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
    SELECT t.*, u.name as assignee_name, u.omuid as assignee_omuid,
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
    WHERE gm.user_id = ? AND COALESCE(g.is_personal, 0) = 0
    ORDER BY gm.joined_at DESC
  `).all(id, id, `%"${id}"%`, id);

  return c.json(groups);
});

// タスクの移動先候補: 所属グループ横断の全プロジェクト（グループ別・個人スペース先頭）
usersRoutes.get('/:id/move-targets', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const rows = db.prepare(`
    SELECT g.id as group_id, g.name as group_name, g.slug as group_slug,
           p.id as project_id, p.name as project_name, p.slug as project_slug,
           p.icon as project_icon, p.is_personal
    FROM group_memberships gm
    JOIN groups g ON g.id = gm.group_id
    JOIN projects p ON p.group_id = g.id AND p.archived = 0
    WHERE gm.user_id = ?
    ORDER BY gm.joined_at DESC, p.is_personal DESC, p.sort_order ASC, p.name ASC
  `).all(id) as any[];

  const map = new Map<string, any>();
  for (const r of rows) {
    if (!map.has(r.group_id)) {
      map.set(r.group_id, {
        group_id: r.group_id, group_name: r.group_name, group_slug: r.group_slug, projects: [],
      });
    }
    map.get(r.group_id).projects.push({
      id: r.project_id, name: r.project_name, slug: r.project_slug,
      icon: r.project_icon, is_personal: r.is_personal,
    });
  }
  return c.json([...map.values()]);
});

// ユーザーのタスク横断一覧
usersRoutes.get('/:id/tasks', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const status = c.req.query('status');
  const groupId = c.req.query('group_id');
  const priority = c.req.query('priority');
  const hideCompleted = c.req.query('hide_completed') === 'true';

  // 「自分のタスク」= 担当者に自分が入っているタスク + 個人スペースのタスク全部。
  // Todoist同様、個人プロジェクトでは担当者を付けなくても自分のタスクとして扱う
  let query = `
    SELECT t.*, g.name as group_name, g.slug as group_slug,
           p.name as project_name, p.slug as project_slug, p.prefix as project_prefix,
           u.name as assignee_name, u.omuid as assignee_omuid
    FROM tasks t
    JOIN groups g ON t.group_id = g.id
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE (t.assignee_id = ? OR (t.assignee_ids IS NOT NULL AND t.assignee_ids LIKE ?)
           OR (p.is_personal = 1 AND p.owner_user_id = ?))
      AND t.is_section = 0
  `;
  const params: any[] = [id, `%"${id}"%`, id];

  if (hideCompleted) {
    query += ` AND t.status != 'completed'`;
  }
  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (groupId) { query += ' AND t.group_id = ?'; params.push(groupId); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }

  query += ` ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC, t.priority DESC`;
  return c.json(db.prepare(query).all(...params));
});

// タスク横断検索（所属グループ全体 + 個人スペース。サイドバーの検索ボックス用）
usersRoutes.get('/:id/search-tasks', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 1) return c.json([]);
  const rows = db.prepare(`
    SELECT t.id, t.title, t.status, t.due_date, t.task_number, t.priority,
           g.name as group_name, g.slug as group_slug,
           p.name as project_name, p.slug as project_slug, p.is_personal
    FROM tasks t
    JOIN groups g ON t.group_id = g.id
    JOIN projects p ON t.project_id = p.id
    WHERE t.is_section = 0
      AND (t.title LIKE @q OR t.description LIKE @q)
      AND (g.id IN (SELECT group_id FROM group_memberships WHERE user_id = @uid)
           OR (p.is_personal = 1 AND p.owner_user_id = @uid))
    ORDER BY CASE t.status WHEN 'completed' THEN 1 ELSE 0 END, t.updated_at DESC
    LIMIT 30
  `).all({ q: `%${q}%`, uid: id });
  return c.json(rows);
});

// 個人スペース（インボックス）の所在。サイドバーへのドロップ移動用
usersRoutes.get('/:id/personal-space', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const u = db.prepare('SELECT name FROM users WHERE id = ?').get(id) as any;
  if (!u) return c.json({ error: 'User not found' }, 404);
  const ensure = (globalThis as any).__ensurePersonalSpace as (uid: string, name: string) => { groupId: string; projectId: string };
  const space = ensure(id, u.name);
  return c.json({ group_id: space.groupId, project_id: space.projectId });
});
