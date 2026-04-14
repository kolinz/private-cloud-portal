# 実装プロンプト集
## 小規模プライベートクラウド基盤ポータル
### Ubuntu Linux 作業用 / Claude.ai SDD実装ガイド v2.2

---

> **使い方**
> 各プロンプトは上から順番に使う。
> 前のステップの出力ファイルが存在する前提で次のプロンプトを貼る。
> 各プロンプトは「そのままコピペ」で使えるように書いてある。
>
> **⚠️ ファイル出力について**
> 各STEPの末尾に「📥 ファイル出力（必須）」という指示が入っている。
> Claudeはコードをチャットに貼るだけでなく、必ずダウンロード可能なファイルとして出力する。
> ダウンロードしたファイルを Ubuntu にコピーして使うこと。

---

## STEP 0 ── Ubuntu 環境セットアップ確認

```
以下の環境でWebアプリを開発します。まず環境を確認・セットアップしてください。

【OS】Ubuntu 22.04 LTS
【目的】Node.js + TypeScript のモノレポプロジェクトを作る

以下を順番に実行してください。

1. ネイティブモジュールのビルドに必要なツールをインストール
   sudo apt update
   sudo apt install -y python3 make g++ build-essential

2. Node.js 24 が入っているか確認
   入っていなければ nvm でインストール:
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   source ~/.bashrc
   nvm install 24
   nvm use 24

3. pnpm が入っているか確認
   入っていなければ: npm install -g pnpm

4. git の初期設定確認

5. 確認できたら以下のバージョンを表示してください:
   - node --version
   - pnpm --version
   - git --version
   - python3 --version
   - g++ --version

問題なければ「環境OK」と報告してください。
```

---

## STEP 1 ── プロジェクト雛形生成

```
以下の仕様でモノレポプロジェクトを作成してください。

【プロジェクト名】private-cloud-portal
【作業ディレクトリ】~/projects/private-cloud-portal
【パッケージマネージャ】pnpm workspaces

## ディレクトリ構成（この通りに作ること）

private-cloud-portal/
├── package.json              # ワークスペースルート
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── backend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── plugins/
│   │       ├── routes/
│   │       ├── services/
│   │       ├── db/
│   │       └── types/
│   └── frontend/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── pages/
│           ├── components/
│           ├── hooks/
│           └── api/

## ルート package.json

{
  "name": "private-cloud-portal",
  "private": true,
  "scripts": {
    "dev": "pnpm --parallel -r dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "bcrypt",
      "better-sqlite3",
      "esbuild"
    ]
  }
}

## pnpm-workspace.yaml

packages:
  - 'packages/*'

## tsconfig.base.json

{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}

## backend/package.json の dependencies

{
  "name": "@pcp/backend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^4.27.0",
    "@fastify/cookie": "^9.3.1",
    "@fastify/session": "^10.8.0",
    "@fastify/cors": "^9.0.1",
    "drizzle-orm": "^0.30.10",
    "better-sqlite3": "^11.0.0",
    "bcrypt": "^5.1.1",
    "zod": "^3.23.8",
    "uuid": "^9.0.1",
    "pino-pretty": "^13.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/bcrypt": "^5.0.2",
    "@types/uuid": "^9.0.8",
    "@types/node": "^22.0.0",
    "tsx": "^4.14.1",
    "typescript": "^5.4.5",
    "drizzle-kit": "^0.21.4"
  }
}

## frontend/package.json の dependencies

{
  "name": "@pcp/frontend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.23.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.5",
    "vite": "^5.3.1"
  }
}

## 作業手順

1. ディレクトリ・ファイル構造を作成
2. 各 package.json を配置
3. pnpm install を実行
4. tailwindcss を初期化: cd packages/frontend && npx tailwindcss init -p
5. vite.config.ts に proxy設定（/api → http://localhost:3000）を追加
6. 全ファイルをリストアップして「構造OK」と報告

エラーが出た場合はエラー内容を貼ること。
## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 2 ── DBスキーマ & マイグレーション

```
以下の仕様で packages/backend/src/db/schema.ts と migrate.ts を実装してください。

## schema.ts（Drizzle ORM + SQLite）

以下のテーブルをすべて実装すること。

### users
- id: text PRIMARY KEY (UUID)
- username: text NOT NULL UNIQUE
- password_hash: text NOT NULL
- role: text enum('admin','user') DEFAULT 'user'
- is_active: integer(boolean) DEFAULT true
- created_at: text NOT NULL

### templates
- id: text PRIMARY KEY
- name: text NOT NULL
- description: text
- type: text enum('preset','custom')
- role: text enum('general','reverse_proxy') DEFAULT 'general'
- image_alias: text NOT NULL
- cpu_limit: integer
- memory_limit: text
- disk_limit: text
- is_active: integer(boolean) DEFAULT true
- created_at: text NOT NULL

### instances
- id: text PRIMARY KEY
- name: text NOT NULL UNIQUE
- owner_user_id: text NOT NULL REFERENCES users(id)
- template_id: text REFERENCES templates(id)
- status: text enum('running','stopped','starting','stopping','error') DEFAULT 'stopped'
- node_name: text NOT NULL DEFAULT 'local'
- ip_address: text
- created_at: text NOT NULL

### port_forwards
- id: text PRIMARY KEY
- instance_id: text NOT NULL REFERENCES instances(id) ON DELETE CASCADE
- host_port: integer NOT NULL
- container_port: integer NOT NULL
- protocol: text enum('tcp','udp') DEFAULT 'tcp'
- description: text
- is_enabled: integer(boolean) DEFAULT true

### reverse_proxy_routes
- id: text PRIMARY KEY
- proxy_instance_id: text NOT NULL REFERENCES instances(id)
- target_instance_id: text NOT NULL REFERENCES instances(id)
- path: text NOT NULL UNIQUE
- target_port: integer NOT NULL DEFAULT 80
- created_at: text NOT NULL

### system_settings
- key: text PRIMARY KEY
- value: text NOT NULL

### storage_volumes（永続ストレージ）
- id: text PRIMARY KEY
- name: text NOT NULL UNIQUE        ← Incus内部名: vol-{uuid8}
- display_name: text NOT NULL       ← UI表示名
- owner_user_id: text NOT NULL REFERENCES users(id)
- pool_name: text NOT NULL DEFAULT 'default'
- size: text NOT NULL               ← 例: "10GB"
- description: text
- created_at: text NOT NULL

### storage_attachments（アタッチメント）
- id: text PRIMARY KEY
- instance_id: text NOT NULL REFERENCES instances(id) ON DELETE CASCADE
- volume_id: text NOT NULL REFERENCES storage_volumes(id)
- mount_path: text NOT NULL         ← 例: /mnt/data
- device_name: text NOT NULL        ← Incusデバイス名: vol-{uuid8}
- attached_at: text NOT NULL

## migrate.ts

