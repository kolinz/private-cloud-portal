// packages/backend/src/routes/storage.ts
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  storageVolumes,
  storageAttachments,
  instances,
  users,
} from '../db/schema.ts';
import * as incus from '../services/incus.ts';
import type { StorageVolumeDTO, StorageAttachmentDTO } from '../types/index.ts';

// ── Zod スキーマ ──────────────────────────────────────────────────────────

const VolumeCreateSchema = z.object({
  displayName: z.string().min(1).max(100),
  size:        z.string().regex(/^\d+(MB|GB)$/, '例: 10GB または 512MB'),
  description: z.string().max(500).optional(),
  poolName:    z.string().min(1).default('default'),
});

const FORBIDDEN_PATHS = [
  '/', '/etc', '/var', '/usr', '/bin', '/sbin',
  '/lib', '/lib64', '/proc', '/sys', '/dev', '/run',
];

const AttachSchema = z.object({
  volumeId:  z.string().uuid(),
  mountPath: z.string()
    .regex(/^\/[a-zA-Z0-9_\-/]+$/, '/mnt/data 形式で入力してください')
    .refine(
      (p) => !FORBIDDEN_PATHS.includes(p),
      'システムパスは使用できません',
    ),
});

// ── ヘルパー ──────────────────────────────────────────────────────────────

async function buildVolumeDTO(
  db: FastifyInstance['db'],
  volumeId: string,
): Promise<StorageVolumeDTO | null> {
  const rows = await db
    .select({
      id:          storageVolumes.id,
      name:        storageVolumes.name,
      displayName: storageVolumes.displayName,
      ownerUserId: storageVolumes.ownerUserId,
      ownerUsername: users.username,
      poolName:    storageVolumes.poolName,
      size:        storageVolumes.size,
      description: storageVolumes.description,
      createdAt:   storageVolumes.createdAt,
    })
    .from(storageVolumes)
    .innerJoin(users, eq(storageVolumes.ownerUserId, users.id))
    .where(eq(storageVolumes.id, volumeId))
    .limit(1);

  if (rows.length === 0) return null;
  const vol = rows[0];

  const attRows = await db
    .select({
      instanceId:   storageAttachments.instanceId,
      instanceName: instances.name,
      mountPath:    storageAttachments.mountPath,
    })
    .from(storageAttachments)
    .innerJoin(instances, eq(storageAttachments.instanceId, instances.id))
    .where(eq(storageAttachments.volumeId, volumeId));

  return { ...vol, attachments: attRows };
}

// ── ルート登録 ────────────────────────────────────────────────────────────

