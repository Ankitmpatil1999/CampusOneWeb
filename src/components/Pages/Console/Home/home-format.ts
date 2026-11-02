/**
 * The home's number formats (prototype fmt.inr0, fmt.inrK, fmt.pct) and labels. Money arrives as
 * `{amount, currency}` and is read as integer paise; nothing is computed in floating rupees.
 */
import { formatInr } from '../../../Utils/format';
import { parseAmount } from '../../../Utils/money';
import type { Money } from './home.api';

/** Paise of a money value (0 when absent or unreadable). */
export function paise(m: Money | null | undefined): number {
  if (!m) return 0;
  try {
    return m.amount.startsWith('-')
      ? -parseAmount(m.amount.slice(1), { allowZero: true })
      : parseAmount(m.amount, { allowZero: true });
  } catch {
    return 0;
  }
}

/** Whole rupees, Indian grouping: ₹8,664 (fmt.inr0). */
export const inr0 = (p: number) => formatInr(Math.round(p / 100) * 100).replace(/\.00$/, '');

/** Short rupees: ₹2.19 L, ₹1.2 Cr, ₹8.7k (fmt.inrK). */
export function inrK(p: number): string {
  const r = p / 100;
  const a = Math.abs(r);
  if (a >= 1e7) return `₹${(r / 1e7).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (a >= 1e5) return `₹${(r / 1e5).toFixed(2).replace(/\.00$/, '')} L`;
  if (a >= 1e3) return `₹${(r / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return inr0(p);
}

/** "94.9%" (fmt.pct). */
export const pct = (n: number | null | undefined, d = 0) => `${(n ?? 0).toFixed(d)}%`;

/** The payment channels of the transactions report, as the prototype names the modes. */
const CHANNEL: Readonly<Record<string, string>> = {
  STATIC_QR: 'Static QR',
  DYNAMIC_QR: 'Dynamic QR',
  NFC: 'NFC',
  ALLOWANCE: 'Allowance',
  EVENT: 'Events',
  TUITION: 'Tuition fees',
  POS: 'Point of sale',
  TRANSFER: 'Transfers',
};
export const channelLabel = (c: string) =>
  CHANNEL[c] ?? c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ');

/** The prototype's donut colours (MODE_C), in order. */
export const MODE_COLOURS = [
  'var(--brand-2)',
  'var(--accent)',
  'var(--violet)',
  'var(--ok)',
  'var(--ink-4)',
];

/** The audience groups of an announcement, as the activity feed lists them. */
const GROUP: Readonly<Record<string, string>> = {
  ALL: 'Everyone',
  STUDENTS: 'Students',
  PARENTS: 'Parents',
  TEACHERS: 'Teachers',
  STAFF: 'Staff',
};
const CHANNEL_NAME: Readonly<Record<string, string>> = {
  IN_APP: 'In-app',
  SMS: 'SMS',
  EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp',
  PUSH: 'Push',
};
export const groupsText = (g: readonly string[]) => g.map((x) => GROUP[x] ?? x).join(', ');
export const channelsText = (c: readonly string[]) => c.map((x) => CHANNEL_NAME[x] ?? x).join(', ');

/** "Mo 21" for a day of the chart, "Today" for today. */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  const d = new Date(`${iso}T00:00:00Z`);
  return `${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getUTCDay()]} ${d.getUTCDate()}`;
}

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** "Monday, 12 October 2026" for a business date (fmt.dlong). */
export function dlongIso(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${DAY_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
