// packages/backend/src/index.ts

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import type { ErrorCode } from './types/index.ts';

import dbPlugin    from './plugins/db.ts';
import authPlugin  from './plugins/auth.ts';

import authRoutes      from './routes/auth.ts';
import onboardingRoutes from './routes/onboarding.ts';
import userRoutes      from './routes/users.ts';
import templateRoutes  from './routes/templates.ts';
import instanceRoutes  from './routes/instances.ts';
import portForwardRoutes from './routes/portforwards.ts';
import proxyRoutes     from './routes/proxy.ts';
import logRoutes       from './routes/logs.ts';
import storageRoutes   from './routes/storage.ts';
import dashboardRoutes from './routes/dashboard.ts';

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  },
});

async function start() {
  // CORS
  await fastify.register(cors, {
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  // プラグイン（順序重要: db → auth → routes）
  await fastify.register(dbPlugin);
  await fastify.register(authPlugin);

  // ルート
  await fastify.register(authRoutes);
  await fastify.register(onboardingRoutes);
  await fastify.register(userRoutes);
  await fastify.register(templateRoutes);
  await fastify.register(instanceRoutes);
  await fastify.register(portForwardRoutes);
  await fastify.register(proxyRoutes);
  await fastify.register(logRoutes);
  await fastify.register(storageRoutes);
  await fastify.register(dashboardRoutes);

  // グローバルエラーハンドラ
  fastify.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error:   'VALIDATION_ERROR' as ErrorCode,
        message: 'Validation failed',
        details: error.errors,
      });
    }

    fastify.log.error(error);
    return reply.status(500).send({
      error:   'INTERNAL_ERROR' as ErrorCode,
      message: error.message ?? 'Internal server error',
    });
  });

  const port = Number(process.env.PORT ?? 3000);
  await fastify.listen({ port, host: '0.0.0.0' });
  fastify.log.info(`Server listening on port ${port}`);
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
