import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const atlasRoutes = new Hono();

// === グループのアトラスデータ取得 ===
// project_id クエリ無し → グループレイヤー（project_id NULL のもの）
// project_id 指定 → そのプロジェクト内
atlasRoutes.get('/groups/:groupId', (c) => {
  const db = getDb();
  const groupId = c.req.param('groupId');
  const projectId = c.req.query('project_id'); // undefined なら group level

  const projectFilter = projectId ? 'project_id = ?' : 'project_id IS NULL';
  const params: any[] = projectId ? [groupId, projectId] : [groupId];

  const annotations = db.prepare(`
    SELECT a.*, u.name as created_by_name
    FROM atlas_annotations a LEFT JOIN users u ON a.created_by = u.id
    WHERE a.group_id = ? AND a.${projectFilter}
    ORDER BY a.created_at ASC
  `).all(...params);

  const links = db.prepare(`
    SELECT * FROM atlas_links WHERE group_id = ? AND ${projectFilter}
  `).all(...params);

  const layout = db.prepare(`
    SELECT * FROM atlas_layout WHERE group_id = ? AND ${projectFilter}
  `).all(...params);

  const drawings = db.prepare(`
    SELECT * FROM atlas_drawings WHERE group_id = ? AND ${projectFilter}
  `).all(...params);

  return c.json({ annotations, links, layout, drawings });
});

// === 注釈 ===
atlasRoutes.post('/groups/:groupId/annotations', async (c) => {
  const user = c.get('currentUser') as { id: string } | undefined;
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const db = getDb();
  const groupId = c.req.param('groupId');
  const body = await c.req.json();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO atlas_annotations (id, group_id, project_id, text, x, y, width, height, color, rotation, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, groupId, body.project_id ?? null,
    body.text ?? '',
    body.x ?? 0, body.y ?? 0,
    body.width ?? 200, body.height ?? 100,
    body.color ?? 0,
    body.rotation ?? (Math.random() - 0.5) * 4,
    user.id
  );
  return c.json(db.prepare(`
    SELECT a.*, u.name as created_by_name FROM atlas_annotations a
    LEFT JOIN users u ON a.created_by = u.id WHERE a.id = ?
  `).get(id), 201);
});

atlasRoutes.patch('/annotations/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const fields: string[] = [];
  const params: any[] = [];
  for (const k of ['text', 'x', 'y', 'width', 'height', 'color', 'rotation'] as const) {
    if (body[k] !== undefined) { fields.push(`${k} = ?`); params.push(body[k]); }
  }
  if (fields.length === 0) return c.json({ error: 'No fields' }, 400);
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE atlas_annotations SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return c.json(db.prepare('SELECT * FROM atlas_annotations WHERE id = ?').get(id));
});

atlasRoutes.delete('/annotations/:id', (c) => {
  const db = getDb();
  db.prepare('DELETE FROM atlas_annotations WHERE id = ?').run(c.req.param('id'));
  return c.json({ success: true });
});

// === レイアウト ===
atlasRoutes.put('/groups/:groupId/layout/:nodeType/:nodeId', async (c) => {
  const db = getDb();
  const groupId = c.req.param('groupId');
  const nodeType = c.req.param('nodeType');
  const nodeId = c.req.param('nodeId');
  const body = await c.req.json();
  db.prepare(`
    INSERT INTO atlas_layout (group_id, project_id, node_type, node_id, x, y, width, height)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id, node_type, node_id) DO UPDATE SET
      project_id = excluded.project_id,
      x = excluded.x, y = excluded.y,
      width = excluded.width, height = excluded.height
  `).run(
    groupId, body.project_id ?? null, nodeType, nodeId,
    body.x ?? 0, body.y ?? 0, body.width ?? null, body.height ?? null,
  );
  return c.json({ success: true });
});

atlasRoutes.delete('/groups/:groupId/layout/:nodeType/:nodeId', (c) => {
  const db = getDb();
  db.prepare(`DELETE FROM atlas_layout WHERE group_id = ? AND node_type = ? AND node_id = ?`)
    .run(c.req.param('groupId'), c.req.param('nodeType'), c.req.param('nodeId'));
  return c.json({ success: true });
});

// === リンク（汎用関係線） ===
atlasRoutes.post('/groups/:groupId/links', async (c) => {
  const db = getDb();
  const groupId = c.req.param('groupId');
  const body = await c.req.json();
  const { project_id, from_type, from_id, to_type, to_id, kind = 'relates' } = body;
  if (!from_type || !from_id || !to_type || !to_id) {
    return c.json({ error: 'from_type, from_id, to_type, to_id required' }, 400);
  }
  if (from_type === to_type && from_id === to_id) {
    return c.json({ error: 'Self link not allowed' }, 400);
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO atlas_links (id, group_id, project_id, from_type, from_id, to_type, to_id, kind)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, groupId, project_id ?? null, from_type, from_id, to_type, to_id, kind);
  return c.json(db.prepare('SELECT * FROM atlas_links WHERE id = ?').get(id), 201);
});

atlasRoutes.delete('/links/:id', (c) => {
  const db = getDb();
  db.prepare('DELETE FROM atlas_links WHERE id = ?').run(c.req.param('id'));
  return c.json({ success: true });
});

// === 描画（ペンツール） ===
atlasRoutes.post('/groups/:groupId/drawings', async (c) => {
  const user = c.get('currentUser') as { id: string } | undefined;
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const db = getDb();
  const groupId = c.req.param('groupId');
  const body = await c.req.json();
  if (!Array.isArray(body.points) || body.points.length < 2) {
    return c.json({ error: 'points required (>=2 points)' }, 400);
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO atlas_drawings (id, group_id, project_id, points, color, stroke_width, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, groupId, body.project_id ?? null,
    JSON.stringify(body.points),
    body.color ?? '#1f2937',
    body.stroke_width ?? 2,
    user.id
  );
  return c.json(db.prepare('SELECT * FROM atlas_drawings WHERE id = ?').get(id), 201);
});

atlasRoutes.delete('/drawings/:id', (c) => {
  const db = getDb();
  db.prepare('DELETE FROM atlas_drawings WHERE id = ?').run(c.req.param('id'));
  return c.json({ success: true });
});