起動時に呼び出すマイグレーション関数を実装。
- DBファイルパス: process.env.DATABASE_PATH ?? './data/portal.db'
- data/ ディレクトリが存在しない場合は作成する
- 関数名: runMigrations（エイリアス: runMigrationsAndSeed も export すること）
- DrizzleDB 型を export すること:
  export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;
- 返り値は drizzle インスタンス単体（{ db, sqlite } オブジェクトは不可）

## 初期データ投入（seed）

マイグレーション後に以下のプリセットテンプレートを INSERT（存在しない場合のみ）:

1. Ubuntu 22.04 LTS / imageAlias: ubuntu/22.04 / cpu:2 / mem:512MB / disk:10GB / role:general
2. Debian 12 / imageAlias: debian/12 / cpu:2 / mem:512MB / disk:10GB / role:general
3. Rocky Linux 9 / imageAlias: rockylinux/9 / cpu:2 / mem:1GB / disk:20GB / role:general

## 管理者の自動作成

環境変数から初期管理者を自動作成する（DB未初期化の場合のみ）:
  ADMIN_USERNAME / ADMIN_PASSWORD / SYSTEM_NAME

実装後、TypeScriptのコンパイルエラーがないことを確認してください。
## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 3 ── 共通型 & Fastifyサーバー基盤

```
以下を実装してください。

## packages/backend/src/types/index.ts

以下のDTO型をすべて定義:

export type UserDTO = {
  id: string; username: string; role: 'admin'|'user';
  isActive: boolean; createdAt: string;
}

export type TemplateDTO = {
  id: string; name: string; description: string|null;
  type: 'preset'|'custom'; role: 'general'|'reverse_proxy';
  imageAlias: string; cpuLimit: number|null;
  memoryLimit: string|null; diskLimit: string|null;
  isActive: boolean; createdAt: string;
}

export type InstanceDTO = {
  id: string; name: string;
  ownerUserId: string; ownerUsername: string;
  templateId: string|null; templateName: string|null;
  templateRole: 'general'|'reverse_proxy'|null;
  status: 'running'|'stopped'|'starting'|'stopping'|'error';
  nodeName: string; ipAddress: string|null; createdAt: string;
}

export type PortForwardDTO = {
  id: string; instanceId: string;
  hostPort: number; containerPort: number;
  protocol: 'tcp'|'udp'; description: string|null; isEnabled: boolean;
}

export type ProxyRouteDTO = {
  id: string;
  proxyInstanceId: string; proxyInstanceName: string;
  targetInstanceId: string; targetInstanceName: string;
  path: string; targetPort: number; createdAt: string;
}

export type StorageVolumeDTO = {
  id: string; name: string; displayName: string;
  ownerUserId: string; ownerUsername: string;
  poolName: string; size: string; description: string|null;
  createdAt: string;
  attachments: { instanceId: string; instanceName: string; mountPath: string }[];
}

export type StorageAttachmentDTO = {
  id: string; instanceId: string; volumeId: string;
  displayName: string; volumeName: string; poolName: string;
  mountPath: string; deviceName: string; attachedAt: string;
}

export type ErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'VALIDATION_ERROR' | 'INVALID_CREDENTIALS'
  | 'USERNAME_TAKEN' | 'NAME_TAKEN' | 'PORT_CONFLICT'
  | 'HOSTNAME_TAKEN' | 'TEMPLATE_IN_USE' | 'INSTANCE_RUNNING'
  | 'TARGET_NOT_RUNNING' | 'ALREADY_INITIALIZED' | 'INCUS_ERROR'
  | 'INTERNAL_ERROR' | 'CANNOT_DELETE_SELF'
  | 'VOLUME_IN_USE' | 'MOUNT_PATH_CONFLICT'
  | 'VOLUME_ALREADY_ATTACHED' | 'VOLUME_NOT_OWNED';

export type ErrorResponse = {
  error: ErrorCode; message: string; details?: unknown;
}

---

## packages/backend/src/plugins/db.ts

Fastifyプラグインとして Drizzle + better-sqlite3 を接続。
- fp（fastify-plugin）でデコレート: fastify.decorate('db', drizzleInstance)
- 起動時に runMigrationsAndSeed() を呼ぶ
- 返り値（drizzle インスタンス）をそのまま fastify.db にセットすること

---

## packages/backend/src/plugins/auth.ts

Fastifyプラグインとして認証ミドルウェアを実装。

- @fastify/cookie + @fastify/session を登録
- セッション設定: secret=process.env.SESSION_SECRET??'dev-secret-change-me', maxAge:86400000
- 以下のデコレータを追加:
  - fastify.authenticate: PreHandlerHook（session.userId未設定なら401）
  - fastify.requireAdmin: PreHandlerHook（role!=='admin'なら403）
- request.session に userId: string を型付け

---

## packages/backend/src/index.ts

Fastifyサーバーのエントリーポイント。

- ポート: process.env.PORT ?? 3000
- @fastify/cors: origin: 'http://localhost:5173', credentials: true
- プラグイン登録順: db → auth → routes
- グローバルエラーハンドラ: ZodError は 422 VALIDATION_ERROR、
  それ以外は 500 INTERNAL_ERROR で統一レスポンス

## ⚠️ Node 24 + tsx: import拡張子は .ts を使うこと（.js は不可）
例: `import dbPlugin from './plugins/db.ts'`

## ⚠️ packages/backend/tsconfig.json の修正（必須）
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}

## ⚠️ pino-pretty は dependencies に必ず入れること（消えやすいので注意）
"pino-pretty": "^13.0.0"

実装後 `pnpm --filter @pcp/backend dev` で起動確認してください。
## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 4 ── 認証 & オンボーディング API

```
以下のAPIルートを実装してください。

## packages/backend/src/routes/auth.ts

### POST /api/auth/login
Body: { username: string, password: string }
処理:
1. Zodでバリデーション
2. DBからusername検索
3. bcrypt.compareでパスワード照合
4. 成功: session.userId = user.id → 200 { user: UserDTO }
5. 失敗: 401 { error: 'INVALID_CREDENTIALS', message: '...' }

### POST /api/auth/logout
処理: session.destroy() → 200 { ok: true }

### GET /api/auth/me
PreHandler: authenticate
処理: session.userId でユーザー取得 → 200 { user: UserDTO }

---

## packages/backend/src/routes/onboarding.ts

### GET /api/onboarding/status
処理: system_settings に key='initialized' があるか確認
→ 200 { initialized: boolean }

### POST /api/onboarding
Body Zodスキーマ:
{
  systemName: z.string().min(1).max(100),
  adminUsername: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  adminPassword: z.string().min(8).max(128)
}
処理:
1. initialized=true なら 409 ALREADY_INITIALIZED
2. adminUser作成（bcrypt.hash rounds:10）
3. system_settings に initialized='true', system_name=systemName を INSERT
4. 200 { ok: true }

---

## packages/backend/src/services/system.ts

isInitialized(): Promise<boolean> を実装。

---

## テスト（curlで確認）

