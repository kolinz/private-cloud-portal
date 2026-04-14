// packages/backend/src/routes/dashboard.ts

import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { instances, users, templates, systemSettings } from '../db/schema.ts';
import { getInstanceResources, getHostResources } from '../services/incus.ts';
import type { HostResources } from '../services/incus.ts';

// ─── DTO ─────────────────────────────────────────────────────────────────────

export interface ResourceMetrics {
  memory: { usage: number; peak: number; total: number };
  disk:   { rootUsage: number };
  cpu:    { usageNs: number };
}

/** インスタンスへの割り当て済み容量（DBのテンプレート設定から計算） */
export interface AllocatedCapacity {
  memoryBytes: number;
  diskBytes:   number;
}

export interface InstanceResourceRow {
  id:               string;
  name:             string;
  status:           string;
  ownerUserId:      string;
  ownerUsername:    string;
  templateName:     string | null;
  ipAddress:        string | null;
  createdAt:        string;
  resources:        ResourceMetrics | null;
  memoryLimitBytes: number | null;
  diskLimitBytes:   number | null;
}

export interface UserResourceSummary {
  userId:        string;
  username:      string;
  instanceCount: number;
  runningCount:  number;
  memoryUsage:   number;
  diskUsage:     number;
  memoryAlloc:   number;
  diskAlloc:     number;
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

function parseSizeToBytes(s: string | null | undefined): number {
  if (!s) return 0;
  const match = s.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit  = (match[2] ?? 'B').toUpperCase();
  const mul: Record<string, number> = {
    B: 1, KB: 1024, MB: 1024**2, GB: 1024**3, TB: 1024**4,
  };
  return Math.round(value * (mul[unit] ?? 1));
}

// ─── ルート ──────────────────────────────────────────────────────────────────

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/dashboard/stats',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (req, reply) => {
      const db = fastify.db;

      // ---- インスタンス一覧 ----
      const rows = await db
        .select({
          id:           instances.id,
          name:         instances.name,
          ownerUserId:  instances.ownerUserId,
          ownerUsername: users.username,
          templateName: templates.name,
          status:       instances.status,
          ipAddress:    instances.ipAddress,
          createdAt:    instances.createdAt,
          memoryLimit:  templates.memoryLimit,
          diskLimit:    templates.diskLimit,
        })
        .from(instances)
        .leftJoin(users,     eq(instances.ownerUserId, users.id))
        .leftJoin(templates, eq(instances.templateId,  templates.id))
        .orderBy(sql`${instances.createdAt} DESC`);

      // ---- ホストリソース + running インスタンスのリソースを並列取得 ----
      const [hostRes, ...resourceResults] = await Promise.allSettled([
        getHostResources(),
        ...rows.map(async (row) => {
          if (row.status !== 'running') return { id: row.id, resources: null };
          const resources = await getInstanceResources(row.name).catch(() => null);
          return { id: row.id, resources };
        }),
      ]);

      const host: HostResources = hostRes.status === 'fulfilled'
        ? hostRes.value as HostResources
        : { memory: { total: 0, used: 0 }, disk: { total: 0, used: 0 }, cpu: { cores: 0, threads: 0 } };

      const resourceMap = new Map<string, ResourceMetrics | null>();
      for (const result of resourceResults) {
        if (result.status === 'fulfilled') {
          const r = result.value as { id: string; resources: ResourceMetrics | null };
          resourceMap.set(r.id, r.resources);
        }
      }

      // ---- インスタンス行 ----
      const instanceList: InstanceResourceRow[] = rows.map(row => ({
        id:               row.id,
        name:             row.name,
        status:           row.status,
        ownerUserId:      row.ownerUserId,
        ownerUsername:    row.ownerUsername ?? '—',
        templateName:     row.templateName ?? null,
        ipAddress:        row.ipAddress ?? null,
        createdAt:        row.createdAt,
        resources:        resourceMap.get(row.id) ?? null,
        memoryLimitBytes: row.memoryLimit ? parseSizeToBytes(row.memoryLimit) : null,
        diskLimitBytes:   row.diskLimit   ? parseSizeToBytes(row.diskLimit)   : null,
      }));

      // ---- コンテナ合計使用量 ----
      const containerUsage = { memory: 0, disk: 0 };
      for (const row of instanceList) {
        if (!row.resources) continue;
        containerUsage.memory += row.resources.memory.usage;
        containerUsage.disk   += row.resources.disk.rootUsage;
      }

      // ---- コンテナへの割り当て済み容量（DBのテンプレート設定合計） ----
      const allocated: AllocatedCapacity = { memoryBytes: 0, diskBytes: 0 };
      for (const row of instanceList) {
        allocated.memoryBytes += row.memoryLimitBytes ?? 0;
        allocated.diskBytes   += row.diskLimitBytes   ?? 0;
      }

      // ---- ユーザー別集計 ----
      const userMap = new Map<string, UserResourceSummary>();
      for (const row of instanceList) {
        const e = userMap.get(row.ownerUserId) ?? {
          userId: row.ownerUserId, username: row.ownerUsername,
          instanceCount: 0, runningCount: 0,
          memoryUsage: 0, diskUsage: 0,
          memoryAlloc: 0, diskAlloc: 0,
        };
        e.instanceCount  += 1;
        e.memoryAlloc    += row.memoryLimitBytes ?? 0;
        e.diskAlloc      += row.diskLimitBytes   ?? 0;
        if (row.status === 'running') {
          e.runningCount += 1;
          e.memoryUsage  += row.resources?.memory.usage    ?? 0;
          e.diskUsage    += row.resources?.disk.rootUsage  ?? 0;
        }
        userMap.set(row.ownerUserId, e);
      }

      // ---- その他統計 ----
      const allUsers     = await db.select().from(users);
      const allTemplates = await db.select().from(templates);
      const settings     = await db.select().from(systemSettings);
      const systemName   = settings.find(s => s.key === 'system_name')?.value ?? 'Private Cloud Portal';
      const statusCount  = (s: string) => rows.filter(r => r.status === s).length;

      return reply.send({
        instances: {
          total:    rows.length,
          running:  statusCount('running'),
          stopped:  statusCount('stopped'),
          starting: statusCount('starting'),
          stopping: statusCount('stopping'),
          error:    statusCount('error'),
          list:     instanceList,
        },
        users: {
          total:  allUsers.length,
          active: allUsers.filter(u => u.isActive).length,
          admins: allUsers.filter(u => u.role === 'admin').length,
        },
        templates: {
          total:        allTemplates.length,
          active:       allTemplates.filter(t => t.isActive).length,
          general:      allTemplates.filter(t => t.role === 'general').length,
          reverseProxy: allTemplates.filter(t => t.role === 'reverse_proxy').length,
        },
        resources: {
          host,            // ホスト物理リソース
          containerUsage,  // コンテナ合計使用量
          allocated,       // コンテナへの割り当て済み上限
          perUser: [...userMap.values()].sort((a, b) => b.memoryAlloc - a.memoryAlloc),
        },
        system: {
          name:          systemName,
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion:   process.version,
          platform:      process.platform,
          generatedAt:   new Date().toISOString(),
        },
      });
    }
  );
}
