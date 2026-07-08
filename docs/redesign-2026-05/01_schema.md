# 新スキーマ設計

## 全体図

```
users
  └─ group_memberships ─┐
                        ▼
groups ──── projects ────┬──── cycles
  │           │          ├──── tasks ──── task_progress_logs
  │           │          │       │ ──── task_recurrences
  │           │          │       │ ──── task_comments
  │           │          │       │ ──── task_history
  │           │          │       │ ──── task_attachments
  │           │          │       │
  │           │          │   sticky_notes (1対1) ─ sticky_relations
  │           │          │       │
  │           │          └─ sticky_boards ─ sticky_groups
  │           │
  │           └── project_members
  │
  ├─ wiki_pages（階層）
  ├─ group_files
  ├─ group_memberships
  └─ calendar_views

users
  └─ notifications
```

## テーブル定義

### projects

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  parent_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,                    -- URL 用、group内ユニーク
  prefix TEXT,                            -- タスクIDの接頭辞（例: DX、EVENT）。NULL可
  description TEXT,
  icon TEXT,                              -- emoji または URL
  color TEXT,                             -- '#hex'
  archived INTEGER DEFAULT 0,
  is_personal INTEGER DEFAULT 0,         -- "My" プロジェクトの場合 1
  owner_user_id TEXT REFERENCES users(id), -- is_personal=1 のとき設定
  next_task_number INTEGER DEFAULT 0,    -- T-N 採番カウンタ
  next_cycle_number INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(group_id, slug)
);
```

### project_members

```sql
-- レコードなし → グループ全員アクセス可
-- レコードあり → 登録ユーザーのみアクセス可
CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK(role IN ('viewer','member','admin')) DEFAULT 'member',
  PRIMARY KEY (project_id, user_id)
);
```

### cycles

```sql
CREATE TABLE cycles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL,           -- project内連番（C-N URL用）
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
```

### tasks（変更）

旧 `tasks` から `job_instance_id` / `task_template_id` を削除、`project_id` / `cycle_id` を追加。
`status` は `not_started/in_progress/completed` の3固定。

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_id TEXT REFERENCES cycles(id) ON DELETE SET NULL,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,  -- 検索用に冗長保持
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  task_number INTEGER NOT NULL,             -- project内連番、T-N
  depth INTEGER DEFAULT 0 CHECK(depth BETWEEN 0 AND 4),
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT,
  due_date TEXT,
  status TEXT CHECK(status IN ('not_started','in_progress','completed')) NOT NULL DEFAULT 'not_started',
  priority TEXT CHECK(priority IN ('urgent','important','normal','none')) DEFAULT 'normal',
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,  -- 後方互換
  assignee_ids TEXT,  -- JSON array
  labels TEXT,        -- JSON array
  current_progress INTEGER DEFAULT 0,  -- 直近の進捗% を高速取得用に保持
  completed_at TEXT,
  sort_order INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, task_number)
);
```

旧 `tasks.depth` は最大3階層だったが、付箋ボードのグルーピング兼用にするので **5階層** までに緩和。

### task_progress_logs

```sql
CREATE TABLE task_progress_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  progress_percent INTEGER CHECK(progress_percent BETWEEN 0 AND 100),
  note TEXT,
  status_at_log TEXT,    -- 記録時点の status を保存（参考用）
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_progress_logs_task_id ON task_progress_logs(task_id);
```

### task_recurrences

```sql
CREATE TABLE task_recurrences (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  rule_text TEXT NOT NULL,        -- ユーザ表示用（例: "毎週月曜"）
  rule_kind TEXT NOT NULL,        -- 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
  rule_json TEXT NOT NULL,        -- 詳細パラメータ
  next_due TEXT,                  -- 次回期限の予定
  last_generated_at TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

`rule_json` の例:
```json
{ "kind": "weekly", "weekdays": [1, 4], "interval": 1, "time": "09:00" }
{ "kind": "monthly", "day_of_month": 1, "interval": 1 }
{ "kind": "monthly", "nth_weekday": { "n": -1, "weekday": 5 }, "interval": 1 }  // 最終金曜
```

### sticky_boards（再設計）

旧 `sticky_boards` は user_id ベース。これを project_id ベースに変更。
個人ふせんボードは `is_personal=1` の "My" プロジェクトの下のボードとして表現。

```sql
CREATE TABLE sticky_boards (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'メインボード',
  slug TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, slug)
);
```

### sticky_groups（変更なし、参考）

```sql
CREATE TABLE sticky_groups (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES sticky_boards(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  x REAL DEFAULT 0,
  y REAL DEFAULT 0,
  color TEXT DEFAULT '#f0f0f0',
  created_at TEXT DEFAULT (datetime('now'))
);
```

### sticky_notes（再設計）

`text` カラムは廃止 → `tasks.title` を参照（1対1双方向）。
`task_id` は **NOT NULL** に。色や座標などの装飾だけ持つ。

```sql
CREATE TABLE sticky_notes (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES sticky_boards(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES sticky_groups(id) ON DELETE SET NULL,
  x REAL DEFAULT 100,
  y REAL DEFAULT 100,
  color INTEGER DEFAULT 0,
  rotation REAL DEFAULT 0,
  width REAL DEFAULT 200,
  height REAL DEFAULT 140,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(board_id, task_id)   -- 同じボードに同じタスクは一度だけ
);
```

### sticky_relations

```sql
CREATE TABLE sticky_relations (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES sticky_boards(id) ON DELETE CASCADE,
  from_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  to_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT CHECK(kind IN ('relates','blocks','blocked_by','duplicates')) DEFAULT 'relates',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(board_id, from_task_id, to_task_id, kind)
);
```

親子関係は `tasks.parent_task_id` で表現。`sticky_relations` はそれ以外の任意関係。

### wiki_pages

```sql
CREATE TABLE wiki_pages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  parent_page_id TEXT REFERENCES wiki_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT DEFAULT '',         -- Markdown
  icon TEXT,                        -- emoji
  sort_order INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(group_id, slug)
);
```

### notifications

```sql
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                  -- 'task_assigned' | 'comment' | 'mention' | 'progress_update' | ...
  ref_type TEXT NOT NULL,              -- 'task' | 'comment' | 'wiki_page' | ...
  ref_id TEXT NOT NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT,
  body TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_user_group ON notifications(user_id, group_id);
```

サイドバー右側のバッジは `notifications` の `read_at IS NULL` を group_id ごとにカウントする。

## マイグレーション

クリーンスタート方針なので、`server/db/init.ts` を書き直して `db:reset` で全消去 → 新スキーマ → 新 seed。
