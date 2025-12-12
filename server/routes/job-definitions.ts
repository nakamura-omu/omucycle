import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const jobDefinitionsRoutes = new Hono();

// 業務定義詳細取得
jobDefinitionsRoutes.get('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const definition = db.prepare(`
    SELECT jd.*, g.name as group_name
    FROM job_definitions jd
    JOIN groups g ON jd.group_id = g.id
    WHERE jd.id = ?
  `).get(id);

  if (!definition) {
    return c.json({ error: 'Job definition not found' }, 404);
  }

  // タスクテンプレートを取得
  const templates = db.prepare(`
    SELECT * FROM task_templates
    WHERE job_definition_id = ?
    ORDER BY sort_order ASC, relative_days ASC
  `).all(id) as any[];

  // default_assignee_ids をJSONからパース
  const parsedTemplates = templates.map(t => ({
    ...t,
    default_assignee_ids: t.default_assignee_ids ? JSON.parse(t.default_assignee_ids) : null
  }));

  return c.json({ ...definition, templates: parsedTemplates });
});

// 業務定義作成
jobDefinitionsRoutes.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const {
    group_id,
    name,
    prefix,
    category,
    typical_start_month,
    typical_start_week,
    typical_duration_days,
    owner_role,
    description,
  } = body;

  if (!group_id || !name) {
    return c.json({ error: 'group_id and name are required' }, 400);
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO job_definitions (
      id, group_id, name, prefix, category, typical_start_month,
      typical_start_week, typical_duration_days, owner_role, description
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, group_id, name, prefix?.toUpperCase() || null, category || null, typical_start_month || null,
    typical_start_week || null, typical_duration_days || null,
    owner_role || null, description || null
  );

  const definition = db.prepare('SELECT * FROM job_definitions WHERE id = ?').get(id);
  return c.json(definition, 201);
});

// 業務定義更新
jobDefinitionsRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();

  const allowedFields = [
    'name', 'prefix', 'category', 'typical_start_month', 'typical_start_week',
    'typical_duration_days', 'owner_role', 'description', 'is_active'
  ];
  const updates: string[] = [];
  const params: any[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      // prefixは大文字に変換
      if (field === 'prefix') {
        params.push(body[field]?.toUpperCase() || null);
      } else {
        params.push(body[field]);
      }
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id);

  const result = db.prepare(`
    UPDATE job_definitions
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);

  if (result.changes === 0) {
    return c.json({ error: 'Job definition not found' }, 404);
  }

  const definition = db.prepare('SELECT * FROM job_definitions WHERE id = ?').get(id);
  return c.json(definition);
});

// 業務定義削除
jobDefinitionsRoutes.delete('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const result = db.prepare('DELETE FROM job_definitions WHERE id = ?').run(id);

  if (result.changes === 0) {
    return c.json({ error: 'Job definition not found' }, 404);
  }

  return c.json({ success: true });
});

