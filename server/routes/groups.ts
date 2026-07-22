import { Hono } from 'hono';
import { getDb } from '../db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { getGroup as getDirectoryGroup, getGroupMembers as getDirectoryGroupMembers, isConfigured as directoryConfigured } from '../directory.js';

export const groupsRoutes = new Hono();

// ══ Directory連携（P1: 共有メールボックス基底のメンバーミラー） ══
// 設計: document/omu-directory/2026-07-17_group-subscriptions-design.md
// - ミラー行は group_memberships.via='directory'（UI編集不可、正典はAD側）
// - 手動追加（via='manual'）は従来どおり共存。既に手動メンバーの人はミラーで上書きしない
const SYNC_TTL_MS = 60 * 60 * 1000; // 1時間。メンバー一覧の閲覧を契機にこの間隔で再同期

function requireGroupAdmin(db: any, groupId: string, userId: string | undefined): boolean {
  if (!userId) return false;
  const m = db.prepare('SELECT role FROM group_memberships WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId) as { role: string } | undefined;
  return !!m && (m.role === 'owner' || m.role === 'admin');
}

async function syncDirectoryMembers(db: any, group: { id: string; directory_group_code: string | null }) {
  const code = group.directory_group_code;
  if (!code || !directoryConfigured()) return { synced: false };
  const dirMembers = await getDirectoryGroupMembers(code); // 失敗はthrow（呼び出し側でcatch）

  const tx = db.transaction(() => {
    const desired = new Set<string>();
    for (const m of dirMembers) {
      if (!m.omuid) continue;
      // mail が無い名簿行はローカルユーザーを作れない（email NOT NULL）ためスキップ
      let u = db.prepare('SELECT id FROM users WHERE omuid = ?').get(m.omuid) as any;
      if (!u && m.mail) u = db.prepare('SELECT id FROM users WHERE email = ?').get(m.mail) as any;
      if (!u) {
        if (!m.mail) continue;
        const id = uuidv4();
        db.prepare('INSERT INTO users (id, email, name, auth_type, omuid) VALUES (?, ?, ?, ?, ?)')
          .run(id, m.mail, m.display_name || m.omuid, 'sso', m.omuid);
        u = { id };
      }
      desired.add(u.id);
      const existing = db.prepare('SELECT via, role FROM group_memberships WHERE group_id = ? AND user_id = ?')
        .get(group.id, u.id) as { via: string; role: string } | undefined;
      if (!existing) {
        db.prepare(`INSERT INTO group_memberships (id, group_id, user_id, role, via) VALUES (?, ?, ?, 'member', 'directory')`)
          .run(uuidv4(), group.id, u.id);
      }
      // 既存の手動メンバー（owner含む）はそのまま（viaを奪わない=連携解除で消えない）
    }
    // 名簿から消えた人のミラー行だけ削除（手動行は残る）
    const mirrored = db.prepare(`SELECT user_id FROM group_memberships WHERE group_id = ? AND via = 'directory'`)
      .all(group.id) as { user_id: string }[];
    for (const row of mirrored) {
      if (!desired.has(row.user_id)) {
        db.prepare(`DELETE FROM group_memberships WHERE group_id = ? AND user_id = ? AND via = 'directory'`)
          .run(group.id, row.user_id);
      }
    }
    db.prepare(`UPDATE groups SET directory_synced_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(group.id);
  });
  tx();
  return { synced: true, member_count: dirMembers.length };
}

// グループ一覧取得（メンバー数・進行中タスク数つき）
groupsRoutes.get('/', (c) => {
  const db = getDb();
  const groups = db.prepare(`
    SELECT g.*, u.name as created_by_name,
           (SELECT COUNT(*) FROM group_memberships WHERE group_id = g.id) as member_count,
           (SELECT COUNT(*) FROM tasks WHERE group_id = g.id AND status != 'completed') as active_tasks
    FROM groups g
    JOIN users u ON g.created_by = u.id
    WHERE COALESCE(g.is_personal, 0) = 0
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

  if (!group) return c.json({ error: 'Group not found' }, 404);
  return c.json(group);
});

// グループ作成
groupsRoutes.post('/', async (c) => {
  const db = getDb();
  const body = await c.req.json();
  const { name, slug, created_by } = body;

  if (!name || !created_by) {
    return c.json({ error: 'name and created_by are required' }, 400);
  }

  const groupId = uuidv4();
  // slug は必須（URL 解決がすべて slug 基準のため）。未指定なら名前から生成、
  // 日本語名などで空になる場合は id から生成
  const slugify = (s: string) =>
    s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  let finalSlug = (typeof slug === 'string' && slugify(slug)) || slugify(name) || `g-${groupId.slice(0, 8)}`;
  if (db.prepare('SELECT 1 FROM groups WHERE slug = ?').get(finalSlug)) {
    finalSlug = `${finalSlug}-${groupId.slice(0, 4)}`;
  }
  db.transaction(() => {
    db.prepare(`INSERT INTO groups (id, name, slug, created_by) VALUES (?, ?, ?, ?)`)
      .run(groupId, name, finalSlug, created_by);
    db.prepare(`INSERT INTO group_memberships (id, group_id, user_id, role) VALUES (?, ?, ?, 'owner')`)
      .run(uuidv4(), groupId, created_by);
    // 個人 (My) プロジェクトを自動作成
    db.prepare(`
      INSERT INTO projects (id, group_id, name, slug, is_personal, owner_user_id, created_by, icon, color)
      VALUES (?, ?, ?, ?, 1, ?, ?, '📌', '#f59e0b')
    `).run(uuidv4(), groupId, 'My', `my-${created_by.slice(0, 8)}`, created_by, created_by);
  })();

  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  return c.json(group, 201);
});

// グループ更新
groupsRoutes.put('/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json();
  const { name, slug } = body;

  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (slug !== undefined) { updates.push('slug = ?'); params.push(slug || null); }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }
  updates.push("updated_at = datetime('now')");
  params.push(id);

  try {
    const result = db.prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    if (result.changes === 0) return c.json({ error: 'Group not found' }, 404);
    return c.json(db.prepare('SELECT * FROM groups WHERE id = ?').get(id));
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'slug already exists' }, 409);
    }
    throw error;
  }
});

