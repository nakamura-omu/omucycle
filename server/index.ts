import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getDb } from './db/connection.js';
import { v4 as uuidv4 } from 'uuid';
import { usersRoutes } from './routes/users.js';
import { groupsRoutes } from './routes/groups.js';
import { tasksRoutes } from './routes/tasks.js';
import { projectsRoutes } from './routes/projects.js';
import { cyclesRoutes } from './routes/cycles.js';
import { wikiRoutes } from './routes/wiki.js';
import { notificationsRoutes } from './routes/notifications.js';
import { browseRoutes } from './routes/browse.js';
import { atlasRoutes } from './routes/atlas.js';
import { aiRoutes } from './routes/ai.js';

const app = new Hono();

app.use('*', logger());

// CORS: 大学アプリ等の外部利用にも開く（環境変数で許可オリジン追加可能）
const allowedOrigins = [
  'http://localhost:5180',
  'http://127.0.0.1:5180',
  'https://dxtools.cii.omu.ac.jp',
  'https://dxtools.omu.ac.jp',
  ...(process.env.CORS_ALLOW_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? []),
];
app.use('*', cors({
  origin: allowedOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Auth-Email', 'X-Auth-Name', 'X-Api-Key'],
  credentials: true,
}));

// 認証ミドルウェア: Entra ID 連携 or APIキー
app.use('/api/*', async (c, next) => {
  // 1) APIキー認証（外部アプリ用）— OMUCYCLE_API_KEYS=key1,key2 の形式で環境変数登録
  const apiKey = c.req.header('X-Api-Key');
  if (apiKey) {
    const validKeys = (process.env.OMUCYCLE_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (validKeys.includes(apiKey)) {
      c.set('apiKeyAuth', true);
      // X-On-Behalf-Of ヘッダで代理ユーザー指定可
      const onBehalfOf = c.req.header('X-On-Behalf-Of');
      if (onBehalfOf) {
        const db = getDb();
        const u = db.prepare('SELECT id, email, name, auth_type FROM users WHERE email = ?').get(onBehalfOf) as any;
        if (u) c.set('currentUser', u);
      }
    } else {
      return c.json({ error: 'Invalid API key' }, 401);
    }
  }

  // 2) Entra ID ヘッダ認証（nginx 経由）
  const email = c.req.header('X-Auth-Email');
  const encodedName = c.req.header('X-Auth-Name');
  if (email && !c.get('currentUser')) {
    const name = encodedName ? decodeURIComponent(encodedName) : email.split('@')[0];
    const db = getDb();
    let user = db.prepare('SELECT id, email, name, auth_type FROM users WHERE email = ?').get(email) as any;
    if (!user) {
      const id = uuidv4();
      db.prepare('INSERT INTO users (id, email, name, auth_type) VALUES (?, ?, ?, ?)').run(id, email, name, 'sso');
      user = { id, email, name, auth_type: 'sso' };
      console.log(`Auto-created SSO user: ${email} (${name})`);
    }
    ensurePersonalSpace(user.id, name);
    c.set('currentUser', user);
  }
  await next();
});

// 個人グループ + My プロジェクトを ensure
function ensurePersonalSpace(userId: string, userName: string): {
  groupId: string; projectId: string;
} {
  const db = getDb();
  const existing = db.prepare(
    `SELECT id, group_id FROM projects WHERE owner_user_id = ? AND is_personal = 1 LIMIT 1`
  ).get(userId) as { id: string; group_id: string } | undefined;
  if (existing) return { groupId: existing.group_id, projectId: existing.id };

  let group = db.prepare(
    `SELECT g.id FROM groups g
     JOIN group_memberships m ON m.group_id = g.id
     WHERE m.user_id = ? AND m.role = 'owner' AND g.name LIKE '%個人スペース%'
     LIMIT 1`
  ).get(userId) as { id: string } | undefined;

  if (!group) {
    const groupId = uuidv4();
    const baseSlug = `personal-${userId.slice(0, 8)}`;
    db.prepare(`INSERT INTO groups (id, name, slug, created_by) VALUES (?, ?, ?, ?)`)
      .run(groupId, `${userName} の個人スペース`, baseSlug, userId);
    db.prepare(`INSERT INTO group_memberships (id, group_id, user_id, role) VALUES (?, ?, ?, 'owner')`)
      .run(uuidv4(), groupId, userId);
    group = { id: groupId };
  }

  const projectId = uuidv4();
  const projSlug = `my-${userId.slice(0, 8)}`;
  db.prepare(`
    INSERT INTO projects (id, group_id, name, slug, is_personal, owner_user_id, icon, color, created_by)
    VALUES (?, ?, 'My', ?, 1, ?, '📌', '#f59e0b', ?)
  `).run(projectId, group.id, projSlug, userId, userId);

  return { groupId: group.id, projectId };
}

(globalThis as any).__ensurePersonalSpace = ensurePersonalSpace;

app.get('/', (c) => c.json({ name: 'OmuCycle API', version: '0.2.0', status: 'running', api_versions: ['v1'] }));
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/api/me', (c) => {
  const user = c.get('currentUser');
  if (!user) return c.json({ error: 'Not authenticated' }, 401);
  return c.json(user);
});

// 既存パス互換 + バージョン付きパスも提供
const mountAll = (basePath: string) => {
  app.route(`${basePath}/users`, usersRoutes);
  app.route(`${basePath}/groups`, groupsRoutes);
  app.route(`${basePath}/projects`, projectsRoutes);
  app.route(`${basePath}/cycles`, cyclesRoutes);
  app.route(`${basePath}/tasks`, tasksRoutes);
  app.route(`${basePath}/wiki`, wikiRoutes);
  app.route(`${basePath}/notifications`, notificationsRoutes);
  app.route(`${basePath}/browse`, browseRoutes);
  app.route(`${basePath}/atlas`, atlasRoutes);
  app.route(`${basePath}/ai`, aiRoutes);
};

mountAll('/api');     // 既存パス（フロントが使用中）
mountAll('/api/v1');  // バージョン明示パス（外部アプリ向け、将来 v2 を出しても v1 を維持）

const PORT = parseInt(process.env.API_PORT || '3180');
console.log(`Starting OmuCycle API server on port ${PORT}...`);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`OmuCycle API server running at http://localhost:${info.port}`);
});