# ログイン
curl -c /tmp/cookie.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'

# me確認
curl -b /tmp/cookie.txt http://localhost:3000/api/auth/me

各レスポンスを貼って確認してください。
## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 5 ── ユーザー & テンプレート API

```
以下のAPIルートを実装してください。

## packages/backend/src/routes/users.ts（Admin専用）

すべてのルートに PreHandler: [authenticate, requireAdmin] を付ける。

### GET /api/users → { users: UserDTO[] }
### POST /api/users → 201 { user: UserDTO }  409: USERNAME_TAKEN
### PATCH /api/users/:id → 200 { user: UserDTO }
### DELETE /api/users/:id → 200 { ok: true }  400: CANNOT_DELETE_SELF

---

## packages/backend/src/routes/templates.ts

### GET /api/templates（PreHandler: authenticate）
- Admin: 全件 / User: isActive=true のみ

### POST /api/templates（Admin専用）
→ 201 { template: TemplateDTO }

### PATCH /api/templates/:id（Admin専用）
→ 200 { template: TemplateDTO }

### DELETE /api/templates/:id（Admin専用）
→ 200 { ok: true }  409: TEMPLATE_IN_USE

---

## テスト

⚠️ サーバーを再起動した場合はセッションが切れるため、先に再ログインすること

curl -b /tmp/cookie.txt http://localhost:3000/api/templates
curl -b /tmp/cookie.txt http://localhost:3000/api/users

結果を貼ること。
## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 6 ── Incus APIクライアント

```
以下のファイルを実装してください。

## packages/backend/src/services/incus.ts

【接続方式】
Unix socket: /var/lib/incus/unix.socket
undici の Agent を使って接続。全APIに ?project=default を付けること。

import { fetch, Agent } from 'undici';
const SOCKET = process.env.INCUS_SOCKET_PATH ?? '/var/lib/incus/unix.socket';
const PROJECT = process.env.INCUS_PROJECT ?? 'default';
const agent = new Agent({ connect: { socketPath: SOCKET } });

【実装する関数】

// インスタンス操作
listInstances(): Promise<string[]>
getInstance(name: string): Promise<unknown>
getInstanceState(name: string): Promise<{ status: string; ipAddress: string|null }>
createInstance(params: { name, imageAlias, cpuLimit?, memoryLimit?, diskLimit? }): Promise<void>
  ※ source に mode:'pull', server:'https://images.linuxcontainers.org', protocol:'simplestreams' を使うこと
  ※ devices.root に path:'/' を必ず含めること
  ※ waitOperation のタイムアウトは 300 秒
startInstance(name: string): Promise<void>
stopInstance(name: string): Promise<void>
restartInstance(name: string): Promise<void>
deleteInstance(name: string): Promise<void>
getInstanceLog(name: string): Promise<string>
getConsoleLog(name: string): Promise<string>

// ストレージプール
listStoragePools(): Promise<string[]>
// GET /1.0/storage-pools?project=default

// ストレージボリューム
listVolumes(pool: string): Promise<string[]>
createVolume(pool: string, name: string, size: string): Promise<void>
// POST /1.0/storage-pools/{pool}/volumes/custom?project=default  Body: { name, config: { size } }
deleteVolume(pool: string, name: string): Promise<void>

// ボリュームアタッチ/デタッチ
attachVolume(params: { instanceName, deviceName, poolName, volumeName, mountPath }): Promise<void>
// PATCH /1.0/instances/{name}?project=default
// Body: { devices: { [deviceName]: { type:"disk", pool, source, path } } }

detachVolume(instanceName: string, deviceName: string): Promise<void>
// GET で全デバイス取得 → deviceName を除去 → PUT で上書き（PATCH+空オブジェクト方式は使わないこと）

【エラー型】
export class IncusError extends Error {
  constructor(public incusMessage: string, public statusCode: number) { ... }
}

【INCUS_MOCK=true の挙動】
- listStoragePools → ['default', 'ssd']
- listVolumes → []
- createVolume / deleteVolume / attachVolume / detachVolume → 即時 resolve
- createInstance → 500ms待機して resolve
- その他 → 適切なモックレスポンスを返す

## ⚠️ undici のインストール（必須）
cd packages/backend && pnpm add undici

動作確認（INCUS_MOCK=true で起動）:
  INCUS_MOCK=true pnpm --filter @pcp/backend dev
## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 7 ── インスタンス API（コア）

```
以下を実装してください。

## packages/backend/src/routes/instances.ts

すべてのルートに PreHandler: [authenticate] を付ける。
一般ユーザーは自分のインスタンスのみ操作可能。Admin は全件操作可能。

### GET /api/instances → { instances: InstanceDTO[] }
### POST /api/instances → 202 非同期作成
### GET /api/instances/:id → { instance: InstanceDTO }
### POST /api/instances/:id/start → 202
### POST /api/instances/:id/stop → 202
### POST /api/instances/:id/restart → 202

### DELETE /api/instances/:id
処理:
1. status='running' なら 409 INSTANCE_RUNNING
2. storageAttachments を全件取得し、各デバイスを incus.detachVolume() でデタッチ
   （失敗しても WARN ログのみ、削除処理は続行）
3. incus.deleteInstance()
4. DB DELETE（port_forwards, storage_attachments は CASCADE で削除）
5. ストレージボリューム自体は削除しない

---

## packages/backend/src/routes/portforwards.ts

### GET /api/instances/:id/portforwards → { portForwards: PortForwardDTO[] }
### POST /api/instances/:id/portforwards → 201  409: PORT_CONFLICT
### PATCH /api/instances/:instanceId/portforwards/:pfId → 200
### DELETE /api/instances/:instanceId/portforwards/:pfId → 200

---

## テスト

INCUS_MOCK=true で起動して確認:

curl -c /tmp/cookie.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'

curl -b /tmp/cookie.txt http://localhost:3000/api/instances

結果を貼ること。
## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 8 ── Nginx & リバースプロキシ API

```
以下を実装してください。

## packages/backend/src/services/nginx.ts

ホスト上のnginxを直接設定するパスベースリバースプロキシ管理。

generateNginxConf(routes): string   → 全ルートからnginx設定を生成（listen 8880）
writeNginxConf(conf): Promise<void> → NGINX_CONF_PATH に書き込み
reloadNginx(): Promise<void>        → nginx -s reload を実行

⚠️ incus exec は使わない。ホスト上のnginxを直接操作する。

---

## packages/backend/src/routes/proxy.ts（Admin専用）

### GET /api/proxy/routes → { routes: ProxyRouteDTO[] }
### POST /api/proxy/routes → 201  400: TARGET_NOT_RUNNING  409: HOSTNAME_TAKEN
### DELETE /api/proxy/routes/:id → 200

---

## packages/backend/src/routes/logs.ts

### GET /api/instances/:id/logs?type=instance|console&lines=100
→ 200 { logs: string[], totalLines: number }

---

## テスト

