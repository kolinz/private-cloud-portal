// packages/backend/src/routes/proxy.ts
import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { reverseProxyRoutes, instances } from '../db/schema.ts';
import type { ProxyRouteDTO } from '../types/index.ts';
import * as nginx from '../services/nginx.ts';

function toDTO(
  row:               typeof reverseProxyRoutes.$inferSelect,
  targetInstanceName: string,
): ProxyRouteDTO {
  return {
    id:                row.id,
    proxyInstanceId:   '',
    proxyInstanceName: 'host-nginx',
    targetInstanceId:  row.targetInstanceId,
    targetInstanceName,
    path:              row.path,
    targetPort:        row.targetPort,
    createdAt:         row.createdAt,
  };
}

const ProxyCreateSchema = z.object({
  targetInstanceId: z.string().uuid(),
  path:             z.string()
    .min(2)
    .regex(/^\/[a-z0-9_-]+$/, 'パスは /app1 のように / で始まる英数字・ハイフン・アンダースコアのみ'),
  targetPort:       z.number().int().min(1).max(65535).default(80),
});

// 全ルートのnginx設定を再構築
async function rebuildNginxConf(
  fastify: Parameters<FastifyPluginAsync>[0],
): Promise<void> {
  const rows = await fastify.db
    .select({
      route:    reverseProxyRoutes,
      targetIP: instances.ipAddress,
    })
    .from(reverseProxyRoutes)
    .leftJoin(instances, eq(reverseProxyRoutes.targetInstanceId, instances.id));

  const routes: nginx.ProxyRoute[] = rows
    .filter(r => r.targetIP)
    .map(r => ({
      path:       r.route.path,
      targetIP:   r.targetIP!,
      targetPort: r.route.targetPort,
    }));

  const conf = nginx.generateNginxConf(routes);
  await nginx.writeNginxConf(conf);
  await nginx.reloadNginx();
}

const proxyRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/proxy/routes
  fastify.get(
    '/api/proxy/routes',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (_req, reply) => {
      const rows = await fastify.db
        .select({ route: reverseProxyRoutes })
        .from(reverseProxyRoutes);

      const result: ProxyRouteDTO[] = [];
      for (const row of rows) {
        const target = await fastify.db
          .select({ name: instances.name })
          .from(instances)
          .where(eq(instances.id, row.route.targetInstanceId))
          .limit(1);
        result.push(toDTO(row.route, target[0]?.name ?? ''));
      }
      return reply.send({ routes: result });
    },
  );

  // POST /api/proxy/routes
  fastify.post(
    '/api/proxy/routes',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (req, reply) => {
      const body = ProxyCreateSchema.parse(req.body);

      // パス重複チェック
      const existing = await fastify.db
        .select({ id: reverseProxyRoutes.id })
        .from(reverseProxyRoutes)
        .where(eq(reverseProxyRoutes.path, body.path))
        .limit(1);
      if (existing.length > 0) {
        return reply.status(409).send({ error: 'HOSTNAME_TAKEN', message: 'このパスはすでに使用中です' });
      }

      // ターゲットインスタンス確認
      const target = await fastify.db
        .select({ status: instances.status, ipAddress: instances.ipAddress, name: instances.name })
        .from(instances)
        .where(eq(instances.id, body.targetInstanceId))
        .limit(1);
      if (target.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'ターゲットインスタンスが見つかりません' });
      }
      if (target[0].status !== 'running') {
        return reply.status(400).send({ error: 'TARGET_NOT_RUNNING', message: '接続先コンテナが起動していません' });
      }
      if (!target[0].ipAddress) {
        return reply.status(400).send({ error: 'TARGET_NOT_RUNNING', message: '接続先コンテナのIPアドレスが取得できません' });
      }

      // DB保存
      const id  = uuidv4();
      const now = new Date().toISOString();
      await fastify.db.insert(reverseProxyRoutes).values({
        id,
        proxyInstanceId:  '',  // ホストnginxなので不要
        targetInstanceId: body.targetInstanceId,
        path:             body.path,
        targetPort:       body.targetPort,
        createdAt:        now,
      });

      // nginx設定再構築
      try {
        await rebuildNginxConf(fastify);
        fastify.log.info(`[proxy] route added: ${body.path} → ${target[0].ipAddress}:${body.targetPort}`);
      } catch (err) {
        fastify.log.error({ err }, '[proxy] nginx update failed');
      }

      const created = await fastify.db
        .select({ route: reverseProxyRoutes })
        .from(reverseProxyRoutes)
        .where(eq(reverseProxyRoutes.id, id))
        .limit(1);

      return reply.status(201).send({ route: toDTO(created[0].route, target[0].name) });
    },
  );

  // DELETE /api/proxy/routes/:id
  fastify.delete(
    '/api/proxy/routes/:id',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      const existing = await fastify.db
        .select({ route: reverseProxyRoutes })
        .from(reverseProxyRoutes)
        .where(eq(reverseProxyRoutes.id, id))
        .limit(1);

      if (existing.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'ルートが見つかりません' });
      }

      await fastify.db.delete(reverseProxyRoutes).where(eq(reverseProxyRoutes.id, id));

      try {
        await rebuildNginxConf(fastify);
      } catch (err) {
        fastify.log.error({ err }, '[proxy] nginx update failed on delete');
      }

      return reply.send({ ok: true });
    },
  );
};

export default proxyRoutes;
