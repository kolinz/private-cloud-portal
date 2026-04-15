# Nano Private Cloud Portal

学生・小規模組織（100名規模まで）向けの **軽量プライベートクラウド管理ポータル**。

Incus / LXC コンテナを WebUI から管理します。

---

## 機能一覧

- **インスタンス管理** — コンテナの作成・起動・停止・削除
- **テンプレート管理** — プリセット / カスタムテンプレートの管理
- **ユーザー管理** — Admin / User ロールによる権限制御
- **ポートフォワーディング** — ホストポート ↔ コンテナポートのマッピング
- **リバースプロキシ連携** — Nginx によるパスベースルーティング（8880番ポート）
- **ログ閲覧** — インスタンスログ・コンソールログの表示
- **ターミナル** — ブラウザから WebSocket 経由でコンテナに接続
- **永続ストレージ管理** — Incus `dir` プールを使ったファイルストレージ（Amazon EFS 相当）
- **管理者ダッシュボード** — ホストリソース使用状況・ユーザー別集計

---

## 技術スタック

| レイヤ | 技術 |
|---|---|
| Frontend | React 18 + TypeScript 5 + Tailwind CSS 3 + Vite 5 |
| Backend | Node.js 24 + Fastify 4 + TypeScript 5 |
| DB | SQLite + Drizzle ORM（better-sqlite3） |
| Container API | Incus REST API（Unix socket） |
| Reverse Proxy | Nginx |
| Auth | @fastify/session（セッション認証） |
| Validation | Zod 3 |
| Monorepo | pnpm workspaces |

---

## 前提条件

- **OS**: Ubuntu 24.04 LTS（WSL2 可）
- **Node.js**: 24.x（nvm 推奨）
- **pnpm**: 最新版
- **Incus**: 0.7 以上（開発中は `INCUS_MOCK=true` で代替可）
- **Nginx**: 1.24 以上（リバースプロキシ機能を使う場合）
- **ビルドツール**: `build-essential`（`better-sqlite3` のネイティブビルドに必要）

---

## セットアップ

### 1. ビルドツールのインストール

```bash
sudo apt update
sudo apt install -y python3 make g++ build-essential
```

### 2. Node.js 24 のインストール（nvm）

```bash
# nvm をインストール
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
# シェルを再起動する代わりに実行
\. "$HOME/.nvm/nvm.sh"
# Node.js 24 をインストール
nvm install 24
# バージョン確認
node -v   # v24.x.x
npm -v
```

### 3. pnpm のインストール

```bash
npm install -g pnpm
pnpm --version
```

### 4. リポジトリのクローン

```bash
git clone https://github.com/kolinz/nano-private-cloud-portal.git
cd private-cloud-portal
```

### 5. 依存パッケージのインストール

```bash
pnpm install
```

> `better-sqlite3` のネイティブビルドが走ります。`build-essential` が入っていないと失敗します。

### 6. 環境変数の設定

```bash
cp .env.example .env.staging
```

以下の項目を環境に合わせて編集します:

| 変数名 | 変更内容 |
|---|---|
| `ADMIN_USERNAME` | 初期管理者のユーザー名を設定 |
| `ADMIN_PASSWORD` | 初期管理者のパスワードを設定（8文字以上） |
| `SYSTEM_NAME` | UI に表示するポータル名称を設定 |
| `SESSION_SECRET` | 任意の長い文字列に変更（`openssl rand -hex 32` で生成可） |

その他の項目はデフォルトのまま動作します。Incus を使わない場合は `./dev.sh --mock` で起動してください。

---

## Incus のセットアップ

Incus を使う場合（`INCUS_MOCK=false`）、以下の設定が必要です。

### Incus のインストールと初期化

```bash
# Incus インストール（Ubuntu 24.04）
sudo apt install -y incus
sudo incus admin init --auto
```

### ユーザーのグループ追加

```bash
sudo usermod -aG incus-admin $USER
newgrp incus-admin

# 確認
ls -la /var/lib/incus/unix.socket   # group: incus-admin であること
curl --unix-socket /var/lib/incus/unix.socket http://localhost/1.0
```

### プロジェクト設定

```bash
incus project list       # "current" が default になっているか確認
incus project switch default
```

---

## 起動

### 開発サーバー

Incus が起動している環境:

```bash
./dev.sh
```

Incus が使えない環境（モック動作）:

```bash
./dev.sh --mock
```

- フロントエンド: http://localhost:5173
- バックエンド API: http://localhost:3000
- WebSocket（ターミナル）: ws://localhost:3001

### 手動起動（バックエンドのみ）

```bash
pnpm --filter @pcp/backend dev
```

### 手動起動（フロントエンドのみ）

```bash
pnpm --filter @pcp/frontend dev
```

---

## DB のリセット

スキーマ変更後や初期化が必要なときに実行します。

```bash
./reset.sh && ./dev.sh
```

> `reset.sh` は `.env.staging` の `DATABASE_PATH` を自動で読み取り、DBファイルを削除します。

---

## ログイン

起動後、http://localhost:5173 にアクセスします。

| 項目 | 値 |
|---|---|
| ユーザー名 | `admin`（`ADMIN_USERNAME` の値） |
| パスワード | `password123`（`ADMIN_PASSWORD` の値） |

初期管理者は起動時に環境変数から自動作成されます。

---

## ディレクトリ構成

