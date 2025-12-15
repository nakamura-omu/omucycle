import Database from 'better-sqlite3';
import { schema } from './schema.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/omucycle.db');

// データディレクトリを作成
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Initializing database...');

// スキーマを実行
db.exec(schema);

console.log('Schema created successfully.');

// === マイグレーション ===
console.log('Running migrations...');

// 1. tasksテーブルのstatus CHECK制約を削除 & assignee_ids追加
const tasksTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
if (tasksTableInfo && tasksTableInfo.sql.includes("CHECK(status IN ('not_started', 'in_progress', 'completed'))")) {
  console.log('Migrating tasks table: removing status CHECK constraint...');

  // バックアップテーブルを作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks_new (
      id TEXT PRIMARY KEY,
      job_instance_id TEXT REFERENCES job_instances(id) ON DELETE SET NULL,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      task_template_id TEXT REFERENCES task_templates(id) ON DELETE SET NULL,
      parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      task_number INTEGER,
      depth INTEGER DEFAULT 0 CHECK(depth BETWEEN 0 AND 2),
      title TEXT NOT NULL,
      description TEXT,
      start_date TEXT,
      due_date TEXT,
      status TEXT DEFAULT 'not_started',
      priority TEXT CHECK(priority IN ('urgent', 'important', 'normal', 'none')) DEFAULT 'normal',
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      assignee_ids TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // データをコピー
  db.exec(`
    INSERT INTO tasks_new (id, job_instance_id, group_id, task_template_id, parent_task_id, task_number, depth, title, description, start_date, due_date, status, priority, assignee_id, created_by, created_at, updated_at)
    SELECT id, job_instance_id, group_id, task_template_id, parent_task_id, task_number, depth, title, description, start_date, due_date, status, priority, assignee_id, created_by, created_at, updated_at
    FROM tasks;
  `);

  // 古いテーブルを削除して新しいテーブルをリネーム
  db.exec('DROP TABLE tasks;');
  db.exec('ALTER TABLE tasks_new RENAME TO tasks;');

  // インデックスを再作成
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_task_group_id ON tasks(group_id);
    CREATE INDEX IF NOT EXISTS idx_task_assignee_id ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_task_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_task_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_task_parent_id ON tasks(parent_task_id);
  `);

  console.log('Tasks table migrated successfully.');
} else {
  // assignee_ids列がなければ追加
  const columns = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (!columns.find(c => c.name === 'assignee_ids')) {
    console.log('Adding assignee_ids column to tasks table...');
    db.exec('ALTER TABLE tasks ADD COLUMN assignee_ids TEXT;');
    console.log('assignee_ids column added.');
  }
}

// 2. task_templatesにrelative_days列を追加
const ttColumns = db.prepare("PRAGMA table_info(task_templates)").all() as { name: string }[];
if (!ttColumns.find(c => c.name === 'relative_days')) {
  console.log('Adding relative_days column to task_templates table...');
  db.exec('ALTER TABLE task_templates ADD COLUMN relative_days INTEGER DEFAULT 0;');
  console.log('relative_days column added.');
}

// 3. job_instancesにname列を追加
const jiColumns = db.prepare("PRAGMA table_info(job_instances)").all() as { name: string }[];
if (!jiColumns.find(c => c.name === 'name')) {
  console.log('Adding name column to job_instances table...');
  db.exec('ALTER TABLE job_instances ADD COLUMN name TEXT;');
  console.log('name column added.');
}

// 4. 既存グループにデフォルトステータスを追加
const groupsWithoutStatuses = db.prepare(`
  SELECT g.id FROM groups g
  WHERE NOT EXISTS (
    SELECT 1 FROM group_statuses gs WHERE gs.group_id = g.id
  )
`).all() as { id: string }[];

if (groupsWithoutStatuses.length > 0) {
  console.log(`Adding default statuses to ${groupsWithoutStatuses.length} groups...`);
  const insertStatus = db.prepare(`
    INSERT INTO group_statuses (id, group_id, key, label, color, sort_order, is_done)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const defaultStatuses = [
    { key: 'not_started', label: '未着手', color: '#94a3b8', sort_order: 0, is_done: 0 },
    { key: 'in_progress', label: '進行中', color: '#3b82f6', sort_order: 1, is_done: 0 },
    { key: 'completed', label: '完了', color: '#22c55e', sort_order: 2, is_done: 1 },
  ];

  for (const group of groupsWithoutStatuses) {
    for (const status of defaultStatuses) {
      insertStatus.run(uuidv4(), group.id, status.key, status.label, status.color, status.sort_order, status.is_done);
    }
  }
  console.log('Default statuses added.');
}

