import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { encrypt, decrypt } from '@/lib/crypto';

export type GraphTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope?: string;
};

export async function saveGraphTokens(userId: string, tokens: GraphTokenSet): Promise<void> {
  const accessTokenEnc = encrypt(tokens.accessToken);
  const refreshTokenEnc = encrypt(tokens.refreshToken);
  const now = new Date();

  await db
    .insert(schema.graphTokens)
    .values({
      userId,
      accessTokenEnc,
      refreshTokenEnc,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.graphTokens.userId,
      set: {
        accessTokenEnc,
        refreshTokenEnc,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope ?? null,
        updatedAt: now,
      },
    });
}

export async function loadGraphTokens(userId: string): Promise<GraphTokenSet | null> {
  const row = await db.query.graphTokens.findFirst({
    where: eq(schema.graphTokens.userId, userId),
  });
  if (!row) return null;
  return {
    accessToken: decrypt(row.accessTokenEnc),
    refreshToken: decrypt(row.refreshTokenEnc),
    expiresAt: row.expiresAt,
    scope: row.scope ?? undefined,
  };
}

export async function deleteGraphTokens(userId: string): Promise<void> {
  await db.delete(schema.graphTokens).where(eq(schema.graphTokens.userId, userId));
}
