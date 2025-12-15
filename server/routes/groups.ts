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

// デフォルトステータス定義
const DEFAULT_STATUSES = [
  { key: 'not_started', label: '未着手', color: '#94a3b8', sort_order: 0, is_done: 0 },
  { key: 'in_progress', label: '進行中', color: '#3b82f6', sort_order: 1, is_done: 0 },
  { key: 'completed', label: '完了', color: '#22c55e', sort_order: 2, is_done: 1 },
];

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

    // デフォルトステータスを作成
    const insertStatus = db.prepare(`
      INSERT INTO group_statuses (id, group_id, key, label, color, sort_order, is_done)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const status of DEFAULT_STATUSES) {
      insertStatus.run(uuidv4(), groupId, status.key, status.label, status.color, status.sort_order, status.is_done);
    }
  })();

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  return c.json(group, 201);
});

// グループ更新
groupsRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { name, slug, is_public_templates } = body;

  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (slug !== undefined) {
    updates.push('slug = ?');
    params.push(slug || null);
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

  try {
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
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'UNIQUE constraint failed: slug already exists' }, 409);
    }
    throw error;
  }
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

// メンバーロール変更
groupsRoutes.patch('/:groupId/members/:userId/role', async (c) => {
  const db = getDb();
  const { groupId, userId } = c.req.param();
  const body = await c.req.json();
  const { role } = body;

  if (!role || !['admin', 'member', 'guest'].includes(role)) {
    return c.json({ error: 'Invalid role. Must be admin, member, or guest' }, 400);
  }

  // オーナーのロールは変更不可
  const membership = db.prepare(`
    SELECT role FROM group_memberships WHERE group_id = ? AND user_id = ?
  `).get(groupId, userId) as { role: string } | undefined;

  if (!membership) {
    return c.json({ error: 'Membership not found' }, 404);
  }

  if (membership.role === 'owner') {
    return c.json({ error: 'Cannot change owner role' }, 403);
  }

  db.prepare(`
    UPDATE group_memberships
    SET role = ?
    WHERE group_id = ? AND user_id = ?
  `).run(role, groupId, userId);

  return c.json({ success: true });
});

// メンバー削除
groupsRoutes.delete('/:groupId/members/:userId', (c) => {
  const db = getDb();
  const { groupId, userId } = c.req.param();

  // オーナーは削除不可
  const membership = db.prepare(`
    SELECT role FROM group_memberships WHERE group_id = ? AND user_id = ?
  `).get(groupId, userId) as { role: string } | undefined;

  if (!membership) {
    return c.json({ error: 'Membership not found' }, 404);
  }

  if (membership.role === 'owner') {
    return c.json({ error: 'Cannot remove owner from group' }, 403);
  }

  const result = db.prepare(`
    DELETE FROM group_memberships
    WHERE group_id = ? AND user_id = ?
  `).run(groupId, userId);

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

// グループの業務インスタンス一覧（業務タスク）
groupsRoutes.get('/:id/job-instances', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const instances = db.prepare(`
    SELECT ji.*,
           COALESCE(ji.name, jd.name) as job_name,
           jd.prefix as job_prefix,
           jd.category,
           (SELECT COUNT(*) FROM tasks WHERE job_instance_id = ji.id) as task_count,
           (SELECT COUNT(*) FROM tasks WHERE job_instance_id = ji.id AND status = 'completed') as completed_count
    FROM job_instances ji
    LEFT JOIN job_definitions jd ON ji.job_definition_id = jd.id
    WHERE ji.group_id = ?
    ORDER BY ji.fiscal_year DESC, ji.actual_start DESC
  `).all(id);

  return c.json(instances);
});

// 業務インスタンス詳細（タスク一覧付き）
groupsRoutes.get('/:groupId/job-instances/:instanceId', (c) => {
  const db = getDb();
  const { groupId, instanceId } = c.req.param();

  const instance = db.prepare(`
    SELECT ji.*,
           COALESCE(ji.name, jd.name) as job_name,
           jd.prefix as job_prefix,
           jd.category,
           jd.description as job_description
    FROM job_instances ji
    LEFT JOIN job_definitions jd ON ji.job_definition_id = jd.id
    WHERE ji.id = ? AND ji.group_id = ?
  `).get(instanceId, groupId);

  if (!instance) {
    return c.json({ error: 'Job instance not found' }, 404);
  }

  // タスク一覧を取得
  const tasks = db.prepare(`
    SELECT t.*, u.name as assignee_name, creator.name as created_by_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users creator ON t.created_by = creator.id
    WHERE t.job_instance_id = ?
    ORDER BY t.depth ASC, t.due_date ASC
  `).all(instanceId);

  return c.json({ ...instance, tasks });
});

// === 業務インスタンス管理 ===

// 業務インスタンス直接作成（テンプレートなし）
groupsRoutes.post('/:id/job-instances', async (c) => {
  const db = getDb();
  const groupId = c.req.param('id');
  const body = await c.req.json();
  const { name, fiscal_year, actual_start, created_by } = body;

  if (!fiscal_year || !created_by) {
    return c.json({ error: 'fiscal_year and created_by are required' }, 400);
  }

  // 次のinstance_numberを取得（グループ内で連番）
  const maxNumber = db.prepare(`
    SELECT COALESCE(MAX(instance_number), 0) as max_num
    FROM job_instances WHERE group_id = ?
  `).get(groupId) as { max_num: number };

  const instanceId = uuidv4();

  db.prepare(`
    INSERT INTO job_instances (id, group_id, job_definition_id, name, instance_number, fiscal_year, actual_start, status)
    VALUES (?, ?, NULL, ?, ?, ?, ?, 'not_started')
  `).run(instanceId, groupId, name || null, maxNumber.max_num + 1, fiscal_year, actual_start || null);

  const instance = db.prepare(`
    SELECT ji.*,
           COALESCE(ji.name, jd.name) as job_name,
           jd.prefix as job_prefix
    FROM job_instances ji
    LEFT JOIN job_definitions jd ON ji.job_definition_id = jd.id
    WHERE ji.id = ?
  `).get(instanceId);

  return c.json(instance, 201);
});

// 業務インスタンスにタスク追加
groupsRoutes.post('/:groupId/job-instances/:instanceId/tasks', async (c) => {
  const db = getDb();
  const { groupId, instanceId } = c.req.param();
  const body = await c.req.json();
  const { title, description, due_date, priority = 'normal', assignee_id, assignee_ids, created_by, parent_task_id } = body;

  if (!title || !created_by) {
    return c.json({ error: 'title and created_by are required' }, 400);
  }

  // インスタンスの存在確認
  const instance = db.prepare('SELECT id FROM job_instances WHERE id = ? AND group_id = ?').get(instanceId, groupId);
  if (!instance) {
    return c.json({ error: 'Job instance not found' }, 404);
  }

  // 次のtask_numberを取得（インスタンス内で連番）
  const maxTaskNum = db.prepare(`
    SELECT COALESCE(MAX(task_number), 0) as max_num
    FROM tasks WHERE job_instance_id = ?
  `).get(instanceId) as { max_num: number };

  // 親タスクがあれば階層を計算
  let depth = 0;
  if (parent_task_id) {
    const parent = db.prepare('SELECT depth FROM tasks WHERE id = ?').get(parent_task_id) as { depth: number } | undefined;
    if (parent) {
      depth = parent.depth + 1;
      if (depth > 2) {
        return c.json({ error: 'Maximum task depth (3 levels) exceeded' }, 400);
      }
    }
  }

  const taskId = uuidv4();

  db.prepare(`
    INSERT INTO tasks (id, group_id, job_instance_id, task_number, parent_task_id, depth, title, description, due_date, priority, assignee_id, assignee_ids, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId, groupId, instanceId, maxTaskNum.max_num + 1,
    parent_task_id || null, depth, title, description || null, due_date || null,
    priority, assignee_id || null, assignee_ids ? JSON.stringify(assignee_ids) : null, created_by
  );

  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.id = ?
  `).get(taskId);

  return c.json(task, 201);
});

// 業務インスタンスをテンプレートとして保存
groupsRoutes.post('/:groupId/job-instances/:instanceId/save-as-template', async (c) => {
  const db = getDb();
  const { groupId, instanceId } = c.req.param();
  const body = await c.req.json();
  const { name, prefix, description, category } = body;

  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  // インスタンスとタスクを取得
  const instance = db.prepare(`
    SELECT * FROM job_instances WHERE id = ? AND group_id = ?
  `).get(instanceId, groupId) as any;

  if (!instance) {
    return c.json({ error: 'Job instance not found' }, 404);
  }

  const tasks = db.prepare(`
    SELECT * FROM tasks WHERE job_instance_id = ? ORDER BY depth ASC, task_number ASC
  `).all(instanceId) as any[];

  // トランザクションで業務定義とテンプレートを作成
  const jobDefId = uuidv4();
  const taskIdMap = new Map<string, string>(); // 旧タスクID → 新テンプレートID

  db.transaction(() => {
    // 業務定義を作成
    db.prepare(`
      INSERT INTO job_definitions (id, group_id, name, prefix, description, category, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(jobDefId, groupId, name, prefix || null, description || null, category || null);

    // タスクをテンプレートに変換
    const insertTemplate = db.prepare(`
      INSERT INTO task_templates (id, job_definition_id, parent_template_id, depth, title, description, relative_days, default_assignee_id, default_assignee_ids, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 基準日（actual_startまたは最初のタスクの日付）
    const baseDate = instance.actual_start ? new Date(instance.actual_start) : new Date();

    tasks.forEach((task, index) => {
      const templateId = uuidv4();
      taskIdMap.set(task.id, templateId);

      // 相対日数を計算
      let relativeDays = 0;
      if (task.due_date) {
        const dueDate = new Date(task.due_date);
        relativeDays = Math.round((dueDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // 親テンプレートIDを解決
      const parentTemplateId = task.parent_task_id ? taskIdMap.get(task.parent_task_id) : null;

      insertTemplate.run(
        templateId,
        jobDefId,
        parentTemplateId || null,
        task.depth,
        task.title,
        task.description,
        relativeDays,
        task.assignee_id,
        task.assignee_ids,
        index
      );
    });

    // インスタンスに業務定義を紐付け（オプション）
    db.prepare(`
      UPDATE job_instances SET job_definition_id = ? WHERE id = ?
    `).run(jobDefId, instanceId);
  })();

  const jobDef = db.prepare(`
    SELECT jd.*,
           (SELECT COUNT(*) FROM task_templates WHERE job_definition_id = jd.id) as template_count
    FROM job_definitions jd
    WHERE jd.id = ?
  `).get(jobDefId);

  return c.json(jobDef, 201);
});

// 業務インスタンス更新（名前変更など）
groupsRoutes.put('/:groupId/job-instances/:instanceId', async (c) => {
  const db = getDb();
  const { groupId, instanceId } = c.req.param();
  const body = await c.req.json();
  const { name, fiscal_year, actual_start, actual_end, status } = body;

  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name || null);
  }
  if (fiscal_year !== undefined) {
    updates.push('fiscal_year = ?');
    params.push(fiscal_year);
  }
  if (actual_start !== undefined) {
    updates.push('actual_start = ?');
    params.push(actual_start);
  }
  if (actual_end !== undefined) {
    updates.push('actual_end = ?');
    params.push(actual_end);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  params.push(instanceId, groupId);

  const result = db.prepare(`
    UPDATE job_instances
    SET ${updates.join(', ')}
    WHERE id = ? AND group_id = ?
  `).run(...params);

  if (result.changes === 0) {
    return c.json({ error: 'Job instance not found' }, 404);
  }

  const instance = db.prepare(`
    SELECT ji.*, COALESCE(ji.name, jd.name) as job_name, jd.prefix as job_prefix
    FROM job_instances ji
    LEFT JOIN job_definitions jd ON ji.job_definition_id = jd.id
    WHERE ji.id = ?
  `).get(instanceId);

  return c.json(instance);
});

// 業務インスタンス削除
groupsRoutes.delete('/:groupId/job-instances/:instanceId', (c) => {
  const db = getDb();
  const { groupId, instanceId } = c.req.param();

  // 関連タスクも削除される（ON DELETE CASCADE）
  const result = db.prepare(`
    DELETE FROM job_instances WHERE id = ? AND group_id = ?
  `).run(instanceId, groupId);

  if (result.changes === 0) {
    return c.json({ error: 'Job instance not found' }, 404);
  }

  return c.json({ success: true });
});

// === ステータス管理 ===

// グループのステータス一覧取得
groupsRoutes.get('/:id/statuses', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  // ステータスがなければデフォルトを返す（既存グループ対応）
  let statuses = db.prepare(`
    SELECT * FROM group_statuses
    WHERE group_id = ?
    ORDER BY sort_order ASC
  `).all(id) as any[];

  if (statuses.length === 0) {
    // 既存グループにデフォルトステータスを追加
    const insertStatus = db.prepare(`
      INSERT INTO group_statuses (id, group_id, key, label, color, sort_order, is_done)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const status of DEFAULT_STATUSES) {
      insertStatus.run(uuidv4(), id, status.key, status.label, status.color, status.sort_order, status.is_done);
    }
    statuses = db.prepare(`
      SELECT * FROM group_statuses
      WHERE group_id = ?
      ORDER BY sort_order ASC
    `).all(id) as any[];
  }

  return c.json(statuses);
});

