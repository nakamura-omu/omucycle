# OmuCycle - 業務サイクル管理システム

## プロジェクト概要

大学事務向けの業務管理システム。Todoist／Plane／Notion 風の軽量な「プロジェクト + ふせん + サイクル + Wiki」構成で、AIを活用した意思決定支援・ナレッジ蓄積を実現する。

## 2026-05 大改修

業務テンプレート前提の重い構造を捨て、Todoist／Plane／Notion 風に再構築。詳細は `docs/redesign-2026-05/`。

### 階層

```
Group → Project → (Cycle, Task, StickyBoard, Wiki)
```

- **Project**: タスクの主要コンテナ（旧 job_definitions/job_instances を統合）
- **Cycle**: プロジェクト単位のスプリント（Plane風、時間区切り）
- **Task**: 3段階固定ステータス `not_started/in_progress/completed`、進捗% は `task_progress_logs` に自由記録
- **StickyBoard**: プロジェクトに紐付くふせんボード、付箋とタスクは1対1双方向、投げ縄/重なりでグルーピング、関係線
- **Wiki**: グループ単位、階層ページ、シンプルなMarkdownエディタ

### 廃止した機能

- 業務テンプレート (`job_definitions`, `task_templates`, `workflow_rules`, `template_shares`)
- 業務インスタンス (`job_instances`)
- カスタムステータス (`group_statuses`)
- Timez（つぶやき）→ omu-office 側に移管

## 技術スタック

- **フロントエンド**: Vue 3 + TypeScript + Vite
- **バックエンド**: Hono (Node.js)
- **データベース**: SQLite (better-sqlite3)
- **AI**: Claude API (予定)

## ディレクトリ構造

```
omucycle/
├── src/                    # フロントエンドソース (Vue)
│   ├── components/         # 共通コンポーネント
│   │   ├── AppHeader.vue   # ヘッダー（ユーザーメニュー付き）
│   │   └── AppSidebar.vue  # サイドバーナビゲーション
│   ├── views/              # ページコンポーネント
│   │   ├── GroupList.vue        # グループ一覧・作成
│   │   ├── GroupHome.vue        # グループレイアウト (router-view)
│   │   ├── GroupDashboard.vue   # グループダッシュボード
│   │   ├── GroupSettings.vue    # グループ設定・メンバー管理
│   │   ├── GroupCalendar.vue    # 業務カレンダー（月間表示）
│   │   ├── TaskList.vue         # タスク一覧 (リスト/カンバン)
│   │   ├── TaskDetail.vue       # タスク詳細・編集・コメント
│   │   ├── JobDefinitionList.vue # 業務定義・テンプレート管理
│   │   ├── UserSettings.vue     # 個人設定（プロフィール編集）
│   │   ├── MyTasks.vue          # マイタスク (Coming Soon)
│   │   ├── MyCalendar.vue       # マイカレンダー (Coming Soon)
│   │   ├── Inbox.vue            # 受信トレイ (Coming Soon)
│   │   └── FlashCard.vue        # フラッシュカード (Coming Soon)
│   ├── stores/             # Pinia stores
│   │   ├── user.ts         # 現在のユーザー
│   │   ├── groups.ts       # グループ・メンバー
│   │   └── tasks.ts        # タスク・コメント
│   └── router/index.ts     # Vue Router設定
├── server/                 # バックエンドソース (Hono)
│   ├── db/                 # データベース関連
│   │   ├── schema.ts       # スキーマ定義
│   │   ├── seed.ts         # デモデータ投入
│   │   └── connection.ts   # DB接続
│   ├── routes/             # APIルート
│   │   ├── users.ts        # /api/users
│   │   ├── groups.ts       # /api/groups
│   │   ├── tasks.ts        # /api/tasks
│   │   ├── job-definitions.ts
│   │   └── browse.ts       # /api/browse (スラッグベースAPI)
│   └── index.ts            # サーバーエントリポイント
└── mddocument/             # 要件定義書等
```

