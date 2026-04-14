// packages/backend/src/routes/portforwards.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { portForwards, instances, users } from '../db/schema.ts';
import * as incus from '../services/incus.ts';
import type { PortForwardDTO } from '../types/index.ts';

function toPortForwardDTO(row: typeof portForwards.$inferSelect): PortForwardDTO {
  return {
    id:            row.id,
    instanceId:    row.instanceId,
    hostPort:      row.hostPort,
    containerPort: row.containerPort,
    protocol:      row.protocol,
    description:   row.description,
    isEnabled:     row.isEnabled,
  };
}

const PortForwardCreateSchema = z.object({
  hostPort:      z.number().int().min(1024).max(65535),
  containerPort: z.number().int().min(1).max(65535),
  protocol:      z.enum(['tcp', 'udp']),
  description:   z.string().max(200).optional(),
});

const PortForwardPatchSchema = z.object({
  isEnabled: z.boolean(),
});

// インスタンスの所有権チェックヘルパー
async function checkInstanceAccess(
  fastify: Parameters<FastifyPluginAsync>[0],
  instanceId: string,
  userId: string,
): Promise<{ allowed: boolean; notFound: boolean }> {
  const userResult = await fastify.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const isAdmin = userResult[0]?.role === 'admin';

  const instanceResult = await fastify.db
    .select({ ownerUserId: instances.ownerUserId })
    .from(instances)
    .where(eq(instances.id, instanceId))
    .limit(1);

  if (instanceResult.length === 0) return { allowed: false, notFound: true };
  if (isAdmin) return { allowed: true, notFound: false };
  return {
    allowed:  instanceResult[0].ownerUserId === userId,
    notFound: false,
  };
}

const portForwardsRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/instances/:id/portforwards
  fastify.get(
    '/api/instances/:id/portforwards',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { allowed, notFound } = await checkInstanceAccess(fastify, id, req.session.userId!);
      if (notFound) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      if (!allowed)  return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });

      const rows = await fastify.db
        .select()
        .from(portForwards)
        .where(eq(portForwards.instanceId, id));

      return reply.send({ portForwards: rows.map(toPortForwardDTO) });
    },
  );

  // POST /api/instances/:id/portforwards
  fastify.post(
    '/api/instances/:id/portforwards',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { allowed, notFound } = await checkInstanceAccess(fastify, id, req.session.userId!);
      if (notFound) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      if (!allowed)  return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });

      const body = PortForwardCreateSchema.parse(req.body);

      // hostPort重複チェック（全インスタンス横断）
      const conflict = await fastify.db
        .select({ id: portForwards.id })
        .from(portForwards)
        .where(
          and(
            eq(portForwards.hostPort, body.hostPort),
            eq(portForwards.isEnabled, true),
          ),
        )
        .limit(1);

      if (conflict.length > 0) {
        return reply.status(409).send({
          error: 'PORT_CONFLICT',
          message: `Host port ${body.hostPort} is already in use`,
        });
      }

      // インスタンス名を取得
      const instForPF = await fastify.db
        .select({ name: instances.name })
        .from(instances)
        .where(eq(instances.id, id))
        .limit(1);

      const pfId = uuidv4();
      await fastify.db.insert(portForwards).values({
        id:            pfId,
        instanceId:    id,
        hostPort:      body.hostPort,
        containerPort: body.containerPort,
        protocol:      body.protocol,
        description:   body.description ?? null,
        isEnabled:     true,
      });

      // Incusにプロキシデバイスを追加
      if (instForPF.length > 0) {
        const deviceName = `pf-${pfId.slice(0, 8)}`;
        try {
          await incus.addPortForward(
            instForPF[0].name,
            deviceName,
            body.hostPort,
            body.containerPort,
            body.protocol,
          );
          fastify.log.info(`[portforward] added: ${deviceName} ${body.hostPort}->${body.containerPort}`);
        } catch (err) {
          fastify.log.error({ err }, '[portforward] incus device add failed');
        }
      }

      const created = await fastify.db
        .select()
        .from(portForwards)
        .where(eq(portForwards.id, pfId))
        .limit(1);

      return reply.status(201).send({ portForward: toPortForwardDTO(created[0]) });
    },
  );

  // PATCH /api/instances/:instanceId/portforwards/:pfId
  fastify.patch(
    '/api/instances/:instanceId/portforwards/:pfId',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { instanceId, pfId } = req.params as { instanceId: string; pfId: string };
      const { allowed, notFound } = await checkInstanceAccess(fastify, instanceId, req.session.userId!);
      if (notFound) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      if (!allowed)  return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });

      const body = PortForwardPatchSchema.parse(req.body);

      const existing = await fastify.db
        .select({ id: portForwards.id })
        .from(portForwards)
        .where(and(eq(portForwards.id, pfId), eq(portForwards.instanceId, instanceId)))
        .limit(1);

      if (existing.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Port forward not found' });
      }

      await fastify.db
        .update(portForwards)
        .set({ isEnabled: body.isEnabled })
        .where(eq(portForwards.id, pfId));

      const updated = await fastify.db
        .select()
        .from(portForwards)
        .where(eq(portForwards.id, pfId))
        .limit(1);

      return reply.send({ portForward: toPortForwardDTO(updated[0]) });
    },
  );

  // DELETE /api/instances/:instanceId/portforwards/:pfId
  fastify.delete(
    '/api/instances/:instanceId/portforwards/:pfId',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { instanceId, pfId } = req.params as { instanceId: string; pfId: string };
      const { allowed, notFound } = await checkInstanceAccess(fastify, instanceId, req.session.userId!);
      if (notFound) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      if (!allowed)  return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });

      const existing = await fastify.db
        .select({ id: portForwards.id })
        .from(portForwards)
        .where(and(eq(portForwards.id, pfId), eq(portForwards.instanceId, instanceId)))
        .limit(1);

      if (existing.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Port forward not found' });
      }

      // Incusのデバイスを削除
      const pfToDelete = await fastify.db
        .select({ id: portForwards.id })
        .from(portForwards)
        .where(eq(portForwards.id, pfId))
        .limit(1);

      if (pfToDelete.length > 0) {
        const instResult = await fastify.db
          .select({ name: instances.name })
          .from(instances)
          .where(eq(instances.id, instanceId))
          .limit(1);
        if (instResult.length > 0) {
          const deviceName = `pf-${pfId.slice(0, 8)}`;
          try {
            await incus.removePortForward(instResult[0].name, deviceName);
          } catch (err) {
            fastify.log.error({ err }, '[portforward] incus device remove failed');
          }
        }
      }

      await fastify.db.delete(portForwards).where(eq(portForwards.id, pfId));
      return reply.send({ ok: true });
    },
  );
};

export default portForwardsRoutes;
