// 業務サイクル管理システム DBスキーマ

export const schema = `
-- ユーザー
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  auth_type TEXT CHECK(auth_type IN ('sso', 'guest')) NOT NULL DEFAULT 'guest',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- グループ
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  invite_token TEXT,
  invite_password TEXT,
  invite_token_expires TEXT,
  is_public_templates INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- グループメンバーシップ
CREATE TABLE IF NOT EXISTS group_memberships (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('owner', 'admin', 'member', 'guest')) NOT NULL DEFAULT 'member',
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(group_id, user_id)
);

-- 業務定義（テンプレート）
CREATE TABLE IF NOT EXISTS job_definitions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT,
  category TEXT,
  typical_start_month INTEGER CHECK(typical_start_month BETWEEN 1 AND 12),
  typical_start_week INTEGER CHECK(typical_start_week BETWEEN 1 AND 5),
  typical_duration_days INTEGER,
  owner_role TEXT,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- タスクテンプレート
CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  job_definition_id TEXT NOT NULL REFERENCES job_definitions(id) ON DELETE CASCADE,
  parent_template_id TEXT REFERENCES task_templates(id) ON DELETE SET NULL,
  depth INTEGER DEFAULT 0 CHECK(depth BETWEEN 0 AND 2),
  title TEXT NOT NULL,
  relative_days INTEGER DEFAULT 0,
  description TEXT,
  default_assignee_role TEXT,
  default_assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  default_assignee_ids TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- テンプレート公開
CREATE TABLE IF NOT EXISTS template_shares (
  id TEXT PRIMARY KEY,
  job_definition_id TEXT UNIQUE NOT NULL REFERENCES job_definitions(id) ON DELETE CASCADE,
  published_name TEXT NOT NULL,
  tags TEXT,
  is_public INTEGER DEFAULT 0,
  published_at TEXT
);

-- 年度業務インスタンス
CREATE TABLE IF NOT EXISTS job_instances (
  id TEXT PRIMARY KEY,
  job_definition_id TEXT REFERENCES job_definitions(id) ON DELETE SET NULL,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  instance_number INTEGER,
  fiscal_year INTEGER NOT NULL,
  actual_start TEXT,
  actual_end TEXT,
  status TEXT CHECK(status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- タスク
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  job_instance_id TEXT REFERENCES job_instances(id) ON DELETE SET NULL,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  task_template_id TEXT REFERENCES task_templates(id) ON DELETE SET NULL,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  task_number INTEGER,
  depth INTEGER DEFAULT 0 CHECK(depth BETWEEN 0 AND 2),
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  status TEXT CHECK(status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
  priority TEXT CHECK(priority IN ('urgent', 'important', 'normal', 'none')) DEFAULT 'normal',
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- タスクコメント
CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  is_ai_generated INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 判断ログ（AI意思決定）
CREATE TABLE IF NOT EXISTS decision_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  conversation TEXT, -- JSON
  final_prompt TEXT,
  final_response TEXT,
  operations TEXT, -- JSON
  committed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ナレッジ
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  job_definition_id TEXT REFERENCES job_definitions(id) ON DELETE SET NULL,
  source_decision_log_id TEXT REFERENCES decision_logs(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- グループファイル
CREATE TABLE IF NOT EXISTS group_files (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- タスク添付
CREATE TABLE IF NOT EXISTS task_attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES group_files(id) ON DELETE CASCADE,
  attached_by TEXT NOT NULL REFERENCES users(id),
  attached_at TEXT DEFAULT (datetime('now'))
);

-- カレンダー表示設定
CREATE TABLE IF NOT EXISTS calendar_views (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  color TEXT DEFAULT '#3B82F6',
  is_visible INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(user_id, group_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_task_group_id ON tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_task_assignee_id ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_task_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_task_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_parent_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_membership_user_id ON group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_group_id ON group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_comment_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_decision_log_task_id ON decision_logs(task_id);
`;
