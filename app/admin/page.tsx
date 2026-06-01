import { eq } from 'drizzle-orm';
import { auth, signOut } from '@/auth';
import { Button } from '@/components/ui/button';
import { db, schema } from '@/db';

type AdminPageProps = {
  searchParams: Promise<{ clio?: string; graph?: string; reason?: string }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await auth();
  const params = await searchParams;
  const clioJustConnected = params.clio === 'connected';
  const graphJustConnected = params.graph === 'connected';
  const graphError = params.graph === 'error' ? params.reason : null;

  let clioConnected = false;
  let graphConnected = false;
  if (session?.user?.email) {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, session.user.email),
    });
    if (user) {
      const [clioTok, graphTok] = await Promise.all([
        db.query.clioTokens.findFirst({ where: eq(schema.clioTokens.userId, user.id) }),
        db.query.graphTokens.findFirst({ where: eq(schema.graphTokens.userId, user.id) }),
      ]);
      clioConnected = Boolean(clioTok);
      graphConnected = Boolean(graphTok);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Legal Ops — Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as {session?.user?.email}
      </p>

      {clioJustConnected && (
        <div className="mt-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Clio connected. Refresh tokens stored encrypted.
        </div>
      )}
      {graphJustConnected && (
        <div className="mt-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Outlook + OneDrive connected. Refresh tokens stored encrypted.
        </div>
      )}
      {graphError && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Outlook connection failed: {graphError}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Integrations</h2>

        <div className="mt-4 rounded-md border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Clio Manage</p>
              <p className="text-sm text-muted-foreground">
                {clioConnected
                  ? 'Connected. Refresh tokens stored encrypted.'
                  : 'Not connected — OAuth round-trip required before /find-matter will work.'}
              </p>
            </div>
            <a
              href="/api/clio/oauth/authorize"
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              {clioConnected ? 'Reconnect' : 'Connect Clio'}
            </a>
          </div>
        </div>

        <div className="mt-4 rounded-md border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Microsoft Outlook + OneDrive</p>
              <p className="text-sm text-muted-foreground">
                {graphConnected
                  ? 'Connected. Delegated Mail.* and Files.ReadWrite.All scopes consented.'
                  : 'Not connected — required for email ingest, draft creation, and OneDrive uploads.'}
              </p>
            </div>
            <a
              href="/api/graph/oauth/authorize"
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              {graphConnected ? 'Reconnect' : 'Connect Outlook'}
            </a>
          </div>
        </div>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-lg font-medium">Sections (placeholders)</h2>
        <ul className="list-disc pl-6 text-sm">
          <li>Agent configs — prompt editor + versioning (Phase 8)</li>
          <li>Audit log viewer (Phase 8)</li>
          <li>Integration toggles per user (Phase 8)</li>
          <li>Cron schedule editor (Phase 8)</li>
        </ul>
      </section>

      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/' });
        }}
        className="mt-12"
      >
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}
