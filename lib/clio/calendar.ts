import { clioFetch } from './client';

export type ClioCalendarEntry = {
  id: number;
  summary: string | null;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  matter?: { id: number; display_number: string } | null;
  calendar_owner?: { id: number; name: string } | null;
};

type ClioCalendarResponse = { data: ClioCalendarEntry[] };

/**
 * Fetch a user's Clio calendar entries that fall within [fromIso, toIso].
 * Clio filters on the entry start time via `from`/`to`. Returns chronological order.
 */
export async function getCalendarEntries(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<ClioCalendarEntry[]> {
  const res = await clioFetch<ClioCalendarResponse>(userId, '/calendar_entries.json', {
    query: {
      from: fromIso,
      to: toIso,
      fields:
        'id,summary,description,start_at,end_at,all_day,location,matter{id,display_number},calendar_owner{id,name}',
      order: 'start_at(asc)',
      limit: 200,
    },
  });
  return res.data ?? [];
}
