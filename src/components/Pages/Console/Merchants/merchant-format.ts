/** Display helpers of the merchants screen (prototype 31_c_money: QR_KINDS, IFSC_BANKS, fmt.mask). */
import { amountPaise, type MoneyLike } from '../../../Shared/Amount';
import { groupIndian } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import type { MerchantStatus, QrKind } from './merchants.api';

/** Banks by IFSC prefix, for the bank name shown from the code (the server keeps the same list). */
export const IFSC_BANKS: Readonly<Record<string, string>> = {
  SBIN: 'State Bank of India',
  CNRB: 'Canara Bank',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  UTIB: 'Axis Bank',
  KARB: 'Karnataka Bank',
  BARB: 'Bank of Baroda',
  UBIN: 'Union Bank of India',
  KKBK: 'Kotak Mahindra Bank',
};

/** The three static codes in the prototype's order (QR_KINDS). */
export const QR_KINDS: readonly {
  readonly kind: QrKind;
  readonly label: string;
  readonly icon: IconName;
  readonly sub: string;
}[] = [
  {
    kind: 'PAYMENT',
    label: 'Payment',
    icon: 'qr',
    sub: 'Wallet payments (scan and pay, up to ₹10,000)',
  },
  { kind: 'ALLOWANCE', label: 'Allowance', icon: 'gift', sub: 'Allowance payments only' },
  { kind: 'COUPON', label: 'Coupon', icon: 'ticket', sub: 'Coupon redemption (CR-15 types)' },
];

export const STATUS: Readonly<Record<MerchantStatus, { l: string; tone: string }>> = {
  ACTIVE: { l: 'Active', tone: 'ok' },
  INACTIVE: { l: 'Inactive', tone: 'neutral' },
  SUSPENDED: { l: 'Suspended', tone: 'bad' },
};

/** The accepts tags (acceptsTags): wallet, allowance, coupon. */
export const ACCEPTS: readonly {
  readonly k: 'wallet' | 'allowance' | 'coupon';
  readonly l: string;
  readonly icon: IconName;
}[] = [
  { k: 'wallet', l: 'Wallet', icon: 'wallet' },
  { k: 'allowance', l: 'Allowance', icon: 'gift' },
  { k: 'coupon', l: 'Coupon', icon: 'ticket' },
];

/** The API's masked account ("XXXXXXXX1234") the prototype's way (fmt.mask): "••••••1234". */
export function maskedAccount(masked: string | null): string {
  if (!masked) return '';
  const tail = masked.slice(-4);
  return masked.length <= 4 ? masked : '•'.repeat(Math.min(6, masked.length - 4)) + tail;
}

/** Whole rupees for a key figure (fmt.inr0): "₹8,664". Integer paise only, never a float sum. */
export function inrWhole(m: MoneyLike): string {
  const p = amountPaise(m);
  const rupees = Math.round(Math.abs(p) / 100);
  return `${p < 0 ? '-' : ''}₹${groupIndian(String(rupees))}`;
}

export function fileSize(b: number): string {
  return b >= 1048576
    ? `${(b / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
}

/** "1 payment", "13 payments" (fmt.plural). */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString('en-IN')} ${noun}${n === 1 ? '' : 's'}`;
}