curl -b /tmp/cookie.txt http://localhost:3000/api/proxy/routes

各レスポンスを貼って確認してください。
## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 9 ── フロントエンド基盤（ルーティング・APIクライアント・レイアウト）

```
以下をReact + TypeScript + Tailwind で実装してください。

## packages/frontend/src/api/client.ts

型付きfetchラッパーを実装。credentials: 'include' を常に付ける。

export const api = {
  auth: { login, logout, me },
  onboarding: { status, setup },
  instances: { list, get, create, start, stop, restart, delete, publish, logs },
  templates: { localImages, downloadImage, list, create, patch, delete },
  users: { list, create, patch, delete },
  portForwards: { list, create, patch, delete },
  proxy: { list, create, delete },
  storage: {
    listPools(): Promise<{pools: string[]}>,
    listVolumes(): Promise<{volumes: StorageVolumeDTO[]}>,
    createVolume(body): Promise<{volume: StorageVolumeDTO}>,
    deleteVolume(id): Promise<{ok: true}>,
    listAttachments(instanceId): Promise<{attachments: StorageAttachmentDTO[]}>,
    attach(instanceId, body): Promise<{attachment: StorageAttachmentDTO}>,
    detach(instanceId, attachmentId): Promise<{ok: true}>,
  },
}

型定義も同ファイルに inline で定義すること（StorageVolumeDTO, StorageAttachmentDTO を含む）。

---

## packages/frontend/src/hooks/useAuth.tsx

React Context + Hook でログイン状態を管理。

---

## packages/frontend/src/App.tsx

React Router v6 でルーティング設定:

/login               → <LoginPage>（未ログイン）
/                    → <AppLayout>（ログイン済み）
  /instances         → <InstancesPage>
  /instances/:id     → <InstanceDetailPage>
  /storage           → <StorageVolumesPage>（全ユーザー）
  /templates         → <TemplatesPage>（Admin）
  /users             → <UsersPage>（Admin）
  /proxy             → <ProxyPage>（Admin）

---

## packages/frontend/src/components/layout/AppLayout.tsx

サイドバーメニュー（上から順）:
  - Instances（全ユーザー）
  - Storage（全ユーザー）
  - Templates（Adminのみ）
  - Users（Adminのみ）
  - Proxy Routes（Adminのみ）

フッターにユーザー名・ロール・ログアウトボタン。
Tailwindのみ使用（外部UIライブラリ不可）。カラーパレット: slate 基調、アクセント blue-600。

## ファイル配置先

| ダウンロードファイル | 配置先 |
|---|---|
| `client.ts` | `packages/frontend/src/api/client.ts` |
| `useAuth.tsx` | `packages/frontend/src/hooks/useAuth.tsx` |
| `App.tsx` | `packages/frontend/src/App.tsx` |
| `AppLayout.tsx` | `packages/frontend/src/components/layout/AppLayout.tsx` |

## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 10 ── インスタンス一覧・作成画面

```
以下のページとコンポーネントを実装してください。

## packages/frontend/src/pages/InstancesPage.tsx

- ステータス別サマリーカード（Total / Running / Stopped）
- "+ New Instance" ボタン
- テーブル: name / template / owner(Adminのみ) / IP / status / actions
- starting/stopping のインスタンスがある場合は 3秒ポーリング

## InstanceStatusBadge
running: 緑ドット / stopped: グレー / starting|stopping: 黄色点滅 / error: 赤

## InstanceCreateModal
- インスタンス名（/^[a-z][a-z0-9-]*[a-z0-9]$/ リアルタイムバリデーション）
- テンプレート選択
- ローディングスピナー付き作成ボタン

## packages/frontend/src/hooks/useInstances.ts

## ファイル配置先

| ダウンロードファイル | 配置先 |
|---|---|
| `InstancesPage.tsx` | `packages/frontend/src/pages/InstancesPage.tsx` |
| `InstanceStatusBadge.tsx` | `packages/frontend/src/components/instances/InstanceStatusBadge.tsx` |
| `InstanceCreateModal.tsx` | `packages/frontend/src/components/instances/InstanceCreateModal.tsx` |
| `useInstances.ts` | `packages/frontend/src/hooks/useInstances.ts` |

## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 11 ── インスタンス詳細画面（ログ・ポートフォワード）

```
以下を実装してください。

## packages/frontend/src/pages/InstanceDetailPage.tsx

【ヘッダー】コンテナ名(mono) + ステータスバッジ + IP + アクションボタン + ← 戻るボタン

【タブ構成】4つ（この順序・この名前で固定）:
type Tab = 'logs' | 'terminal' | 'storage' | 'portforwards';
{(['logs', 'terminal', 'storage', 'portforwards'] as Tab[]).map(tab => (

タブラベル: Logs / Terminal / Storage / Port Forwards

---

## Tab: Logs → <LogViewer>
モノスペース黒背景、ログレベル色分け、Auto refresh トグル、最新へスクロールボタン

## Tab: Terminal → <TerminalViewer instanceId userId />
status=running のみ表示。停止中は「インスタンスを起動してからターミナルに接続できます」

## Tab: Storage → <StorageTab instanceId instanceStatus />
（STEP 15 で実装済みのコンポーネントを使う）

## Tab: Port Forwards
一覧 + 追加フォーム（PORT_CONFLICT エラー対応）

## ファイル配置先

| ダウンロードファイル | 配置先 |
|---|---|
| `InstanceDetailPage.tsx` | `packages/frontend/src/pages/InstanceDetailPage.tsx` |
| `LogViewer.tsx` | `packages/frontend/src/components/logs/LogViewer.tsx` |

## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 12 ── 管理画面（Templates・Users・Proxy）

```
以下の3ページを実装してください。

## TemplatesPage（Admin専用）
カードグリッド（3列）/ 追加モーダル / TEMPLATE_IN_USE エラー対応

## UsersPage（Admin専用）
テーブル + 追加・編集モーダル / 自分自身の削除は無効

## ProxyPage（Admin専用）
ルートテーブル + 接続フォーム（status=running のコンテナのみ選択可）
アクセス: http://localhost:8880/app1 でコンテナにアクセスできる

---

## InstanceDetailPage に Terminal タブを追加

⚠️ STEP 11 で作成した InstanceDetailPage.tsx に Terminal タブを追加すること。

