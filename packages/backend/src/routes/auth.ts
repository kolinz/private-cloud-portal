// packages/backend/src/routes/auth.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.ts';
import type { UserDTO } from '../types/index.ts';
import { sessionUserMap } from '../services/terminalWs.ts';

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function toUserDTO(user: typeof users.$inferSelect): UserDTO {
  return {
    id:        user.id,
    username:  user.username,
    role:      user.role,
    isActive:  user.isActive,
    createdAt: user.createdAt,
  };
}

const authRoutes: FastifyPluginAsync = async (fastify) => {

  // POST /api/auth/login
  fastify.post('/api/auth/login', async (req, reply) => {
    const body = LoginSchema.parse(req.body);

    const result = await fastify.db
      .select()
      .from(users)
      .where(eq(users.username, body.username))
      .limit(1);

    const user = result[0];

    if (!user || !user.isActive) {
      return reply.status(401).send({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    }

    req.session.userId = user.id;
    // ターミナルWS認証用にセッションIDを登録
    const rawSid = (req.session as unknown as { sessionId?: string }).sessionId
      ?? (req.session as unknown as Record<string, string>).id ?? '';
    if (rawSid) sessionUserMap.set(rawSid, user.id);
    return reply.send({ user: toUserDTO(user) });
  });

  // POST /api/auth/logout
  fastify.post('/api/auth/logout', async (req, reply) => {
    await req.session.destroy();
    return reply.send({ ok: true });
  });

  // GET /api/auth/me
  fastify.get(
    '/api/auth/me',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const result = await fastify.db
        .select()
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .limit(1);

      const user = result[0];
      if (!user) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'User not found',
        });
      }

      return reply.send({ user: toUserDTO(user) });
    },
  );
};

export default authRoutes;
