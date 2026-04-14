# 小規模プライベートクラウド基盤（Incus/LXC）管理ポータル
## SDD仕様書 v2.2 — Claude.ai実装生成用

---

> **Claude.aiへの指示**
> この仕様書はSDD（Specification Driven Development）に基づいている。
> 実装時は以下の順序でコードを生成すること。
> 1. ディレクトリ構成・共通型定義
> 2. DBスキーマ（SQLite + Drizzle ORM）
> 3. Incus APIクライアント層
> 4. バックエンドAPIルート（Fastify）
> 5. フロントエンドコンポーネント（React + Tailwind）
> 仕様外の独自判断は禁止。不明点は質問すること。

---

# 1. システム概要

学生および小規模組織（100名規模まで）向けの
**軽量プライベートクラウド管理ポータル**。

Incus / LXC を実行基盤とし、WebUIから以下を提供する。

- システムコンテナ管理
- ユーザー管理
- テンプレート管理
- ポートフォワーディング
- リバースプロキシ連携（Nginx）
- ログ閲覧
- **永続ストレージ管理**（ファイルストレージ / Amazon EFS 相当）
- **管理者ダッシュボード**（ホストリソース使用状況・ユーザー別集計）

**構成前提：** 単一ホスト。将来のHAクラスタ拡張の余地を残す。

---

# 2. 技術スタック（確定版）

| レイヤ | 技術 | バージョン目安 |
|---|---|---|
| Frontend | React + TypeScript + Tailwind CSS | React 18 / TS 5 |
| Backend | Node.js + TypeScript + Fastify | Node 24 |
| DB | SQLite + Drizzle ORM | drizzle-orm 0.30+ |
| Container API | Incus REST API（Unix socket） | Incus 0.7+ |
| Reverse Proxy | Nginx（ホスト上） | nginx 1.24+ |
| Auth | セッション認証（@fastify/session） | — |
| Validation | Zod | zod 3.x |

---

# 3. ディレクトリ構成

```
/project-root
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── plugins/
│   │   │   │   ├── auth.ts
│   │   │   │   └── db.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── templates.ts
│   │   │   │   ├── instances.ts
│   │   │   │   ├── portforwards.ts
│   │   │   │   ├── proxy.ts
│   │   │   │   ├── logs.ts
│   │   │   │   ├── terminal.ts
│   │   │   │   ├── storage.ts
│   │   │   │   └── dashboard.ts          # 管理者ダッシュボード (STEP 16)
│   │   │   ├── services/
│   │   │   │   ├── incus.ts
│   │   │   │   ├── nginx.ts
│   │   │   │   ├── system.ts
│   │   │   │   └── terminalWs.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.ts
│   │   │   │   └── migrate.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   └── package.json
│   └── frontend/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── LoginPage.tsx
│       │   │   ├── DashboardPage.tsx       # 管理者ダッシュボード (STEP 16)
│       │   │   ├── InstancesPage.tsx
│       │   │   ├── InstanceDetailPage.tsx
│       │   │   ├── TemplatesPage.tsx
│       │   │   ├── UsersPage.tsx
│       │   │   ├── ProxyPage.tsx
│       │   │   └── StorageVolumesPage.tsx
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── AppLayout.tsx
│       │   │   │   └── TopBar.tsx
│       │   │   ├── instances/
│       │   │   │   ├── InstanceCard.tsx
│       │   │   │   ├── InstanceCreateModal.tsx
│       │   │   │   ├── InstanceStatusBadge.tsx
│       │   │   │   └── StorageTab.tsx
│       │   │   ├── logs/
│       │   │   │   └── LogViewer.tsx
│       │   │   ├── terminal/
│       │   │   │   └── TerminalViewer.tsx
│       │   │   └── ui/
│       │   ├── hooks/
│       │   │   ├── useAuth.tsx
│       │   │   ├── useInstances.ts
│       │   │   ├── useLogs.ts
│       │   │   └── useStorage.ts
│       │   └── api/
│       │       └── client.ts
│       └── package.json
└── package.json
```

