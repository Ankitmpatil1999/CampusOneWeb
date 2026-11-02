/** Display helpers of the fee records screen (prototype 5. FEE RECORDS: frStatus, STATUS tones). */
import type { ApiFieldError } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { FeeRecord, FinancingStatus, RecordStatus } from './fee-records.api';

/** The record statuses (status register: fee_record) with the prototype's tones. */
export const RECORD_STATUS: Readonly<Record<RecordStatus, { l: () => string; tone: string }>> = {
  DUE: { l: () => translate('status.fee_record.due'), tone: 'warn' },
  PARTIALLY_PAID: { l: () => translate('status.fee_record.partially_paid'), tone: 'info' },
  PAID: { l: () => translate('status.fee_record.paid'), tone: 'ok' },
  OVERDUE: { l: () => translate('status.fee_record.overdue'), tone: 'bad' },
  CANCELLED: { l: () => translate('status.fee_record.cancelled'), tone: 'neutral' },
};

/** The financing registration statuses (status register: fee_financing). */
export const FINANCING_STATUS: Readonly<
  Record<FinancingStatus, { l: () => string; tone: string }>
> = {
  PENDING: { l: () => translate('status.fee_financing.pending'), tone: 'warn' },
  SUCCESS: { l: () => translate('status.fee_financing.success'), tone: 'ok' },
  FAILED: { l: () => translate('status.fee_financing.failed'), tone: 'bad' },
};

/** Processing: from the wallet, or by the financing partner (never from the wallet, BR-35). */
export const processing = (r: Pick<FeeRecord, 'financed'>) =>
  r.financed ? { l: 'Financed', tone: 'violet' } : { l: 'Processed', tone: 'ok' };

/** Unpaid records are the ones that can still be collected or changed. */
export const isOpen = (r: Pick<FeeRecord, 'status'>) =>
  r.status === 'DUE' || r.status === 'OVERDUE' || r.status === 'PARTIALLY_PAID';

/** Why a collection is waiting: the engine's refusal in a few words. */
export function waitingWhy(code: string | null): string {
  if (!code) return 'Waiting for balance';
  if (code === 'PAY.INSUFFICIENT_BALANCE') return 'Balance short';
  const t = translate(code);
  return /\{\w+\}/.test(t) ? 'Not collected' : t;
}

/** "Collected" / "Settled" (a collection paid out to the fee account). */
export const collectionStatus = (s: 'COLLECTED' | 'SETTLED') =>
  s === 'SETTLED' ? { l: 'Settled', tone: 'brand' } : { l: 'Collected', tone: 'ok' };

/** How a collection was made. */
export const collectionSource = (s: 'CONSOLE' | 'JOB' | 'MEMBER') =>
  s === 'CONSOLE'
    ? 'Collected from the console'
    : s === 'JOB'
      ? 'Auto-debit job'
      : 'Paid in the app';

/** "Grade 6 A" → "Grade 6" with the class list; the last word dropped otherwise. */
export function classOf(classSection: string, classes: readonly string[]): string {
  const hit = [...classes]
    .sort((a, b) => b.length - a.length)
    .find((c) => classSection === c || classSection.startsWith(`${c} `));
  if (hit) return hit;
  const i = classSection.lastIndexOf(' ');
  return i > 0 ? classSection.slice(0, i) : classSection;
}

/** "3 × ₹6,000.00" or "2 × ₹18,533.00 + ₹18,534.00" (prototype splitTxt). */
export function splitText(parts: readonly string[]): string {
  if (!parts.length) return '';
  const last = parts[parts.length - 1]!;
  const head = parts.slice(0, -1);
  if (parts.every((p) => p === parts[0])) return `${parts.length} × ${parts[0]}`;
  return head.length && head.every((p) => p === head[0])
    ? `${head.length} × ${head[0]} + ${last}`
    : parts.join(' + ');
}

/**
 * A field error from the server as the form shows it. A due date outside today … the year's end
 * comes back as VALIDATION.DATE, whose register text speaks of a date of birth; it is said plainly.
 */
export function fieldMessage(e: ApiFieldError): string {
  if (e.field === 'dueDate' && e.code === 'VALIDATION.DATE') {
    return 'Choose a due date from today to the end of the academic year';
  }
  return e.message;
}

/** "YYYY-MM-DD" plus n days. */
export function addDays(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The short form of an id shown in mono (the full id is in the title): its last eight characters —
 * the ids are time-ordered, so their first characters repeat.
 */
export const shortRef = (id: string) => id.replace(/-/g, '').slice(-8).toUpperCase();
