/** Display helpers of the allowances screen (prototype 31_c_money: alwStatus, alwLimits). */
import { inrText } from '../../../Shared/Amount';
import { istBusinessDate } from '../../../Utils/format';
import type { AllowanceGrant, AllowanceState, DailyLimits } from './allowances.api';

/** The states as the prototype shows them (ui.status tones). */
export const STATE: Readonly<Record<AllowanceState, { l: string; tone: string }>> = {
  SCHEDULED: { l: 'Scheduled', tone: 'info' },
  ACTIVE: { l: 'Active', tone: 'ok' },
  EXPIRED: { l: 'Expired', tone: 'neutral' },
  CANCELLED: { l: 'Cancelled', tone: 'neutral' },
};

/** "3 payments · ₹200.00 a day" (alwLimits); '' when there is no daily limit. */
export function limitsText(l: DailyLimits | null): string {
  if (!l || (l.count === null && l.amount === null)) return '';
  const parts = [
    l.count !== null ? `${l.count} payment${l.count === 1 ? '' : 's'}` : '',
    l.amount ? `${inrText(l.amount)} a day` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

/** "YYYY-MM-DD" of the 1st of the month after today's (IST) date: the form's default start. */
export function firstOfNextMonth(now: Date = new Date()): string {
  const [y, m] = istBusinessDate(now).split('-').map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

/** 31 Mar ending the financial year that `start` falls in (the prototype's default expiry). */
export function financialYearEnd(start: string): string {
  const [y, m] = start.split('-').map(Number) as [number, number];
  return `${m >= 4 ? y + 1 : y}-03-31`;
}

/** Whether two [start, expiry) periods overlap — the server's one-allowance-at-a-time check (BR-40). */
export function overlaps(a: { start: string; expiry: string }, g: AllowanceGrant): boolean {
  return g.startDate < a.expiry && g.expiryDate > a.start;
}

/** A grant that still counts for BR-40: issued and not ended. */
export function holds(g: AllowanceGrant): boolean {
  return g.state === 'SCHEDULED' || g.state === 'ACTIVE';
}

/** "1 student", "13 students" (fmt.plural). */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString('en-IN')} ${noun}${n === 1 ? '' : 's'}`;
}

/** "17 Sep" from "2026-09-17" (fmt.dshort). */
export function shortDate(d: string): string {
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const [, m, day] = d.split('-').map(Number) as [number, number, number];
  return `${day} ${MONTHS[m - 1] ?? ''}`;
}

/** A rupee amount typed in a form ("500", "500.5") → the API's "500.50"; null when invalid. */
export function moneyInput(v: string): string | null {
  const s = v.trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [r = '0', f = ''] = s.split('.');
  return `${r.replace(/^0+(?=\d)/, '')}.${f.padEnd(2, '0')}`;
}
