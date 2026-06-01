import { clioFetch } from './client';

export type ClioTask = {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null; // date (YYYY-MM-DD) or null
  priority: 'High' | 'Normal' | 'Low' | null;
  complete?: boolean; // not requestable via `fields`; inferred from the complete=false filter
  status: string | null;
  matter?: { id: number; display_number: string } | null;
  assignee?: { id: number; name: string } | null;
};

type ClioTaskResponse = { data: ClioTask[] };

/**
 * Fetch a user's incomplete Clio tasks. Clio's per-task date filter params are
 * inconsistent across accounts, so we pull incomplete tasks ordered by due date
 * and let the caller filter to "due on or before today" client-side.
 */
export async function getOpenTasks(userId: string): Promise<ClioTask[]> {
  const res = await clioFetch<ClioTaskResponse>(userId, '/tasks.json', {
    query: {
      complete: false, // filter (not a requestable field)
      fields: 'id,name,description,due_at,priority,status,matter{id,display_number},assignee{id,name}',
      order: 'due_at(asc)',
      limit: 200,
    },
  });
  return res.data ?? [];
}

/**
 * Incomplete tasks that are due on or before `endOfTodayIso` (overdue + due today).
 * Tasks with no due date are excluded — they are not "today" work.
 */
export function filterDueByEndOfDay(tasks: ClioTask[], endOfTodayIso: string): ClioTask[] {
  const cutoff = new Date(endOfTodayIso).getTime();
  return tasks.filter((t) => {
    if (t.complete || !t.due_at) return false;
    const due = new Date(t.due_at).getTime();
    return !Number.isNaN(due) && due <= cutoff;
  });
}