---

# 4. DBスキーマ（SQLite + Drizzle ORM）

```typescript
// packages/backend/src/db/schema.ts

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id:           text('id').primaryKey(),
  username:     text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role:         text('role', { enum: ['admin', 'user'] }).notNull().default('user'),
  isActive:     integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt:    text('created_at').notNull(),
});

export const templates = sqliteTable('templates', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),
  type:        text('type', { enum: ['preset', 'custom'] }).notNull(),
  role:        text('role', { enum: ['general', 'reverse_proxy'] }).notNull().default('general'),
  imageAlias:  text('image_alias').notNull(),
  cpuLimit:    integer('cpu_limit'),
  memoryLimit: text('memory_limit'),
  diskLimit:   text('disk_limit'),
  isActive:    integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt:   text('created_at').notNull(),
});

export const instances = sqliteTable('instances', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull().unique(),
  ownerUserId: text('owner_user_id').notNull().references(() => users.id),
  templateId:  text('template_id').references(() => templates.id),
  status:      text('status', {
    enum: ['running', 'stopped', 'starting', 'stopping', 'error'],
  }).notNull().default('stopped'),
  nodeName:    text('node_name').notNull().default('local'),
  ipAddress:   text('ip_address'),
  createdAt:   text('created_at').notNull(),
});

export const portForwards = sqliteTable('port_forwards', {
  id:            text('id').primaryKey(),
  instanceId:    text('instance_id').notNull().references(() => instances.id, { onDelete: 'cascade' }),
  hostPort:      integer('host_port').notNull(),
  containerPort: integer('container_port').notNull(),
  protocol:      text('protocol', { enum: ['tcp', 'udp'] }).notNull().default('tcp'),
  description:   text('description'),
  isEnabled:     integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
});

export const reverseProxyRoutes = sqliteTable('reverse_proxy_routes', {
  id:               text('id').primaryKey(),
  proxyInstanceId:  text('proxy_instance_id').notNull().references(() => instances.id),
  targetInstanceId: text('target_instance_id').notNull().references(() => instances.id),
  path:             text('path').notNull().unique(),
  targetPort:       integer('target_port').notNull().default(80),
  createdAt:        text('created_at').notNull(),
});

export const systemSettings = sqliteTable('system_settings', {
  key:   text('key').primaryKey(),
  value: text('value').notNull(),
});

export const storageVolumes = sqliteTable('storage_volumes', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  ownerUserId: text('owner_user_id').notNull().references(() => users.id),
  poolName:    text('pool_name').notNull().default('default'),
  size:        text('size').notNull(),
  description: text('description'),
  createdAt:   text('created_at').notNull(),
});

export const storageAttachments = sqliteTable('storage_attachments', {
  id:         text('id').primaryKey(),
  instanceId: text('instance_id').notNull()
                .references(() => instances.id, { onDelete: 'cascade' }),
  volumeId:   text('volume_id').notNull()
                .references(() => storageVolumes.id),
  mountPath:  text('mount_path').notNull(),
  deviceName: text('device_name').notNull(),
  attachedAt: text('attached_at').notNull(),
});
```

### シードデータ（プリセットテンプレート）

以下の3件のみ。**Nginx Reverse Proxy は含めない。**

| name | imageAlias | cpu | memory | disk | role |
|---|---|---|---|---|---|
| Ubuntu 22.04 LTS | ubuntu/22.04 | 2 | 512MB | 10GB | general |
| Debian 12 | debian/12 | 2 | 512MB | 10GB | general |
| Rocky Linux 9 | rockylinux/9 | 2 | 1GB | 20GB | general |

---

# 5. APIエンドポイント定義（REST契約）

