/**
 * PII redaction for text headed to an LLM. We're conservative: better to
 * over-redact than leak. The redaction is destructive — callers should store
 * the original separately if needed (we store originals in audit_log, which
 * is admin-gated).
 *
 * What we redact:
 *  - US SSN: 9 digits with dashes (123-45-6789) or grouped (123 45 6789).
 *  - Credit/bank account numbers: 12-19 consecutive digits (Luhn not checked
 *    — false positives are acceptable for redaction).
 *  - Phone numbers stay (lawyers need to read them).
 *  - Full DOB in the form mm/dd/yyyy or m/d/yyyy where year is 1900-2025.
 *  - Driver's license-style alphanumerics (1 letter + 7 digits, e.g. CA DL).
 *
 * Email addresses are not redacted — the case parties are often identified
 * by email, and the triage agent needs them.
 */

const PATTERNS: Array<{ name: string; re: RegExp; replace: string }> = [
  {
    name: 'ssn',
    re: /\b(?!000|666|9\d{2})\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    replace: '[REDACTED_SSN]',
  },
  {
    name: 'account_number',
    re: /\b\d{12,19}\b/g,
    replace: '[REDACTED_ACCOUNT]',
  },
  {
    name: 'dob',
    re: /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(19\d{2}|20[01]\d|202[0-5])\b/g,
    replace: '[REDACTED_DOB]',
  },
  {
    name: 'ca_drivers_license',
    re: /\b[A-Z]\d{7}\b/g,
    replace: '[REDACTED_DL]',
  },
];

export type RedactionStats = Record<string, number>;

export function redactPII(text: string): { redacted: string; stats: RedactionStats } {
  let redacted = text;
  const stats: RedactionStats = {};
  for (const p of PATTERNS) {
    let count = 0;
    redacted = redacted.replace(p.re, () => {
      count += 1;
      return p.replace;
    });
    if (count > 0) stats[p.name] = count;
  }
  return { redacted, stats };
}