## ポート設定

Mastraが同一サーバーで動作しているため、ポートを分離:

- **Mastra本番**: 4111
- **Mastra開発**: 4112
- **OmuCycle API**: 3180
- **OmuCycle フロントエンド**: 5180

## 開発コマンド

```bash
# 初回セットアップ
npm install
npm run db:init

# フロントエンドのみ
npm run dev

# APIサーバーのみ
npm run dev:server

# DBリセット（デモデータ再投入）
npm run db:reset

# ビルド
npm run build

# 型チェック
npm run type-check
```

## データモデル概要

主要テーブル:
- `users` - ユーザー (SSO/ゲスト)
- `groups` - グループ (課・チーム単位、`slug`でURL識別)
- `group_memberships` - グループメンバー (role: owner/admin/member/guest)
- `job_definitions` - 業務定義（テンプレート、`prefix`でURL識別）
- `task_templates` - タスクテンプレート
- `job_instances` - 年度業務インスタンス (`instance_number`でURL識別)
- `tasks` - タスク (親子関係対応、最大3階層、`task_number`でURL識別)
- `task_comments` - コメント
- `decision_logs` - AI判断ログ
- `knowledge` - ナレッジ

詳細は `/mddocument/02_データモデル.md` を参照。

## API エンドポイント

### ユーザー
- `GET /api/users` - 一覧取得
- `POST /api/users` - 新規作成
- `GET /api/users/:id` - 詳細取得

### グループ
- `GET /api/groups` - 一覧取得
- `POST /api/groups` - 新規作成
- `GET /api/groups/:id` - 詳細取得
- `GET /api/groups/:id/members` - メンバー一覧
- `POST /api/groups/:id/members` - メンバー追加
- `PATCH /api/groups/:groupId/members/:userId/role` - ロール変更
- `DELETE /api/groups/:groupId/members/:userId` - メンバー削除
- `GET /api/groups/:id/tasks` - グループのタスク一覧

### タスク
- `GET /api/tasks/:id` - 詳細取得（子タスク含む）
- `POST /api/tasks` - 新規作成
- `PUT /api/tasks/:id` - 更新
- `PATCH /api/tasks/:id/status` - ステータス変更
- `GET /api/tasks/:id/comments` - コメント一覧
- `POST /api/tasks/:id/comments` - コメント追加

### 業務定義
- `GET /api/job-definitions/:id` - 詳細取得（テンプレート含む）
- `POST /api/job-definitions` - 新規作成
- `PUT /api/job-definitions/:id` - 更新
- `DELETE /api/job-definitions/:id` - 削除
- `POST /api/job-definitions/:id/instantiate` - 業務インスタンス化

### ブラウズ（スラッグベースAPI）
- `GET /api/browse/:slug` - グループ取得（スラッグ指定）
- `GET /api/browse/:slug/:instanceKey` - 業務インスタンス取得（例: `/api/browse/dx-suishin/TEST-1`）
- `GET /api/browse/:slug/:instanceKey/tasks` - インスタンスのタスク一覧
- `GET /api/browse/:slug/:instanceKey/tasks/:taskNumber` - 個別タスク取得

## 実装状況

### 完了
- [x] グループ一覧・作成
- [x] タスク一覧（リスト/カンバンビュー）
- [x] タスク作成（担当者・親タスク選択対応）
- [x] タスク詳細・編集
- [x] タスクコメント
- [x] グループ設定・メンバー管理
- [x] メンバーロール変更・削除
- [x] 新規ユーザー作成・グループ追加
- [x] ユーザーメニュー（Teams風ドロップダウン）
- [x] 個人設定画面（プロフィール編集）
- [x] カレンダービュー（月間表示）
- [x] 業務定義・テンプレート管理
- [x] 業務インスタンス化機能
- [x] 業務タスク一覧・詳細画面
- [x] 人間が読みやすいURL形式（スラッグベース）
- [x] 3ペイン構成の業務タスク画面（インライン編集対応）
- [x] 複数担当者対応（assignee_ids）

