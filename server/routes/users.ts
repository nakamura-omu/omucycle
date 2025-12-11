import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const usersRoutes = new Hono();

// ユーザー一覧取得
usersRoutes.get('/', (c) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT id, email, name, auth_type, created_at, updated_at
    FROM users
    ORDER BY created_at DESC
  `).all();
  return c.json(users);
});

// ユーザー詳細取得
usersRoutes.get('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const user = db.prepare(`
    SELECT id, email, name, auth_type, created_at, updated_at
    FROM users
    WHERE id = ?
  `).get(id);

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  return c.json(user);
});

// ユーザー作成
usersRoutes.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { email, name, auth_type = 'guest' } = body;

  if (!email || !name) {
    return c.json({ error: 'email and name are required' }, 400);
  }

  const id = uuidv4();
  try {
    db.prepare(`
      INSERT INTO users (id, email, name, auth_type)
      VALUES (?, ?, ?, ?)
    `).run(id, email, name, auth_type);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return c.json(user, 201);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'Email already exists' }, 409);
    }
    throw error;
  }
});

// ユーザー更新
usersRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { name } = body;

  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  const result = db.prepare(`
    UPDATE users
    SET name = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name, id);

  if (result.changes === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return c.json(user);
});

// ユーザーのグループ一覧
usersRoutes.get('/:id/groups', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const groups = db.prepare(`
    SELECT g.*, gm.role, gm.joined_at
    FROM groups g
    JOIN group_memberships gm ON g.id = gm.group_id
    WHERE gm.user_id = ?
    ORDER BY gm.joined_at DESC
  `).all(id);

  return c.json(groups);
});

// ユーザーのタスク一覧（全グループ横断）
usersRoutes.get('/:id/tasks', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const status = c.req.query('status');

  let query = `
    SELECT t.*, g.name as group_name
    FROM tasks t
    JOIN groups g ON t.group_id = g.id
    WHERE t.assignee_id = ?
  `;
  const params: any[] = [id];

  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  query += ' ORDER BY t.due_date ASC, t.priority DESC';

  const tasks = db.prepare(query).all(...params);
  return c.json(tasks);
});
