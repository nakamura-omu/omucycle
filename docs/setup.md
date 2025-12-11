# OmuCycle セットアップガイド

## 概要

OmuCycleは大学事務向けの業務サイクル管理システムです。従来のプロジェクト管理ツールとは異なり、年間カレンダーを軸とした業務サイクルの管理と、AIを活用した意思決定支援を目指しています。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Vue 3 + TypeScript + Vite |
| バックエンド | Hono (Node.js) |
| データベース | SQLite (better-sqlite3) |
| AI | Claude API (予定) |

## ポート設定

同一サーバーでMastraが稼働しているため、以下のポートで分離:

| サービス | ポート |
|----------|--------|
| Mastra本番 | 4111 |
| Mastra開発 | 4112 |
| **OmuCycle API** | **3180** |
| **OmuCycle フロントエンド** | **5180** |

## 初回セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/nakamura-omu/omucycle.git
cd omucycle
```

### 2. 依存パッケージのインストール

```bash
npm install
```

### 3. 環境変数の設定

```bash
cp .env.example .env
# 必要に応じて .env を編集
```

### 4. データベースの初期化

```bash
npm run db:init
```

これにより:
- `data/omucycle.db` が作成される
- 全テーブルが作成される
- デモデータ（ユーザー、グループ、タスク）が挿入される

## 開発サーバーの起動

### フロントエンド + API 同時起動（推奨）

```bash
npm run dev:all
```

### 個別起動

```bash
# APIサーバーのみ (http://localhost:3180)
npm run dev:server

# フロントエンドのみ (http://localhost:5180)
npm run dev
```

## API エンドポイント

### ヘルスチェック

```bash
curl http://localhost:3180/
# => {"name":"OmuCycle API","version":"0.1.0","status":"running"}

curl http://localhost:3180/health
# => {"status":"ok","timestamp":"2025-12-11T..."}
```

### ユーザー

```bash
# 一覧取得
GET /api/users

# 詳細取得
GET /api/users/:id

# 作成
POST /api/users
Body: { "email": "user@example.com", "name": "ユーザー名" }

# ユーザーのグループ一覧
GET /api/users/:id/groups

# ユーザーのタスク一覧
GET /api/users/:id/tasks
```

### グループ

```bash
# 一覧取得
GET /api/groups

# 詳細取得
GET /api/groups/:id

# 作成
POST /api/groups
Body: { "name": "グループ名", "created_by": "user-uuid" }

# メンバー一覧
GET /api/groups/:id/members

# メンバー追加
POST /api/groups/:id/members
Body: { "user_id": "user-uuid", "role": "member" }

# グループのタスク一覧
GET /api/groups/:id/tasks

# グループの業務定義一覧
GET /api/groups/:id/job-definitions
```

### タスク

```bash
# 詳細取得（子タスク含む）
GET /api/tasks/:id

# 作成
POST /api/tasks
Body: {
  "group_id": "group-uuid",
  "title": "タスク名",
  "created_by": "user-uuid",
  "due_date": "2025-03-20",
  "priority": "urgent"
}

# 更新
PUT /api/tasks/:id
Body: { "title": "新しいタスク名", "status": "in_progress" }

# ステータス変更
PATCH /api/tasks/:id/status
Body: { "status": "completed" }

# コメント一覧
GET /api/tasks/:id/comments

# コメント追加
POST /api/tasks/:id/comments
Body: { "user_id": "user-uuid", "content": "コメント内容" }
```

### 業務定義

```bash
# 詳細取得（テンプレート含む）
GET /api/job-definitions/:id

# 作成
POST /api/job-definitions
Body: {
  "group_id": "group-uuid",
  "name": "入学式準備",
  "typical_start_month": 3
}

# タスクテンプレート追加
POST /api/job-definitions/:id/templates
Body: { "title": "式次第作成", "relative_days": 0 }

# 年度業務としてインスタンス化
POST /api/job-definitions/:id/instantiate
Body: {
  "fiscal_year": 2025,
  "actual_start": "2025-03-01",
  "created_by": "user-uuid"
}
```

## ディレクトリ構造

```
omucycle/
├── docs/                   # ドキュメント
├── server/                 # バックエンド
│   ├── db/
│   │   ├── schema.ts       # DBスキーマ定義
│   │   ├── init.ts         # 初期化スクリプト
│   │   └── connection.ts   # DB接続管理
│   ├── routes/
│   │   ├── users.ts        # ユーザーAPI
│   │   ├── groups.ts       # グループAPI
│   │   ├── tasks.ts        # タスクAPI
│   │   └── job-definitions.ts  # 業務定義API
│   └── index.ts            # サーバーエントリポイント
├── src/                    # フロントエンド (Vue)
│   ├── components/
│   ├── views/
│   ├── stores/             # Pinia (予定)
│   └── router/             # Vue Router (予定)
├── data/                   # SQLite DB (gitignore)
├── mddocument/             # 要件定義書
├── package.json
├── vite.config.ts
└── CLAUDE.md               # Claude Code用ガイド
```

## データモデル

主要テーブル:

| テーブル | 説明 |
|----------|------|
| users | ユーザー (SSO/ゲスト) |
| groups | グループ (課・チーム) |
| group_memberships | グループメンバーシップ |
| job_definitions | 業務定義テンプレート |
| task_templates | タスクテンプレート |
| job_instances | 年度業務インスタンス |
| tasks | タスク (3階層まで) |
| task_comments | コメント |
| decision_logs | AI判断ログ |
| knowledge | ナレッジ |

詳細は `mddocument/02_データモデル.md` を参照。

## 今後の実装予定

- [ ] フロントエンド画面実装
- [ ] 認証 (Entra ID SSO)
- [ ] フラッシュカードUI (AI意思決定支援)
- [ ] ナレッジベース
- [ ] ファイル添付 (MinIO)
- [ ] カレンダービュー
