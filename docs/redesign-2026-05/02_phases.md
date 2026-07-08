# 実装フェーズ詳細

## Phase 1: 基盤刷新

### やること
- [ ] `server/db/schema.ts` を新スキーマに丸ごと書き換え
- [ ] `server/db/init.ts` でクリーンリセット → 新スキーマ適用
- [ ] 旧ルート削除: `job-definitions.ts`, `job-instances.ts`, `group-statuses.ts`, `workflow-rules.ts`, `timez.ts`
- [ ] 新ルート骨格作成: `projects.ts`, `cycles.ts`, `wiki.ts`, `notifications.ts`
- [ ] `server/routes/sticky-notes.ts` の参照テーブルを project_id ベースに更新
- [ ] `server/routes/tasks.ts` を 3段階ステータス・project_id ベースに更新
- [ ] `server/routes/browse.ts` を新URL構造に対応（`/api/browse/:slug/:projectSlug`、`T-N`）
- [ ] `server/index.ts` のルート登録を更新
- [ ] `seed.ts` を新スキーマで書き直し（デモ: 1 group / 2 projects / 1 cycle / いくつかのタスク）
- [ ] 旧 view を一旦コメントアウトでルータから外す
- [ ] Timez を omu-office にエクスポート → omu-cycle 側削除

### Definition of Done
- `npm run db:reset` が走る
- `npm run dev:start` が起動する
- 既存の旧画面アクセスは 404 か "刷新中" 表示でも可

## Phase 2: プロジェクト + タスクコア

### やること
- [ ] `src/views/ProjectList.vue` 新規（プロジェクト一覧、作成、アーカイブ）
- [ ] `src/views/ProjectHome.vue` 新規（タスクリスト = `/:groupSlug/:projectSlug`）
- [ ] `src/views/TaskList.vue` をリストビュー / カンバンビュー / グループ化（assignee/cycle/priority）に再構成
- [ ] `src/views/TaskDetail.vue` を3段階固定ステータス＋進捗ログUI付きに改修
- [ ] `src/components/task/ProgressLogPanel.vue` 進捗ログ追加 UI（%スライダー＋テキスト）
- [ ] `src/components/task/RecurrencePicker.vue` Todoist 風繰り返し設定
- [ ] `src/components/task/TaskRow.vue` リスト行
- [ ] `src/stores/projects.ts`、`src/stores/tasks.ts`（再設計）
- [ ] `src/router/index.ts` ルート定義変更
- [ ] `src/components/AppSidebar.vue` プロジェクトナビゲーション

### Definition of Done
- グループ → プロジェクト → タスクの作成・編集・削除が一通り動く
- ステータスは 3段階固定で、進捗ログから`%`を任意に記録できる
- 繰り返しを設定したタスクが、完了後に次回タスクを自動生成する（バックグラウンド処理 or 完了時生成）

## Phase 3: ふせんボード再構築

### やること
- [ ] `src/views/StickyBoard.vue` 大改修（プロジェクト紐付け、複数ボードタブ）
- [ ] 付箋作成 = タスク作成（projectのT-Nを採番）
- [ ] 付箋編集 = タスクのタイトル更新（双方向）
- [ ] **投げ縄選択**: 空白から start drag で矩形選択 → 離した瞬間に選択中の付箋を新規グループ化
- [ ] **重なりグルーピング**: 付箋同士の重なりが閾値超でグループ化
- [ ] グループ間移動の自然なアニメーション
- [ ] **関係線**: 付箋から線をドラッグ → 別の付箋にドロップで `sticky_relations` レコード作成
- [ ] 関係線の表示（SVG オーバーレイ）
- [ ] 親子関係（`tasks.parent_task_id`）も別スタイルの線で表示
- [ ] 個人ボード: My プロジェクト（`is_personal=1`）の board として実装

### Definition of Done
- ふせんを書いてタスクとしても扱える、その逆も動く
- 投げ縄／重なり両方でグループ化できる
- 関係線が引け、保存・再読込で復元される

## Phase 4: サイクル

### やること
- [ ] `src/views/CycleList.vue`（サイクル一覧、現在/未来/完了）
- [ ] `src/views/CycleDetail.vue`（タスク追加、進捗バー、バーンダウン簡易）
- [ ] サイクル切替セレクタ（`ProjectHome` 上部）
- [ ] サイクル未割当タスクのフィルタ
- [ ] サイクル完了時に未完タスクを次サイクルへ移行する操作

### Definition of Done
- プロジェクト内でサイクルが作成でき、タスクをサイクルに割り付けて表示できる
- サイクル別の進捗が見られる

## Phase 5: Wiki

### やること
- [ ] `src/views/WikiHome.vue` `WikiPage.vue`
- [ ] 階層ページのサイドナビ
- [ ] Markdown エディタ（軽量、`@tiptap/starter-kit` か簡易プレビュー方式）
- [ ] スラッグ自動採番、改名対応
- [ ] タスク/プロジェクトへの内部リンク `[[T-3]]` 風の処理（最小実装）

### Definition of Done
- グループ単位で Wiki ページが作成・編集・削除できる
- 階層構造が組める

## Phase 6: サイドバー + 通知

### やること
- [ ] サイドバーに所属グループ全表示
- [ ] グループ名横の **未読バッジ**（`notifications.read_at IS NULL` のカウント）
- [ ] グループ展開時にプロジェクトリスト
- [ ] `Inbox.vue` を実装（通知一覧、既読化）
- [ ] 通知生成トリガ:
  - タスク担当者割当
  - 自分担当タスクへのコメント
  - 自分担当タスクの進捗ログ
  - Wiki 更新（フォロー対象）
- [ ] バッジは API で `GET /api/notifications/summary` 一発取得

### Definition of Done
- サイドバーに全グループ + 未読数が出る
- 受信トレイが機能する
