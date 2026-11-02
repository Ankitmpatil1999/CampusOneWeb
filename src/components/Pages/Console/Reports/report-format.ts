/**
 * Display helpers of the reports (prototype REPORTS): each report's icon, a cell as the column's type
 * prints it (money as ₹1,24,560.00, dates as 30 Sep 2026, times as 12:40 PM), and the period a
 * report covers.
 */
import type { IconName } from '../../../Utils/icons';
import { formatDate, formatInr, formatTime } from '../../../Utils/format';
import { parseAmount } from '../../../Utils/money';
import type { Cell, ReportEntry } from './reports.api';

/** The prototype's icon of each report. */
export const REPORT_ICONS: Readonly<Record<string, IconName>> = {
  'institution-overview': 'users',
  'user-summary': 'idcard',
  'card-register': 'card',
  'pii-corrections': 'lock',
  'transactions-by-member': 'list',
  'transactions-by-institution': 'chart',
  'merchant-summary': 'store',
  'allowance-report': 'gift',
  'coupon-statement': 'ticket',
  'event-payments': 'calendar',
  'entry-pass-history': 'door',
  'settlement-summary': 'bank',
  'posted-vouchers': 'filetext',
  'tuition-collection': 'receipt',
  'dues-overdue': 'alert',
  'admission-fees': 'rupee',
  'marks-by-exam': 'award',
  'enrolment-by-year': 'grad',
  'teacher-leave': 'plane',
  'daily-attendance': 'calcheck',
  'reader-captures': 'nfc',
  'trip-history': 'bus',
  'vehicle-utilisation': 'truck',
  'communication-report': 'chats',
  'announcement-acknowledgements': 'megaphone',
  'grievance-summary': 'help',
  'maker-checker-log': 'approve',
};

export const reportIcon = (id: string): IconName => REPORT_ICONS[id] ?? 'report';

/** What a report covers, by its period. */
export function periodText(r: Pick<ReportEntry, 'period'>, yearLabel: string) {
  return r.period === 'now'
    ? 'As it stands now'
    : r.period === 'year'
      ? `Covers ${yearLabel || 'the year in context'}`
      : `Covers a date range in ${yearLabel || 'the year'}`;
}

/** A code such as PARTIALLY_PAID read as "Partially paid" (the report rows carry codes). */
export function readable(v: string) {
  if (!/^[A-Z][A-Z0-9_]+$/.test(v)) return v;
  const s = v
    .split('_')
    .map((w) => (ACRONYMS.has(w) ? w : w.toLowerCase()))
    .join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** Words a code keeps in capitals (STATIC_QR → "Static QR"). */
const ACRONYMS = new Set(['QR', 'NFC', 'UPI', 'OTP', 'SMS', 'POS', 'PII', 'ID', 'CSV', 'PDF']);

const isMoney = (v: unknown): v is { amount: string; currency: string } =>
  typeof v === 'object' && v !== null && 'amount' in v && 'currency' in v;

/** A cell as its column's type prints it. */
export function cellText(v: Cell | undefined, type: string): string {
  if (v === null || v === undefined || v === '') return '—';
  if (isMoney(v)) {
    const neg = v.amount.startsWith('-');
    try {
      return (
        (neg ? '−' : '') +
        formatInr(parseAmount(neg ? v.amount.slice(1) : v.amount, { allowZero: true }))
      );
    } catch {
      return `₹${v.amount}`;
    }
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (type === 'date' && typeof v === 'string') return formatDate(v);
  if (type === 'datetime' && typeof v === 'string') return `${formatDate(v)}, ${formatTime(v)}`;
  if (type === 'percent' && typeof v === 'number') return `${v}%`;
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  return readable(String(v));
}

/** Right-aligned columns (numbers and money). */
export const isNumeric = (type: string) => ['number', 'paise', 'percent'].includes(type);
