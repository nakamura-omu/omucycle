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
    INSERT INTO task_templates (id, job_definition_id, depth, title, relative_days, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(taskTemplateId, jobDefId, 0, '式次第作成', 0, '入学式の式次第を作成');

  db.prepare(`
    INSERT INTO task_templates (id, job_definition_id, parent_template_id, depth, title, relative_days, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), jobDefId, taskTemplateId, 1, '来賓リスト確認', 5, '来賓の出席確認と挨拶順序の決定');

  // 年度業務インスタンス
  const jobInstanceId = uuidv4();
  db.prepare(`
    INSERT INTO job_instances (id, job_definition_id, group_id, fiscal_year, status, actual_start)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(jobInstanceId, jobDefId, demoGroupId, 2025, 'in_progress', '2025-03-01');

  // デモタスク
  const taskId = uuidv4();
  db.prepare(`
    INSERT INTO tasks (id, job_instance_id, group_id, depth, title, description, due_date, status, priority, assignee_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(taskId, jobInstanceId, demoGroupId, 0, '式次第作成', '入学式の式次第を作成する。昨年度のものをベースに変更点を反映。', '2025-03-20', 'not_started', 'urgent', demoUserId, demoUserId);

  db.prepare(`
    INSERT INTO tasks (id, job_instance_id, group_id, parent_task_id, depth, title, description, due_date, status, priority, assignee_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), jobInstanceId, demoGroupId, taskId, 1, '来賓挨拶順確認', '来賓の挨拶順序を確認する', '2025-03-15', 'not_started', 'important', demoUserId, demoUserId);

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
