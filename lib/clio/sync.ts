import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { logger } from '@/lib/logger';
import { clioPaginate } from './client';
import type { ClioClient, ClioMatter } from './types';

const CLIENT_FIELDS = 'id,name,first_name,last_name,primary_email_address,primary_phone_number,type,created_at,updated_at';
const MATTER_FIELDS = 'id,display_number,description,status,client{id,name},practice_area{id,name},custom_field_values{id,field_name,field_type,value},created_at,updated_at';

export type SyncResult = {
  clientsUpserted: number;
  mattersUpserted: number;
  errors: string[];
};

export async function syncClioForUser(userId: string): Promise<SyncResult> {
  const result: SyncResult = { clientsUpserted: 0, mattersUpserted: 0, errors: [] };
  const log = logger.child({ userId, op: 'clio.sync' });

  log.info('starting Clio sync');

  try {
    for await (const client of clioPaginate<ClioClient>(userId, '/contacts.json', {
      query: { fields: CLIENT_FIELDS, type: 'Person', limit: 200 },
    })) {
      await upsertClient(client);
      result.clientsUpserted += 1;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'clients sync failed');
    result.errors.push(`clients: ${msg}`);
  }

  try {
    for await (const matter of clioPaginate<ClioMatter>(userId, '/matters.json', {
      query: { fields: MATTER_FIELDS, limit: 200 },
    })) {
      await upsertMatter(matter);
      result.mattersUpserted += 1;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'matters sync failed');
    result.errors.push(`matters: ${msg}`);
  }

  log.info(result, 'Clio sync completed');
  return result;
}

async function upsertClient(client: ClioClient): Promise<void> {
  const clioId = String(client.id);
  const now = new Date();

  await db
    .insert(schema.clients)
    .values({
      clioId,
      name: client.name,
      primaryEmail: client.primary_email_address ?? null,
      aliases: [],
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.clients.clioId,
      set: {
        name: client.name,
        primaryEmail: client.primary_email_address ?? null,
        updatedAt: now,
      },
    });
}

async function upsertMatter(matter: ClioMatter): Promise<void> {
  const clioId = String(matter.id);
  const now = new Date();

  const customFields = (matter.custom_field_values ?? []).reduce<Record<string, unknown>>(
    (acc, cf) => {
      const name = cf.custom_field?.name ?? cf.field_name;
      if (name) acc[name] = cf.value;
      return acc;
    },
    {},
  );

  let clientUuid: string | null = null;
  if (matter.client?.id !== undefined) {
    const existing = await db.query.clients.findFirst({
      where: eq(schema.clients.clioId, String(matter.client.id)),
      columns: { id: true },
    });
    clientUuid = existing?.id ?? null;
  }

  await db
    .insert(schema.matters)
    .values({
      clioId,
      clientId: clientUuid,
      displayName: matter.display_number,
      description: matter.description ?? null,
      status: matter.status,
      customFields,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.matters.clioId,
      set: {
        clientId: clientUuid,
        displayName: matter.display_number,
        description: matter.description ?? null,
        status: matter.status,
        customFields,
        updatedAt: now,
      },
    });
}

export async function syncAllUsersWithClioTokens(): Promise<SyncResult[]> {
  const rows = await db
    .select({ userId: schema.clioTokens.userId })
    .from(schema.clioTokens);

  const results: SyncResult[] = [];
  for (const { userId } of rows) {
    try {
      results.push(await syncClioForUser(userId));
    } catch (err) {
      logger.error({ err, userId }, 'sync failed for user');
      results.push({
        clientsUpserted: 0,
        mattersUpserted: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  }
  return results;
}

export async function lastSyncedAtForMatters(): Promise<Date | null> {
  const row = await db
    .select({ max: sql<Date>`max(${schema.matters.updatedAt})` })
    .from(schema.matters);
  return row[0]?.max ?? null;
}