// 5. tasksにsort_order列を追加
const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
if (!taskColumns.find(c => c.name === 'sort_order')) {
  console.log('Adding sort_order column to tasks table...');
  db.exec('ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0;');
  console.log('sort_order column added.');
}

console.log('Migrations complete.');

// デモ用の初期データを挿入
const demoUserId = uuidv4();
const demoGroupId = uuidv4();

const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@example.com');

if (!existingUser) {
  console.log('Inserting demo data...');

  // デモユーザー
  db.prepare(`
    INSERT INTO users (id, email, name, auth_type)
    VALUES (?, ?, ?, ?)
  `).run(demoUserId, 'demo@example.com', 'デモユーザー', 'guest');

  // デモグループ
  db.prepare(`
    INSERT INTO groups (id, name, created_by)
    VALUES (?, ?, ?)
  `).run(demoGroupId, 'DX推進課', demoUserId);

  // メンバーシップ
  db.prepare(`
    INSERT INTO group_memberships (id, group_id, user_id, role)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), demoGroupId, demoUserId, 'owner');

  // デモ業務定義
  const jobDefId = uuidv4();
  db.prepare(`
    INSERT INTO job_definitions (id, group_id, name, category, typical_start_month, typical_duration_days, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(jobDefId, demoGroupId, '入学式準備', '式典系', 3, 30, '入学式の準備業務。式次第作成から当日運営まで。');

  // デモタスクテンプレート
  const taskTemplateId = uuidv4();
  db.prepare(`
    INSERT INTO task_templates (id, job_definition_id, depth, title, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(taskTemplateId, jobDefId, 0, '式次第作成', '入学式の式次第を作成');

  db.prepare(`
    INSERT INTO task_templates (id, job_definition_id, parent_template_id, depth, title, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), jobDefId, taskTemplateId, 1, '来賓リスト確認', '来賓の出席確認と挨拶順序の決定');

  // 年度業務インスタンス
  const jobInstanceId = uuidv4();
  db.prepare(`
    INSERT INTO job_instances (id, job_definition_id, group_id, fiscal_year, status, actual_start)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(jobInstanceId, jobDefId, demoGroupId, 2025, 'in_progress', '2025-03-01');

  // デモタスク
  const taskId = uuidv4();
  db.prepare(`
    INSERT INTO tasks (id, job_instance_id, group_id, depth, title, description, start_date, due_date, status, priority, assignee_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(taskId, jobInstanceId, demoGroupId, 0, '式次第作成', '入学式の式次第を作成する。昨年度のものをベースに変更点を反映。', '2025-03-01', '2025-03-20', 'not_started', 'urgent', demoUserId, demoUserId);

  db.prepare(`
    INSERT INTO tasks (id, job_instance_id, group_id, parent_task_id, depth, title, description, start_date, due_date, status, priority, assignee_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), jobInstanceId, demoGroupId, taskId, 1, '来賓挨拶順確認', '来賓の挨拶順序を確認する', '2025-03-05', '2025-03-15', 'not_started', 'important', demoUserId, demoUserId);

  // デモコメント
  db.prepare(`
    INSERT INTO task_comments (id, task_id, user_id, content)
    VALUES (?, ?, ?, ?)
  `).run(uuidv4(), taskId, demoUserId, '昨年度の式次第を参考に作成開始します。');

  console.log('Demo data inserted successfully.');
} else {
  console.log('Demo data already exists, skipping...');
}

db.close();
console.log('Database initialization complete!');
console.log(`Database location: ${dbPath}`);
