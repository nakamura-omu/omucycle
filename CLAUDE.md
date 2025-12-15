# OmuCycle - 業務サイクル管理システム

## プロジェクト概要

大学事務向けの業務サイクル管理システム。従来のプロジェクト管理ツールの「始まり→終わり」の一回性ではなく、年間カレンダーを軸とした業務サイクルの管理と、AIを活用した意思決定支援・ナレッジ蓄積を実現する。

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
- [ ] マイタスク（個人ビュー）
- [ ] マイカレンダー
- [ ] 認証機能（Entra ID SSO）
- [ ] フラッシュカード（AI意思決定支援）
- [ ] ナレッジベース
- [ ] タスクテンプレート編集機能

## デモデータ

`npm run db:reset` で以下が作成される:
- ユーザー: admin@example.com, user1@example.com, user2@example.com
- グループ: 総務部、経理部
- サンプルタスク

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
