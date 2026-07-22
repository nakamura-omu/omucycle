# OmuCycle - 業務サイクル管理システム

## プロジェクト概要

大学事務向けの業務管理システム。Todoist風の軽量な「プロジェクト + タスク + サイクル + Wiki」構成で、AIを活用した意思決定支援・ナレッジ蓄積を実現する。
**タスク管理ツールに集中する方針（2026-07-10）**: アトラス（ふせんキャンバス）は廃止
（外部コラボツールに役割を移管）。グループはタスク中心（クリック=タスク一覧直行）。

> 2026-05 大改修以前の記述（業務テンプレート・カスタムステータス・PREFIX式URL等）は
> すべて廃止済み。歴史は `docs/redesign-2026-05/` を参照。

## 2026-07 OMU365合流

OMU365（学内共通サービス基盤）の一員。正典は `~/projectcore/document/architecture/OMU365.md`。

- **共通シェル組込済み**: App.vueが `/shell/omu-shell.js` を動的ロード（サービスカラー=オレンジ #c2410c / 🔄）。開発時（vite直）はシェル不在でも素で動く
- **omuid**: usersにDirectory正典IDへのポインタ（X-Auth-Userから捕捉）。
  users.nameは表示キャッシュで、ログイン時にDirectoryのdisplay_nameへリフレッシュされる
- **メンバー追加はDirectory名簿検索**（`GET /api/directory/search` → `POST /api/groups/:id/members`に
  `{omuid, mail, display_name}`）。手作りユーザー・ゲスト作成UIは廃止
- **X-Shell-Probe: 1** 付きリクエストは読み取り専用（ユーザー自動作成しない）

## 2026-07 UI Todoist化

「UI 暖色化」計画を実装。紺+シアン → **Todoist風ライトテーマ**（白〜ウォームグレー基調、
赤アクセント #dc4c3e、ライトサイドバー #fcfaf8）。パレットは `src/style.css` の
`@theme inline` に集約（アクセントは text-info インジゴ → **bg-primary/text-primary 赤** が主役に変更）。

- **ホーム = `/my`（インボックス）**: `/` は `/my` へリダイレクト（2026-07-12）。
  グループ一覧ページ（GroupList.vue）は廃止し、グループの一覧・作成はサイドバーに集約
- **チェックサークル**: タスク完了UIは優先度色の丸（P1赤/P2橙/P3青/なし灰、ホバーで✓）。
  優先度ドット●は廃止しサークルに統合（Todoist流）
- **Undoトースト**: ステータス変更後に左下「取り消す」トースト
  （`stores/toast.ts` + `components/UndoToast.vue`。updateStatusの `{silent:true}` で再帰防止）
- **D&D**: マウス位置で上/下挿入（赤線インジケーター表示）、行の左端140px超の
  右側ドロップで子タスク化（誤ネスト防止で狭め・depth<2のみ）。循環ネストはクライアントで拒否
- **汎用Undo**: 並べ替え/移動/期限変更/移設/完了、全操作が左下トースト+「取り消す」
  （`stores/toast.ts`。新規操作を足すときも必ずUndoを付けること）
- **サイドバードロップ**: タスクを掴んで今日(期限=今日)/近日予定(=明日)/インボックス(移設)/
  プロジェクト(移設)へ。`stores/dnd.ts`がドラッグ中タスクを共有。
  移設は `POST /api/tasks/:id/move-to-project`（task_number再採番）
- **検索**: サイドバーの検索ボックス → `GET /api/users/:id/search-tasks?q=`
- **表示メニュー**: レイアウト(リスト/ボード)・グループ化・並び替え・完了表示。
  プロジェクトごとにlocalStorage記憶（cycle.view.<projectId>）
- **プロジェクトD&D並び替え**（2026-07-17）: サイドバーのプロジェクト行を掴んで並び替え
  （`POST /api/projects/reorder-bulk`）。タスク一覧のプロジェクト別バケット順も
  projects の sort_order 順に固定（タスク移動で並びが変わらない）
- **繰り返し**（2026-07-17）: タスク詳細の🔁ボタン→モーダル（RecurrencePicker）。
  完了時にサーバーが期限を次回へ進め完了にしない（Todoist流、`PATCH /status` が
  `{recurred, next_due}` を返す）。期限切れ完了は今日基準で次回を探す
