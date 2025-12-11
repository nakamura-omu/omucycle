import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const tasksRoutes = new Hono();

// タスク詳細取得
tasksRoutes.get('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const task = db.prepare(`
    SELECT t.*,
           u.name as assignee_name,
           creator.name as created_by_name,
           g.name as group_name,
           ji.fiscal_year,
           jd.name as job_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users creator ON t.created_by = creator.id
    JOIN groups g ON t.group_id = g.id
    LEFT JOIN job_instances ji ON t.job_instance_id = ji.id
    LEFT JOIN job_definitions jd ON ji.job_definition_id = jd.id
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  // 子タスクを取得
  const children = db.prepare(`
    SELECT t.*, u.name as assignee_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.parent_task_id = ?
    ORDER BY t.sort_order ASC, t.created_at ASC
  `).all(id);

  return c.json({ ...task, children });
});

// タスク作成
tasksRoutes.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const {
    group_id,
    title,
    description,
    due_date,
    status = 'not_started',
    priority = 'normal',
    assignee_id,
    created_by,
    parent_task_id,
    job_instance_id,
    task_template_id,
  } = body;

  if (!group_id || !title || !created_by) {
    return c.json({ error: 'group_id, title, and created_by are required' }, 400);
  }

  // 親タスクがあれば階層を計算
  let depth = 0;
  if (parent_task_id) {
    const parent = db.prepare('SELECT depth FROM tasks WHERE id = ?').get(parent_task_id) as any;
    if (parent) {
      depth = parent.depth + 1;
      if (depth > 2) {
        return c.json({ error: 'Maximum task depth (3 levels) exceeded' }, 400);
      }
    }
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO tasks (
      id, group_id, job_instance_id, task_template_id, parent_task_id,
      depth, title, description, due_date, status, priority,
      assignee_id, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, group_id, job_instance_id || null, task_template_id || null,
    parent_task_id || null, depth, title, description || null,
    due_date || null, status, priority, assignee_id || null, created_by
  );

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return c.json(task, 201);
});

// タスク更新
tasksRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();

  const allowedFields = ['title', 'description', 'due_date', 'status', 'priority', 'assignee_id'];
  const updates: string[] = [];
  const params: any[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  const result = db.prepare(`
    UPDATE tasks
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);

  if (result.changes === 0) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return c.json(task);
});

// タスク削除
tasksRoutes.delete('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

  if (result.changes === 0) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json({ success: true });
});

// タスクコメント一覧
tasksRoutes.get('/:id/comments', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const comments = db.prepare(`
    SELECT tc.*, u.name as user_name
    FROM task_comments tc
    JOIN users u ON tc.user_id = u.id
    WHERE tc.task_id = ?
    ORDER BY tc.created_at ASC
  `).all(id);

  return c.json(comments);
});

// コメント追加
tasksRoutes.post('/:id/comments', async (c) => {
  const db = getDb();
  const taskId = c.req.param('id');
  const body = await c.req.json();
  const { user_id, content, is_ai_generated = false } = body;

  if (!user_id || !content) {
    return c.json({ error: 'user_id and content are required' }, 400);
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO task_comments (id, task_id, user_id, content, is_ai_generated)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, taskId, user_id, content, is_ai_generated ? 1 : 0);

  // タスクの更新日時も更新
  db.prepare(`
    UPDATE tasks SET updated_at = datetime('now') WHERE id = ?
  `).run(taskId);

  const comment = db.prepare(`
    SELECT tc.*, u.name as user_name
    FROM task_comments tc
    JOIN users u ON tc.user_id = u.id
    WHERE tc.id = ?
  `).get(id);

  return c.json(comment, 201);
});

// ステータス変更（簡易API）
tasksRoutes.patch('/:id/status', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { status } = body;

  const validStatuses = ['not_started', 'in_progress', 'completed'];
  if (!validStatuses.includes(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const result = db.prepare(`
    UPDATE tasks
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, id);

  if (result.changes === 0) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json({ success: true, status });
});

// 優先度変更（簡易API）
tasksRoutes.patch('/:id/priority', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { priority } = body;

  const validPriorities = ['urgent', 'important', 'normal', 'none'];
  if (!validPriorities.includes(priority)) {
    return c.json({ error: 'Invalid priority' }, 400);
  }

  const result = db.prepare(`
    UPDATE tasks
    SET priority = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(priority, id);

  if (result.changes === 0) {
    return c.json({ error: 'Task not found' }, 404);
  }

  return c.json({ success: true, priority });
});
