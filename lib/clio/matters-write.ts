import { clioFetch, ClioApiError } from './client';

export type ClioContactCreateInput = {
  firstName: string;
  lastName: string;
  primaryEmail?: string;
  primaryPhone?: string;
  idempotencyKey: string;
};

type ContactResponse = { data: { id: number; name: string } };

export async function createClioContact(
  userId: string,
  input: ClioContactCreateInput,
): Promise<{ clioContactId: number; name: string }> {
  try {
    const response = await clioFetch<ContactResponse>(userId, '/contacts.json', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': input.idempotencyKey },
      body: {
        data: {
          type: 'Person',
          first_name: input.firstName,
          last_name: input.lastName,
          email_addresses: input.primaryEmail
            ? [{ name: 'Other', address: input.primaryEmail, default_email: true }]
            : undefined,
          phone_numbers: input.primaryPhone
            ? [{ name: 'Mobile', number: input.primaryPhone, default_number: true }]
            : undefined,
        },
      },
    });
    return { clioContactId: response.data.id, name: response.data.name };
  } catch (err) {
    if (err instanceof ClioApiError && err.status === 422) {
      const body = err.body as { error?: { existing_id?: number } } | undefined;
      if (body?.error?.existing_id) {
        return { clioContactId: body.error.existing_id, name: `${input.firstName} ${input.lastName}` };
      }
    }
    throw err;
  }
}

export type ClioMatterCreateInput = {
  clientClioId: number;
  description: string;
  practiceAreaName?: string;
  customFields?: Record<string, unknown>;
  idempotencyKey: string;
};

type MatterResponse = {
  data: { id: number; display_number: string; description: string | null };
};

export async function createClioMatter(
  userId: string,
  input: ClioMatterCreateInput,
): Promise<{ clioMatterId: number; displayNumber: string; clioMatterUrl: string }> {
  try {
    const response = await clioFetch<MatterResponse>(userId, '/matters.json', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': input.idempotencyKey },
      body: {
        data: {
          client: { id: input.clientClioId },
          description: input.description,
          status: 'Open',
        },
      },
    });
    const matterId = response.data.id;
    return {
      clioMatterId: matterId,
      displayNumber: response.data.display_number,
      clioMatterUrl: `https://app.clio.com/nc/#/matters/${matterId}`,
    };
  } catch (err) {
    if (err instanceof ClioApiError && err.status === 422) {
      const body = err.body as { error?: { existing_id?: number; message?: string } } | undefined;
      if (body?.error?.existing_id) {
        const existingId = body.error.existing_id;
        return {
          clioMatterId: existingId,
          displayNumber: `${existingId}`,
          clioMatterUrl: `https://app.clio.com/nc/#/matters/${existingId}`,
        };
      }
    }
    throw err;
  }
}
