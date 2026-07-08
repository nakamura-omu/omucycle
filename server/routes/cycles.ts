import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const cyclesRoutes = new Hono();

cyclesRoutes.get('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const cycle = db.prepare(`
    SELECT c.*, p.name as project_name, p.slug as project_slug
    FROM cycles c
    JOIN projects p ON c.project_id = p.id
    WHERE c.id = ?
  `).get(id);
  if (!cycle) return c.json({ error: 'Cycle not found' }, 404);

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress
    FROM tasks WHERE cycle_id = ?
  `).get(id);

  return c.json({ ...cycle, stats });
});

cyclesRoutes.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { project_id, name, description, start_date, end_date, status, created_by } = body;

  if (!project_id || !name || !start_date || !end_date || !created_by) {
    return c.json({ error: 'project_id, name, start_date, end_date, created_by are required' }, 400);
  }

  const project = db.prepare(`SELECT next_cycle_number FROM projects WHERE id = ?`).get(project_id) as
    { next_cycle_number: number } | undefined;
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const id = uuidv4();
  const cycleNumber = (project.next_cycle_number ?? 0) + 1;

  db.transaction(() => {
    db.prepare(`
      INSERT INTO cycles (id, project_id, cycle_number, name, description,
                         start_date, end_date, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, project_id, cycleNumber, name, description ?? null,
           start_date, end_date, status ?? 'upcoming', created_by);
    db.prepare(`UPDATE projects SET next_cycle_number = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(cycleNumber, project_id);
  })();

  return c.json(db.prepare('SELECT * FROM cycles WHERE id = ?').get(id), 201);
});

cyclesRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const allowed = ['name', 'description', 'start_date', 'end_date', 'status', 'sort_order'];
  const updates: string[] = [];
  const params: any[] = [];

  for (const f of allowed) {
    if (body[f] !== undefined) { updates.push(`${f} = ?`); params.push(body[f]); }
  }
  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400);
  updates.push("updated_at = datetime('now')");
  params.push(id);

  const result = db.prepare(`UPDATE cycles SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  if (result.changes === 0) return c.json({ error: 'Cycle not found' }, 404);
  return c.json(db.prepare('SELECT * FROM cycles WHERE id = ?').get(id));
});

cyclesRoutes.delete('/:id', (c) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM cycles WHERE id = ?').run(c.req.param('id'));
  if (result.changes === 0) return c.json({ error: 'Cycle not found' }, 404);
  return c.json({ success: true });
});

cyclesRoutes.get('/:id/tasks', (c) => {
  const db = getDb();
  return c.json(db.prepare(`
    SELECT t.*, u.name as assignee_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.cycle_id = ?
    ORDER BY t.sort_order ASC, t.due_date ASC
  `).all(c.req.param('id')));
});
