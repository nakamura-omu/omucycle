# OmuCycle 大改修 (2026-05) — 概要

## ねらい

業務テンプレート前提の重い構造を捨て、Todoist／Plane／Notion 風の軽量な「プロジェクト管理 + ふせん + サイクル + Wiki」に作り直す。

## 設計の決定事項

| # | 項目 | 決定 |
|---|---|---|
| 1 | 業務テンプレート | **全廃**（job_definitions / task_templates / workflow_rules / template_shares / job_instances） |
| 2 | 階層 | `Group → Project → (Cycle, Task, StickyBoard, Wiki)` の4本柱 |
| 3 | タスク進捗 | 固定3段階 `not_started / in_progress / completed`、`group_statuses` 廃止 |
| 4 | 進捗ログ | `task_progress_logs` 新設（%、テキスト、時刻） |
| 5 | ふせん | タスクと **1対1双方向**、ふせんは tasks の装飾レイヤー |
| 6 | ふせんボード | プロジェクトに紐付く、デフォルト1個・複数可 |
| 7 | グルーピング | **投げ縄 + 重なり判定** 両方サポート |
| 8 | ふせん関係線 | `tasks.parent_task_id` ＋ `sticky_relations` で可視化 |
| 9 | 繰り返し | Todoist 風（毎日／毎週指定曜日／毎月N日／RRULE 風） |
| 10 | サイクル | **プロジェクト単位**（Plane と同じ）、タスクは0〜1個のサイクル |
| 11 | Wiki | **グループ単位**、階層ページ |
| 12 | サイドバー | 所属グループを全表示 + 未読/関連カウントバッジ |
| 13 | Timez（つぶやき） | omu-cycle から削除 → omu-office に移管 |
| 14 | 既存データ | クリーンスタート（DB リセット） |

## 廃止するもの

**テーブル**
- `job_definitions`, `task_templates`, `workflow_rules`, `template_shares`
- `job_instances`
- `group_statuses`
- `timez_posts`, `timez_comments`, `timez_hashtags`

**ファイル**
- `server/routes/job-definitions.ts`
- `server/routes/job-instances.ts`
- `server/routes/group-statuses.ts`
- `server/routes/workflow-rules.ts`
- `server/routes/timez.ts`
- `src/views/JobDefinitionList.vue`, `JobDefinitionDetail.vue`
- `src/views/JobInstanceList.vue`, `JobInstanceDetail.vue`
- `src/views/Timez.vue`
- `src/components/job-definition/`, `src/components/job-workspace/`, `src/components/timez/`
- `src/stores/timez.ts`

## 新規導入

**テーブル**
- `projects`, `project_members`
- `cycles`
- `task_progress_logs`
- `task_recurrences`
- `sticky_relations`
- `wiki_pages`
- `notifications`

**ファイル（主なもの）**
- `server/routes/projects.ts`
- `server/routes/cycles.ts`
- `server/routes/wiki.ts`
- `server/routes/notifications.ts`
- `src/views/ProjectList.vue`, `ProjectHome.vue`, `CycleList.vue`, `CycleDetail.vue`, `WikiPage.vue`
- `src/components/project/`, `src/components/cycle/`, `src/components/wiki/`, `src/components/sticky/`

## URL 構造（新）

```
/                                          グループ一覧
/my                                        マイホーム
/my/board                                  個人ふせんボード（My プロジェクトの board）
/my/tasks                                  自分のタスク横断
/inbox                                     通知一覧

/:groupSlug                                グループダッシュボード
/:groupSlug/projects                       プロジェクト一覧
/:groupSlug/wiki                           Wiki トップ
/:groupSlug/wiki/:pageSlug                 Wiki ページ
/:groupSlug/settings                       グループ設定

/:groupSlug/:projectSlug                   プロジェクトHOME（タスクリスト）
/:groupSlug/:projectSlug/board             ふせんボード
/:groupSlug/:projectSlug/board/:boardSlug  追加ボード
/:groupSlug/:projectSlug/cycles            サイクル一覧
/:groupSlug/:projectSlug/cycles/:cycleNum  サイクル詳細
/:groupSlug/:projectSlug/T-:taskNum        タスク詳細
```

## 実装フェーズ

| Phase | 内容 |
|---|---|
| 1 | スキーマ刷新 + クリーンスタート（旧テーブル/旧ルート削除、seed 刷新） |
| 2 | プロジェクト + タスクコア（3段階ステータス、進捗ログ、繰り返し） |
| 3 | ふせんボード再構築（1対1、投げ縄、重なり、関係線） |
| 4 | サイクル |
| 5 | Wiki |
| 6 | サイドバー + 通知 |
