// packages/backend/src/plugins/auth.ts
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.ts';

// セッションの型拡張
declare module '@fastify/session' {
  interface FastifySessionObject {
    userId?: string;
  }
}

// Fastifyインスタンスの型拡張
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCookie);

  await fastify.register(fastifySession, {
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me-at-least-32-chars!!',
    cookieName: 'pcportal.sid',
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // 開発環境: false / 本番は true に変更
      maxAge: 86400000, // 24時間
    },
    saveUninitialized: false,
  });

  // requireAuth: ログイン済みか確認
  fastify.decorate(
    'authenticate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.session.userId) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Login required',
        });
      }
    },
  );

  // requireAdmin: Admin権限か確認
  fastify.decorate(
    'requireAdmin',
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.session.userId) {
        return reply.status(401).send({
          error: 'UNAUTHORIZED',
          message: 'Login required',
        });
      }

      const result = await fastify.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, req.session.userId))
        .limit(1);

      if (result.length === 0 || result[0].role !== 'admin') {
        return reply.status(403).send({
          error: 'FORBIDDEN',
          message: 'Admin role required',
        });
      }
    },
  );
};

export default fp(authPlugin, { name: 'auth', dependencies: ['db'] });