// ステータス追加
groupsRoutes.post('/:id/statuses', async (c) => {
  const db = getDb();
  const groupId = c.req.param('id');
  const body = await c.req.json();
  const { key, label, color = '#6b7280', is_done = false } = body;

  if (!key || !label) {
    return c.json({ error: 'key and label are required' }, 400);
  }

  // 次のsort_orderを取得
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) as max_order
    FROM group_statuses WHERE group_id = ?
  `).get(groupId) as { max_order: number };

  const statusId = uuidv4();
  try {
    db.prepare(`
      INSERT INTO group_statuses (id, group_id, key, label, color, sort_order, is_done)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(statusId, groupId, key, label, color, maxOrder.max_order + 1, is_done ? 1 : 0);

    const status = db.prepare('SELECT * FROM group_statuses WHERE id = ?').get(statusId);
    return c.json(status, 201);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'Status key already exists in this group' }, 409);
    }
    throw error;
  }
});

// ステータス更新
groupsRoutes.put('/:groupId/statuses/:statusId', async (c) => {
  const db = getDb();
  const { groupId, statusId } = c.req.param();
  const body = await c.req.json();
  const { label, color, is_done } = body;

  const updates: string[] = [];
  const params: any[] = [];

  if (label !== undefined) {
    updates.push('label = ?');
    params.push(label);
  }
  if (color !== undefined) {
    updates.push('color = ?');
    params.push(color);
  }
  if (is_done !== undefined) {
    updates.push('is_done = ?');
    params.push(is_done ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  params.push(statusId, groupId);
  const result = db.prepare(`
    UPDATE group_statuses
    SET ${updates.join(', ')}
    WHERE id = ? AND group_id = ?
  `).run(...params);

  if (result.changes === 0) {
    return c.json({ error: 'Status not found' }, 404);
  }

  const status = db.prepare('SELECT * FROM group_statuses WHERE id = ?').get(statusId);
  return c.json(status);
});

// ステータス削除
groupsRoutes.delete('/:groupId/statuses/:statusId', (c) => {
  const db = getDb();
  const { groupId, statusId } = c.req.param();

  // このステータスを使っているタスクがあるか確認
  const status = db.prepare('SELECT key FROM group_statuses WHERE id = ?').get(statusId) as { key: string } | undefined;
  if (!status) {
    return c.json({ error: 'Status not found' }, 404);
  }

  const tasksWithStatus = db.prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE group_id = ? AND status = ?
  `).get(groupId, status.key) as { count: number };

  if (tasksWithStatus.count > 0) {
    return c.json({ error: `Cannot delete: ${tasksWithStatus.count} tasks are using this status` }, 400);
  }

  const result = db.prepare(`
    DELETE FROM group_statuses WHERE id = ? AND group_id = ?
  `).run(statusId, groupId);

  if (result.changes === 0) {
    return c.json({ error: 'Status not found' }, 404);
  }

  return c.json({ success: true });
});

// ステータス順序変更
groupsRoutes.put('/:id/statuses/reorder', async (c) => {
  const db = getDb();
  const groupId = c.req.param('id');
  const body = await c.req.json();
  const { status_ids } = body;

  if (!Array.isArray(status_ids)) {
    return c.json({ error: 'status_ids array is required' }, 400);
  }

  db.transaction(() => {
    const updateOrder = db.prepare(`
      UPDATE group_statuses SET sort_order = ? WHERE id = ? AND group_id = ?
    `);
    status_ids.forEach((statusId: string, index: number) => {
      updateOrder.run(index, statusId, groupId);
    });
  })();

  const statuses = db.prepare(`
    SELECT * FROM group_statuses WHERE group_id = ? ORDER BY sort_order ASC
  `).all(groupId);

  return c.json(statuses);
});