// タスクテンプレート追加
jobDefinitionsRoutes.post('/:id/templates', async (c) => {
  const db = getDb();
  const jobDefinitionId = c.req.param('id');
  const body = await c.req.json();
  const {
    title,
    parent_template_id,
    relative_days = 0,
    description,
    default_assignee_role,
    default_assignee_id,
    default_assignee_ids,
    sort_order = 0,
  } = body;

  if (!title) {
    return c.json({ error: 'title is required' }, 400);
  }

  // 親テンプレートがあれば階層を計算
  let depth = 0;
  if (parent_template_id) {
    const parent = db.prepare('SELECT depth FROM task_templates WHERE id = ?').get(parent_template_id) as any;
    if (parent) {
      depth = parent.depth + 1;
      if (depth > 2) {
        return c.json({ error: 'Maximum template depth (3 levels) exceeded' }, 400);
      }
    }
  }

  const id = uuidv4();

  // default_assignee_ids を JSON文字列に変換
  const assigneeIdsJson = default_assignee_ids ? JSON.stringify(default_assignee_ids) : null;

  db.prepare(`
    INSERT INTO task_templates (
      id, job_definition_id, parent_template_id, depth,
      title, relative_days, description, default_assignee_role, default_assignee_id, default_assignee_ids, sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, jobDefinitionId, parent_template_id || null, depth,
    title, relative_days, description || null,
    default_assignee_role || null, default_assignee_id || null, assigneeIdsJson, sort_order
  );

  const template = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id);
  return c.json(template, 201);
});

// 年度業務インスタンス化
jobDefinitionsRoutes.post('/:id/instantiate', async (c) => {
  const db = getDb();
  const jobDefinitionId = c.req.param('id');
  const body = await c.req.json();
  const { fiscal_year, actual_start, created_by } = body;

  if (!fiscal_year || !created_by) {
    return c.json({ error: 'fiscal_year and created_by are required' }, 400);
  }

  // 業務定義を取得
  const definition = db.prepare(`
    SELECT * FROM job_definitions WHERE id = ?
  `).get(jobDefinitionId) as any;

  if (!definition) {
    return c.json({ error: 'Job definition not found' }, 404);
  }

  // タスクテンプレートを取得
  const templates = db.prepare(`
    SELECT * FROM task_templates
    WHERE job_definition_id = ?
    ORDER BY depth ASC, sort_order ASC
  `).all(jobDefinitionId) as any[];

  const instanceId = uuidv4();
  const startDate = actual_start || new Date().toISOString().split('T')[0];

  // instance_numberを取得（同じ業務定義の既存インスタンス数 + 1）
  const existingCount = db.prepare(`
    SELECT COUNT(*) as count FROM job_instances WHERE job_definition_id = ?
  `).get(jobDefinitionId) as { count: number };
  const instanceNumber = existingCount.count + 1;

  db.transaction(() => {
    // 年度業務インスタンス作成
    db.prepare(`
      INSERT INTO job_instances (id, job_definition_id, group_id, instance_number, fiscal_year, actual_start, status)
      VALUES (?, ?, ?, ?, ?, ?, 'not_started')
    `).run(instanceId, jobDefinitionId, definition.group_id, instanceNumber, fiscal_year, startDate);

    // テンプレートIDから新タスクIDへのマッピング
    const templateToTask: Record<string, string> = {};
    let taskNumber = 0;

    // タスクを生成
    for (const template of templates) {
      const taskId = uuidv4();
      templateToTask[template.id] = taskId;
      taskNumber++;

      // 期限日を計算
      const dueDate = new Date(startDate);
      dueDate.setDate(dueDate.getDate() + (template.relative_days || 0));

      const parentTaskId = template.parent_template_id
        ? templateToTask[template.parent_template_id]
        : null;

      db.prepare(`
        INSERT INTO tasks (
          id, job_instance_id, group_id, task_template_id, parent_task_id,
          task_number, depth, title, description, due_date, assignee_id, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId, instanceId, definition.group_id, template.id,
        parentTaskId, taskNumber, template.depth, template.title,
        template.description, dueDate.toISOString().split('T')[0],
        template.default_assignee_id || null, created_by
      );
    }
  })();

  // 作成したインスタンスを返す
  const instance = db.prepare(`
    SELECT ji.*, jd.name as job_name,
           (SELECT COUNT(*) FROM tasks WHERE job_instance_id = ji.id) as task_count
    FROM job_instances ji
    JOIN job_definitions jd ON ji.job_definition_id = jd.id
    WHERE ji.id = ?
  `).get(instanceId);

  return c.json(instance, 201);
});

// タスクテンプレート更新
jobDefinitionsRoutes.put('/templates/:templateId', async (c) => {
  const db = getDb();
  const templateId = c.req.param('templateId');
  const body = await c.req.json();

  const allowedFields = ['title', 'description', 'relative_days', 'default_assignee_role', 'default_assignee_id', 'default_assignee_ids', 'sort_order'];
  const updates: string[] = [];
  const params: any[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      // default_assignee_ids は JSON文字列に変換
      if (field === 'default_assignee_ids') {
        params.push(body[field] ? JSON.stringify(body[field]) : null);
      } else {
        params.push(body[field]);
      }
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  params.push(templateId);

  const result = db.prepare(`
    UPDATE task_templates
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);

  if (result.changes === 0) {
    return c.json({ error: 'Template not found' }, 404);
  }

  const template = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(templateId);
  return c.json(template);
});

// タスクテンプレート削除
jobDefinitionsRoutes.delete('/templates/:templateId', (c) => {
  const db = getDb();
  const templateId = c.req.param('templateId');

  // 子テンプレートがあるか確認
  const children = db.prepare('SELECT id FROM task_templates WHERE parent_template_id = ?').all(templateId);
  if (children.length > 0) {
    return c.json({ error: 'Cannot delete template with children. Delete children first.' }, 400);
  }

  const result = db.prepare('DELETE FROM task_templates WHERE id = ?').run(templateId);

  if (result.changes === 0) {
    return c.json({ error: 'Template not found' }, 404);
  }

  return c.json({ success: true });
});

// 公開テンプレート一覧
jobDefinitionsRoutes.get('/public/templates', (c) => {
  const db = getDb();
  const tag = c.req.query('tag');

  let query = `
    SELECT jd.*, ts.published_name, ts.tags, ts.published_at,
           g.name as group_name,
           (SELECT COUNT(*) FROM task_templates WHERE job_definition_id = jd.id) as template_count
    FROM job_definitions jd
    JOIN template_shares ts ON jd.id = ts.job_definition_id
    JOIN groups g ON jd.group_id = g.id
    WHERE ts.is_public = 1
  `;
  const params: any[] = [];

  if (tag) {
    query += ' AND ts.tags LIKE ?';
    params.push(`%${tag}%`);
  }

  query += ' ORDER BY ts.published_at DESC';

  const templates = db.prepare(query).all(...params);
  return c.json(templates);
});
