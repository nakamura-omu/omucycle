import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { usersRoutes } from './routes/users.js';
import { groupsRoutes } from './routes/groups.js';
import { tasksRoutes } from './routes/tasks.js';
import { jobDefinitionsRoutes } from './routes/job-definitions.js';
import { browseRoutes } from './routes/browse.js';

const app = new Hono();

// ミドルウェア
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:5180', 'http://127.0.0.1:5180'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ヘルスチェック
app.get('/', (c) => {
  return c.json({
    name: 'OmuCycle API',
    version: '0.1.0',
    status: 'running',
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API ルート
app.route('/api/users', usersRoutes);
app.route('/api/groups', groupsRoutes);
app.route('/api/tasks', tasksRoutes);
app.route('/api/job-definitions', jobDefinitionsRoutes);
app.route('/api/browse', browseRoutes);

// サーバー起動
const PORT = parseInt(process.env.API_PORT || '3180');

console.log(`Starting OmuCycle API server on port ${PORT}...`);
console.log(`  - Mastra is running on port 4111`);
console.log(`  - Frontend dev server will be on port 5180`);

serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`OmuCycle API server running at http://localhost:${info.port}`);
});
