import { signIn } from '@/auth';
import { Button } from '@/components/ui/button';

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Legal Ops — Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in with your firm Microsoft account.
      </p>

      <form
        action={async () => {
          'use server';
          await signIn('microsoft-entra-id', { redirectTo: '/admin' });
        }}
        className="mt-6"
      >
        <Button type="submit" className="w-full">
          Continue with Microsoft
        </Button>
      </form>
    </main>
  );
}
