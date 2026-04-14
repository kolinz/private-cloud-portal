// packages/backend/src/routes/templates.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { templates, instances, users } from '../db/schema.ts';
import * as incus from '../services/incus.ts';
import type { TemplateDTO } from '../types/index.ts';

function toTemplateDTO(t: typeof templates.$inferSelect): TemplateDTO {
  return {
    id:          t.id,
    name:        t.name,
    description: t.description,
    type:        t.type,
    role:        t.role,
    imageAlias:  t.imageAlias,
    cpuLimit:    t.cpuLimit,
    memoryLimit: t.memoryLimit,
    diskLimit:   t.diskLimit,
    isActive:    t.isActive,
    createdAt:   t.createdAt,
  };
}

const TemplateCreateSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type:        z.enum(['preset', 'custom']),
  role:        z.enum(['general', 'reverse_proxy']),
  imageAlias:  z.string().min(1),
  cpuLimit:    z.number().int().min(1).max(32).optional(),
  memoryLimit: z.string().optional(),
  diskLimit:   z.string().optional(),
});

const TemplatePatchSchema = TemplateCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const templatesRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/templates
  fastify.get(
    '/api/templates',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const userResult = await fastify.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, req.session.userId!))
        .limit(1);

      const isAdmin = userResult[0]?.role === 'admin';

      const result = isAdmin
        ? await fastify.db.select().from(templates).orderBy(desc(templates.createdAt))
        : await fastify.db.select().from(templates)
            .where(eq(templates.isActive, true))
            .orderBy(desc(templates.createdAt));

      return reply.send({ templates: result.map(toTemplateDTO) });
    },
  );

  // POST /api/templates
  fastify.post(
    '/api/templates',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (req, reply) => {
      const body = TemplateCreateSchema.parse(req.body);
      const now = new Date().toISOString();
      const id = uuidv4();

      await fastify.db.insert(templates).values({
        id,
        name:        body.name,
        description: body.description ?? null,
        type:        body.type,
        role:        body.role,
        imageAlias:  body.imageAlias,
        cpuLimit:    body.cpuLimit ?? null,
        memoryLimit: body.memoryLimit ?? null,
        diskLimit:   body.diskLimit ?? null,
        isActive:    true,
        createdAt:   now,
      });

      const created = await fastify.db.select().from(templates)
        .where(eq(templates.id, id)).limit(1);

      return reply.status(201).send({ template: toTemplateDTO(created[0]) });
    },
  );

  // PATCH /api/templates/:id
  fastify.patch(
    '/api/templates/:id',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = TemplatePatchSchema.parse(req.body);

      const existing = await fastify.db.select().from(templates)
        .where(eq(templates.id, id)).limit(1);

      if (existing.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Template not found' });
      }

      const updates: Partial<typeof templates.$inferInsert> = {};
      if (body.name        !== undefined) updates.name        = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.type        !== undefined) updates.type        = body.type;
      if (body.role        !== undefined) updates.role        = body.role;
      if (body.imageAlias  !== undefined) updates.imageAlias  = body.imageAlias;
      if (body.cpuLimit    !== undefined) updates.cpuLimit    = body.cpuLimit;
      if (body.memoryLimit !== undefined) updates.memoryLimit = body.memoryLimit;
      if (body.diskLimit   !== undefined) updates.diskLimit   = body.diskLimit;
      if (body.isActive    !== undefined) updates.isActive    = body.isActive;

      await fastify.db.update(templates).set(updates).where(eq(templates.id, id));

      const updated = await fastify.db.select().from(templates)
        .where(eq(templates.id, id)).limit(1);

      return reply.send({ template: toTemplateDTO(updated[0]) });
    },
  );

  // DELETE /api/templates/:id
  fastify.delete(
    '/api/templates/:id',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };

      const existing = await fastify.db.select({ id: templates.id }).from(templates)
        .where(eq(templates.id, id)).limit(1);

      if (existing.length === 0) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Template not found' });
      }

      const inUse = await fastify.db.select({ id: instances.id }).from(instances)
        .where(eq(instances.templateId, id)).limit(1);

      if (inUse.length > 0) {
        return reply.status(409).send({
          error: 'TEMPLATE_IN_USE',
          message: 'Template is in use by one or more instances',
        });
      }

      await fastify.db.delete(templates).where(eq(templates.id, id));
      return reply.send({ ok: true });
    },
  );

  // GET /api/templates/images/local — ローカルに存在するイメージ一覧
  fastify.get(
    '/api/templates/images/local',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (_req, reply) => {
      const images = await incus.listLocalImages();
      const aliases = images.flatMap(img => img.aliases.map(a => a.name));
      return reply.send({ aliases });
    },
  );

  // POST /api/templates/images/download — イメージをダウンロード
  fastify.post(
    '/api/templates/images/download',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (req, reply) => {
      const { alias } = (req.body as { alias?: string });
      if (!alias) return reply.status(422).send({ error: 'VALIDATION_ERROR', message: 'alias is required' });
      await incus.downloadImage(alias);
      return reply.send({ ok: true, alias });
    },
  );
};

export default templatesRoutes;
