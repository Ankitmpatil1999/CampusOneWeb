/**
 * Display helpers of the accounting screen (prototype 31_c_money §10: the voucher status tones, the
 * mapping categories, tsCell, fmt.plural).
 */
import { translate } from '../../../Utils/translate';
import type { AccountingEvent, VoucherStatus } from './vouchers.api';

/** The register labels (status.voucher.*) with the prototype's tones (Posted ok, Failed bad). */
export const VOUCHER_STATUS: Readonly<
  Record<VoucherStatus, { readonly l: () => string; readonly tone: string }>
> = {
  PENDING: { l: () => translate('status.voucher.pending'), tone: 'warn' },
  TRANSFERRED: { l: () => translate('status.voucher.transferred'), tone: 'ok' },
  FAILED: { l: () => translate('status.voucher.failed'), tone: 'bad' },
};

/** The mapping table's category column (prototype cmAcctMap cat). */
export const EVENT_CATEGORY: Readonly<Record<AccountingEvent, string>> = {
  TUITION: 'Fees',
  EVENT: 'Events',
  ALLOWANCE_CREDIT: 'Allowance',
  REFUND: 'Refunds',
};

/** A ledger or company name as the server takes it (ACC.LEDGER / ACC.COMPANY). */
export const LEDGER_NAME = /^[\p{L}\p{N} .,&()'/-]{2,100}$/u;

/** "1 voucher", "180 vouchers" (fmt.plural). */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString('en-IN')} ${noun}${n === 1 ? '' : 's'}`;
}
