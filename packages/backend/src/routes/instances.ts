// packages/backend/src/routes/instances.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { instances, users, templates, storageAttachments } from '../db/schema.ts';
import type { InstanceDTO } from '../types/index.ts';
import * as incus from '../services/incus.ts';

// ────────────────────────────────────────────────
// DTO変換
// ────────────────────────────────────────────────
function toInstanceDTO(
  row: typeof instances.$inferSelect,
  ownerUsername: string,
  templateName: string | null,
  templateRole: 'general' | 'reverse_proxy' | null = null,
): InstanceDTO {
  return {
    id:            row.id,
    name:          row.name,
    ownerUserId:   row.ownerUserId,
    ownerUsername,
    templateId:    row.templateId,
    templateName,
    templateRole,
    status:        row.status,
    nodeName:      row.nodeName,
    ipAddress:     row.ipAddress,
    createdAt:     row.createdAt,
  };
}

// ────────────────────────────────────────────────
// 権限チェックヘルパー
// ────────────────────────────────────────────────
async function getInstanceWithAuth(
  fastify: Parameters<FastifyPluginAsync>[0],
  id: string,
  userId: string,
): Promise<{
  instance: typeof instances.$inferSelect;
  ownerUsername: string;
  templateName: string | null;
  isAdmin: boolean;
} | null> {
  const userResult = await fastify.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const isAdmin = userResult[0]?.role === 'admin';

  const rows = await fastify.db
    .select({
      instance:      instances,
      ownerUsername: users.username,
      templateName:  templates.name,
    })
    .from(instances)
    .leftJoin(users,     eq(instances.ownerUserId, users.id))
    .leftJoin(templates, eq(instances.templateId,  templates.id))
    .where(eq(instances.id, id))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    instance:      row.instance,
    ownerUsername: row.ownerUsername ?? '',
    templateName:  row.templateName ?? null,
    isAdmin,
  };
}

// ────────────────────────────────────────────────
// バリデーション
// ────────────────────────────────────────────────
const InstanceCreateSchema = z.object({
  name: z.string()
    .min(2).max(63)
    .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, 'lowercase alphanumeric and hyphens only'),
  templateId: z.string().uuid(),
});

