import { db, schema } from '@/db';
import { graphPaginate } from '@/lib/graph/client';
import { ingestInboxMessage } from '@/lib/graph/ingest';
import { runTriageWorker } from '@/lib/email/worker';
import { sql } from 'drizzle-orm';

type InboxMessage = {
  id: string;
  receivedDateTime: string;
  subject: string;
};

async function main() {
  const users = await db.query.users.findMany();
  const user = users[0];
  if (!user) {
    console.error('No users in DB. Sign in once via /admin.');
    process.exit(1);
  }

  const graphTokens = await db.query.graphTokens.findFirst();
  if (!graphTokens) {
    console.error('No Graph tokens. Connect Outlook via /admin first.');
    process.exit(1);
  }

  // Pull the 5 most recent Inbox messages and enqueue them. Idempotent —
  // double-enqueue is deduped against email_summaries + recent audit log.
  console.log('Fetching 5 most recent Inbox messages...');
  const enqueued: string[] = [];
  let count = 0;
  for await (const msg of graphPaginate<InboxMessage>(user.id, "/me/mailFolders('Inbox')/messages", {
    query: { $select: 'id,receivedDateTime,subject', $orderby: 'receivedDateTime desc', $top: 5 },
  })) {
    const r = await ingestInboxMessage({ userId: user.id, messageId: msg.id, source: 'reconcile' });
    console.log(`  ${msg.receivedDateTime} | ${msg.subject?.slice(0, 60) ?? '(no subject)'}  →  ${r.accepted ? 'enqueued' : 'skipped (' + r.reason + ')'}`);
    if (r.accepted) enqueued.push(msg.id);
    count += 1;
    if (count >= 5) break;
  }

  console.log(`\n${enqueued.length} message(s) enqueued. Running triage worker...\n`);

  const result = await runTriageWorker({ limit: 10 });
  console.log(`Total: ${result.total}  Triaged: ${result.triaged}  Failed: ${result.failed}  Skipped: ${result.skipped}\n`);

  for (const d of result.details) {
    console.log(`  ${d.status.padEnd(8)} ${d.messageId.slice(0, 24)}…  ${d.importance ?? d.reason ?? ''}`);
  }

  // Show what landed
  console.log('\nemail_summaries (most recent 10):');
  const rows = await db.execute<{ subject: string | null; importance: string; summary: string; action_items: string }>(
    sql`SELECT graph_message_id, importance, summary, action_items::text AS action_items
        FROM email_summaries
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC
        LIMIT 10`,
  );
  for (const r of rows) {
    console.log(`  [${r.importance}] ${r.summary.slice(0, 120)}…`);
    if (r.action_items && r.action_items !== '[]') {
      console.log(`    actions: ${r.action_items.slice(0, 200)}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
