// packages/backend/src/plugins/db.ts
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { runMigrationsAndSeed, type DrizzleDB } from '../db/migrate.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: DrizzleDB;
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const db = await runMigrationsAndSeed();
  fastify.decorate('db', db);
  fastify.log.info('[db] connected and migrations applied');
};

export default fp(dbPlugin, { name: 'db' });