## 5-1. 認証

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
```

## 5-2. ユーザー管理（Admin専用）

```
GET    /api/users
POST   /api/users
PATCH  /api/users/:id
DELETE /api/users/:id
```

## 5-3. テンプレート管理

```
GET    /api/templates
GET    /api/templates/images/local    → { aliases: string[] }  ※フラット文字列配列
POST   /api/templates/images/download → { ok: true, alias: string }
POST   /api/templates         (Admin)
PATCH  /api/templates/:id     (Admin)
DELETE /api/templates/:id     (Admin)  409: TEMPLATE_IN_USE
```

## 5-4. インスタンス管理

```
GET    /api/instances
POST   /api/instances
GET    /api/instances/:id
POST   /api/instances/:id/start
POST   /api/instances/:id/stop
POST   /api/instances/:id/restart
DELETE /api/instances/:id
```

## 5-5. ポートフォワーディング

```
GET    /api/instances/:id/portforwards
POST   /api/instances/:id/portforwards
PATCH  /api/instances/:instanceId/portforwards/:pfId
DELETE /api/instances/:instanceId/portforwards/:pfId
```

## 5-6. リバースプロキシ（Admin専用）

```
GET    /api/proxy/routes
POST   /api/proxy/routes
DELETE /api/proxy/routes/:id
```

## 5-7. ログ

```
GET    /api/instances/:id/logs?type=instance|console&lines=100
```

## 5-8. ターミナル（WebSocket / ポート3001）

```
WS     ws://host:3001
```

## 5-9. ストレージ管理

```
GET    /api/storage/pools
GET    /api/storage/volumes
POST   /api/storage/volumes
GET    /api/storage/volumes/:id
DELETE /api/storage/volumes/:id
GET    /api/instances/:id/storage
POST   /api/instances/:id/storage
DELETE /api/instances/:instanceId/storage/:attachmentId
```

## 5-10. 管理者ダッシュボード（STEP 16）

```
GET    /api/dashboard/stats    (Admin専用)
  200: {
    instances: {
      total, running, stopped, starting, stopping, error,
      list: InstanceResourceRow[]   // 最新順・全件
    },
    users:     { total, active, admins },
    templates: { total, active, general, reverseProxy },
    resources: {
      host: {                       // Incus GET /1.0/resources から取得
        memory: { total, used },    // bytes
        disk:   { total, used },    // bytes
        cpu:    { cores, threads },
      },
      containerUsage: {             // running インスタンス合計
        memory: number,             // bytes
        disk:   number,             // bytes
      },
      allocated: {                  // DB テンプレート設定から計算
        memoryBytes: number,        // 全インスタンスの memoryLimit 合計
        diskBytes:   number,        // 全インスタンスの diskLimit 合計
      },
      perUser: UserResourceSummary[],
    },
    system: { name, uptimeSeconds, nodeVersion, platform, generatedAt },
  }
