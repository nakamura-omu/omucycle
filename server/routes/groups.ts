import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const groupsRoutes = new Hono();

// グループ一覧取得
groupsRoutes.get('/', (c) => {
  const db = getDb();
  const groups = db.prepare(`
    SELECT g.*, u.name as created_by_name,
           (SELECT COUNT(*) FROM group_memberships WHERE group_id = g.id) as member_count,
           (SELECT COUNT(*) FROM tasks WHERE group_id = g.id AND status != 'completed') as active_tasks
    FROM groups g
    JOIN users u ON g.created_by = u.id
    ORDER BY g.created_at DESC
  `).all();
  return c.json(groups);
});

// グループ詳細取得
groupsRoutes.get('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const group = db.prepare(`
    SELECT g.*, u.name as created_by_name
    FROM groups g
    JOIN users u ON g.created_by = u.id
    WHERE g.id = ?
  `).get(id);

  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }
  return c.json(group);
});

// グループ作成
groupsRoutes.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { name, created_by } = body;

  if (!name || !created_by) {
    return c.json({ error: 'name and created_by are required' }, 400);
  }

  const groupId = uuidv4();
  const membershipId = uuidv4();

  db.transaction(() => {
    // グループ作成
    db.prepare(`
      INSERT INTO groups (id, name, created_by)
      VALUES (?, ?, ?)
    `).run(groupId, name, created_by);

    // 作成者をownerとして追加
    db.prepare(`
      INSERT INTO group_memberships (id, group_id, user_id, role)
      VALUES (?, ?, ?, 'owner')
    `).run(membershipId, groupId, created_by);
  })();

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  return c.json(group, 201);
});

// グループ更新
groupsRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { name, is_public_templates } = body;

  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (is_public_templates !== undefined) {
    updates.push('is_public_templates = ?');
    params.push(is_public_templates ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  const result = db.prepare(`
    UPDATE groups
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);

  if (result.changes === 0) {
    return c.json({ error: 'Group not found' }, 404);
  }

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
  return c.json(group);
});

// グループ削除
groupsRoutes.delete('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const result = db.prepare('DELETE FROM groups WHERE id = ?').run(id);

  if (result.changes === 0) {
    return c.json({ error: 'Group not found' }, 404);
  }

  return c.json({ success: true });
});

// グループメンバー一覧
groupsRoutes.get('/:id/members', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const members = db.prepare(`
    SELECT u.id, u.email, u.name, u.auth_type, gm.role, gm.joined_at
    FROM users u
    JOIN group_memberships gm ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at ASC
  `).all(id);

  return c.json(members);
});

// メンバー追加
groupsRoutes.post('/:id/members', async (c) => {
  const db = getDb();
  const groupId = c.req.param('id');
  const body = await c.req.json();
  const { user_id, role = 'member' } = body;

  if (!user_id) {
    return c.json({ error: 'user_id is required' }, 400);
  }

  const membershipId = uuidv4();
  try {
    db.prepare(`
      INSERT INTO group_memberships (id, group_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `).run(membershipId, groupId, user_id, role);

    return c.json({ success: true, membership_id: membershipId }, 201);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'User already a member' }, 409);
    }
    throw error;
  }
});

// メンバー削除
groupsRoutes.delete('/:groupId/members/:userId', (c) => {
  const db = getDb();
  const { groupId, userId } = c.req.param();

  const result = db.prepare(`
    DELETE FROM group_memberships
    WHERE group_id = ? AND user_id = ?
  `).run(groupId, userId);

  if (result.changes === 0) {
    return c.json({ error: 'Membership not found' }, 404);
  }

  return c.json({ success: true });
});

// グループのタスク一覧
groupsRoutes.get('/:id/tasks', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const status = c.req.query('status');
  const parentOnly = c.req.query('parent_only') === 'true';

  let query = `
    SELECT t.*, u.name as assignee_name, creator.name as created_by_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users creator ON t.created_by = creator.id
    WHERE t.group_id = ?
  `;
  const params: any[] = [id];

  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  if (parentOnly) {
    query += ' AND t.parent_task_id IS NULL';
  }

  query += ' ORDER BY t.due_date ASC, t.priority DESC';

  const tasks = db.prepare(query).all(...params);
  return c.json(tasks);
});

// グループの業務定義一覧
groupsRoutes.get('/:id/job-definitions', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const definitions = db.prepare(`
    SELECT jd.*,
           (SELECT COUNT(*) FROM task_templates WHERE job_definition_id = jd.id) as template_count,
           (SELECT COUNT(*) FROM job_instances WHERE job_definition_id = jd.id) as instance_count
    FROM job_definitions jd
    WHERE jd.group_id = ?
    ORDER BY jd.typical_start_month ASC, jd.name ASC
  `).all(id);

  return c.json(definitions);
});
