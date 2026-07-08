import { Hono } from 'hono';
import { getDb } from '../db/connection.js';

export const browseRoutes = new Hono();

// グループ取得（slug）
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
  if (!group) return c.json({ error: 'Group not found' }, 404);
  return c.json(group);
});

// プロジェクト取得（groupSlug + projectSlug）
browseRoutes.get('/:groupSlug/projects/:projectSlug', (c) => {
  const db = getDb();
  const { groupSlug, projectSlug } = c.req.param();
  const project = db.prepare(`
    SELECT p.*, g.slug as group_slug, g.name as group_name
    FROM projects p
    JOIN groups g ON p.group_id = g.id
    WHERE g.slug = ? AND p.slug = ?
  `).get(groupSlug, projectSlug);
  if (!project) return c.json({ error: 'Project not found' }, 404);
  return c.json(project);
});

// タスク取得（T-N 形式）
// 例: /dx-suishin/projects/admission-ceremony/tasks/3
browseRoutes.get('/:groupSlug/projects/:projectSlug/tasks/:taskNumber{[0-9]+}', (c) => {
  const db = getDb();
  const { groupSlug, projectSlug, taskNumber } = c.req.param();
  const taskNum = parseInt(taskNumber, 10);

  const project = db.prepare(`
    SELECT p.id FROM projects p
    JOIN groups g ON p.group_id = g.id
    WHERE g.slug = ? AND p.slug = ?
  `).get(groupSlug, projectSlug) as { id: string } | undefined;
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name, creator.name as created_by_name,
           p.name as project_name, p.slug as project_slug, p.prefix as project_prefix,
           g.name as group_name, g.slug as group_slug,
           c.name as cycle_name, c.cycle_number
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users creator ON t.created_by = creator.id
    JOIN projects p ON t.project_id = p.id
    JOIN groups g ON t.group_id = g.id
    LEFT JOIN cycles c ON t.cycle_id = c.id
    WHERE t.project_id = ? AND t.task_number = ?
  `).get(project.id, taskNum);
  if (!task) return c.json({ error: 'Task not found' }, 404);

  const children = db.prepare(`
    SELECT t.*, u.name as assignee_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.parent_task_id = ?
    ORDER BY t.sort_order ASC, t.created_at ASC
  `).all((task as any).id);

  return c.json({ ...task, children });
});

// サイクル取得（cycle_number ベース）
browseRoutes.get('/:groupSlug/projects/:projectSlug/cycles/:cycleNumber{[0-9]+}', (c) => {
  const db = getDb();
  const { groupSlug, projectSlug, cycleNumber } = c.req.param();
  const num = parseInt(cycleNumber, 10);

  const cycle = db.prepare(`
    SELECT c.*, p.name as project_name, p.slug as project_slug
    FROM cycles c
    JOIN projects p ON c.project_id = p.id
    JOIN groups g ON p.group_id = g.id
    WHERE g.slug = ? AND p.slug = ? AND c.cycle_number = ?
  `).get(groupSlug, projectSlug, num);
  if (!cycle) return c.json({ error: 'Cycle not found' }, 404);
  return c.json(cycle);
});