```

### InstanceResourceRow

```typescript
{
  id, name, status, ownerUserId, ownerUsername, templateName,
  ipAddress, createdAt,
  resources: ResourceMetrics | null,    // running のみ取得
  memoryLimitBytes: number | null,      // テンプレート設定値 (bytes)
  diskLimitBytes:   number | null,      // テンプレート設定値 (bytes)
}
```

### UserResourceSummary

```typescript
{
  userId, username,
  instanceCount, runningCount,
  memoryUsage, diskUsage,     // running インスタンスの実使用量合計 (bytes)
  memoryAlloc, diskAlloc,     // DB設定上限の合計 (bytes)
}
```

---

# 6. 共通レスポンス型（DTO）

```typescript
export type UserDTO = { id, username, role, isActive, createdAt };
export type TemplateDTO = { id, name, description, type, role, imageAlias, cpuLimit, memoryLimit, diskLimit, isActive, createdAt };
export type InstanceDTO = { id, name, ownerUserId, ownerUsername, templateId, templateName, templateRole, status, nodeName, ipAddress, createdAt };
export type PortForwardDTO = { id, instanceId, hostPort, containerPort, protocol, description, isEnabled };
export type ProxyRouteDTO = { id, proxyInstanceId, proxyInstanceName, targetInstanceId, targetInstanceName, path, targetPort, createdAt };
export type StorageVolumeDTO = { id, name, displayName, ownerUserId, ownerUsername, poolName, size, description, createdAt, attachments: [...] };
export type StorageAttachmentDTO = { id, instanceId, volumeId, displayName, volumeName, poolName, mountPath, deviceName, attachedAt };
```

---

# 7. エラーハンドリング仕様

| コード | HTTP | 意味 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 未ログイン |
| `FORBIDDEN` | 403 | 権限不足 |
| `NOT_FOUND` | 404 | リソースなし |
| `VALIDATION_ERROR` | 422 | 入力値不正（Zod） |
| `INVALID_CREDENTIALS` | 401 | ログイン失敗 |
| `USERNAME_TAKEN` | 409 | ユーザー名重複 |
| `NAME_TAKEN` | 409 | コンテナ名重複 |
| `PORT_CONFLICT` | 409 | ポート競合 |
| `HOSTNAME_TAKEN` | 409 | ホスト名重複 |
| `TEMPLATE_IN_USE` | 409 | テンプレート使用中 |
| `INSTANCE_RUNNING` | 409 | 起動中のため操作不可 |
| `TARGET_NOT_RUNNING` | 400 | プロキシ接続先が停止中 |
| `ALREADY_INITIALIZED` | 409 | 初期化済み |
| `INCUS_ERROR` | 502 | Incus API呼び出し失敗 |
| `INTERNAL_ERROR` | 500 | サーバー内部エラー |
| `CANNOT_DELETE_SELF` | 400 | 自分自身を削除不可 |
| `VOLUME_IN_USE` | 409 | アタッチ中のためボリューム削除不可 |
| `MOUNT_PATH_CONFLICT` | 409 | マウントパス重複 |
| `VOLUME_ALREADY_ATTACHED` | 409 | 同一ボリュームを二重アタッチ |
| `VOLUME_NOT_OWNED` | 403 | 他ユーザーのボリュームへのアクセス禁止 |

---

# 8. Incus API連携仕様

## 8-1. 接続方式

```
Unix socket: /var/lib/incus/unix.socket
undici の Agent を使って接続
全 API に ?project=default クエリパラメータを付与すること
ただし /1.0/resources はプロジェクトパラメータ不要
```

## 8-2. incus.ts 実装関数一覧

```typescript
// イメージ管理
listLocalImages(): Promise<LocalImage[]>
  // GET /1.0/images?recursion=1
  // LocalImage = { fingerprint, aliases: {name,description}[], architecture, type, size, createdAt }

downloadImage(alias: string): Promise<void>
  // POST /1.0/images  source: { type:'image', mode:'pull', server:'https://images.linuxcontainers.org', protocol:'simplestreams', alias }
  // operation を待機（timeout: 300秒）

// ホストリソース（ダッシュボード用）
getHostResources(): Promise<HostResources>
  // GET /1.0/resources  ※ ?project= パラメータ不要
  // HostResources = { memory:{total,used}, disk:{total,used}, cpu:{cores,threads} }

// インスタンス操作
listInstances() / getInstance(name) / getInstanceState(name)
getInstanceResources(name): Promise<InstanceResources>
  // GET /1.0/instances/{name}/state
  // InstanceResources = { memory:{usage,peak,total}, disk:{rootUsage}, cpu:{usageNs} }
createInstance(params) / startInstance / stopInstance / restartInstance / deleteInstance
getInstanceLog(name) / getConsoleLog(name)

// ストレージ
listStoragePools() / listVolumes(pool)
createVolume(pool, name, size) / deleteVolume(pool, name)
attachVolume(params) / detachVolume(instanceName, deviceName)
```

## 8-3. ローカルイメージ一覧のレスポンス変換

```typescript
// templates.ts の GET /api/templates/images/local ハンドラ内
const images = await incus.listLocalImages();
// aliases はフラットな文字列配列に変換して返す（TemplatesPage の includes() 判定に必要）
const aliases = images.flatMap(img => img.aliases.map(a => a.name));
return reply.send({ aliases });
```

## 8-4. ホストリソース API（ダッシュボード用）

```
GET /1.0/resources  （project パラメータ不要）

