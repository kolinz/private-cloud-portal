// packages/backend/src/services/system.ts
import type { DrizzleDB } from '../db/migrate.ts';
import { systemSettings } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export async function isInitialized(db: DrizzleDB): Promise<boolean> {
  const result = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, 'initialized'))
    .limit(1);

  return result.length > 0 && result[0].value === 'true';
}
