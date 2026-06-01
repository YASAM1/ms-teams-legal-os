import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      oid?: string;
      tenantId?: string;
      isAdmin?: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    oid?: string;
    tenantId?: string;
    isAdmin?: boolean;
  }
}