レスポンス構造:
  metadata.memory.total / .used       → ホスト搭載 RAM (bytes)
  metadata.storage.disks[].size       → ディスクサイズ
  metadata.storage.disks[].partitions[].used → パーティション使用量
  metadata.cpu.sockets[].cores / .threads
```

## 8-5. ストレージボリューム操作

```
# アタッチ（PATCH で既存デバイスを保持したまま追加）
PATCH /1.0/instances/{name}?project=default
Body: { devices: { [deviceName]: { type:"disk", pool, source: volumeName, path: mountPath } } }

# デタッチ（GET → deviceName 除去 → PUT で上書き）
GET  /1.0/instances/{name}?project=default
PUT  /1.0/instances/{name}?project=default  → deviceName を除いた devices で上書き
※ PATCH + 空オブジェクト方式はバージョン依存のため使わない
```

---

# 9. Nginx設定自動生成仕様

リバースプロキシはホスト上の nginx（8880番ポート）で実現。

```
設定ファイルパス: process.env.NGINX_CONF_PATH ?? '/etc/nginx/conf.d/portal.conf'
```

---

# 10. 画面遷移・UIコンポーネント構成

## 10-1. 画面遷移図

```
[未ログイン]
  → /login         ログイン画面
    → 成功後 → / → DefaultRedirect
                    Admin  → /dashboard
                    User   → /instances

[ログイン済み・Admin]
  /dashboard         管理者ダッシュボード（ホストリソース・ユーザー別集計）
  /instances         インスタンス一覧
  /instances/:id     インスタンス詳細
  /storage           ストレージボリューム管理
  /users             ユーザー管理
  /templates         テンプレート管理
  /proxy             リバースプロキシ管理

[ログイン済み・一般ユーザー]
  /instances
  /instances/:id
  /storage
```

## 10-2. ログイン後リダイレクト

```typescript
// LoginPage.tsx: ログイン成功後は / に遷移
navigate('/', { replace: true });

// App.tsx: DefaultRedirect コンポーネントで role に応じて振り分け
function DefaultRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'admin' ? '/dashboard' : '/instances'} replace />;
}
```

## 10-3. サイドバー構成

```
[Adminのみ]
- Dashboard      ← STEP 16 追加
[全ユーザー]
- Instances
- Storage
[Adminのみ]
- Templates
- Users
- Proxy Routes
```

## 10-4. DashboardPage 構成（Admin専用）

```
<DashboardPage>
  <HeaderBar systemName uptime cpu />
  <AlertBanner />  ← エラー・操作中インスタンスがある場合のみ

  <SummaryCards>
    Total Instances / メモリ残量 / ディスク残量 / Users
  </SummaryCards>

  <HostResourceSection>
    <!-- HostGauge × 2: Memory / Disk -->
    <!-- スタック型バー: コンテナ使用量（濃色）+ 割り当て済み上限（薄色）をホスト物理量基準で表示 -->
    <!-- 3つの数値パネル: コンテナ使用 / 割り当て済み上限 / 未割り当て残量 -->
    <!-- ※ バーはホスト物理量 = 100% として描画 -->
  </HostResourceSection>

  <PerUserTable>
    <!-- ユーザー別: インスタンス数 / メモリ（使用/上限/残） / ディスク（使用/上限/残） -->
  </PerUserTable>

  <InstanceResourceTable>
    <!-- インスタンス別: running のみリソース値 / バーは割り当て上限基準 -->
  </InstanceResourceTable>
</DashboardPage>
```

### 残量の定義

```
ホスト物理量（GET /1.0/resources）
  memory.total = ホスト搭載 RAM
  disk.total   = 全ディスクサイズ合計

