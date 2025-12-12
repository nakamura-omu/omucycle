import { Hono } from 'hono';
import { getDb } from '../db/connection.js';

export const browseRoutes = new Hono();

// スラッグからグループを取得
browseRoutes.get('/:slug', (c) => {
  const db = getDb();
  const slug = c.req.param('slug');

  const group = db.prepare(`
    SELECT g.*, u.name as created_by_name,
           (SELECT COUNT(*) FROM group_memberships WHERE group_id = g.id) as member_count,
           (SELECT COUNT(*) FROM tasks WHERE group_id = g.id AND status != 'completed') as active_tasks
    FROM groups g
    JOIN users u ON g.created_by = u.id
    WHERE g.slug = ?
  `).get(slug);

  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }
  return c.json(group);
});

// 業務インスタンス取得 (prefix-number形式)
// 例: /dx-suishin/TEST-1
browseRoutes.get('/:slug/:instanceKey', (c) => {
  const db = getDb();
  const { slug, instanceKey } = c.req.param();

  // instanceKeyをパース (例: TEST-1 -> prefix=TEST, number=1)
  const match = instanceKey.match(/^([A-Z]+)-(\d+)$/);
  if (!match) {
    return c.json({ error: 'Invalid instance key format. Expected: PREFIX-NUMBER' }, 400);
  }
  const [, prefix, numberStr] = match;
  const instanceNumber = parseInt(numberStr, 10);

  // グループ取得
  const group = db.prepare('SELECT id FROM groups WHERE slug = ?').get(slug) as { id: string } | undefined;
  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  // 業務インスタンス取得
  const instance = db.prepare(`
    SELECT ji.*,
           jd.name as job_name,
           jd.prefix,
           jd.category,
           jd.description as job_description
    FROM job_instances ji
    JOIN job_definitions jd ON ji.job_definition_id = jd.id
    WHERE ji.group_id = ? AND jd.prefix = ? AND ji.instance_number = ?
  `).get(group.id, prefix, instanceNumber);

  if (!instance) {
    return c.json({ error: 'Job instance not found' }, 404);
  }

  return c.json(instance);
});

// 業務インスタンスのタスク一覧
// 例: /dx-suishin/TEST-1/tasks
browseRoutes.get('/:slug/:instanceKey/tasks', (c) => {
  const db = getDb();
  const { slug, instanceKey } = c.req.param();

  const match = instanceKey.match(/^([A-Z]+)-(\d+)$/);
  if (!match) {
    return c.json({ error: 'Invalid instance key format' }, 400);
  }
  const [, prefix, numberStr] = match;
  const instanceNumber = parseInt(numberStr, 10);

  const group = db.prepare('SELECT id FROM groups WHERE slug = ?').get(slug) as { id: string } | undefined;
  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  const instance = db.prepare(`
    SELECT ji.id
    FROM job_instances ji
    JOIN job_definitions jd ON ji.job_definition_id = jd.id
    WHERE ji.group_id = ? AND jd.prefix = ? AND ji.instance_number = ?
  `).get(group.id, prefix, instanceNumber) as { id: string } | undefined;

  if (!instance) {
    return c.json({ error: 'Job instance not found' }, 404);
  }

  const tasks = db.prepare(`
    SELECT t.*, u.name as assignee_name, creator.name as created_by_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users creator ON t.created_by = creator.id
    WHERE t.job_instance_id = ?
    ORDER BY t.task_number ASC
  `).all(instance.id);

  return c.json(tasks);
});

// 個別タスク取得
// 例: /dx-suishin/TEST-1/tasks/3
browseRoutes.get('/:slug/:instanceKey/tasks/:taskNumber', (c) => {
  const db = getDb();
  const { slug, instanceKey, taskNumber } = c.req.param();

  const match = instanceKey.match(/^([A-Z]+)-(\d+)$/);
  if (!match) {
    return c.json({ error: 'Invalid instance key format' }, 400);
  }
  const [, prefix, numberStr] = match;
  const instanceNumber = parseInt(numberStr, 10);
  const taskNum = parseInt(taskNumber, 10);

  const group = db.prepare('SELECT id FROM groups WHERE slug = ?').get(slug) as { id: string } | undefined;
  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  const instance = db.prepare(`
    SELECT ji.id
    FROM job_instances ji
    JOIN job_definitions jd ON ji.job_definition_id = jd.id
    WHERE ji.group_id = ? AND jd.prefix = ? AND ji.instance_number = ?
  `).get(group.id, prefix, instanceNumber) as { id: string } | undefined;

  if (!instance) {
    return c.json({ error: 'Job instance not found' }, 404);
  }

  const task = db.prepare(`
    SELECT t.*,
           u.name as assignee_name,
           creator.name as created_by_name,
           g.name as group_name,
           g.slug as group_slug,
           ji.fiscal_year,
           ji.instance_number,
           jd.name as job_name,
           jd.prefix as job_prefix
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users creator ON t.created_by = creator.id
    JOIN groups g ON t.group_id = g.id
    JOIN job_instances ji ON t.job_instance_id = ji.id
    JOIN job_definitions jd ON ji.job_definition_id = jd.id
    WHERE t.job_instance_id = ? AND t.task_number = ?
  `).get(instance.id, taskNum);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  // 子タスクを取得
  const children = db.prepare(`
    SELECT t.*, u.name as assignee_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.parent_task_id = ?
    ORDER BY t.task_number ASC
  `).all((task as any).id);

  return c.json({ ...task, children });
});