### 開発予定
- [ ] プロジェクト階層構造（設計済み、下記参照）
- [ ] 付箋モード（個人メモ、設計済み、下記参照）
- [ ] UI 暖色化（付箋ボードのデザイン言語を全体に適用）
- [ ] マイタスク（個人ビュー）
- [ ] マイカレンダー
- [ ] 認証機能（Entra ID SSO）
- [ ] フラッシュカード（AI意思決定支援）
- [ ] ナレッジベース
- [ ] タスクテンプレート編集機能

## 設計: プロジェクト階層構造

### 概要

グループ内に「プロジェクト」（フォルダ的な概念）を導入し、業務インスタンスをプロジェクト単位で整理する。
Teams のチャンネルと同じ考え方で、プロジェクト単位でアクセス制御が可能。

### データ構造の変更

```
【現状】
Group → job_instances (フラット)

【変更後】
Group → projects (フォルダ) → job_instances
       ├── 📁 プロジェクトA/
       │   ├── 業務インスタンス A-1
       │   └── 業務インスタンス A-2
       ├── 📁 プロジェクトB/
       │   └── 📁 サブプロジェクト B-1/   ← ネスト可能
       │       └── 業務インスタンス B-1-1
       └── 業務インスタンス C（直置き、プロジェクト未所属も許可）
```

### DB スキーマ

```sql
-- 新テーブル: プロジェクト
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    parent_project_id TEXT REFERENCES projects(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- プロジェクト単位のアクセス制御
-- レコードなし = グループ全員がアクセス可（既存動作を壊さない）
-- レコードあり = 指定ユーザーのみアクセス可
CREATE TABLE project_members (
    project_id TEXT NOT NULL REFERENCES projects(id),
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',  -- viewer / member / admin
    PRIMARY KEY (project_id, user_id)
);

-- job_instances にプロジェクト紐付けを追加
ALTER TABLE job_instances ADD COLUMN project_id TEXT REFERENCES projects(id);
```

### URL 設計

```
/:slug/projects                        # プロジェクト一覧
/:slug/projects/:projectSlug           # プロジェクト内の業務一覧
/:slug/projects/:projectSlug/:PREFIX-N # プロジェクト内の業務タスク
```

### API 設計

```
GET    /api/groups/:id/projects              # プロジェクト一覧（権限フィルタ付き）
POST   /api/groups/:id/projects              # プロジェクト作成
PUT    /api/projects/:id                     # プロジェクト更新
DELETE /api/projects/:id                     # プロジェクト削除
GET    /api/projects/:id/members             # メンバー一覧
POST   /api/projects/:id/members             # メンバー追加
DELETE /api/projects/:id/members/:userId     # メンバー削除
```

### 権限モデル

- `project_members` にレコードがない → グループ全員がアクセス可能（オープン）
- `project_members` にレコードがある → 登録ユーザーのみアクセス可能（制限付き）
- プロジェクト admin → メンバー管理、プロジェクト設定変更が可能
- グループ owner/admin → 全プロジェクトにアクセス可能（override）

## 設計: 付箋モード

### 概要

タスク作成の「項目が多くて重い・面倒」という課題を解消するための、構造化前のメモ置き場。
個人用のふせんボードとして提供し、必要に応じてタスクに昇格させる。

### 役割分担

- **ふせんボード** = 構造化前の「とりあえずメモ」置き場
- **omucycle タスク** = 構造化して管理する場所

### 機能

- カンバン形式（デフォルト列: やること / やってる / おわった）
- ドラッグ＆ドロップで列間移動
- 色分け 6 色（きいろ、ピンク、みどり、あお、むらさき、オレンジ）
- 列の追加・名前変更・削除
- 付箋の編集・削除
- 「タスクにする →」ボタン → タスク作成画面に `?title=テキスト` で遷移
- タスク化済みマーク表示

