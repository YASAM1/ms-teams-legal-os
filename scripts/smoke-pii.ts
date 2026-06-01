import { redactPII } from '@/lib/pii';

const cases = [
  'Client SSN is 123-45-6789, DOB 05/12/1987.',
  'Wire to account 4111111111111234 (12-19 digits).',
  'CA driver license A1234567.',
  'Just plain text with no PII.',
  'Mixed: SSN 999-12-3456 and DOB 11/3/2001 and account 9876543210123.',
  'Email me at test@example.com or call (555) 123-4567.', // should NOT redact phone/email
];

for (const text of cases) {
  const { redacted, stats } = redactPII(text);
  console.log(`IN:    ${text}`);
  console.log(`OUT:   ${redacted}`);
  console.log(`STATS: ${JSON.stringify(stats)}`);
  console.log('');
}
