import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const workflowRulesRoutes = new Hono();

// ルール一覧取得
workflowRulesRoutes.get('/job-definitions/:jobId/rules', (c) => {
  const db = getDb();
  const jobId = c.req.param('jobId');

  const rules = db.prepare(`
    SELECT * FROM workflow_rules
    WHERE job_definition_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(jobId);

  // JSONをパース
  const parsedRules = rules.map((r: any) => ({
    ...r,
    trigger_config: r.trigger_config ? JSON.parse(r.trigger_config) : null,
    action_config: r.action_config ? JSON.parse(r.action_config) : null,
  }));

  return c.json(parsedRules);
});

// ルール追加
workflowRulesRoutes.post('/job-definitions/:jobId/rules', async (c) => {
  const db = getDb();
  const jobId = c.req.param('jobId');
  const body = await c.req.json();

  const { name, trigger_type, trigger_config, action_type, action_config, sort_order } = body;

  if (!name || !trigger_type || !action_type) {
    return c.json({ error: 'name, trigger_type, action_type are required' }, 400);
  }

  // 業務定義の存在確認
  const jobDef = db.prepare('SELECT id FROM job_definitions WHERE id = ?').get(jobId);
  if (!jobDef) {
    return c.json({ error: 'Job definition not found' }, 404);
  }

  const id = uuidv4();

  db.prepare(`
    INSERT INTO workflow_rules (
      id, job_definition_id, name, trigger_type, trigger_config,
      action_type, action_config, sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, jobId, name, trigger_type,
    trigger_config ? JSON.stringify(trigger_config) : null,
    action_type,
    action_config ? JSON.stringify(action_config) : null,
    sort_order || 0
  );

  const rule = db.prepare('SELECT * FROM workflow_rules WHERE id = ?').get(id) as any;

  return c.json({
    ...rule,
    trigger_config: rule.trigger_config ? JSON.parse(rule.trigger_config) : null,
    action_config: rule.action_config ? JSON.parse(rule.action_config) : null,
  }, 201);
});

// ルール更新
workflowRulesRoutes.put('/workflow-rules/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();

  const allowedFields = ['name', 'trigger_type', 'trigger_config', 'action_type', 'action_config', 'is_active', 'sort_order'];
  const updates: string[] = [];
  const params: any[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      if (field === 'trigger_config' || field === 'action_config') {
        params.push(body[field] ? JSON.stringify(body[field]) : null);
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
    UPDATE workflow_rules
    SET ${updates.join(', ')}
    WHERE id = ?
  `).run(...params);

  if (result.changes === 0) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  const rule = db.prepare('SELECT * FROM workflow_rules WHERE id = ?').get(id) as any;

  return c.json({
    ...rule,
    trigger_config: rule.trigger_config ? JSON.parse(rule.trigger_config) : null,
    action_config: rule.action_config ? JSON.parse(rule.action_config) : null,
  });
});

// ルール削除
workflowRulesRoutes.delete('/workflow-rules/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');

  const result = db.prepare('DELETE FROM workflow_rules WHERE id = ?').run(id);

  if (result.changes === 0) {
    return c.json({ error: 'Rule not found' }, 404);
  }

  return c.json({ success: true });
});
