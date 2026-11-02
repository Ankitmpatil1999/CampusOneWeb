/**
 * Labels of the cross-institution pages (prototype o.crossinst, o.access): the figure groups with
 * what each reports, the period presets, an institution's status (status.institution.*) and a
 * value as its unit prints it.
 */
import { formatDate, formatInr } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { addDays, today } from '../../Console/Structure/academic-format';
import type { XiFigure, XiStatus, XiUnit } from './crossinst.api';

export const FIGURES: readonly { v: XiFigure; l: string; s: string }[] = [
  { v: 'members', l: 'Members', s: 'Active, inactive and suspended members when read · IDN 6.20' },
  {
    v: 'admissions',
    l: 'Admissions',
    s: 'Applications received and approved in the period · ADM 19',
  },
  {
    v: 'attendance',
    l: 'Attendance %',
    s: 'Students present, late or half day ÷ day records · ATT 21.11',
  },
  { v: 'fees', l: 'Fees', s: 'Instalments falling due and collections received · FEE 13.4' },
  { v: 'wallets', l: 'Wallets', s: 'Wallet funding and spend in the period · WAL 8.2, 8.5' },
  { v: 'settlement', l: 'Settlement amount', s: 'Net settled and platform fee taken · STL 14.2' },
  {
    v: 'communication',
    l: 'Communication',
    s: 'Messages sent and the share that failed · COM 23.18',
  },
  { v: 'tickets', l: 'Tickets', s: 'Tickets raised and still open · GRV 16.7' },
];
export const figureLabel = (f: string) => FIGURES.find((x) => x.v === f)?.l ?? f;

export const STATUSES: readonly XiStatus[] = [
  'ACTIVE',
  'PENDING_ACTIVATION',
  'SUSPENDED',
  'CANCELLED',
];
const TONE: Readonly<Record<string, string>> = {
  ACTIVE: 'ok',
  TRIAL: 'info',
  PENDING_ACTIVATION: 'warn',
  SUSPENDED: 'bad',
  CANCELLED: 'neutral',
};

/** The institution's status as the register names it (Trial while an active one is on trial). */
export function statusChip(status: string, subscription: string | null = null) {
  if (status === 'ACTIVE' && subscription === 'TRIAL') return { l: 'Trial', tone: 'info' };
  return {
    l: translate(`status.institution.${status.toLowerCase()}`),
    tone: TONE[status] ?? 'neutral',
  };
}

export type PeriodPreset = '1d' | '7d' | 'mtd' | '30d' | 'custom';
export const PERIODS: readonly { v: PeriodPreset; l: string }[] = [
  { v: '1d', l: 'Yesterday (single day)' },
  { v: '7d', l: 'Last 7 days' },
  { v: 'mtd', l: 'This month to date' },
  { v: '30d', l: 'Last 30 days' },
  { v: 'custom', l: 'Custom dates…' },
];

/** The dates a preset covers (IST business days; "last 7 days" ends yesterday, as the prototype). */
export function presetRange(p: PeriodPreset, now: string = today()): { from: string; to: string } {
  const y = addDays(now, -1);
  if (p === '1d') return { from: y, to: y };
  if (p === '7d') return { from: addDays(now, -7), to: y };
  if (p === '30d') return { from: addDays(now, -30), to: y };
  return { from: `${now.slice(0, 8)}01`, to: now };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "23 Sep – 29 Sep" (fmt.dshort). */
export function shortRange(from: string, to: string) {
  const d = (s: string) => `${Number(s.slice(8, 10))} ${MON[Number(s.slice(5, 7)) - 1]}`;
  return from === to ? d(from) : `${d(from)} – ${d(to)}`;
}
export const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
export const longRange = (from: string, to: string) =>
  from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;

/** A figure as its unit prints it; null is "not available". */
export function valueText(v: number | null | undefined, unit: XiUnit | string): string {
  if (v === null || v === undefined) return '';
  if (unit === 'paise') return formatInr(Math.round(v));
  if (unit === 'percent') return `${Number(v.toFixed(1))}%`;
  return Math.round(v * 10) / 10 === Math.round(v)
    ? Math.round(v).toLocaleString('en-IN')
    : (Math.round(v * 10) / 10).toLocaleString('en-IN');
}

/** "PARTIALLY_PAID" → "Partially paid" for the breakdown labels. */
export const readable = (s: string) =>
  /^[A-Z][A-Z0-9_]+$/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : s;