### デザイン

- フォント: `Zen Maru Gothic`（やわらかい丸ゴシック）
- 背景: 暖色系グラデーション（`#FFF8E7` → `#F0E6D3` → `#E8DDD0`）
- 付箋がわずかにランダムに傾いてリアル感
- ホバーで水平に戻り拡大するアニメーション

### DB スキーマ

```sql
CREATE TABLE sticky_notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    column_id TEXT NOT NULL DEFAULT 'todo',
    text TEXT NOT NULL DEFAULT '',
    color INTEGER DEFAULT 0,
    rotation REAL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    task_id TEXT REFERENCES tasks(id),  -- タスク化済みの場合
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sticky_columns (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    emoji TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
);
```

### URL

```
/my/sticky    # 個人の付箋ボード
```

### 今後の拡張可能性

- プロジェクト単位の共有ふせんボード（チーム利用）
- ふせんからの直接タスク作成（画面遷移なし）

### プロトタイプ

React JSX のプロトタイプが sui-memory に保存済み（ID:85）。
omucycle は Vue なので Vue コンポーネントに移植して実装する。

## デモデータ

`npm run db:reset` で以下が作成される:
- ユーザー: admin@example.com, user1@example.com, user2@example.com
- グループ: 総務部、経理部
- サンプルタスク

## 開発スタンス

- ユーザーから仕様の提案があった場合、そのまま実装するだけでなく、より良いアプローチがあればサジェストすること
- 「こうした方がいいかも」「この設計だと将来こういう問題が出そう」など、建設的な代替案を提示する
- ただし最終判断はユーザーに委ねる。押し付けない
- 技術選定・データモデル・UI設計いずれもサジェスト対象

## 注意事項

- SQLiteは `server/omucycle.db` に保存
- 本番環境ではPostgreSQLへの移行を検討
- 認証は現在未実装（デフォルトで admin@example.com としてログイン）
- フロントエンドとバックエンドは別々に起動が必要

## 画面一覧

### メインナビゲーション（サイドバー）
| パス | 画面名 | 状態 |
|------|--------|------|
| `/` | グループ一覧 | 実装済 |
| `/my/tasks` | マイタスク | Coming Soon |
| `/my/calendar` | マイカレンダー | Coming Soon |
| `/inbox` | 受信トレイ | Coming Soon |
| `/flashcard` | フラッシュカード | Coming Soon |
| `/settings` | 個人設定 | 実装済 |

### グループ内ナビゲーション（新URL形式 - 推奨）
| パス | 画面名 | 状態 |
|------|--------|------|
| `/:slug` | ダッシュボード | 実装済 |
| `/:slug/tasks` | タスク一覧 | 実装済 |
| `/:slug/calendar` | 業務カレンダー | 実装済 |
| `/:slug/job-definitions` | 業務定義 | 実装済 |
| `/:slug/job-instances` | 業務タスク一覧 | 実装済 |
| `/:slug/:PREFIX-N` | 業務タスク詳細 | 実装済 |
| `/:slug/:PREFIX-N/tasks/:taskNumber` | タスク詳細 | 実装済 |
| `/:slug/settings` | グループ設定 | 実装済 |

### グループ内ナビゲーション（旧URL形式 - 後方互換）
| パス | 画面名 | 状態 |
|------|--------|------|
| `/groups/:id` | ダッシュボード | 実装済 |
| `/groups/:id/tasks` | タスク一覧 | 実装済 |
| `/groups/:id/tasks/:taskId` | タスク詳細 | 実装済 |
| `/groups/:id/calendar` | 業務カレンダー | 実装済 |
| `/groups/:id/job-definitions` | 業務定義 | 実装済 |
| `/groups/:id/job-instances` | 業務タスク一覧 | 実装済 |
| `/groups/:id/job-instances/:instanceId` | 業務タスク詳細 | 実装済 |
| `/groups/:id/settings` | グループ設定 | 実装済 |