```
private-cloud-portal/
├── packages/
│   ├── backend/
│   │   └── src/
│   │       ├── index.ts              # Fastify エントリーポイント
│   │       ├── plugins/
│   │       │   ├── auth.ts           # セッション認証
│   │       │   └── db.ts             # Drizzle ORM 接続
│   │       ├── routes/
│   │       │   ├── auth.ts
│   │       │   ├── instances.ts
│   │       │   ├── templates.ts
│   │       │   ├── users.ts
│   │       │   ├── portforwards.ts
│   │       │   ├── proxy.ts
│   │       │   ├── logs.ts
│   │       │   ├── terminal.ts
│   │       │   ├── storage.ts
│   │       │   └── dashboard.ts
│   │       ├── services/
│   │       │   ├── incus.ts          # Incus API クライアント（Unix socket）
│   │       │   ├── nginx.ts          # Nginx 設定生成・リロード
│   │       │   └── system.ts
│   │       └── db/
│   │           ├── schema.ts         # Drizzle スキーマ定義
│   │           └── migrate.ts        # マイグレーション & シード
│   └── frontend/
│       └── src/
│           ├── App.tsx
│           ├── pages/
│           │   ├── LoginPage.tsx
│           │   ├── DashboardPage.tsx
│           │   ├── InstancesPage.tsx
│           │   ├── InstanceDetailPage.tsx
│           │   ├── TemplatesPage.tsx
│           │   ├── UsersPage.tsx
│           │   ├── ProxyPage.tsx
│           │   └── StorageVolumesPage.tsx
│           ├── hooks/
│           └── api/
│               └── client.ts
├── .env.example
├── .env.staging
├── dev.sh                            # 開発サーバー起動スクリプト
├── reset.sh                          # DB リセットスクリプト
└── package.json
```

---

## 環境変数リファレンス

| 変数名 | 説明 | デフォルト |
|---|---|---|
| `PORT` | バックエンドポート | `3000` |
| `DATABASE_PATH` | SQLite DB ファイルパス | `./data/portal.db` |
| `SESSION_SECRET` | セッション署名シークレット（本番は必ず変更） | `dev-secret-change-me` |
| `INCUS_SOCKET_PATH` | Incus Unix socket パス | `/var/lib/incus/unix.socket` |
| `INCUS_PROJECT` | Incus プロジェクト名 | `default` |
| `INCUS_MOCK` | `true` でモック動作（Incus 不要） | `false` |
| `FRONTEND_ORIGIN` | CORS 許可オリジン | `http://localhost:5173` |
| `ADMIN_USERNAME` | 初期管理者ユーザー名 | — |
| `ADMIN_PASSWORD` | 初期管理者パスワード | — |
| `SYSTEM_NAME` | ポータル名称（UI表示用） | `Private Cloud Portal` |
| `WS_PORT` | WebSocket（ターミナル）ポート | `3001` |
| `NGINX_CONF_PATH` | Nginx 設定ファイルパス | `/etc/nginx/conf.d/portal.conf` |

---

## 動作確認（curl）

サーバー起動後:

```bash
# ログイン（Cookie を保存）
curl -c /tmp/cookie.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'

# ログインユーザー確認
curl -b /tmp/cookie.txt http://localhost:3000/api/auth/me

# インスタンス一覧
curl -b /tmp/cookie.txt http://localhost:3000/api/instances

# ストレージプール確認
curl -b /tmp/cookie.txt http://localhost:3000/api/storage/pools

# ダッシュボード統計（Admin のみ）
curl -b /tmp/cookie.txt http://localhost:3000/api/dashboard/stats | jq '.resources.host'
```

---

## ユーザーロール

| 操作 | Admin | User |
|---|---|---|
| ダッシュボード閲覧 | ✅ | ❌ |
| 全コンテナ閲覧 | ✅ | 自分のみ |
| コンテナ作成・削除 | ✅ | ✅（自分のみ） |
| ユーザー管理 | ✅ | ❌ |
| テンプレート管理 | ✅ | 閲覧のみ |
| リバースプロキシ管理 | ✅ | ❌ |
| ストレージ管理 | ✅ | ✅（自分のみ） |

---

## トラブルシューティング

### `better-sqlite3` のビルド失敗

```bash
sudo apt install -y python3 make g++ build-essential
# package.json の better-sqlite3 を "^11.0.0" に固定して再インストール
rm -rf node_modules packages/*/node_modules
pnpm install
```

### Incus 接続エラー

```bash
# グループ確認
groups $USER
# incus-admin が含まれていなければ追加
sudo usermod -aG incus-admin $USER
newgrp incus-admin
# ソケット確認
curl --unix-socket /var/lib/incus/unix.socket http://localhost/1.0
```

### TypeScript エラー

```bash
pnpm typecheck
# packages/backend の moduleResolution が "bundler" になっているか確認
```

### セッションが切れた（サーバー再起動後）

サーバー再起動後はセッションが無効になります。再ログインしてから動作確認してください。

---

## 本番環境へのデプロイ

本番環境では `.env.example` をコピーして `SESSION_SECRET` を必ず変更してください。

### コードの配置

```bash
sudo git clone https://github.com/<your-org>/private-cloud-portal.git /opt/private-cloud-portal
sudo chown -R <your-user>:<your-user> /opt/private-cloud-portal
cd /opt/private-cloud-portal
pnpm install
```

### 環境変数の設定

```bash
cp .env.example .env.production
# SESSION_SECRET を長いランダム文字列に変更
openssl rand -hex 32
```

### systemd サービス登録

```ini
# /etc/systemd/system/private-cloud-portal.service
[Unit]
Description=Private Cloud Portal
After=network.target incus.service

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/opt/private-cloud-portal
EnvironmentFile=/opt/private-cloud-portal/.env.production
ExecStart=/usr/bin/node packages/backend/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable private-cloud-portal
sudo systemctl start private-cloud-portal
```

---

## ライセンス

MIT
