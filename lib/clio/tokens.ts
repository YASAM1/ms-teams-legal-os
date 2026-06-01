import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { encrypt, decrypt } from '@/lib/crypto';

export type ClioTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope?: string;
};

export async function saveClioTokens(userId: string, tokens: ClioTokenSet): Promise<void> {
  const accessTokenEnc = encrypt(tokens.accessToken);
  const refreshTokenEnc = encrypt(tokens.refreshToken);
  const now = new Date();

  await db
    .insert(schema.clioTokens)
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
      target: schema.clioTokens.userId,
      set: {
        accessTokenEnc,
        refreshTokenEnc,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope ?? null,
        updatedAt: now,
      },
    });
}

export async function loadClioTokens(userId: string): Promise<ClioTokenSet | null> {
  const row = await db.query.clioTokens.findFirst({
    where: eq(schema.clioTokens.userId, userId),
  });
  if (!row) return null;
  return {
    accessToken: decrypt(row.accessTokenEnc),
    refreshToken: decrypt(row.refreshTokenEnc),
    expiresAt: row.expiresAt,
    scope: row.scope ?? undefined,
  };
}

export async function deleteClioTokens(userId: string): Promise<void> {
  await db.delete(schema.clioTokens).where(eq(schema.clioTokens.userId, userId));
}
