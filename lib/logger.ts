import { pino, type Logger } from 'pino';
import { env } from './env';

export type AppLogger = Logger;

const isDev = env().NODE_ENV !== 'production';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  base: { service: 'teams-legal-os' },
  redact: {
    paths: [
      '*.password',
      '*.token',
      '*.access_token',
      '*.refresh_token',
      'authorization',
      'cookie',
      '*.ssn',
      '*.dob',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
      }
    : undefined,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