## 機能詳細

### カレンダービュー
- 月間グリッド表示
- 前月/次月ナビゲーション、「今日」ボタン
- タスクの期限日で表示（優先度で色分け）
- 完了タスクは打ち消し線表示
- タスククリックで詳細画面へ遷移

### 業務定義管理
- 業務定義の一覧・作成・削除
- 繰り返しタイプ（年次/四半期/月次/単発）
- 期間設定（開始月〜終了月）
- 有効/無効の切り替え
- タスクテンプレート一覧表示

### ユーザーメニュー（ヘッダー右上）
- アバターアイコン（名前の頭文字、色は名前から自動生成）
- ドロップダウンメニュー
  - 設定 → 個人設定画面
  - ログアウト（認証実装後に有効化）

### 個人設定
- プロフィール表示・編集（名前変更可能）
- アバタープレビュー
- メールアドレス・認証タイプは表示のみ

### カスタムステータス
グループごとにタスクのステータスをカスタマイズ可能。

**データ構造:**
```
group_statuses テーブル
├── id           -- ステータスID
├── group_id     -- グループID
├── key          -- 内部キー（例: review, waiting_approval）
├── label        -- 表示名（例: レビュー中）
├── color        -- カンバン列の色
├── sort_order   -- 表示順
├── is_done      -- 完了扱いか（進捗計算用）
└── created_at
```

**デフォルトステータス:**
- 未着手 (not_started) - グレー
- 進行中 (in_progress) - 青
- 完了 (completed) - 緑、is_done=true

**カスタマイズ例:**
- レビュー中 (review) - オレンジ
- 承認待ち (waiting_approval) - 紫

**設定方法:**
グループ設定画面（/:slug/settings）の「タスクステータス」セクションで追加・編集・削除が可能。

**API:**
- `GET /api/groups/:id/statuses` - ステータス一覧
- `POST /api/groups/:id/statuses` - ステータス追加
- `PUT /api/groups/:groupId/statuses/:statusId` - ステータス更新
- `DELETE /api/groups/:groupId/statuses/:statusId` - ステータス削除
- `PUT /api/groups/:id/statuses/reorder` - 順序変更

## URL設計

### 人間が読みやすいURL形式

Plane風のURL構造を採用し、人間が読みやすく共有しやすいURLを実現。

**URL構造:**
```
/:groupSlug/:PREFIX-instanceNumber/tasks/:taskNumber
```

**例:**
- グループ: `/dx-suishin`
- 業務タスク: `/dx-suishin/TEST-1`
- 個別タスク: `/dx-suishin/TEST-1/tasks/3`

**各要素の説明:**
| 要素 | 格納場所 | 例 | 説明 |
|------|----------|-----|------|
| groupSlug | `groups.slug` | `dx-suishin` | 小文字英数字とハイフン |
| PREFIX | `job_definitions.prefix` | `TEST` | 大文字英字のみ |
| instanceNumber | `job_instances.instance_number` | `1` | インスタンス作成順の連番 |
| taskNumber | `tasks.task_number` | `3` | インスタンス内のタスク連番 |

**設定方法:**
- **グループslug**: グループ設定画面で編集可能
- **業務prefix**: 業務定義作成時に設定
- **instance_number/task_number**: インスタンス化時に自動採番

**フォールバック:**
slug/prefix/numberが未設定の場合は旧形式（UUID）のURLにフォールバック。

### 業務インスタンス化

業務定義（テンプレート）から年度業務インスタンスを作成する機能。

**インスタンス化時の処理:**
1. `job_instances`テーブルに新レコード作成
2. `instance_number`を自動採番（同じ業務定義内での連番）
3. `task_templates`から`tasks`を自動生成
4. 各タスクに`task_number`を自動採番
5. テンプレートの`relative_days`から期限日を自動計算

**API:**
```
POST /api/job-definitions/:id/instantiate
Body: { fiscal_year: 2024, actual_start: "2024-04-01", created_by: "user-id" }
```

