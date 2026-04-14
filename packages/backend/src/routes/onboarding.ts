// packages/backend/src/routes/onboarding.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { users, systemSettings } from '../db/schema.ts';
import { isInitialized } from '../services/system.ts';

const OnboardingSchema = z.object({
  systemName:    z.string().min(1).max(100),
  adminUsername: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, 'alphanumeric and underscore only'),
  adminPassword: z.string().min(8).max(128),
});

const onboardingRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/onboarding/status
  fastify.get('/api/onboarding/status', async (_req, reply) => {
    const initialized = await isInitialized(fastify.db);
    return reply.send({ initialized });
  });

  // POST /api/onboarding
  fastify.post('/api/onboarding', async (req, reply) => {
    // 既に初期化済みなら 409
    if (await isInitialized(fastify.db)) {
      return reply.status(409).send({
        error: 'ALREADY_INITIALIZED',
        message: 'System is already initialized',
      });
    }

    // バリデーション
    const body = OnboardingSchema.parse(req.body);

    // adminユーザー作成
    const passwordHash = await bcrypt.hash(body.adminPassword, 10);
    const now = new Date().toISOString();

    await fastify.db.insert(users).values({
      id:           uuidv4(),
      username:     body.adminUsername,
      passwordHash,
      role:         'admin',
      isActive:     true,
      createdAt:    now,
    });

    // system_settings に初期化フラグとシステム名を保存
    await fastify.db.insert(systemSettings).values([
      { key: 'initialized', value: 'true' },
      { key: 'system_name', value: body.systemName },
    ]);

    return reply.send({ ok: true });
  });
};

export default onboardingRoutes;
