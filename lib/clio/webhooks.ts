import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyClioSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const computed = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = signatureHeader.replace(/^sha256=/, '');
  if (computed.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(provided));
}

export type ClioWebhookEvent = {
  event: string;
  resource_type: 'matter' | 'contact' | 'note' | 'communication' | 'activity' | string;
  resource_id: number;
  occurred_at: string;
  data?: Record<string, unknown>;
};
