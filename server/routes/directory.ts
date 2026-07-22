import { Hono } from 'hono';
import { searchUsers, searchGroups, isConfigured } from '../directory.js';

// Directory名簿のブラウザ向けプロキシ（メンバー追加UIの候補検索）。
// APIキーはサーバー内に留め、フロントには最小フィールドだけ返す
export const directoryRoutes = new Hono();

directoryRoutes.get('/search', async (c) => {
  const user = c.get('currentUser');
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  if (!isConfigured()) return c.json({ error: 'Directory未接続（開発環境）', users: [] }, 503);
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ users: [] });
  const users = await searchUsers(q, 20);
  return c.json({ users: users.map((u) => ({
    omuid: u.omuid, display_name: u.display_name, mail: u.mail, department: u.department,
  })) });
});

// 共有メールボックス検索（グループ連携先の候補）
directoryRoutes.get('/groups', async (c) => {
  const user = c.get('currentUser');
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  if (!isConfigured()) return c.json({ error: 'Directory未接続（開発環境）', groups: [] }, 503);
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ groups: [] });
  const groups = await searchGroups(q, 20);
  return c.json({ groups: groups.map((g) => ({
    group_code: g.group_code, display_name: g.display_name, mail: g.mail, member_count: g.member_count,
  })) });
});
