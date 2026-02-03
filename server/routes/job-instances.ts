import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const jobInstancesRoutes = new Hono();

// グループの業務インスタンス一覧（業務タスク）
jobInstancesRoutes.get('/:id/job-instances', (c) => {
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
jobInstancesRoutes.get('/:groupId/job-instances/:instanceId', (c) => {
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

// 業務インスタンス直接作成（テンプレートなし）
jobInstancesRoutes.post('/:id/job-instances', async (c) => {
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
jobInstancesRoutes.post('/:groupId/job-instances/:instanceId/tasks', async (c) => {
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
jobInstancesRoutes.post('/:groupId/job-instances/:instanceId/save-as-template', async (c) => {
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
jobInstancesRoutes.put('/:groupId/job-instances/:instanceId', async (c) => {
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
jobInstancesRoutes.delete('/:groupId/job-instances/:instanceId', (c) => {
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