割り当て済み容量（DB テンプレート設定から計算）
  = 全インスタンスの memoryLimit / diskLimit をバイト換算して合算

未割り当て残量 = ホスト物理量 − 割り当て済み容量
コンテナ実使用量 = running インスタンスの memory.usage / disk.rootUsage 合計
```

### 30秒自動更新

`setInterval(() => fetchData(true), 30_000)` でサイレント更新。

---

# 11. ユーザーロール・認可マトリクス

| 操作 | Admin | User |
|---|---|---|
| ダッシュボード閲覧 | ✅ | ❌ |
| 全コンテナ閲覧 | ✅ | ❌（自分のみ） |
| コンテナ作成 | ✅ | ✅ |
| コンテナ起動/停止/再起動 | ✅（全件） | ✅（自分のみ） |
| コンテナ削除 | ✅（全件） | ✅（自分のみ） |
| ログ閲覧 | ✅（全件） | ✅（自分のみ） |
| ユーザー管理 | ✅ | ❌ |
| テンプレート管理 | ✅ | ❌（閲覧のみ） |
| リバースプロキシ管理 | ✅ | ❌ |
| ポートフォワード管理 | ✅（全件） | ✅（自分のみ） |
| ストレージボリューム作成 | ✅ | ✅ |
| ストレージボリューム閲覧 | ✅（全件） | ✅（自分のみ） |
| ストレージボリューム削除 | ✅（全件） | ✅（自分のみ） |
| アタッチ（自分のボリューム） | ✅ | ✅（自分のインスタンスのみ） |
| アタッチ（他ユーザーのボリューム） | ✅ | ❌（VOLUME_NOT_OWNED） |

---

# 12. 認証・セッション仕様

```
ライブラリ: @fastify/session + @fastify/cookie
セッション有効期限: 24時間
Cookie名: pcportal.sid
Cookie属性: httpOnly=true, sameSite='lax'
```

---

# 13. 初期化仕様

オンボーディング画面は廃止。環境変数から初期管理者を自動作成する。

```
起動時自動初期化（migrate.ts）:
  1. systemSettings に key='initialized' が存在しない場合のみ実行
  2. ADMIN_USERNAME / ADMIN_PASSWORD から admin ユーザーを作成
  3. systemSettings に initialized='true', system_name=SYSTEM_NAME を保存

必要な環境変数:
  ADMIN_USERNAME=admin
  ADMIN_PASSWORD=password123
  SYSTEM_NAME=My Private Cloud（省略時: 'Private Cloud Portal'）
  WS_PORT=3001
```

---

# 14. MVP範囲（優先度順）

| 優先 | 機能 | 状態 |
|---|---|---|
| P0 | ログイン | ✅ 実装済み |
| P0 | インスタンス CRUD + 起動/停止 | ✅ 実装済み |
| P0 | テンプレート管理 | ✅ 実装済み |
| P1 | ポートフォワーディング | ✅ 実装済み |
| P1 | ログ閲覧 | ✅ 実装済み |
| P1 | ユーザー管理 | ✅ 実装済み |
| P1 | ターミナル（WebSocket） | ✅ 実装済み |
| P2 | リバースプロキシ連携 | ✅ 実装済み |
| P2 | 永続ストレージ管理 | ✅ 実装済み（STEP 15） |
| P2 | **管理者ダッシュボード** | ✅ 実装済み（STEP 16） |

---

# 15. 将来拡張（MVP対象外）

- HAクラスタ・マルチホスト
- HTTPS + Let's Encrypt 自動証明書
- WebSocket対応ログストリーム
- SSO連携（LDAP/SAML）
- **スナップショット管理** — `incus snapshot` を使った時系列バックアップ・ロールバック

---

> **Claude.aiへの最終指示**
> この仕様書に基づき、セクション番号の順にコードを生成すること。
> 各セクション生成後に「次に進んでよいか」を確認すること。
> 仕様に明記されていない実装判断が必要な場合は、
> 実装前に選択肢を提示して確認を求めること。
