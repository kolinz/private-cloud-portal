// packages/backend/src/routes/users.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { users } from '../db/schema.ts';
import type { UserDTO } from '../types/index.ts';

function toUserDTO(user: typeof users.$inferSelect): UserDTO {
  return {
    id:        user.id,
    username:  user.username,
    role:      user.role,
    isActive:  user.isActive,
    createdAt: user.createdAt,
  };
}

const UserCreateSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, 'alphanumeric and underscore only'),
  password: z.string().min(8).max(128),
  role:     z.enum(['admin', 'user']),
});

const UserPatchSchema = z.object({
  password: z.string().min(8).max(128).optional(),
  role:     z.enum(['admin', 'user']).optional(),
  isActive: z.boolean().optional(),
});

const usersRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/users
  fastify.get(
    '/api/users',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (_req, reply) => {
      const result = await fastify.db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt));

      return reply.send({ users: result.map(toUserDTO) });
    },
  );

  // POST /api/users
  fastify.post(
    '/api/users',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (req, reply) => {
      const body = UserCreateSchema.parse(req.body);

      // username 重複チェック
      const existing = await fastify.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, body.username))
        .limit(1);

      if (existing.length > 0) {
        return reply.status(409).send({
          error: 'USERNAME_TAKEN',
          message: `Username "${body.username}" is already taken`,
        });
      }

      const passwordHash = await bcrypt.hash(body.password, 10);
      const now = new Date().toISOString();
      const id = uuidv4();

      await fastify.db.insert(users).values({
        id,
        username:     body.username,
        passwordHash,
        role:         body.role,
        isActive:     true,
        createdAt:    now,
      });

      const created = await fastify.db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return reply.status(201).send({ user: toUserDTO(created[0]) });
    },
  );

  // PATCH /api/users/:id
  fastify.patch(
    '/api/users/:id',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = UserPatchSchema.parse(req.body);

      const existing = await fastify.db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (existing.length === 0) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const updates: Partial<typeof users.$inferInsert> = {};
      if (body.password !== undefined) {
        updates.passwordHash = await bcrypt.hash(body.password, 10);
      }
      if (body.role !== undefined)     updates.role     = body.role;
      if (body.isActive !== undefined) updates.isActive = body.isActive;

      await fastify.db
        .update(users)
        .set(updates)
        .where(eq(users.id, id));

      const updated = await fastify.db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return reply.send({ user: toUserDTO(updated[0]) });
    },
  );

  // DELETE /api/users/:id
  fastify.delete(
    '/api/users/:id',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      // 自分自身は削除不可
      if (id === req.session.userId) {
        return reply.status(400).send({
          error: 'CANNOT_DELETE_SELF',
          message: 'Cannot delete your own account',
        });
      }

      const existing = await fastify.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (existing.length === 0) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      await fastify.db.delete(users).where(eq(users.id, id));
      return reply.send({ ok: true });
    },
  );
};

export default usersRoutes;
