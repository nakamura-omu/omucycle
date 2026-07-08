import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';

export const notificationsRoutes = new Hono();

// 自分宛の通知一覧
notificationsRoutes.get('/', (c) => {
  const user = c.get('currentUser') as { id: string } | undefined;
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const onlyUnread = c.req.query('unread') === 'true';
  const limit = parseInt(c.req.query('limit') || '100');

  const db = getDb();
  let query = `
    SELECT n.*, a.name as actor_name, g.name as group_name, g.slug as group_slug,
           p.name as project_name, p.slug as project_slug
    FROM notifications n
    LEFT JOIN users a ON n.actor_user_id = a.id
    LEFT JOIN groups g ON n.group_id = g.id
    LEFT JOIN projects p ON n.project_id = p.id
    WHERE n.user_id = ?
  `;
  const params: any[] = [user.id];
  if (onlyUnread) query += ' AND n.read_at IS NULL';
  query += ' ORDER BY n.created_at DESC LIMIT ?';
  params.push(limit);

  return c.json(db.prepare(query).all(...params));
});

// グループごと未読サマリ
notificationsRoutes.get('/summary', (c) => {
  const user = c.get('currentUser') as { id: string } | undefined;
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const db = getDb();

  const byGroup = db.prepare(`
    SELECT group_id, COUNT(*) as unread_count
    FROM notifications
    WHERE user_id = ? AND read_at IS NULL AND group_id IS NOT NULL
    GROUP BY group_id
  `).all(user.id);

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL
  `).get(user.id) as { count: number };

  return c.json({ total: total.count, by_group: byGroup });
});

// 既読化
notificationsRoutes.post('/:id/read', (c) => {
  const user = c.get('currentUser') as { id: string } | undefined;
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const db = getDb();
  db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(c.req.param('id'), user.id);
  return c.json({ success: true });
});

// 全既読
notificationsRoutes.post('/mark-all-read', (c) => {
  const user = c.get('currentUser') as { id: string } | undefined;
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  const db = getDb();
  db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`)
    .run(user.id);
  return c.json({ success: true });
});

// 内部用: 通知作成（他のルートから呼ぶためのヘルパも兼ねる）
export function createNotification(opts: {
  user_id: string;
  kind: string;
  ref_type: string;
  ref_id: string;
  group_id?: string | null;
  project_id?: string | null;
  actor_user_id?: string | null;
  title?: string | null;
  body?: string | null;
}) {
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO notifications (id, user_id, kind, ref_type, ref_id, group_id, project_id,
                              actor_user_id, title, body)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, opts.user_id, opts.kind, opts.ref_type, opts.ref_id,
         opts.group_id ?? null, opts.project_id ?? null,
         opts.actor_user_id ?? null, opts.title ?? null, opts.body ?? null);
  return id;
}
