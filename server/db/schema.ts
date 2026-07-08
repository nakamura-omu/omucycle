// 業務サイクル管理システム DBスキーマ（2026-05 大改修版）

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

-- プロジェクト
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  parent_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  prefix TEXT,
  description TEXT,
  icon TEXT,
  color TEXT,
  archived INTEGER DEFAULT 0,
  is_personal INTEGER DEFAULT 0,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  next_task_number INTEGER DEFAULT 0,
  next_cycle_number INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(group_id, slug)
);

-- プロジェクトメンバー
-- レコードなし → グループ全員アクセス可
-- レコードあり → 登録ユーザーのみアクセス可
CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('viewer','member','admin')) DEFAULT 'member',
  PRIMARY KEY (project_id, user_id)
);

-- サイクル（プロジェクト単位、Plane 風）
CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT CHECK(status IN ('upcoming','active','completed')) DEFAULT 'upcoming',
  sort_order INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, cycle_number)
);

-- タスク
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  task_number INTEGER NOT NULL,
  depth INTEGER DEFAULT 0 CHECK(depth BETWEEN 0 AND 4),
  is_section INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT,
  due_date TEXT,
  status TEXT CHECK(status IN ('not_started','in_progress','completed')) NOT NULL DEFAULT 'not_started',
  priority TEXT CHECK(priority IN ('urgent','important','normal','none')) DEFAULT 'normal',
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  assignee_ids TEXT,
  labels TEXT,
  current_progress INTEGER DEFAULT 0,
  completed_at TEXT,
  sort_order INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, task_number)
);

-- 進捗ログ
CREATE TABLE IF NOT EXISTS task_progress_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  progress_percent INTEGER CHECK(progress_percent BETWEEN 0 AND 100),
  note TEXT,
  status_at_log TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 繰り返しスケジュール
CREATE TABLE IF NOT EXISTS task_recurrences (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  rule_text TEXT NOT NULL,
  rule_kind TEXT NOT NULL,
  rule_json TEXT NOT NULL,
  next_due TEXT,
  last_generated_at TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
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

-- コメントリアクション
CREATE TABLE IF NOT EXISTS comment_reactions (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(comment_id, user_id, emoji)
);

-- タスク操作履歴
CREATE TABLE IF NOT EXISTS task_history (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  action_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 判断ログ（AI意思決定）
CREATE TABLE IF NOT EXISTS decision_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  conversation TEXT,
  final_prompt TEXT,
  final_response TEXT,
  operations TEXT,
  committed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ナレッジ（旧）
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
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

-- Wiki ページ（グループ単位、階層）
CREATE TABLE IF NOT EXISTS wiki_pages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  parent_page_id TEXT REFERENCES wiki_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT DEFAULT '',
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(group_id, slug)
);

-- アトラス注釈（プロジェクト/タスクの上に置く自由メッセージ）
-- project_id NULL = グループレイヤー、NOT NULL = プロジェクトレイヤー
CREATE TABLE IF NOT EXISTS atlas_annotations (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT DEFAULT '',
  x REAL DEFAULT 0,
  y REAL DEFAULT 0,
  width REAL DEFAULT 200,
  height REAL DEFAULT 100,
  color INTEGER DEFAULT 0,
  rotation REAL DEFAULT 0,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- アトラス関係線（汎用: プロジェクト/タスク/注釈の間で線が引ける）
CREATE TABLE IF NOT EXISTS atlas_links (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  from_type TEXT NOT NULL CHECK(from_type IN ('project','task','annotation','section')),
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL CHECK(to_type IN ('project','task','annotation','section')),
  to_id TEXT NOT NULL,
  kind TEXT DEFAULT 'relates',
  created_at TEXT DEFAULT (datetime('now'))
);

-- アトラス上のレイアウト（プロジェクト等の自由配置位置）
CREATE TABLE IF NOT EXISTS atlas_layout (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  node_id TEXT NOT NULL,
  x REAL DEFAULT 0,
  y REAL DEFAULT 0,
  width REAL,
  height REAL,
  PRIMARY KEY (group_id, node_type, node_id)
);

-- アトラス描画（ペンツールのストローク）
CREATE TABLE IF NOT EXISTS atlas_drawings (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  points TEXT NOT NULL,  -- JSON: [[x,y],[x,y],...]
  color TEXT DEFAULT '#1f2937',
  stroke_width REAL DEFAULT 2,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 通知
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT,
  body TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_projects_group ON projects(group_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_cycles_project ON cycles(project_id);
CREATE INDEX IF NOT EXISTS idx_task_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_task_cycle ON tasks(cycle_id);
CREATE INDEX IF NOT EXISTS idx_task_group ON tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_task_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_task_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_task_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_progress_logs_task ON task_progress_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_recurrences_task ON task_recurrences(task_id);
CREATE INDEX IF NOT EXISTS idx_membership_user ON group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_group ON group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_comment_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_decision_log_task ON decision_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_created ON task_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_group ON wiki_pages(group_id);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_parent ON wiki_pages(parent_page_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_group ON notifications(user_id, group_id);
CREATE INDEX IF NOT EXISTS idx_atlas_annotations_group ON atlas_annotations(group_id, project_id);
CREATE INDEX IF NOT EXISTS idx_atlas_links_group ON atlas_links(group_id, project_id);
CREATE INDEX IF NOT EXISTS idx_atlas_layout_group ON atlas_layout(group_id, project_id);
CREATE INDEX IF NOT EXISTS idx_atlas_drawings_group ON atlas_drawings(group_id, project_id);
`;
