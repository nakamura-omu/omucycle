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
    ORDER BY t.created_at ASC
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
    start_date,
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
      depth, title, description, start_date, due_date, status, priority,
      assignee_id, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, group_id, job_instance_id || null, task_template_id || null,
    parent_task_id || null, depth, title, description || null,
    start_date || null, due_date || null, status, priority, assignee_id || null, created_by
  );

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return c.json(task, 201);
});

// タスク更新
tasksRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();

  const allowedFields = ['title', 'description', 'start_date', 'due_date', 'status', 'priority', 'assignee_id', 'assignee_ids'];
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
  `).all(id) as any[];

  // 各コメントにリアクションを追加
  for (const comment of comments) {
    const reactions = db.prepare(`
      SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as user_ids
      FROM comment_reactions
      WHERE comment_id = ?
      GROUP BY emoji
    `).all(comment.id) as any[];
    comment.reactions = reactions.map(r => ({
      emoji: r.emoji,
      count: r.count,
      user_ids: r.user_ids ? r.user_ids.split(',') : [],
    }));
  }

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

// コメントリアクション追加/トグル
tasksRoutes.post('/comments/:commentId/reactions', async (c) => {
  const db = getDb();
  const commentId = c.req.param('commentId');
  const body = await c.req.json();
  const { user_id, emoji } = body;

  if (!user_id || !emoji) {
    return c.json({ error: 'user_id and emoji are required' }, 400);
  }

  // 既存のリアクションをチェック
  const existing = db.prepare(`
    SELECT id FROM comment_reactions
    WHERE comment_id = ? AND user_id = ? AND emoji = ?
  `).get(commentId, user_id, emoji) as any;

  if (existing) {
    // 既にあれば削除（トグル）
    db.prepare('DELETE FROM comment_reactions WHERE id = ?').run(existing.id);
    return c.json({ action: 'removed', emoji });
  } else {
    // なければ追加
    const id = uuidv4();
    db.prepare(`
      INSERT INTO comment_reactions (id, comment_id, user_id, emoji)
      VALUES (?, ?, ?, ?)
    `).run(id, commentId, user_id, emoji);
    return c.json({ action: 'added', emoji, id }, 201);
  }
});

// コメントのリアクション一覧取得
tasksRoutes.get('/comments/:commentId/reactions', (c) => {
  const db = getDb();
  const commentId = c.req.param('commentId');

  const reactions = db.prepare(`
    SELECT cr.*, u.name as user_name
    FROM comment_reactions cr
    JOIN users u ON cr.user_id = u.id
    WHERE cr.comment_id = ?
    ORDER BY cr.created_at ASC
  `).all(commentId);

  return c.json(reactions);
});

// ステータス変更（簡易API）
tasksRoutes.patch('/:id/status', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { status } = body;

  // タスクのgroup_idを取得してステータスを検証
  const task = db.prepare('SELECT group_id FROM tasks WHERE id = ?').get(id) as { group_id: string } | undefined;
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const validStatus = db.prepare(`
    SELECT key FROM group_statuses WHERE group_id = ? AND key = ?
  `).get(task.group_id, status);

  if (!validStatus) {
    return c.json({ error: 'Invalid status for this group' }, 400);
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

// タスク並び替え・親変更API
tasksRoutes.patch('/:id/reorder', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { parent_task_id, sort_order } = body;

  // タスク取得
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  // 親タスクが変わる場合、階層をチェック
  let newDepth = 0;
  if (parent_task_id !== undefined) {
    if (parent_task_id === null) {
      newDepth = 0;
    } else {
      // 自分自身を親にはできない
      if (parent_task_id === id) {
        return c.json({ error: 'Cannot set task as its own parent' }, 400);
      }
      const parent = db.prepare('SELECT depth FROM tasks WHERE id = ?').get(parent_task_id) as any;
      if (!parent) {
        return c.json({ error: 'Parent task not found' }, 404);
      }
      newDepth = parent.depth + 1;
      if (newDepth > 2) {
        return c.json({ error: 'Maximum task depth (3 levels) exceeded' }, 400);
      }
    }
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (parent_task_id !== undefined) {
    updates.push('parent_task_id = ?');
    params.push(parent_task_id);
    updates.push('depth = ?');
    params.push(newDepth);
  }

  if (sort_order !== undefined) {
    updates.push('sort_order = ?');
    params.push(sort_order);
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`
    UPDATE tasks
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  return c.json(updated);
});

// タスク一括並び替えAPI
tasksRoutes.post('/reorder-bulk', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { tasks } = body; // [{ id, sort_order, parent_task_id? }]

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return c.json({ error: 'tasks array is required' }, 400);
  }

  const transaction = db.transaction(() => {
    for (const t of tasks) {
      // 自分自身を親にしようとしていないかチェック
      if (t.parent_task_id === t.id) {
        throw new Error('SELF_PARENT');
      }

      // 親のdepthを取得
      let depth = 0;
      if (t.parent_task_id) {
        const parent = db.prepare('SELECT depth FROM tasks WHERE id = ?').get(t.parent_task_id) as any;
        if (parent) {
          depth = parent.depth + 1;
        }
      }

      // depth制限チェック
      if (depth > 2) {
        throw new Error('MAX_DEPTH');
      }

      // タスクを更新
      db.prepare(`
        UPDATE tasks
        SET sort_order = ?, parent_task_id = ?, depth = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(t.sort_order ?? 0, t.parent_task_id ?? null, depth, t.id);
    }
  });

  try {
    transaction();
    return c.json({ success: true, updated: tasks.length });
  } catch (error: any) {
    console.error('Failed to reorder tasks:', error);
    if (error.message === 'MAX_DEPTH') {
      return c.json({ error: '最大3階層までです' }, 400);
    }
    return c.json({ error: 'Failed to reorder tasks' }, 500);
  }
});
