import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const groupStatusesRoutes = new Hono();

// デフォルトステータス定義
const DEFAULT_STATUSES = [
  { key: 'not_started', label: '未着手', color: '#94a3b8', sort_order: 0, is_done: 0 },
  { key: 'in_progress', label: '進行中', color: '#3b82f6', sort_order: 1, is_done: 0 },
  { key: 'completed', label: '完了', color: '#22c55e', sort_order: 2, is_done: 1 },
];

// グループのステータス一覧取得
groupStatusesRoutes.get('/:id/statuses', (c) => {
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
groupStatusesRoutes.post('/:id/statuses', async (c) => {
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
groupStatusesRoutes.put('/:groupId/statuses/:statusId', async (c) => {
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
groupStatusesRoutes.delete('/:groupId/statuses/:statusId', (c) => {
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
groupStatusesRoutes.put('/:id/statuses/reorder', async (c) => {
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

// デフォルトステータスをエクスポート（グループ作成時に使用）
export { DEFAULT_STATUSES };