## UI設計

### 業務タスク画面（3ペイン構成）

業務タスク画面（`/:slug/job-instances`）は、画面遷移なしでタスクを操作できる3ペイン構成を採用。

```
┌─────────────────────────────────────────────────────────────┐
│ [業務一覧]      │ [タスク一覧]       │ [タスク詳細パネル]    │
│                │                   │ (右からスライドイン)   │
│ ○ TEST-1      │ □ タスク1         │                      │
│ ● TEST-2 ←選択│ ■ タスク2 ←選択   │ タイトル: タスク2     │
│ ○ TEST-3      │ □ タスク3         │ 説明: ...            │
│                │                   │ ステータス: [▼]      │
│                │                   │ 担当者: [複数選択]   │
└─────────────────────────────────────────────────────────────┘
```

**特徴:**
- **左ペイン（280px）**: 業務インスタンス一覧（進捗バー付き）
- **中央ペイン（可変）**: 選択した業務のタスク一覧（階層表示対応）
- **右ペイン（380px）**: タスク詳細パネル（スライドインアニメーション）

**インライン編集:**
- 編集ボタン不要、直接操作可能
- タイトル: クリックして直接編集
- ステータス/優先度: ボタンクリックで即座に変更
- 担当者: チェックボックスで複数選択可能
- 説明: テキストエリアで直接編集
- 変更は自動保存（blur時またはクリック時）

### 複数担当者対応

タスクには複数の担当者を設定可能。

**データ構造:**
- `tasks.assignee_ids`: JSON配列で複数のユーザーIDを格納
- `tasks.assignee_id`: 旧形式（単一担当者）との後方互換用

**UI:**
- チェックボックス形式でメンバー一覧から複数選択
- 選択済みの担当者はハイライト表示
- タスク一覧では複数担当者をそれぞれバッジ表示

### タスクのドラッグ＆ドロップ

タスク一覧でドラッグ＆ドロップによる並び替えが可能。

**機能:**
- タスクをドラッグして順序を変更
- 他のタスクの上にドロップで子タスク化
- 階層は最大3レベル（depth: 0, 1, 2）まで
- 自分自身や子孫を親にする操作は自動的にブロック

**データ構造:**
- `tasks.sort_order`: 同一階層内での表示順（INTEGER）
- `tasks.depth`: 階層の深さ（0=ルート、1=子、2=孫）
- `tasks.parent_task_id`: 親タスクへの参照

**API:**
- `PATCH /api/tasks/:id/reorder` - 単一タスクの並び替え
- `POST /api/tasks/reorder-bulk` - 複数タスクの一括並び替え（トランザクション処理）

### タスク一覧のステータス表示

タスク一覧でステータスをバッジ表示。

**特徴:**
- 優先度（●）の横にステータスラベルをバッジ表示
- 完了ステータスは✓マークで表現（バッジ非表示）
- 背景色に応じて文字色を自動調整（コントラスト確保）
  - 明るい背景 → 黒文字
  - 暗い背景 → 白文字

**実装:**
```typescript
// YIQ方式で輝度を計算
const luminance = (r * 299 + g * 587 + b * 114) / 1000
return luminance >= 128 ? '#333333' : '#ffffff'
```

## 開発サーバー管理

開発サーバーの起動・停止を管理するスクリプト。

**コマンド:**
```bash
npm run dev:start      # API + フロントエンド起動
npm run dev:stop       # 全サーバー停止
npm run dev:restart    # 全サーバー再起動
npm run dev:restart-api # APIサーバーのみ再起動
npm run dev:status     # サーバー状態確認
npm run dev:logs       # ログ表示
```

**ファイル構成:**
- `scripts/dev-server.sh` - サーバー管理スクリプト
- `.pids/` - PIDファイル格納ディレクトリ
- `.logs/` - ログファイル格納ディレクトリ

## UIグランドルール

shadcn-vue + Tailwind CSS v4 ベースの宣言的UI設計ルール。

