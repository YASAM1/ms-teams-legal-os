import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  buildCommand: 'pnpm build',
  installCommand: 'pnpm install',

  crons: [
    { path: '/api/cron/daily-digest', schedule: '30 13 * * 1-5' },
    { path: '/api/cron/clio-sync', schedule: '0 9 * * *' },
    { path: '/api/cron/graph-subscriptions-renew', schedule: '0 */6 * * *' },
    { path: '/api/cron/email-reconcile', schedule: '*/15 * * * *' },
  ],

  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],
};

export default config;
