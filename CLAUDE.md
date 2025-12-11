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
│   ├── components/
│   ├── views/
│   ├── stores/            # Pinia stores
│   └── router/
├── server/                 # バックエンドソース (Hono)
│   ├── db/                # データベース関連
│   │   ├── schema.ts      # スキーマ定義
│   │   ├── init.ts        # 初期化スクリプト
│   │   └── connection.ts  # DB接続
│   ├── routes/            # APIルート
│   │   ├── users.ts
│   │   ├── groups.ts
│   │   ├── tasks.ts
│   │   └── job-definitions.ts
│   └── index.ts           # サーバーエントリポイント
├── data/                   # SQLiteデータベース (gitignore)
└── mddocument/            # 要件定義書等
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

# 開発サーバー起動（フロントエンド + API）
npm run dev:all

# フロントエンドのみ
npm run dev

# APIサーバーのみ
npm run dev:server

# ビルド
npm run build
```

## データモデル概要

主要テーブル:
- `users` - ユーザー (SSO/ゲスト)
- `groups` - グループ (課・チーム単位)
- `group_memberships` - グループメンバー
- `job_definitions` - 業務定義（テンプレート）
- `task_templates` - タスクテンプレート
- `job_instances` - 年度業務インスタンス
- `tasks` - タスク
- `task_comments` - コメント
- `decision_logs` - AI判断ログ
- `knowledge` - ナレッジ

詳細は `/mddocument/02_データモデル.md` を参照。

## 主要機能

1. **グループ管理** - 課・チーム単位でのグループ作成・メンバー管理
2. **業務定義** - 年間で繰り返す業務のテンプレート化
3. **タスク管理** - 3階層までの親子タスク、ステータス・優先度管理
4. **業務カレンダー** - 年間/月間/週間ビュー
5. **フラッシュカード** - AI問いかけによる意思決定支援 (開発予定)
6. **ナレッジベース** - 判断ログからの知識蓄積 (開発予定)

## 注意事項

- SQLiteは `data/omucycle.db` に保存 (gitignore対象)
- 本番環境ではPostgreSQLへの移行を検討
- 認証は現在未実装 (Entra ID SSO予定)
