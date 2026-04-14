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

// ── ストレージ管理（STEP 15 追加） ──────────────────────────────────────

export const storageVolumes = sqliteTable('storage_volumes', {
  id:          text('id').primaryKey(),              // UUID
  name:        text('name').notNull().unique(),      // Incus上の名前: vol-{uuid8}
  displayName: text('display_name').notNull(),       // UI表示名
  ownerUserId: text('owner_user_id').notNull()
                 .references(() => users.id),
  poolName:    text('pool_name').notNull().default('default'),
  size:        text('size').notNull(),               // 例: "10GB"
  description: text('description'),
  createdAt:   text('created_at').notNull(),
});

export const storageAttachments = sqliteTable('storage_attachments', {
  id:         text('id').primaryKey(),
  instanceId: text('instance_id').notNull()
                .references(() => instances.id, { onDelete: 'cascade' }),
  volumeId:   text('volume_id').notNull()
                .references(() => storageVolumes.id),
  mountPath:  text('mount_path').notNull(),          // 例: /mnt/data
  deviceName: text('device_name').notNull(),         // Incusデバイス名: vol-{uuid8}
  attachedAt: text('attached_at').notNull(),
});