- **時刻付き期限**（2026-07-17）: `tasks.due_time`（HH:MM、M365カレンダー連携を見据える）。
  マイグレーションは `server/db/connection.ts` の起動時 ensureColumn
  （**db:init はデモデータを再投入するため本番で使わない**）
- **セクション表示**: グループのタスク一覧はセクション行を出さず、各行に
  「▸ セクション名」チップ（`/api/groups/:id/tasks` が section_title / recurrence_text を返す）

## 2026-07 タスク管理特化 + 顔写真

- **アトラス廃止**: views/ProjectAtlas・GroupAtlas・components/atlas削除、
  routes/atlas.tsは未マウント温存（atlas_*テーブルも温存）。ふせん(/my/board)も撤去
- **グループ=タスク中心**: グループ遷移は `/:slug` → `/:slug/tasks` へリダイレクト
  （ダッシュボード廃止）。グループ配下メニューはサイクル/Wiki/設定のみ
- **顔写真**: `components/UserAvatar.vue`（omuidがあれば
  `/directory/api/me/users/:omuid/photo` = DirectoryのGraphプロキシ、
  無ければイニシャル+ハッシュ色）。API応答に `assignee_omuid`・membersに `omuid` を追加済み。
  開発環境(vite直)では常にイニシャルにフォールバック
- **アイデンティティ**: 人・所属・ロールの正典はDirectory、Cycle内チームはomuid参照のアドホック集合。学外コラボは扱わない（OMU-COLAB構想に分離）
- 作業実績: `~/projectcore/document/omucycle/2026-07-10_omu365-integration.md`

## 2026-05 大改修

業務テンプレート前提の重い構造を捨て、Todoist／Plane／Notion 風に再構築。詳細は `docs/redesign-2026-05/`。

### 階層

```
Group → Project → (Cycle, Task, Wiki)
```

- **Group**: 課・チーム単位。**slug必須**（URL解決がすべてslug基準。作成APIが未指定時は
  名前からslugify、日本語名等は `g-<id先頭8桁>` で自動生成。2026-07-12）
- **Project**: タスクの主要コンテナ。個人スペースは「My」プロジェクト（`is_personal=1`）
- **Cycle**: プロジェクト単位のスプリント（Plane風、時間区切り）
- **Task**: 3段階固定ステータス `not_started/in_progress/completed`、
  進捗% は `task_progress_logs` に自由記録（最新値は `tasks.current_progress` にキャッシュ）。
  複数担当者は `tasks.assignee_ids`（JSON配列）、親子は `parent_task_id`（最大3階層）
- **Wiki**: グループ単位、階層ページ、Markdownエディタ
- **繰り返し**: `task_recurrences`（daily/weekly/monthly/yearly + rule_json）

### 廃止した機能（復活させない）

- 業務テンプレート/インスタンス (`job_definitions`, `job_instances`, `task_templates`,
  `workflow_rules`, `template_shares`)
- カスタムステータス (`group_statuses`)
- Timez（つぶやき）→ omu-office 側に移管
- アトラス・ふせんボード（2026-07-10。atlas_*テーブルとroutes/atlas.tsのみ温存）
- グループ一覧ページ GroupList.vue（2026-07-12。サイドバーに集約）

## 技術スタック

- **フロントエンド**: Vue 3 + TypeScript + Vite + shadcn-vue + Tailwind CSS v4
- **バックエンド**: Hono (Node.js)
- **データベース**: SQLite (better-sqlite3、`data/omucycle.db`)
- **AI**: マルチプロバイダ（server/routes/ai.ts）。
  `OPENAI_API_KEY` があれば **OpenAI**（既定モデル gpt-5.4-mini、`OPENAI_MODEL` で変更可）、
  無ければ Anthropic。`AI_PROVIDER=openai|anthropic` で明示切替。
  SSEイベントプロトコルは両プロバイダ共通（フロントは無変更）。2026-07-10 OpenAIでE2E疎通確認済み
  - **運用メモ**: OpenAIはデータ共有オプトイン（Share inputs and outputs）の
    無料枠で運用中（mini系=1,000万トークン/日）。**入出力がOpenAIの学習に提供される**ため、
    課の実データ・個人情報を本格的に載せる前に共有オフ（有償）への切替か
    学内データ取り扱い方針との突き合わせが必要。超過は通常課金 →
    ダッシュボードでUsage limitsを設定しておくこと

## ディレクトリ構造