export default async function storageRoutes(fastify: FastifyInstance) {

  // GET /api/storage/pools
  fastify.get('/api/storage/pools', {
    preHandler: [fastify.authenticate],
  }, async (_req, reply) => {
    const pools = await incus.listStoragePools();
    return reply.send({ pools });
  });

  // GET /api/storage/volumes
  fastify.get('/api/storage/volumes', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const { userId, role } = req.session as { userId: string; role: string };

    const rows = await fastify.db
      .select({
        id:          storageVolumes.id,
        name:        storageVolumes.name,
        displayName: storageVolumes.displayName,
        ownerUserId: storageVolumes.ownerUserId,
        ownerUsername: users.username,
        poolName:    storageVolumes.poolName,
        size:        storageVolumes.size,
        description: storageVolumes.description,
        createdAt:   storageVolumes.createdAt,
      })
      .from(storageVolumes)
      .innerJoin(users, eq(storageVolumes.ownerUserId, users.id))
      .where(role === 'admin' ? undefined : eq(storageVolumes.ownerUserId, userId));

    // attachments を各ボリュームに付与
    const volumes: StorageVolumeDTO[] = await Promise.all(
      rows.map(async (vol) => {
        const attRows = await fastify.db
          .select({
            instanceId:   storageAttachments.instanceId,
            instanceName: instances.name,
            mountPath:    storageAttachments.mountPath,
          })
          .from(storageAttachments)
          .innerJoin(instances, eq(storageAttachments.instanceId, instances.id))
          .where(eq(storageAttachments.volumeId, vol.id));
        return { ...vol, attachments: attRows };
      }),
    );

    return reply.send({ volumes });
  });

  // POST /api/storage/volumes
  fastify.post('/api/storage/volumes', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const { userId } = req.session as { userId: string };
    const parsed = VolumeCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: parsed.error.issues,
      });
    }
    const { displayName, size, description, poolName } = parsed.data;

    const internalName = `vol-${uuidv4().replace(/-/g, '').slice(0, 8)}`;
    const now = new Date().toISOString();

    await incus.createVolume(poolName, internalName, size);

    await fastify.db.insert(storageVolumes).values({
      id:          uuidv4(),
      name:        internalName,
      displayName,
      ownerUserId: userId,
      poolName,
      size,
      description: description ?? null,
      createdAt:   now,
    });

    const allRows = await fastify.db
      .select()
      .from(storageVolumes)
      .where(eq(storageVolumes.name, internalName))
      .limit(1);

    const dto = await buildVolumeDTO(fastify.db, allRows[0].id);
    return reply.status(201).send({ volume: dto });
  });

  // GET /api/storage/volumes/:id
  fastify.get<{ Params: { id: string } }>('/api/storage/volumes/:id', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const { userId, role } = req.session as { userId: string; role: string };
    const dto = await buildVolumeDTO(fastify.db, req.params.id);
    if (!dto) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Volume not found' });
    if (role !== 'admin' && dto.ownerUserId !== userId) {
      return reply.status(403).send({ error: 'VOLUME_NOT_OWNED', message: 'Access denied' });
    }
    return reply.send({ volume: dto });
  });

  // DELETE /api/storage/volumes/:id
  fastify.delete<{ Params: { id: string } }>('/api/storage/volumes/:id', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const { userId, role } = req.session as { userId: string; role: string };

    const vol = await fastify.db
      .select().from(storageVolumes)
      .where(eq(storageVolumes.id, req.params.id))
      .limit(1);
    if (vol.length === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Volume not found' });
    }
    if (role !== 'admin' && vol[0].ownerUserId !== userId) {
      return reply.status(403).send({ error: 'VOLUME_NOT_OWNED', message: 'Access denied' });
    }

    // アタッチ中チェック
    const attached = await fastify.db
      .select({
        instanceId:   storageAttachments.instanceId,
        instanceName: instances.name,
      })
      .from(storageAttachments)
      .innerJoin(instances, eq(storageAttachments.instanceId, instances.id))
      .where(eq(storageAttachments.volumeId, req.params.id));

    if (attached.length > 0) {
      return reply.status(409).send({
        error:     'VOLUME_IN_USE',
        message:   'Volume is currently attached to one or more instances',
        details:   { attachedTo: attached },
      });
    }

    await incus.deleteVolume(vol[0].poolName, vol[0].name);
    await fastify.db.delete(storageVolumes).where(eq(storageVolumes.id, req.params.id));
    return reply.send({ ok: true });
  });

  // GET /api/instances/:id/storage
  fastify.get<{ Params: { id: string } }>('/api/instances/:id/storage', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const { userId, role } = req.session as { userId: string; role: string };

    const inst = await fastify.db
      .select().from(instances)
      .where(eq(instances.id, req.params.id))
      .limit(1);
    if (inst.length === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
    }
    if (role !== 'admin' && inst[0].ownerUserId !== userId) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
    }

    const rows = await fastify.db
      .select({
        id:          storageAttachments.id,
        instanceId:  storageAttachments.instanceId,
        volumeId:    storageAttachments.volumeId,
        displayName: storageVolumes.displayName,
        volumeName:  storageVolumes.name,
        poolName:    storageVolumes.poolName,
        mountPath:   storageAttachments.mountPath,
        deviceName:  storageAttachments.deviceName,
        attachedAt:  storageAttachments.attachedAt,
      })
      .from(storageAttachments)
      .innerJoin(storageVolumes, eq(storageAttachments.volumeId, storageVolumes.id))
      .where(eq(storageAttachments.instanceId, req.params.id));

    return reply.send({ attachments: rows as StorageAttachmentDTO[] });
  });

  // POST /api/instances/:id/storage
  fastify.post<{ Params: { id: string } }>('/api/instances/:id/storage', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const { userId, role } = req.session as { userId: string; role: string };

    const parsed = AttachSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: parsed.error.issues,
      });
    }
    const { volumeId, mountPath } = parsed.data;

    // インスタンス取得
    const inst = await fastify.db
      .select().from(instances)
      .where(eq(instances.id, req.params.id))
      .limit(1);
    if (inst.length === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
    }
    if (role !== 'admin' && inst[0].ownerUserId !== userId) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
    }

    // ボリューム取得
    const vol = await fastify.db
      .select().from(storageVolumes)
      .where(eq(storageVolumes.id, volumeId))
      .limit(1);
    if (vol.length === 0) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Volume not found' });
    }

    // 権限チェック: User は自分のボリュームのみアタッチ可
    if (role !== 'admin' && vol[0].ownerUserId !== userId) {
      return reply.status(403).send({ error: 'VOLUME_NOT_OWNED', message: 'Access denied' });
    }

    // マウントパス重複チェック
    const pathConflict = await fastify.db
      .select().from(storageAttachments)
      .where(
        and(
          eq(storageAttachments.instanceId, req.params.id),
          eq(storageAttachments.mountPath, mountPath),
        ),
      )
      .limit(1);
    if (pathConflict.length > 0) {
      return reply.status(409).send({
        error: 'MOUNT_PATH_CONFLICT',
        message: `Mount path "${mountPath}" is already in use on this instance`,
      });
    }

    // 二重アタッチチェック
    const alreadyAttached = await fastify.db
      .select().from(storageAttachments)
      .where(
        and(
          eq(storageAttachments.instanceId, req.params.id),
          eq(storageAttachments.volumeId, volumeId),
        ),
      )
      .limit(1);
    if (alreadyAttached.length > 0) {
      return reply.status(409).send({
        error: 'VOLUME_ALREADY_ATTACHED',
        message: 'This volume is already attached to this instance',
      });
    }

    const deviceName = `vol-${uuidv4().replace(/-/g, '').slice(0, 8)}`;
    const now = new Date().toISOString();

    // Incus にアタッチ
    await incus.attachVolume({
      instanceName: inst[0].name,
      deviceName,
      poolName:     vol[0].poolName,
      volumeName:   vol[0].name,
      mountPath,
    });

    // DB に記録
    const attachId = uuidv4();
    await fastify.db.insert(storageAttachments).values({
      id:         attachId,
      instanceId: req.params.id,
      volumeId,
      mountPath,
      deviceName,
      attachedAt: now,
    });

    const attachment: StorageAttachmentDTO = {
      id:          attachId,
      instanceId:  req.params.id,
      volumeId,
      displayName: vol[0].displayName,
      volumeName:  vol[0].name,
      poolName:    vol[0].poolName,
      mountPath,
      deviceName,
      attachedAt:  now,
    };

    return reply.status(201).send({ attachment });
  });

  // DELETE /api/instances/:instanceId/storage/:attachmentId
  fastify.delete<{ Params: { instanceId: string; attachmentId: string } }>(
    '/api/instances/:instanceId/storage/:attachmentId',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { userId, role } = req.session as { userId: string; role: string };

      const inst = await fastify.db
        .select().from(instances)
        .where(eq(instances.id, req.params.instanceId))
        .limit(1);
      if (inst.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      }
      if (role !== 'admin' && inst[0].ownerUserId !== userId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
      }

      const att = await fastify.db
        .select().from(storageAttachments)
        .where(eq(storageAttachments.id, req.params.attachmentId))
        .limit(1);
      if (att.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Attachment not found' });
      }

      // Incus からデタッチ（失敗してもDB削除は続行）
      try {
        await incus.detachVolume(inst[0].name, att[0].deviceName);
      } catch (err) {
        fastify.log.warn({ err }, `[storage] detach failed for device ${att[0].deviceName}, proceeding with DB cleanup`);
      }

      await fastify.db
        .delete(storageAttachments)
        .where(eq(storageAttachments.id, req.params.attachmentId));

      return reply.send({ ok: true });
    },
  );
}