// ────────────────────────────────────────────────
// ルート定義
// ────────────────────────────────────────────────
const instancesRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/instances
  fastify.get(
    '/api/instances',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const userId = req.session.userId!;
      const userResult = await fastify.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const isAdmin = userResult[0]?.role === 'admin';

      const query = fastify.db
        .select({
          instance:      instances,
          ownerUsername: users.username,
          templateName:  templates.name,
          templateRole:  templates.role,
        })
        .from(instances)
        .leftJoin(users,     eq(instances.ownerUserId, users.id))
        .leftJoin(templates, eq(instances.templateId,  templates.id));

      const rows = isAdmin
        ? await query
        : await query.where(eq(instances.ownerUserId, userId));

      const result = rows.map(r =>
        toInstanceDTO(r.instance, r.ownerUsername ?? '', r.templateName ?? null, r.templateRole ?? null),
      );

      return reply.send({ instances: result });
    },
  );

  // POST /api/instances
  fastify.post(
    '/api/instances',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const userId = req.session.userId!;
      const body = InstanceCreateSchema.parse(req.body);

      // 1. DB重複チェック
      const existing = await fastify.db
        .select({ id: instances.id })
        .from(instances)
        .where(eq(instances.name, body.name))
        .limit(1);
      if (existing.length > 0) {
        return reply.status(409).send({ error: 'NAME_TAKEN', message: `Name "${body.name}" is already taken` });
      }

      // Incus重複チェック
      const incusList = await incus.listInstances().catch(() => [] as string[]);
      if (incusList.includes(body.name)) {
        return reply.status(409).send({ error: 'NAME_TAKEN', message: `Name "${body.name}" is already taken` });
      }

      // 2. テンプレート確認
      const tplResult = await fastify.db
        .select()
        .from(templates)
        .where(eq(templates.id, body.templateId))
        .limit(1);
      if (tplResult.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Template not found' });
      }
      const tpl = tplResult[0];

      // オーナー情報取得
      const ownerResult = await fastify.db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      // 3. DB INSERT（status='starting'）
      const id = uuidv4();
      const now = new Date().toISOString();
      await fastify.db.insert(instances).values({
        id,
        name:        body.name,
        ownerUserId: userId,
        templateId:  body.templateId,
        status:      'starting',
        nodeName:    'local',
        ipAddress:   null,
        createdAt:   now,
      });

      // 4. バックグラウンドでIncus作成 → 5. 完了後 status='stopped'
      incus.createInstance({
        name:        body.name,
        imageAlias:  tpl.imageAlias,
        cpuLimit:    tpl.cpuLimit ?? undefined,
        memoryLimit: tpl.memoryLimit ?? undefined,
        diskLimit:   tpl.diskLimit ?? undefined,
      }).then(async () => {
        await fastify.db
          .update(instances)
          .set({ status: 'stopped' })
          .where(eq(instances.id, id));
      }).catch(async (err: unknown) => {
        fastify.log.error({ err }, '[incus] createInstance failed');
        await fastify.db
          .update(instances)
          .set({ status: 'error' })
          .where(eq(instances.id, id));
      });

      // 6. 即座に202
      const dto = toInstanceDTO(
        { id, name: body.name, ownerUserId: userId, templateId: body.templateId,
          status: 'starting', nodeName: 'local', ipAddress: null, createdAt: now },
        ownerResult[0]?.username ?? '',
        tpl.name,
      );
      return reply.status(202).send({ instance: dto });
    },
  );

  // GET /api/instances/:id
  fastify.get(
    '/api/instances/:id',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const userId = req.session.userId!;

      const found = await getInstanceWithAuth(fastify, id, userId);
      if (!found) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      }
      if (!found.isAdmin && found.instance.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
      }

      return reply.send({
        instance: toInstanceDTO(found.instance, found.ownerUsername, found.templateName),
      });
    },
  );

  // POST /api/instances/:id/start
  fastify.post(
    '/api/instances/:id/start',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const userId = req.session.userId!;

      const found = await getInstanceWithAuth(fastify, id, userId);
      if (!found) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      if (!found.isAdmin && found.instance.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
      }
      if (found.instance.status === 'running') {
        return reply.status(409).send({ error: 'INSTANCE_RUNNING', message: 'Instance is already running' });
      }

      await fastify.db.update(instances).set({ status: 'starting' }).where(eq(instances.id, id));

      incus.startInstance(found.instance.name).then(async () => {
        let ipAddress: string | null = null;
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const state = await incus.getInstanceState(found.instance.name).catch(() => null);
          ipAddress = state?.ipAddress ?? null;
          if (ipAddress) break;
        }
        await fastify.db.update(instances).set({
          status: 'running',
          ipAddress,
        }).where(eq(instances.id, id));
      }).catch(async () => {
        await fastify.db.update(instances).set({ status: 'error' }).where(eq(instances.id, id));
      });

      return reply.status(202).send({
        instance: toInstanceDTO(
          { ...found.instance, status: 'starting' },
          found.ownerUsername, found.templateName,
        ),
      });
    },
  );

  // POST /api/instances/:id/stop
  fastify.post(
    '/api/instances/:id/stop',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const userId = req.session.userId!;

      const found = await getInstanceWithAuth(fastify, id, userId);
      if (!found) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      if (!found.isAdmin && found.instance.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
      }

      await fastify.db.update(instances).set({ status: 'stopping' }).where(eq(instances.id, id));

      incus.stopInstance(found.instance.name).then(async () => {
        await fastify.db.update(instances).set({ status: 'stopped', ipAddress: null })
          .where(eq(instances.id, id));
      }).catch(async () => {
        await fastify.db.update(instances).set({ status: 'error' }).where(eq(instances.id, id));
      });

      return reply.status(202).send({
        instance: toInstanceDTO(
          { ...found.instance, status: 'stopping' },
          found.ownerUsername, found.templateName,
        ),
      });
    },
  );

  // POST /api/instances/:id/restart
  fastify.post(
    '/api/instances/:id/restart',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const userId = req.session.userId!;

      const found = await getInstanceWithAuth(fastify, id, userId);
      if (!found) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      if (!found.isAdmin && found.instance.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
      }

      await fastify.db.update(instances).set({ status: 'stopping' }).where(eq(instances.id, id));

      incus.restartInstance(found.instance.name).then(async () => {
        const state = await incus.getInstanceState(found.instance.name).catch(() => null);
        await fastify.db.update(instances).set({
          status:    'running',
          ipAddress: state?.ipAddress ?? null,
        }).where(eq(instances.id, id));
      }).catch(async () => {
        await fastify.db.update(instances).set({ status: 'error' }).where(eq(instances.id, id));
      });

      return reply.status(202).send({
        instance: toInstanceDTO(
          { ...found.instance, status: 'stopping' },
          found.ownerUsername, found.templateName,
        ),
      });
    },
  );

  // POST /api/instances/:id/publish
  fastify.post(
    '/api/instances/:id/publish',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const userId = req.session.userId!;
      const body = z.object({
        alias: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9._-]*$/, 'lowercase alphanumeric, dots, hyphens, underscores'),
      }).parse(req.body);

      const found = await getInstanceWithAuth(fastify, id, userId);
      if (!found) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      if (!found.isAdmin && found.instance.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
      }
      if (found.instance.status === 'running') {
        return reply.status(409).send({ error: 'INSTANCE_RUNNING', message: 'Stop the instance before publishing' });
      }

      await incus.publishInstance(found.instance.name, body.alias);
      return reply.send({ ok: true, alias: body.alias });
    },
  );

  // DELETE /api/instances/:id
  fastify.delete(
    '/api/instances/:id',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const userId = req.session.userId!;

      const found = await getInstanceWithAuth(fastify, id, userId);
      if (!found) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      if (!found.isAdmin && found.instance.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
      }
      if (found.instance.status === 'running') {
        return reply.status(409).send({ error: 'INSTANCE_RUNNING', message: 'Stop the instance before deleting' });
      }

      // ── ストレージアタッチメントのクリーンアップ（STEP 15） ──────────────
      const attachments = await fastify.db
        .select()
        .from(storageAttachments)
        .where(eq(storageAttachments.instanceId, id));

      for (const att of attachments) {
        try {
          await incus.detachVolume(found.instance.name, att.deviceName);
        } catch (err) {
          fastify.log.warn(
            { err },
            `[storage] pre-delete detach failed for device ${att.deviceName}, continuing`,
          );
        }
      }
      // ────────────────────────────────────────────────────────────────────

      await incus.deleteInstance(found.instance.name).catch(() => {});
      // DB削除（port_forwards, storage_attachments は CASCADE で消える）
      await fastify.db.delete(instances).where(eq(instances.id, id));

      return reply.send({ ok: true });
    },
  );
};

export default instancesRoutes;
