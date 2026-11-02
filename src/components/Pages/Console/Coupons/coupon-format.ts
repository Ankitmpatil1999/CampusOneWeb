/** Display helpers of the coupons screen (prototype 31_c_money: winOf, typeChip, PERIODS, ciDays). */
import type { CouponKind, CouponPeriod, CouponState, CouponType } from './coupons.api';

/** The states as the prototype shows them (ui.status tones). */
export const COUPON_STATE: Readonly<Record<CouponState, { l: string; tone: string }>> = {
  ACTIVE: { l: 'Active', tone: 'ok' },
  USED: { l: 'Used', tone: 'neutral' },
  EXPIRED: { l: 'Expired', tone: 'neutral' },
  CANCELLED: { l: 'Cancelled', tone: 'neutral' },
};

export const KINDS: readonly { v: CouponKind; l: string }[] = [
  { v: 'MEAL', l: 'Meal' },
  { v: 'NUTRITION', l: 'Nutrition' },
  { v: 'EVENT', l: 'Event' },
  { v: 'OTHER', l: 'Other' },
];
export const kindLabel = (k: CouponKind) => KINDS.find((x) => x.v === k)?.l ?? k;

export const PERIODS: readonly { v: CouponPeriod; l: string; per: string }[] = [
  { v: 'DAY', l: 'Day', per: 'a day' },
  { v: 'WEEK', l: 'Week', per: 'a week' },
  { v: 'MONTH', l: 'Month', per: 'a month' },
];
export const periodWord = (p: CouponPeriod) => PERIODS.find((x) => x.v === p)?.per ?? p;

/** "Breakfast · 07:00–11:00" or "Own window · 09:00–17:00" (winOf). */
export function windowLabel(t: Pick<CouponType, 'slot' | 'window'>): string {
  const w = `${t.window.start}–${t.window.end}`;
  return t.slot ? `${t.slot.name} · ${w}` : `Own window · ${w}`;
}

/** The accepting merchants as a sentence; every regular merchant when none are listed. */
export function acceptsLabel(t: Pick<CouponType, 'acceptsAll' | 'merchants'>): string {
  return t.acceptsAll || !t.merchants.length
    ? 'Every regular merchant'
    : t.merchants.map((m) => m.name).join(', ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
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

const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(utc(v).getTime());

/** "YYYY-MM-DD" plus n days. */
export function addDays(d: string, n: number): string {
  return iso(new Date(utc(d).getTime() + n * 86_400_000));
}

/** The first and the last day of the month of `d`. */
export function monthStart(d: string): string {
  return `${d.slice(0, 7)}-01`;
}
export function monthEnd(d: string): string {
  const [y, m] = d.split('-').map(Number) as [number, number];
  return iso(new Date(Date.UTC(y, m, 0)));
}

/** The days from `from` to `to` (inclusive), at most `max` (ciDays: 93). */
export function daysOf(from: string, to: string, max = 93): string[] {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return [];
  const out: string[] = [];
  for (let d = from; d <= to && out.length < max; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 for Monday … 6 for Sunday. */
export const dowMon = (d: string) => (utc(d).getUTCDay() + 6) % 7;
export const isSunday = (d: string) => utc(d).getUTCDay() === 0;
export const dayOfMonth = (d: string) => utc(d).getUTCDate();
/** "October 2026" (fmt.MONL). */
export const monthTitle = (d: string) =>
  `${MONTHS_LONG[utc(d).getUTCMonth()] ?? ''} ${utc(d).getUTCFullYear()}`;
/** "17 Sep" (fmt.dshort). */
export const dshort = (d: string) => `${dayOfMonth(d)} ${MONTHS[utc(d).getUTCMonth()] ?? ''}`;

/** Days grouped by month for the exclusion calendars. */
export function byMonth(days: readonly string[]): { key: string; days: string[] }[] {
  const out: { key: string; days: string[] }[] = [];
  for (const d of days) {
    const key = d.slice(0, 7);
    const last = out.at(-1);
    if (last?.key === key) last.days.push(d);
    else out.push({ key, days: [d] });
  }
  return out;
}

/** Percentage with one decimal (pct): used ÷ (used + expired). */
export function rate(used: number, expired: number): number {
  const b = used + expired;
  return b ? Math.round((1000 * used) / b) / 10 : 0;
}

/** The short form of an id shown in mono (the full id is in the title). */
export const shortId = (id: string) => id.replace(/-/g, '').slice(0, 8).toUpperCase();

/** A CSV cell, quoted when needed. */
export function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
