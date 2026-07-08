# 外部アプリからの API 利用

omu-cycle の API を、大学内の他アプリ（学生向け統合アプリ等）からも呼び出せるように分離可能な構成に整備した。

## 認証方式（2系統）

### 1) Entra ID ヘッダ認証（既存・omu-cycle 内部利用）
nginx で SSO セッションを検証し、`X-Auth-Email` / `X-Auth-Name` ヘッダを下流に注入。
omu-cycle のフロント自体はこの仕組みで認証される。

### 2) API キー認証（外部アプリ向け）
リクエストヘッダ `X-Api-Key: <key>` で認証。

**サーバ側設定:**
```
OMUCYCLE_API_KEYS=key_for_university_app,key_for_another_app
```
カンマ区切りで複数キー登録可能。

**代理ユーザー指定（オプション）:**
```
X-On-Behalf-Of: yusuke.tanaka@omu.ac.jp
```
を併送すると、その emailのユーザーとしてリクエストされたものとして扱う。

## API バージョニング

| パス | 用途 |
|---|---|
| `/api/...` | 既存パス（omu-cycle 内部フロントが使用中） |
| `/api/v1/...` | バージョン明示パス（外部アプリ向け推奨） |

両者は同じ実装にマウントされており、将来 v2 を出しても v1 は維持する。

## CORS

許可オリジンは環境変数 `CORS_ALLOW_ORIGINS` でカンマ区切り追加可。
デフォルトで以下を許可:
- `https://dxtools.cii.omu.ac.jp`
- `https://dxtools.omu.ac.jp`
- localhost（開発用）

## 主要エンドポイント（外部利用想定）

```
GET  /api/v1/users/:id/groups       # ユーザの所属グループ
GET  /api/v1/users/:id/tasks        # ユーザの担当タスク横断

GET  /api/v1/groups/:id/projects    # グループのプロジェクト一覧
GET  /api/v1/projects/:id/tasks     # プロジェクトのタスク一覧
GET  /api/v1/tasks/:id              # タスク詳細
PATCH /api/v1/tasks/:id/status      # ステータス変更
POST  /api/v1/tasks/:id/progress-logs  # 進捗ログ投稿

GET  /api/v1/wiki/groups/:groupId/pages    # Wiki ツリー
GET  /api/v1/wiki/pages/:id                # ページ取得
```

## クライアント例

```ts
const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': process.env.OMUCYCLE_API_KEY,
  'X-On-Behalf-Of': currentUser.email,
};

const res = await fetch('https://dxtools.omu.ac.jp/cycle/api/v1/users/' + userId + '/tasks', { headers });
```

## 今後の TODO

- [ ] OpenAPI / Swagger 定義の自動生成
- [ ] APIキー単位のレート制限
- [ ] スコープベース権限（read-only キー、write キー等）
- [ ] webhooks（外部アプリへのイベント通知）
