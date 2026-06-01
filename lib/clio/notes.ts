import { clioFetch, ClioApiError } from './client';

export type ClioNoteCreateInput = {
  /** Clio matter id (the external id, not our internal UUID). */
  clioMatterId: string;
  subject: string;
  /** Plain-text body. Clio also accepts HTML but plain-text is safer for v1. */
  body: string;
  /** ISO date-only (YYYY-MM-DD). Defaults to today in Clio's tz if omitted. */
  date?: string;
  /** Idempotency key. Same key + same matter → Clio returns the original note. */
  idempotencyKey: string;
};

type ClioNoteResponse = {
  data: {
    id: number;
    subject: string | null;
    detail: string | null;
    date: string;
    type: string;
    created_at: string;
    updated_at: string;
  };
};

/**
 * Create a Clio note tied to a matter. Idempotency: we set the `X-Idempotency-Key`
 * header. Clio's behavior on duplicate: returns the existing record. If they
 * change that, the 422-with-existing-id branch below handles it.
 */
export async function createClioNote(
  userId: string,
  input: ClioNoteCreateInput,
): Promise<{ clioNoteId: number; clioWebUrl: string }> {
  try {
    const response = await clioFetch<ClioNoteResponse>(userId, '/notes.json', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': input.idempotencyKey },
      body: {
        data: {
          subject: input.subject,
          detail: input.body,
          date: input.date,
          type: 'Matter',
          matter: { id: Number(input.clioMatterId) },
        },
      },
    });
    const noteId = response.data.id;
    return {
      clioNoteId: noteId,
      clioWebUrl: `https://app.clio.com/nc/#/matters/${input.clioMatterId}/notes/${noteId}`,
    };
  } catch (err) {
    if (err instanceof ClioApiError && err.status === 422) {
      // Duplicate idempotency key (or validation). Try to extract existing id.
      const body = err.body as { error?: { existing_id?: number; message?: string } } | undefined;
      const existingId = body?.error?.existing_id;
      if (existingId) {
        return {
          clioNoteId: existingId,
          clioWebUrl: `https://app.clio.com/nc/#/matters/${input.clioMatterId}/notes/${existingId}`,
        };
      }
    }
    throw err;
  }
}
