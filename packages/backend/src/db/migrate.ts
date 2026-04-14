// packages/backend/src/db/migrate.ts

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as schema from './schema.ts';

const {
  users, templates, instances, portForwards,
  reverseProxyRoutes, systemSettings,
  storageVolumes, storageAttachments,
} = schema;

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

export async function runMigrations(): Promise<DrizzleDB> {
  const dbPath = process.env.DATABASE_PATH ?? './data/portal.db';

  // data/ ディレクトリがなければ作成
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  const db     = drizzle(sqlite, { schema });

  // WAL モードで高速化
  sqlite.pragma('journal_mode = WAL');

  // ── テーブル作成 ──────────────────────────────────────────────────────────

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT,
      type         TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'general',
      image_alias  TEXT NOT NULL,
      cpu_limit    INTEGER,
      memory_limit TEXT,
      disk_limit   TEXT,
      is_active    INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instances (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL UNIQUE,
      owner_user_id TEXT NOT NULL REFERENCES users(id),
      template_id   TEXT REFERENCES templates(id),
      status        TEXT NOT NULL DEFAULT 'stopped',
      node_name     TEXT NOT NULL DEFAULT 'local',
      ip_address    TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS port_forwards (
      id             TEXT PRIMARY KEY,
      instance_id    TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
      host_port      INTEGER NOT NULL,
      container_port INTEGER NOT NULL,
      protocol       TEXT NOT NULL DEFAULT 'tcp',
      description    TEXT,
      is_enabled     INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS reverse_proxy_routes (
      id                 TEXT PRIMARY KEY,
      proxy_instance_id  TEXT NOT NULL REFERENCES instances(id),
      target_instance_id TEXT NOT NULL REFERENCES instances(id),
      path               TEXT NOT NULL UNIQUE,
      target_port        INTEGER NOT NULL DEFAULT 80,
      created_at         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS storage_volumes (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL,
      owner_user_id TEXT NOT NULL REFERENCES users(id),
      pool_name     TEXT NOT NULL DEFAULT 'default',
      size          TEXT NOT NULL,
      description   TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS storage_attachments (
      id          TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
      volume_id   TEXT NOT NULL REFERENCES storage_volumes(id),
      mount_path  TEXT NOT NULL,
      device_name TEXT NOT NULL,
      attached_at TEXT NOT NULL
    );
  `);

  // ── 初期化済みチェック ────────────────────────────────────────────────────

  const initialized = sqlite
    .prepare(`SELECT value FROM system_settings WHERE key = 'initialized'`)
    .get() as { value: string } | undefined;

  if (!initialized) {
    const now = new Date().toISOString();

    // ── プリセットテンプレート（Nginx Reverse Proxy は含まない）──────────────

    const presetTemplates = [
      {
        id:          uuidv4(),
        name:        'Ubuntu 22.04 LTS',
        description: 'Ubuntu 22.04 LTS (Jammy Jellyfish)',
        type:        'preset' as const,
        role:        'general'  as const,
        imageAlias:  'ubuntu/22.04',
        cpuLimit:    2,
        memoryLimit: '512MB',
        diskLimit:   '10GB',
        isActive:    true,
        createdAt:   now,
      },
      {
        id:          uuidv4(),
        name:        'Debian 12',
        description: 'Debian 12 (Bookworm)',
        type:        'preset' as const,
        role:        'general'  as const,
        imageAlias:  'debian/12',
        cpuLimit:    2,
        memoryLimit: '512MB',
        diskLimit:   '10GB',
        isActive:    true,
        createdAt:   now,
      },
      {
        id:          uuidv4(),
        name:        'Rocky Linux 9',
        description: 'Rocky Linux 9',
        type:        'preset' as const,
        role:        'general'  as const,
        imageAlias:  'rockylinux/9',
        cpuLimit:    2,
        memoryLimit: '1GB',
        diskLimit:   '20GB',
        isActive:    true,
        createdAt:   now,
      },
    ];

    for (const t of presetTemplates) {
      sqlite
        .prepare(`
          INSERT OR IGNORE INTO templates
            (id, name, description, type, role, image_alias,
             cpu_limit, memory_limit, disk_limit, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          t.id, t.name, t.description, t.type, t.role, t.imageAlias,
          t.cpuLimit, t.memoryLimit, t.diskLimit, t.isActive ? 1 : 0, t.createdAt,
        );
    }

    // ── 初期管理者作成 ────────────────────────────────────────────────────────

    const adminUsername = process.env.ADMIN_USERNAME ?? 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD ?? 'password123';
    const systemName    = process.env.SYSTEM_NAME    ?? 'Private Cloud Portal';

    const existingAdmin = sqlite
      .prepare(`SELECT id FROM users WHERE username = ?`)
      .get(adminUsername);

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      sqlite
        .prepare(`
          INSERT INTO users (id, username, password_hash, role, is_active, created_at)
          VALUES (?, ?, ?, 'admin', 1, ?)
        `)
        .run(uuidv4(), adminUsername, passwordHash, now);
    }

    // ── システム設定 ──────────────────────────────────────────────────────────

    sqlite
      .prepare(`INSERT OR IGNORE INTO system_settings (key, value) VALUES ('initialized', 'true')`)
      .run();
    sqlite
      .prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('system_name', ?)`)
      .run(systemName);
  }

  return db;
}

// エイリアス
export const runMigrationsAndSeed = runMigrations;