タブ配列は必ず4つ:
type Tab = 'logs' | 'terminal' | 'storage' | 'portforwards';
{(['logs', 'terminal', 'storage', 'portforwards'] as Tab[]).map(tab => (

## ファイル配置先

| ダウンロードファイル | 配置先 |
|---|---|
| `TemplatesPage.tsx` | `packages/frontend/src/pages/TemplatesPage.tsx` |
| `UsersPage.tsx` | `packages/frontend/src/pages/UsersPage.tsx` |
| `ProxyPage.tsx` | `packages/frontend/src/pages/ProxyPage.tsx` |
| `InstanceDetailPage.tsx` | `packages/frontend/src/pages/InstanceDetailPage.tsx`（上書き） |

## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 13 ── ログイン画面

⚠️ オンボーディング画面は廃止。初期管理者は環境変数（ADMIN_USERNAME / ADMIN_PASSWORD）から自動作成する方式に変更。

```
以下の画面を実装してください。

## LoginPage（/login）

中央配置、ロゴ（テキスト）+ フォームカード
ログイン成功後: /instances へリダイレクト
エラー表示: 「ユーザー名またはパスワードが正しくありません」

---

## .env.staging（検証用）

PORT=3000
DATABASE_PATH=./data/staging.db
SESSION_SECRET=staging-secret-change-before-production
INCUS_MOCK=false
INCUS_SOCKET_PATH=/var/lib/incus/unix.socket
INCUS_PROJECT=default
FRONTEND_ORIGIN=http://localhost:5173
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password123
SYSTEM_NAME=Private Cloud Portal (Staging)
WS_PORT=3001

---

## 最終確認事項

1. 全ルートで認証チェックが機能するか
2. Admin/Userのロール切替で表示が変わるか
3. ログイン → インスタンス作成 の一連フローが動くか

## DB リセット手順

./reset.sh && ./dev.sh

## ファイル配置先

| ダウンロードファイル | 配置先 |
|---|---|
| `LoginPage.tsx` | `packages/frontend/src/pages/LoginPage.tsx` |
| `App.tsx` | `packages/frontend/src/App.tsx`（上書き） |
| `migrate.ts` | `packages/backend/src/db/migrate.ts`（上書き） |

## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 14 ── 統合テスト & 本番設定

```
以下の確認と設定を行ってください。

## 動作確認チェックリスト

### 認証フロー
[ ] /login でログイン成功・失敗
[ ] ログアウト後に /login にリダイレクト

### Admin操作
[ ] テンプレート追加・削除
[ ] ユーザー追加・無効化
[ ] インスタンス全件表示

### インスタンス接続確認
[ ] incus list でインスタンスが Running か確認
[ ] incus exec <名前> -- /bin/bash で接続できるか確認

### ポートフォワーディング確認
[ ] Web UI でポートフォワードを追加（Host 8080 → Container 80）
[ ] incus config device list <名前> で pf-xxxxxxxx が表示されること
[ ] curl localhost:8080 でアクセスできること

### エラー表示
[ ] 重複名でインスタンス作成 → エラーメッセージ表示
[ ] 重複ポートでポートフォワード追加 → エラーメッセージ表示

---

## 本番向け環境変数ファイル作成（.env.example）

PORT=3000
DATABASE_PATH=./data/portal.db
SESSION_SECRET=replace-with-long-random-secret-string
INCUS_SOCKET_PATH=/var/lib/incus/unix.socket
INCUS_MOCK=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
WS_PORT=3001

---

## systemd サービスファイル・README.md を生成

すべて完了したら「実装完了」と報告してください。
## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## STEP 15 ── 永続ストレージ管理

```
以下の仕様で永続ストレージ管理機能を実装してください。

## 設計方針

- 種別: ファイルストレージ（Amazon EFS 相当）
  コンテナ内の指定パスにディレクトリとしてバインドマウントされる
- ストレージボリュームはインスタンスとは独立したライフサイクル
- アタッチ → 即時 Incus デバイス永続登録（インスタンス停止中でも可）
- デタッチ → 即時 Incus デバイス削除
- start/stop → 変更なし（Incus が自動維持）
- インスタンス削除 → 全デバイスをデタッチ → ボリューム自体は残す

---

## 15-1: DB スキーマ（schema.ts・migrate.ts に追加）

storage_volumes テーブルと storage_attachments テーブルを追加すること。
（STEP 2 の schema.ts 定義を参照）

---

## 15-2: DTO・エラーコード（types/index.ts に追加）

StorageVolumeDTO / StorageAttachmentDTO を追加。
ErrorCode に以下を追加:
  'VOLUME_IN_USE' | 'MOUNT_PATH_CONFLICT' | 'VOLUME_ALREADY_ATTACHED' | 'VOLUME_NOT_OWNED'

---

## 15-3: Incus サービス拡張（incus.ts に追加）

以下の関数を追加:
  listStoragePools() / listVolumes(pool) / createVolume(pool, name, size)
  deleteVolume(pool, name) / attachVolume(params) / detachVolume(instanceName, deviceName)

detachVolume は GET で全デバイス取得 → 対象除去 → PUT 上書き方式を使うこと。
INCUS_MOCK=true 時は全関数即時 resolve（listStoragePools は ['default', 'ssd'] を返す）。

---

## 15-4: ストレージ API ルート（routes/storage.ts を新規作成）

### Zod スキーマ
```typescript
const VolumeCreateSchema = z.object({
  displayName: z.string().min(1).max(100),
  size: z.string().regex(/^\d+(MB|GB)$/),
  description: z.string().max(500).optional(),
  poolName: z.string().min(1).default('default'),
});

const AttachSchema = z.object({
  volumeId: z.string().uuid(),
  mountPath: z.string()
    .regex(/^\/[a-zA-Z0-9_\-/]+$/)
    .refine(p => !['/etc','/var','/usr','/bin','/sbin',
                   '/lib','/proc','/sys','/dev','/run','/'].includes(p)),
});
```

### エンドポイント
- GET    /api/storage/pools           → { pools: string[] }
- GET    /api/storage/volumes         → Admin: 全件 / User: 自分のみ
- POST   /api/storage/volumes         → vol-{uuid8} で内部名を生成 → Incus作成 → DB INSERT
- GET    /api/storage/volumes/:id
- DELETE /api/storage/volumes/:id     → アタッチ中なら 409 VOLUME_IN_USE（details.attachedTo を含める）
- GET    /api/instances/:id/storage
- POST   /api/instances/:id/storage   → 重複チェック → Incusアタッチ → DB INSERT
- DELETE /api/instances/:instanceId/storage/:attachmentId → Incusデタッチ（失敗はWARNのみ）→ DB DELETE

### 権限ルール
- Admin: 全ボリューム・全インスタンスに対して操作可
- User: 自分のボリュームのみ。他ユーザーのボリュームへは 403 VOLUME_NOT_OWNED

---

## 15-5: instances.ts の DELETE を修正

削除前に storageAttachments を全件取得し、各デバイスを incus.detachVolume() でデタッチ。
失敗しても WARN ログのみで削除処理は続行。ボリューム自体は削除しない。

---

## 15-6: index.ts にルート登録

```typescript
import storageRoutes from './routes/storage.ts';
await fastify.register(storageRoutes);
```

---

## 15-7: フロントエンド

### api/client.ts に追加
StorageVolumeDTO / StorageAttachmentDTO 型定義と storage: { ... } セクションを追加。

### hooks/useStorage.ts（新規）
useStorageVolumes() と useInstanceStorage(instanceId) を実装。

### pages/StorageVolumesPage.tsx（新規）
- ヘッダー直下にファイルストレージ説明バナー（青背景）:
  「ファイルストレージ（Amazon EFS 相当）- コンテナ内の指定パスにディレクトリとしてマウント。
   通常のファイル操作がそのまま使えます。インスタンスを削除してもデータは保持されます。」
- テーブル: 表示名 / 内部名(mono) / プール / サイズ / オーナー / 使用中インスタンス / 作成日 / 削除
- 使用中インスタンスバッジに cursor-help + tooltip:
  「マウントパス: {mountPath}\n\nターミナルから確認:\n  incus config device show {instanceName}」
- VolumeCreateModal: 表示名 / プール(動的取得) / サイズ(プリセット+カスタム) / 説明

### components/instances/StorageTab.tsx（新規）
- アタッチ済みボリューム一覧テーブル（デタッチボタン付き）
- アタッチフォーム: 未アタッチのボリュームのみ選択可 + マウントパス入力
- status=running の場合「起動中のインスタンスへのアタッチは即時反映されます」を表示

### pages/InstanceDetailPage.tsx（上書き）
タブを4つに固定:
type Tab = 'logs' | 'terminal' | 'storage' | 'portforwards';
{(['logs', 'terminal', 'storage', 'portforwards'] as Tab[]).map(tab => (

### components/layout/AppLayout.tsx（上書き）
サイドバーに Storage を追加（Instances の次、全ユーザー表示）。

### App.tsx（上書き）
/storage ルートを全ユーザー向けに追加。

---

## ファイル配置先

| ダウンロードファイル | 配置先 |
|---|---|
| `schema.ts` | `packages/backend/src/db/schema.ts`（上書き） |
| `migrate.ts` | `packages/backend/src/db/migrate.ts`（上書き） |
| `types_index.ts` | `packages/backend/src/types/index.ts`（上書き） |
| `incus.ts` | `packages/backend/src/services/incus.ts`（上書き） |
| `storage.ts` | `packages/backend/src/routes/storage.ts`（新規） |
| `instances.ts` | `packages/backend/src/routes/instances.ts`（上書き） |
| `index.ts` | `packages/backend/src/index.ts`（上書き） |
| `client.ts` | `packages/frontend/src/api/client.ts`（上書き） |
| `useStorage.ts` | `packages/frontend/src/hooks/useStorage.ts`（新規） |
| `StorageVolumesPage.tsx` | `packages/frontend/src/pages/StorageVolumesPage.tsx`（新規） |
| `StorageTab.tsx` | `packages/frontend/src/components/instances/StorageTab.tsx`（新規） |
| `InstanceDetailPage.tsx` | `packages/frontend/src/pages/InstanceDetailPage.tsx`（上書き） |
| `AppLayout.tsx` | `packages/frontend/src/components/layout/AppLayout.tsx`（上書き） |
| `App.tsx` | `packages/frontend/src/App.tsx`（上書き） |

---

## テスト（INCUS_MOCK=false で実施）

### DB リセット（スキーマ変更のため必須）
./reset.sh && ./dev.sh

### ストレージプール確認
curl -b /tmp/cookie.txt http://localhost:3000/api/storage/pools
# → { pools: ["default"] }

### ボリューム作成
curl -b /tmp/cookie.txt -X POST http://localhost:3000/api/storage/volumes \
  -H "Content-Type: application/json" \
  -d '{"displayName":"My Data","size":"5GB","poolName":"default"}'

### Incus 上で確認
incus storage volume list default
# → vol-xxxxxxxx が表示されること

### アタッチ後の確認
incus config device show <instanceName>
# → vol-xxxxxxxx: { path: /mnt/data, pool: default, source: vol-xxxxxxxx, type: disk }

### 永続化の確認
incus exec <instanceName> -- touch /mnt/data/test.txt
incus stop <instanceName> && incus start <instanceName>
incus exec <instanceName> -- ls /mnt/data
# → test.txt が残っていること

### インスタンス削除後のボリューム残存確認
curl -b /tmp/cookie.txt -X DELETE http://localhost:3000/api/instances/<id>
curl -b /tmp/cookie.txt http://localhost:3000/api/storage/volumes
incus storage volume list default
# → ボリュームが残っていること

## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

## 補足プロンプト集（問題発生時）

---

### トラブルシュート: better-sqlite3 ビルド失敗（Node 24環境）

```
better-sqlite3 のインストールで以下のようなエラーが出て失敗しています。

  Failed in X.Xs at .../better-sqlite3

## 修正手順
1. sudo apt install -y python3 make g++ build-essential
2. better-sqlite3 を "^11.0.0" に更新
3. rm -rf node_modules packages/*/node_modules && pnpm install
```

---

### トラブルシュート: Incus接続エラー

```
Incus Unix socketへの接続でエラーが発生しています。

1. ls -la /var/lib/incus/unix.socket
2. groups $USER
3. sudo usermod -aG incus-admin $USER && newgrp incus-admin
4. curl --unix-socket /var/lib/incus/unix.socket http://localhost/1.0
```

---

### トラブルシュート: TypeScriptエラー

```
以下のTypeScriptコンパイルエラーを修正してください。

[エラー内容をここに貼る]

修正方針:
- as any は使わないこと
- 修正後 pnpm typecheck を実行してエラーがないことを確認すること
```

---

## 将来拡張メモ（MVP対象外）

以下は今後の追加機能候補として検討中のもの:

- HAクラスタ・マルチホスト対応
- 複数リバースプロキシ
- HTTPS + Let's Encrypt 自動証明書
- WebSocket対応ログストリーム
- コンテナリソース使用状況グラフ
- SSO連携（LDAP/SAML）
- **スナップショット管理** — `incus snapshot` を使った時系列バックアップ・ロールバック
  （btrfs/zfs ストレージドライバー使用時に特に有効）
- ✅ **永続ストレージ管理** — STEP 15 で実装済み（ファイルストレージ / Amazon EFS 相当）
- ✅ **管理者ダッシュボード** — STEP 16 で実装済み（ホストリソース使用状況・ユーザー別集計）

---

*以上でプロンプト集は完成です。STEP 0 → 16 の順に進めてください。*

---

## 実装ノート：WSL環境での検証で判明した注意事項

### Incus 接続・権限

```
# incus-admin グループへの追加が必要（incus グループだけでは不足）
sudo usermod -aG incus-admin $USER
newgrp incus-admin

# ソケットのグループ確認
ls -la /var/lib/incus/unix.socket  # → group: incus-admin であること

# Incus プロジェクトの確認
incus project list  # → "current" が default になっていること
incus project switch default
# .env.staging に追加: INCUS_PROJECT=default
```

### Incus 初期化

```
sudo incus admin init --auto
```

### インスタンス作成でイメージ未取得エラーが出る場合

```typescript
source: {
  type: 'image', mode: 'pull',
  server: 'https://images.linuxcontainers.org',
  protocol: 'simplestreams',
  alias: params.imageAlias,
},
```

初回ダウンロードは数分かかるため waitOperation のタイムアウトを 300 秒にすること。

### Incus デバイスの root パス指定

```typescript
devices['root'] = { type: 'disk', pool: 'default', path: '/', size: params.diskLimit };
```

### ポートフォワーディング

```typescript
await incusJSON(`/1.0/instances/${instanceName}`, {
  method: 'PATCH',
  body: JSON.stringify({
    devices: {
      [deviceName]: { type: 'proxy', listen: `tcp:0.0.0.0:${hostPort}`, connect: `tcp:127.0.0.1:${containerPort}` },
    },
  }),
});
```

WSL・VM 環境では `localhost:<hostPort>` でアクセスする（コンテナ IP では不可）。

### WebSocket ターミナル実装方針

- `node-pty` はネイティブモジュールのためビルド環境によっては使えない
- **推奨: `child_process.spawn` で `incus exec` を直接起動** し stdin/stdout を WebSocket に繋ぐ
- WebSocket は Vite の HMR と競合するため **3001 番ポートに分離**すること
- 出力の改行は `\n` → `\r\n` に変換すること

```typescript
const proc = spawn('incus', ['exec', instanceName, `--project=${PROJECT}`, '--', '/bin/bash', '-i'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, TERM: 'xterm-256color' },
});
proc.stdout.on('data', (d) => ws.send(d.toString().replace(/\r?\n/g, '\r\n')));
proc.stderr.on('data', (d) => ws.send(d.toString().replace(/\r?\n/g, '\r\n')));
```

### pino-pretty は毎回消える

`packages/backend/package.json` の `dependencies` に必ず含めること。`package.json` を更新するたびに確認すること:

```json
"pino-pretty": "^13.0.0"
```

### InstanceDetailPage のタブ構成（STEP 12・15 以降）

タブは必ず 4 つ。出力するたびに確認すること:

```typescript
type Tab = 'logs' | 'terminal' | 'storage' | 'portforwards';
{(['logs', 'terminal', 'storage', 'portforwards'] as Tab[]).map(tab => (
```

### オンボーディング画面

廃止。初期管理者は環境変数から自動作成:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=password123
SYSTEM_NAME=Private Cloud Portal
```

### ログ取得 API

```typescript
const listRes = await incusFetch(`/1.0/instances/${name}/logs`);
const logFiles = listBody.metadata ?? [];
const logFileName = logFiles[logFiles.length - 1]?.split('/').pop();
const res = await incusFetch(`/1.0/instances/${name}/logs/${logFileName}`);
```

### リバースプロキシ設計

ホスト上の nginx を直接設定するパスベース方式。nginx は **8880 番ポート**で動作。

```bash
sudo apt install -y nginx
```

環境変数: `NGINX_CONF_PATH=/etc/nginx/conf.d/portal.conf`

### IP アドレス取得（起動直後）

```typescript
for (let i = 0; i < 10; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const state = await incus.getInstanceState(name).catch(() => null);
  ipAddress = state?.ipAddress ?? null;
  if (ipAddress) break;
}
```

### migrate.ts の返り値と DrizzleDB 型（重要）

```typescript
export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;
export { runMigrations as runMigrationsAndSeed };

export async function runMigrations(): Promise<DrizzleDB> {
  // ...
  return db;  // ← { db, sqlite } ではなく drizzle インスタンス単体を返すこと
}
```

`return { db, sqlite }` にすると `fastify.db.select is not a function` エラーになる。

### ストレージボリュームのデタッチ（Incus）

PATCH + 空オブジェクト方式はバージョン依存のため使わない。安全な方式:

```typescript
// GET で現在のデバイスを取得 → 対象を除去 → PUT で全体を上書き
const meta = await incusJSON(`/1.0/instances/${instanceName}`);
const devices = { ...(meta.devices ?? {}) };
delete devices[deviceName];
await incusJSON(`/1.0/instances/${instanceName}`, {
  method: 'PUT',
  body: JSON.stringify({ ...meta, devices }),
});
```

### ストレージ種別について

ファイルストレージ（Amazon EFS 相当）。`dir` ドライバーの場合 `df` に独立エントリとして出ないが正常動作。

確認コマンド:

```bash
incus config device show <instanceName>      # デバイス設定確認
incus storage volume list default            # ボリューム一覧
incus storage volume show default <volName>  # アタッチ先確認
```

### プリセットテンプレートのシードデータ（STEP 2 以降）

Nginx Reverse Proxy は含めない。以下の3件のみ:

```
1. Ubuntu 22.04 LTS / imageAlias: ubuntu/22.04 / cpu:2 / mem:512MB / disk:10GB / role:general
2. Debian 12          / imageAlias: debian/12    / cpu:2 / mem:512MB / disk:10GB / role:general
3. Rocky Linux 9      / imageAlias: rockylinux/9 / cpu:2 / mem:1GB   / disk:20GB / role:general
```

### templates.ts の listLocalImages レスポンス（重要）

`incus.listLocalImages()` は `LocalImage[]`（オブジェクト配列）を返す。
フロントエンドの `localImages.includes(alias)` が機能するよう、**フラットな文字列配列に変換して返すこと**。

```typescript
// GET /api/templates/images/local ハンドラ内
const images = await incus.listLocalImages();
const aliases = images.flatMap(img => img.aliases.map(a => a.name));  // ← フラット変換
return reply.send({ aliases });
```

### ログイン後のリダイレクト

`LoginPage.tsx` のログイン成功後は `/instances` ではなく `/` に遷移すること。
`App.tsx` の `DefaultRedirect` コンポーネントが role を見て振り分ける。

```typescript
// LoginPage.tsx
navigate('/', { replace: true });  // ← / に遷移（直接 /instances ではない）

// App.tsx
function DefaultRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'admin' ? '/dashboard' : '/instances'} replace />;
}
```

### getHostResources の URL（重要）

`/1.0/resources` は project クエリパラメータ不要。
`url()` ヘルパーで自動付与される `?project=default` を除外すること。

```typescript
// incus.ts の url() ヘルパー内
function url(path: string): string {
  if (path.startsWith('/1.0/resources')) return `http://localhost${path}`;  // ← project パラメータ不要
  return `http://localhost${path}${path.includes('?') ? '&' : '?'}project=${PROJECT}`;
}
```

---

## STEP 16 ── 管理者ダッシュボード

```
以下の仕様で管理者専用ダッシュボード機能を実装してください。

## 設計方針

- Admin のみアクセス可能（/api/dashboard/stats は requireAdmin で保護）
- ホストの物理リソース（RAM・ディスク）を基準に、割り当て済み容量と残量を表示
- running インスタンスのリソース使用量を Incus state API から並列取得
- ユーザー別の使用量・割り当て量を集計
- 30秒ごとに自動更新（サイレント）
- ログイン後のデフォルト遷移先を Admin は /dashboard に変更

---

## 16-1: incus.ts に2関数を追加

### getHostResources(): Promise<HostResources>
GET /1.0/resources（project パラメータ不要）

```typescript
export interface HostResources {
  memory: { total: number; used: number };   // bytes
  disk:   { total: number; used: number };   // bytes
  cpu:    { cores: number; threads: number };
}
```

INCUS_MOCK=true 時:
  memory: { total: 16GB, used: 4GB }
  disk:   { total: 100GB, used: 20GB }
  cpu:    { cores: 4, threads: 8 }

### listLocalImages(): Promise<LocalImage[]>
GET /1.0/images?recursion=1

### downloadImage(alias: string): Promise<void>
POST /1.0/images  source: { type:'image', mode:'pull', server:'https://images.linuxcontainers.org', protocol:'simplestreams', alias }
operation を待機（timeout: 300秒）

---

## 16-2: バックエンド API（routes/dashboard.ts を新規作成）

### GET /api/dashboard/stats（Admin専用）

レスポンス:
```typescript
{
  instances: {
    total, running, stopped, starting, stopping, error,
    list: InstanceResourceRow[]  // 全件・作成日降順
  },
  users:     { total, active, admins },
  templates: { total, active, general, reverseProxy },
  resources: {
    host: HostResources,           // GET /1.0/resources
    containerUsage: {              // running インスタンスの合計実使用量
      memory: number,              // bytes
      disk:   number,              // bytes
    },
    allocated: {                   // DB のテンプレート設定から計算
      memoryBytes: number,         // 全インスタンスの memoryLimit 合計
      diskBytes:   number,         // 全インスタンスの diskLimit 合計
    },
    perUser: UserResourceSummary[],  // メモリ割り当て降順
  },
  system: { name, uptimeSeconds, nodeVersion, platform, generatedAt },
}
```

InstanceResourceRow:
```typescript
{
  id, name, status, ownerUserId, ownerUsername, templateName,
  ipAddress, createdAt,
  resources: ResourceMetrics | null,    // running のみ取得
  memoryLimitBytes: number | null,      // parseSizeToBytes(template.memoryLimit)
  diskLimitBytes:   number | null,      // parseSizeToBytes(template.diskLimit)
}
```

UserResourceSummary:
```typescript
{
  userId, username,
  instanceCount, runningCount,
  memoryUsage, diskUsage,     // running 時の実使用量合計 (bytes)
  memoryAlloc, diskAlloc,     // 全インスタンスの設定上限合計 (bytes)
}
```

サイズ文字列 → バイト変換ヘルパー:
```typescript
function parseSizeToBytes(s: string | null): number {
  // "512MB" → 536870912, "10GB" → 10737418240 など
  const match = s?.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return 0;
  const mul = { B:1, KB:1024, MB:1024**2, GB:1024**3, TB:1024**4 };
  return Math.round(parseFloat(match[1]) * (mul[match[2]?.toUpperCase() ?? 'B'] ?? 1));
}
```

running インスタンスのリソースは Promise.allSettled で並列取得すること。
1件失敗しても他に影響しない。

---

## 16-3: index.ts にルート登録

```typescript
import dashboardRoutes from './routes/dashboard.ts';
await fastify.register(dashboardRoutes);
```

---

## 16-4: フロントエンド

### pages/DashboardPage.tsx（新規）

#### サマリーカード（4枚）
- Total Instances（running/stopped内訳）
- メモリ残量（ホスト物理量 − 割り当て済み上限）
- ディスク残量（ホスト物理量 − 割り当て済み上限）
- Users（active/admin内訳）

#### HostGauge コンポーネント（Memory / Disk 各1つ）
スタック型バーでホスト物理量を100%として表示:
- 濃色: コンテナ実使用量
- 薄色（25%透明）: 割り当て済み上限
- 境界線: 割り当て済み上限の位置に縦線

3枚の数値パネル:
- コンテナ使用量（bytes + %）
- 割り当て済み上限（bytes + %）
- 未割り当て残量（bytes + %、残量が少ない場合は赤/黄色）

90%以上でバーを赤、70%以上で黄色に変更。

#### PerUserTable
ユーザー別: インスタンス数 / メモリ（実使用 / 上限 / 残） / ディスク（実使用 / 上限 / 残）
バーはホスト物理量基準（相対比較）。

#### InstanceResourceTable
インスタンス別の一覧。running のみリソース値を表示。
インスタンス名をクリックで /instances/:id へ遷移。

#### 自動更新
30秒ごとのサイレント更新（手動更新ボタンも配置）。

### components/layout/AppLayout.tsx（上書き）

navItems に Dashboard（adminOnly: true）を追加。Instances より上に配置:

```typescript
const navItems = [
  { to: '/dashboard',  label: 'Dashboard',    adminOnly: true  },
  { to: '/instances',  label: 'Instances',    adminOnly: false },
  { to: '/storage',    label: 'Storage',      adminOnly: false },
  { to: '/templates',  label: 'Templates',    adminOnly: true  },
  { to: '/users',      label: 'Users',        adminOnly: true  },
  { to: '/proxy',      label: 'Proxy Routes', adminOnly: true  },
];
```

### pages/LoginPage.tsx（上書き）

ログイン成功後: `navigate('/', { replace: true })` に変更。
（直接 /instances へ飛ばさない。App.tsx の DefaultRedirect に委ねる。）

### App.tsx（上書き）

```typescript
// /dashboard ルートを Admin 専用で追加
<Route path="dashboard" element={<RequireAdmin><DashboardPage /></RequireAdmin>} />

// DefaultRedirect: role に応じて振り分け
function DefaultRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'admin' ? '/dashboard' : '/instances'} replace />;
}
```

---

## ファイル配置先

| ダウンロードファイル | 配置先 |
|---|---|
| `incus.ts` | `packages/backend/src/services/incus.ts`（上書き） |
| `dashboard.ts` | `packages/backend/src/routes/dashboard.ts`（新規） |
| `index.ts` | `packages/backend/src/index.ts`（上書き） |
| `DashboardPage.tsx` | `packages/frontend/src/pages/DashboardPage.tsx`（新規） |
| `AppLayout.tsx` | `packages/frontend/src/components/layout/AppLayout.tsx`（上書き） |
| `LoginPage.tsx` | `packages/frontend/src/pages/LoginPage.tsx`（上書き） |
| `App.tsx` | `packages/frontend/src/App.tsx`（上書き） |

---

## テスト確認

# ログイン → /dashboard にリダイレクトされること（Admin）
# サマリーカードにホスト物理量基準の残量が表示されること
# インスタンスを起動後、リソース値が表示されること
curl -b /tmp/cookie.txt http://localhost:3000/api/dashboard/stats | jq '.resources.host'

## 📥 ファイル出力（必須）
このステップで新規作成・編集したファイルをすべてダウンロード可能な形で提供してください。
チャット内へのコード貼り付けだけでは不十分です。
各ファイルを個別にダウンロードできるリンクとして出力すること。
```

---