```
omucycle/
├── src/                    # フロントエンド (Vue)
│   ├── components/         # AppSidebar（ナビ+検索+グループ作成）、task/、wiki/、ai/、ui/(shadcn)
│   ├── views/              # ルーティング先（下記「画面一覧」参照）
│   ├── stores/             # Pinia: user/groups/projects/tasks/cycles/wiki/dnd/toast/taskPanel
│   └── router/index.ts     # Vue Router（base=/cycle/）
├── server/                 # バックエンド (Hono)
│   ├── db/                 # schema.ts / connection.ts / seed.ts / init.ts
│   ├── routes/             # users/groups/projects/cycles/tasks/wiki/notifications/browse/ai/directory
│   └── index.ts            # エントリポイント（/api と /api/v1 を両マウント）
├── data/omucycle.db        # SQLite 実体
├── docs/redesign-2026-05/  # 大改修の設計記録
└── dist/                   # ビルド成果物（nginxが配信）
```

## 画面一覧（router/index.ts が正）

| パス | 画面 |
|------|------|
| `/` | → `/my` へリダイレクト |
| `/my` `/my/inbox` | インボックス（個人スペース） |
| `/my/today` `/my/upcoming` | 今日 / 近日予定 |
| `/my/tasks` `/my/calendar` | マイタスク / マイカレンダー |
| `/my/filters` | フィルター&ラベル |
| `/notifications` | 通知 |
| `/settings` | 個人設定 |
| `/:groupSlug` | → `/:groupSlug/tasks` へリダイレクト |
| `/:groupSlug/tasks` | グループのタスク一覧（リスト/ボード） |
| `/:groupSlug/projects` `/cycles` `/calendar` `/wiki` `/settings` | グループ配下機能 |
| `/:groupSlug/:projectSlug` | プロジェクトホーム |
| `/:groupSlug/:projectSlug/cycles/:n` | サイクル詳細 |
| `/:groupSlug/:projectSlug/tasks/:n` | タスク詳細 |

## API

- パス: `/api/...`（内部用）と `/api/v1/...`（外部向けバージョン明示）の両マウント
- 認証: nginx の SSOヘッダ（`X-Auth-User` 等）または `X-Api-Key`
  （`OMUCYCLE_API_KEYS` カンマ区切り）。代理指定は `X-On-Behalf-Of`
- ルート単位の一覧は `server/routes/` の各ファイルが正。スラグ解決系は `/api/browse/...`
- 外部向けドキュメント: `docs/redesign-2026-05/03_api_external.md`

## ポート設定

- **OmuCycle API**: 127.0.0.1:3260（`CYCLE_API_PORT`、pm2 name=omu-cycle。2026-07-11 に 3180 から移設・本番化）
- **フロント開発**: 5180（vite。本番は nginx が ~/omucycle/dist/ を配信）
- 同居サービスのポート台帳は `~/projectcore/document/architecture/README.md` を参照

## 開発コマンド

```bash
npm install && npm run db:init   # 初回セットアップ
npm run dev                      # フロントエンドのみ (vite)
npm run dev:server               # APIサーバーのみ
npm run db:reset                 # DBリセット（デモデータ再投入）
npm run build                    # ビルド → dist/
```

開発サーバー管理: `npm run dev:start / dev:stop / dev:restart / dev:status / dev:logs`
（`scripts/dev-server.sh`。PID/ログは `.pids/` `.logs/`）

**本番反映**: フロントは `npm run build`（nginxがdist配信）、
サーバーは `pm2 restart omu-cycle`。

## 開発スタンス

- ユーザーから仕様の提案があった場合、そのまま実装するだけでなく、より良いアプローチがあればサジェストすること
- 「こうした方がいいかも」「この設計だと将来こういう問題が出そう」など、建設的な代替案を提示する
- ただし最終判断はユーザーに委ねる。押し付けない
- 技術選定・データモデル・UI設計いずれもサジェスト対象

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
| アクセントカラー | `text-primary` / `bg-primary/10` | `text-[#dc4c3e]` |
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
- スライドアニメーション
- リアクションUI (`TaskComments.vue`)
- **上記以外ではscoped CSSを使わない**

### 任意値 (`[...]`) の使用ルール
- **幅/高さ**: レイアウト上の固定値はOK (`w-[280px]`, `w-[750px]` 等)
- **カラー**: **禁止** — 必ずテーマトークンを使う
- **フォントサイズ**: **禁止** — Tailwind標準スケールを使う
- **スペーシング**: 原則禁止。標準スケールで表現できない場合のみ許可