// グループ削除
groupsRoutes.delete('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const result = db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  if (result.changes === 0) return c.json({ error: 'Group not found' }, 404);
  return c.json({ success: true });
});

// === メンバー管理 ===

groupsRoutes.get('/:id/members', async (c) => {
  const db = getDb();
  const id = c.req.param('id');

  // 連携グループは閲覧を契機にTTL超過分を再同期（Directoryはローカル・キャッシュ済みで軽い）
  const group = db.prepare('SELECT id, directory_group_code, directory_synced_at FROM groups WHERE id = ?')
    .get(id) as { id: string; directory_group_code: string | null; directory_synced_at: string | null } | undefined;
  if (group?.directory_group_code) {
    const parsed = group.directory_synced_at ? Date.parse(group.directory_synced_at.replace(' ', 'T') + 'Z') : NaN;
    const last = Number.isNaN(parsed) ? 0 : parsed;
    if (Date.now() - last > SYNC_TTL_MS) {
      try { await syncDirectoryMembers(db, group); }
      catch (e) { console.error('directory member sync failed:', e); } // 失敗しても手元の名簿で続行
    }
  }

  const members = db.prepare(`
    SELECT u.id, u.email, u.name, u.auth_type, u.omuid, gm.role, gm.joined_at, gm.via
    FROM users u
    JOIN group_memberships gm ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at ASC
  `).all(id);
  return c.json(members);
});

// === Directory連携の設定・解除 ===

