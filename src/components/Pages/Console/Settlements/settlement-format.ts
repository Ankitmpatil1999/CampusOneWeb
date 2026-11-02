/**
 * Display helpers of the settlement screens (prototype 31_c_money §8: the status chips, the four
 * statement files, fmt.dshort / fmt.dt / fmt.dlong, the period pills).
 */
import { amountPaise, type MoneyLike } from '../../../Shared/Amount';
import { formatDate, formatInr, formatTime, istBusinessDate } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { formatAmount } from '../../../Utils/money';
import { translate } from '../../../Utils/translate';
import type { Money, SettlementStatus } from './settlements.api';

/** The register labels (status.settlement.*) with the prototype's tones. */
export const SETTLEMENT_STATUS: Readonly<
  Record<SettlementStatus, { readonly l: () => string; readonly tone: string }>
> = {
  PENDING: { l: () => translate('status.settlement.pending'), tone: 'warn' },
  APPROVAL_STAGE_1: { l: () => translate('status.settlement.approval_stage_1'), tone: 'info' },
  APPROVED: { l: () => translate('status.settlement.approved'), tone: 'ok' },
  FAILED: { l: () => translate('status.settlement.failed'), tone: 'bad' },
};

/** The four statement files in the prototype's order (cm-dls), by the API's kind. */
export const STATEMENT_FILES: readonly {
  readonly kind: string;
  readonly title: string;
  readonly sub: string;
  readonly icon: IconName;
}[] = [
  {
    kind: 'transactions',
    title: 'Transaction file',
    sub: 'Every transaction with fee and net',
    icon: 'sheet',
  },
  {
    kind: 'merchant_summary',
    title: 'Merchant summary',
    sub: 'Counts and amounts by status per merchant',
    icon: 'users',
  },
  {
    kind: 'summary_report',
    title: 'Summary report',
    sub: 'Net to each merchant with an aggregate line',
    icon: 'report',
  },
  {
    kind: 'settlement_report',
    title: 'Settlement report',
    sub: 'Transaction, merchant, fee and net',
    icon: 'filetext',
  },
];

/** Paise → API money. */
export const toMoney = (paise: number): Money => ({ amount: formatAmount(paise), currency: 'INR' });
/** "₹1,24,560.00". */
export const inr = (m: MoneyLike) => formatInr(amountPaise(m));
/** Sum of API amounts, exactly (integer paise). */
export const sumPaise = <T>(rows: readonly T[], get: (r: T) => MoneyLike) =>
  rows.reduce((a, r) => a + amountPaise(get(r)), 0);

/** "1 settlement", "12 settlements" (fmt.plural). */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString('en-IN')} ${noun}${n === 1 ? '' : 's'}`;
}

export const num = (n: number) => n.toLocaleString('en-IN');

/** Today in India ("YYYY-MM-DD"). */
export const todayIst = (now: Date = new Date()) => istBusinessDate(now);

/** "YYYY-MM-DD" plus n days. */
export function plusDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** fmt.dshort: "28 Sep". */
export function dshort(v: string): string {
  return formatDate(v).slice(0, 6);
}

/** fmt.dt: "30 Sep 2026, 12:48 PM" (IST). */
export function dt(v: string): string {
  return `${formatDate(v)}, ${formatTime(v)}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
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

/** fmt.dlong of a calendar date: "Tuesday, 29 September 2026". */
export function dlong(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[w]}, ${d} ${MONTHS[m - 1] ?? ''} ${y}`;
}

/** The date-range pills of the console (prototype DP / dpRange) as an API range in IST. */
export type Period = 'today' | 'yday' | '7' | '30' | 'month';
export const PERIOD_LABEL: Readonly<Record<Period, string>> = {
  today: 'Today',
  yday: 'Yesterday',
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  month: 'This month',
};
export function periodRange(p: Period, today: string = todayIst()): { from: string; to: string } {
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case 'yday':
      return { from: plusDays(today, -1), to: plusDays(today, -1) };
    case '30':
      return { from: plusDays(today, -29), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    default:
      return { from: plusDays(today, -6), to: today };
  }
}

/** A table's sort (ui.table): numbers by value, text in natural order. */
export function sortRows<T>(
  rows: readonly T[],
  sort: { k: string; dir: 'asc' | 'desc' } | null,
  get: (r: T, k: string) => string | number,
): T[] {
  const list = [...rows];
  if (!sort) return list;
  list.sort((a, b) => {
    const x = get(a, sort.k);
    const y = get(b, sort.k);
    const r =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), 'en', { numeric: true });
    return sort.dir === 'desc' ? -r : r;
  });
  return list;
}
