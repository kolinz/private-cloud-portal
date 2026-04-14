// packages/backend/src/routes/logs.ts
import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { instances, users } from '../db/schema.ts';
import * as incus from '../services/incus.ts';

const logsRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/instances/:id/logs?type=instance|console&lines=100
  fastify.get(
    '/api/instances/:id/logs',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const query   = req.query as { type?: string; lines?: string };
      const logType = query.type === 'console' ? 'console' : 'instance';
      const lines   = Math.max(1, Math.min(10000, Number(query.lines ?? 100)));

      const userId = req.session.userId!;

      // 権限チェック
      const userResult = await fastify.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const isAdmin = userResult[0]?.role === 'admin';

      const instanceResult = await fastify.db
        .select()
        .from(instances)
        .where(eq(instances.id, id))
        .limit(1);

      if (instanceResult.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Instance not found' });
      }

      const instance = instanceResult[0];

      if (!isAdmin && instance.ownerUserId !== userId) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access denied' });
      }

      // ログ取得
      const rawLog = logType === 'console'
        ? await incus.getConsoleLog(instance.name)
        : await incus.getInstanceLog(instance.name);

      // 末尾N行に絞り込み
      const allLines = rawLog.split('\n').filter(l => l.length > 0);
      const sliced   = allLines.slice(-lines);

      return reply.send({
        logs:       sliced,
        totalLines: allLines.length,
      });
    },
  );
};

export default logsRoutes;