groupsRoutes.put('/:id/directory-link', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const user = c.get('currentUser') as { id: string } | undefined;
  if (!requireGroupAdmin(db, id, user?.id)) return c.json({ error: 'オーナー/管理者のみ設定できます' }, 403);

  const body = await c.req.json();
  const code = (body.group_code ?? '').trim();
  if (!code) return c.json({ error: 'group_code is required' }, 400);
  if (!directoryConfigured()) return c.json({ error: 'Directory未接続（開発環境）' }, 503);

  const dirGroup = await getDirectoryGroup(code);
  if (!dirGroup) return c.json({ error: '指定の共有メールボックスが見つかりません' }, 404);

  db.prepare(`UPDATE groups SET directory_group_code = ?, directory_group_name = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(dirGroup.group_code, dirGroup.display_name ?? dirGroup.group_code, id);

  try {
    const result = await syncDirectoryMembers(db, { id, directory_group_code: dirGroup.group_code });
    return c.json({ success: true, group_code: dirGroup.group_code, display_name: dirGroup.display_name, ...result });
  } catch (e) {
    console.error('initial directory sync failed:', e);
    return c.json({ success: true, group_code: dirGroup.group_code, display_name: dirGroup.display_name, synced: false });
  }
});

groupsRoutes.delete('/:id/directory-link', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const user = c.get('currentUser') as { id: string } | undefined;
  if (!requireGroupAdmin(db, id, user?.id)) return c.json({ error: 'オーナー/管理者のみ解除できます' }, 403);

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM group_memberships WHERE group_id = ? AND via = 'directory'`).run(id);
    db.prepare(`UPDATE groups SET directory_group_code = NULL, directory_group_name = NULL,
                directory_synced_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
  });
  tx();
  return c.json({ success: true });
});

groupsRoutes.post('/:id/directory-link/refresh', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const group = db.prepare('SELECT id, directory_group_code FROM groups WHERE id = ?').get(id) as any;
  if (!group?.directory_group_code) return c.json({ error: '連携されていません' }, 400);
  try {
    const result = await syncDirectoryMembers(db, group);
    return c.json({ success: true, ...result });
  } catch (e) {
    console.error('directory member sync failed:', e);
    return c.json({ error: 'Directoryとの同期に失敗しました' }, 502);
  }
});

groupsRoutes.post('/:id/members', async (c) => {
  const db = getDb();
  const groupId = c.req.param('id');
  const body = await c.req.json();
  let { user_id } = body;
  const { role = 'member', omuid, mail, display_name } = body;

  // Directory検索の候補から追加: ローカルユーザーをfind-or-create（omuidポインタ付き）
  // 氏名の正典はDirectory。ここで入るnameは表示キャッシュ（ログイン時リフレッシュ対象）
  if (!user_id && omuid && mail) {
    let u = db.prepare('SELECT id FROM users WHERE omuid = ? OR email = ?').get(omuid, mail) as any;
    if (!u) {
      const id = uuidv4();
      db.prepare('INSERT INTO users (id, email, name, auth_type, omuid) VALUES (?, ?, ?, ?, ?)')
        .run(id, mail, display_name || omuid, 'sso', omuid);
      u = { id };
    }
    user_id = u.id;
  }

  if (!user_id) return c.json({ error: 'user_id is required' }, 400);

  const membershipId = uuidv4();
  try {
    db.prepare(`INSERT INTO group_memberships (id, group_id, user_id, role) VALUES (?, ?, ?, ?)`)
      .run(membershipId, groupId, user_id, role);
    return c.json({ success: true, membership_id: membershipId }, 201);
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return c.json({ error: 'User already a member' }, 409);
    }
    throw error;
  }
});

groupsRoutes.patch('/:groupId/members/:userId/role', async (c) => {
  const db = getDb();
  const { groupId, userId } = c.req.param();
  const body = await c.req.json();
  const { role } = body;

  if (!role || !['admin', 'member', 'guest'].includes(role)) {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const membership = db.prepare(`SELECT role, via FROM group_memberships WHERE group_id = ? AND user_id = ?`)
    .get(groupId, userId) as { role: string; via: string } | undefined;
  if (!membership) return c.json({ error: 'Membership not found' }, 404);
  if (membership.role === 'owner') return c.json({ error: 'Cannot change owner role' }, 403);
  if (membership.via === 'directory') return c.json({ error: '連携メンバーのロールは変更できません（正典はAD側）' }, 403);

  db.prepare(`UPDATE group_memberships SET role = ? WHERE group_id = ? AND user_id = ?`)
    .run(role, groupId, userId);
  return c.json({ success: true });
});

groupsRoutes.delete('/:groupId/members/:userId', (c) => {
  const db = getDb();
  const { groupId, userId } = c.req.param();
  const membership = db.prepare(`SELECT role, via FROM group_memberships WHERE group_id = ? AND user_id = ?`)
    .get(groupId, userId) as { role: string; via: string } | undefined;
  if (!membership) return c.json({ error: 'Membership not found' }, 404);
  if (membership.role === 'owner') return c.json({ error: 'Cannot remove owner from group' }, 403);
  if (membership.via === 'directory') return c.json({ error: '連携メンバーは削除できません（連携解除で外れます）' }, 403);

  db.prepare(`DELETE FROM group_memberships WHERE group_id = ? AND user_id = ?`).run(groupId, userId);
  return c.json({ success: true });
});

// === タスク取得 ===

groupsRoutes.get('/:id/tasks', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const status = c.req.query('status');
  const parentOnly = c.req.query('parent_only') === 'true';

  let query = `
    SELECT t.*, u.name as assignee_name, u.omuid as assignee_omuid, creator.name as created_by_name,
           p.name as project_name, p.slug as project_slug, p.prefix as project_prefix,
           sec.title as section_title,
           r.rule_text as recurrence_text
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users creator ON t.created_by = creator.id
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks sec ON t.parent_task_id = sec.id AND sec.is_section = 1
    LEFT JOIN task_recurrences r ON r.task_id = t.id AND r.active = 1
    WHERE t.group_id = ? AND p.is_personal = 0
  `;
  const params: any[] = [id];

  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (parentOnly) query += ' AND t.parent_task_id IS NULL';
  query += ' ORDER BY t.due_date ASC, t.priority DESC';

  return c.json(db.prepare(query).all(...params));
});

// グループのプロジェクト一覧
groupsRoutes.get('/:id/projects', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const includePersonal = c.req.query('include_personal') === 'true';

  let query = `
    SELECT p.*,
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status != 'completed') as active_tasks,
           (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks
    FROM projects p
    WHERE p.group_id = ? AND p.archived = 0
  `;
  const params: any[] = [id];
  if (!includePersonal) {
    query += ' AND p.is_personal = 0';
  }
  query += ' ORDER BY p.sort_order ASC, p.created_at ASC';

  return c.json(db.prepare(query).all(...params));
});

// === タスク履歴 ===

groupsRoutes.get('/:id/history', (c) => {
  const db = getDb();
  const groupId = c.req.param('id');
  const limit = parseInt(c.req.query('limit') || '20');

  const history = db.prepare(`
    SELECT th.*, u.name as user_name, t.title as task_title, t.task_number
    FROM task_history th
    JOIN tasks t ON th.task_id = t.id
    JOIN users u ON th.user_id = u.id
    WHERE t.group_id = ?
    ORDER BY th.created_at DESC
    LIMIT ?
  `).all(groupId, limit);

  return c.json(history);
});
