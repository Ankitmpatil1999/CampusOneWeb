/** Display helpers of "Transactions & MIS" (prototype 31_c_money §9: DP, tsCell, mono, tags). */
import type { DropdownOption } from '../../../Shared/Dropdown';
import type { AttemptStatus, MatchKind } from './recon.api';

/** The payment channels of the register (config/registers/payments.ts PAYMENT_CHANNELS). */
export const CHANNEL_LABEL: Readonly<Record<string, string>> = {
  TRANSFER: 'Transfer',
  STATIC_QR: 'Static QR',
  ALLOWANCE: 'Allowance',
  TUITION: 'Tuition',
  POS_QR: 'POS QR',
  DYNAMIC_QR: 'Dynamic QR',
  NFC: 'NFC',
  EVENT: 'Event',
  BANK_VA: 'Bank transfer to the virtual account',
  JOB: 'Scheduled processing',
  CONSOLE: 'Institution console',
  BACK_OFFICE: 'Back office',
  PARTNER: 'Partner',
};
export const channelLabel = (c: string) => CHANNEL_LABEL[c] ?? c;

/** The mode filter: the channels a campus payment or transfer comes from. */
export const MODE_OPTIONS: readonly DropdownOption[] = [
  { v: '', l: 'All modes' },
  ...['ALLOWANCE', 'DYNAMIC_QR', 'EVENT', 'NFC', 'POS_QR', 'STATIC_QR', 'TRANSFER', 'TUITION'].map(
    (c) => ({ v: c, l: CHANNEL_LABEL[c]! }),
  ),
];

export const STATUS_OPTIONS: readonly DropdownOption[] = [
  { v: '', l: 'Any status' },
  { v: 'SUCCESS', l: 'Success' },
  { v: 'FAILURE', l: 'Failure' },
  { v: 'PENDING', l: 'Pending' },
];

/** The prototype's STATUS tones of a payment. */
export const ATTEMPT_TONE: Readonly<Record<AttemptStatus, string>> = {
  SUCCESS: 'ok',
  FAILURE: 'bad',
  PENDING: 'warn',
};
export const attemptTone = (label: string) =>
  ({ Success: 'ok', Failure: 'bad', Pending: 'warn' })[label] ?? 'neutral';

/** Payer ↔ merchant matching (REC-014). */
export const MATCH: Readonly<
  Record<
    MatchKind,
    { readonly l: string; readonly tone: string; readonly color: string; readonly sub: string }
  >
> = {
  MATCHED: {
    l: 'Matched',
    tone: 'ok',
    color: 'var(--ok)',
    sub: 'The payer was debited and the merchant credited the same amount',
  },
  UNMATCHED: {
    l: 'Unmatched',
    tone: 'warn',
    color: 'var(--warn)',
    sub: 'No merchant credit for the payment (failed or still pending)',
  },
  MISMATCHED: {
    l: 'Mismatched',
    tone: 'bad',
    color: 'var(--bad)',
    sub: 'The amounts or the status differ between the two sides',
  },
};

/** Ledger accounts that hold part of the pool besides the wallets (REC-016 otherAccounts). */
export const ACCOUNT_LABEL: Readonly<
  Record<string, { readonly l: string; readonly basis: string }>
> = {
  PLATFORM_FEE: {
    l: 'Platform fees not yet paid out',
    basis: 'Fees of paid-out settlements, held for CampusOne',
  },
  HELD_SUSPENSE: {
    l: 'Bank credits on hold',
    basis: 'Credits waiting to be matched to a member',
  },
  REFUND_CLEARING: { l: 'Refunds in clearing', basis: 'Refunds not yet returned' },
  COUPON_REIMBURSEMENT: {
    l: 'Coupon reimbursements',
    basis: 'Coupon redemptions owed to merchants',
  },
  ADJUSTMENT: { l: 'Adjustments', basis: 'Approved correcting entries' },
  ALLOWANCE_FUNDING: { l: 'Allowance funding', basis: 'Allowances funded but not yet spent' },
};

/** Wallet kinds (REC-017) as the prototype names them ("Campus wallet"). */
export const walletKind = (k: string) =>
  `${k.charAt(0)}${k.slice(1).toLowerCase().replace(/_/g, ' ')} wallet`;

/** fmt.wallet: "4102 01277" for nine digits, else groups of four. */
export const walletNo = (n: string) =>
  n.length === 9 ? `${n.slice(0, 4)} ${n.slice(4)}` : n.replace(/(.{4})/g, '$1 ').trim();

/** Quotes a CSV value when it holds a comma, a quote or a line break (OI-STL-08). */
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Rows → CSV text (with a BOM so spreadsheet programs read ₹ and Indian names correctly). */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return String.fromCharCode(0xfeff) + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** Hands a CSV built in the browser to the user as a download. */
export function saveCsv(name: string, rows: readonly (readonly (string | number)[])[]) {
  const href = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