### カラー
| 用途 | 使うクラス | 禁止 |
|------|-----------|------|
| 本文テキスト | `text-foreground` | `text-[#1a1a2e]`, `text-[#333]` |
| 補助テキスト | `text-muted-foreground` | `text-[#666]`, `text-[#999]` |
| ボーダー | `border-border` / `border-input` | `border-[#e5e7eb]`, `border-[#e0e0e0]` |
| 背景 | `bg-card` / `bg-muted` / `bg-background` | `bg-white`, `bg-[#f8f9fa]` |
| サイドバーテキスト | `text-sidebar-foreground` | `text-[#ccc]` |
| サイドバーセクションタイトル | `text-muted-foreground` | `text-[#666]` |
| アクセントカラー（インジゴ） | `text-info` / `bg-info/10` | `text-[#4338ca]` |
| 成功 | `text-success` / `bg-success` | `text-[#22c55e]` |
| 警告 | `text-warning` / `bg-warning` | `text-[#f59e0b]` |
| エラー | `text-danger` / `text-destructive` | `text-[#dc2626]` |

### フォントサイズ（Tailwind標準スケールのみ使用）
| 用途 | クラス | 禁止 |
|------|--------|------|
| ページタイトル | `text-xl` or `text-2xl` | |
| セクション見出し | `text-lg` or `text-base font-semibold` | |
| 本文 | `text-sm` | `text-[13px]`, `text-[0.875rem]` |
| ラベル / キャプション | `text-xs` | `text-[11px]`, `text-[10px]`, `text-[0.7rem]` |
| バッジ内テキスト | `text-xs` | `text-[10px]`, `text-[0.65rem]` |

### スペーシング規約
| 用途 | クラス |
|------|--------|
| ページ内セクション間 | `mb-6` or `space-y-6` |
| カード内セクション間 | `space-y-4` |
| フォーム項目間 | `space-y-4` |
| リスト項目間 | `gap-2` |
| インライン要素間 | `gap-2` |

### コンポーネント選択
| 場面 | 使うもの | 禁止 |
|------|---------|------|
| アクションボタン | `<Button>` | 生の `<button>` + Tailwindクラス |
| 透明ボタン | `<Button variant="ghost">` | `<button class="bg-transparent border-0 ...">` |
| アウトラインボタン | `<Button variant="outline">` | |
| モーダル | `<Dialog>` | `v-if` + overlay div |
| 入力フィールド | `<Input>` | 生の `<input>` + Tailwindクラス |
| テキストエリア | `<Textarea>` | 生の `<textarea>` + Tailwindクラス |
| ページ全体ラッパー | `<PageContainer>` / `<PageContainer narrow>` | `max-w-[Xpx] mx-auto` |
| ページ見出し | `<PageHeader title="...">` | 手書きの flex + h2 |
| 空状態 | `<EmptyState message="...">` | 手書きの text-center div |
| カードセクション | `<Card>` + `<CardContent>` | `bg-card rounded-xl shadow-sm` div |
| セレクト | ネイティブ `<select>` + Tailwindクラス | (shadcn Selectは使わない) |
| チェックボックスリスト | ネイティブ checkbox + Tailwind | (同上) |

### scoped CSS が許可される場面
- カレンダーの7列グリッド (`GroupCalendar.vue`)
- D&Dインジケータ (`TaskPane.vue`)
- スライドアニメーション (`JobInstanceList.vue`)
- リアクションUI (`TaskComments.vue`)
- **上記以外ではscoped CSSを使わない**

### 任意値 (`[...]`) の使用ルール
- **幅/高さ**: レイアウト上の固定値はOK (`w-[280px]`, `w-[750px]` 等)
- **カラー**: **禁止** — 必ずテーマトークンを使う
- **フォントサイズ**: **禁止** — Tailwind標準スケールを使う
- **スペーシング**: 原則禁止。標準スケールで表現できない場合のみ許可
