import { titleCase } from './format';

/** The prototype's greeting (greet + first name): "Good afternoon, Prakash". Local time. */
export function greeting(fullName: string, now: Date = new Date()): string {
  const h = now.getHours();
  const first = titleCase(fullName.trim().split(/\s+/)[0] ?? '');
  // Whole sentences, so each reads naturally in every language (ADR-0018).
  if (!first) return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return h < 12
    ? `Good morning, ${first}`
    : h < 17
      ? `Good afternoon, ${first}`
      : `Good evening, ${first}`;
}
