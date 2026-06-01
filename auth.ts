import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { env } from '@/lib/env';

const adminEmails = new Set(
  (env().ADMIN_EMAIL_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  if (adminEmails.size === 0) return false;
  return adminEmails.has(email.toLowerCase());
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: env().ENTRA_CLIENT_ID,
      clientSecret: env().ENTRA_CLIENT_SECRET,
      issuer: env().ENTRA_TENANT_ID
        ? `https://login.microsoftonline.com/${env().ENTRA_TENANT_ID}/v2.0`
        : undefined,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.oid = (profile as { oid?: string }).oid;
        token.tenantId = (profile as { tid?: string }).tid;
      }
      token.isAdmin = isAdmin(token.email);
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.oid = token.oid as string | undefined;
        session.user.tenantId = token.tenantId as string | undefined;
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
    authorized({ auth: session, request }) {
      const path = request.nextUrl.pathname;
      if (!path.startsWith('/admin')) return true;
      if (path.startsWith('/admin/sign-in')) return true;
      if (!session?.user) return false;
      return Boolean(session.user.isAdmin);
    },
  },
  pages: {
    signIn: '/admin/sign-in',
  },
});
