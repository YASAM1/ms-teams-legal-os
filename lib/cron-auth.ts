import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export function isAuthorizedCron(req: NextRequest): boolean {
  if (env().NODE_ENV !== 'production') return true;
  const header = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return header === `Bearer ${expected}`;
}
