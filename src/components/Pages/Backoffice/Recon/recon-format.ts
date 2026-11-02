/** Reconciliation labels and helpers (prototype o.recon; register status.* labels). */
import type { IconName } from '../../../Utils/icons';
import { translate } from '../../../Utils/translate';
import { inr, paiseOf } from '../Settlements/settlement-format';
import type {
  ChargebackStatus,
  Layouts,
  Mismatch,
  MismatchKind,
  RefundStatus,
  Resolution,
  SignedMoney,
  StatementKind,
} from './recon.api';

/** The three statements the platform takes (example layouts until the banks are chosen). */
export const STATEMENT: Readonly<
  Record<StatementKind, { l: string; icon: IconName; key: string }>
> = {
  VA_CREDITS: {
    l: 'Virtual-account credit statement',
    icon: 'bank',
    key: 'UTR and bank transaction id',
  },
  PAYOUTS: { l: 'Payout bank statement', icon: 'send', key: 'UTR' },
  GATEWAY: { l: 'Gateway transaction statement', icon: 'receipt', key: 'Payment ID' },
};
export const STATEMENT_KINDS: readonly StatementKind[] = ['VA_CREDITS', 'PAYOUTS', 'GATEWAY'];

/** The layouts the server reports (REC-002); these are only the fallback until it answers. */
export const DEFAULT_LAYOUTS: Layouts = {
  VA_CREDITS: {
    columns: ['Date', 'UTR', 'Bank Txn ID', 'VA Number', 'Amount', 'Mode', 'Sender'],
    required: ['Date', 'UTR', 'Bank Txn ID', 'VA Number', 'Amount'],
  },
  PAYOUTS: {
    columns: ['Date', 'UTR', 'Amount', 'Status', 'Beneficiary'],
    required: ['Date', 'UTR', 'Amount', 'Status'],
  },
  GATEWAY: {
    columns: ['Date', 'Payment ID', 'Order ID', 'Amount', 'Status'],
    required: ['Date', 'Payment ID', 'Amount', 'Status'],
  },
};

export const MISMATCH_KIND: Readonly<Record<MismatchKind, { l: string; tone: string }>> = {
  AMOUNT: { l: 'Amount difference', tone: 'warn' },
  STATUS: { l: 'Status difference', tone: 'info' },
  MISSING_IN_STATEMENT: { l: 'Missing in statement', tone: 'violet' },
  MISSING_ON_PLATFORM: { l: 'Missing on platform', tone: 'violet' },
};
export const MISMATCH_KINDS: readonly MismatchKind[] = [
  'AMOUNT',
  'STATUS',
  'MISSING_IN_STATEMENT',
  'MISSING_ON_PLATFORM',
];

export const RESOLUTION: Readonly<Record<Resolution, string>> = {
  EXPLAINED: 'Explained',
  ADJUSTED: 'Adjusted',
  REFUND: 'Refund requested',
  CHARGEBACK: 'Chargeback raised',
};

/** The platform record a statement row is matched to. */
export const PLATFORM_TYPE: Readonly<Record<string, string>> = {
  bank_credit: 'Bank credit',
  settlement: 'Settlement payout',
  admission_payment: 'Admission payment',
};

export const REFUND_TONE: Readonly<Record<RefundStatus, string>> = {
  REQUESTED: 'warn',
  PROCESSED: 'ok',
  REJECTED: 'bad',
};
export const CHARGEBACK_TONE: Readonly<Record<ChargebackStatus, string>> = {
  RAISED: 'warn',
  ACCEPTED: 'info',
  DISPUTED: 'violet',
  COMPLETED: 'ok',
};
export const mismatchStatus = (s: 'OPEN' | 'RESOLVED') =>
  translate(`status.reconMismatch.${s.toLowerCase()}`);
export const refundStatus = (s: RefundStatus) => translate(`status.refund.${s.toLowerCase()}`);
export const chargebackStatus = (s: ChargebackStatus) =>
  translate(`status.chargeback.${s.toLowerCase()}`);

export const REFUND_SOURCE: Readonly<Record<string, string>> = {
  MISMATCH: 'From a mismatch',
  GRIEVANCE: 'From a grievance',
  MANUAL: 'Requested here',
};

/** The prototype's reason codes (example values; any 1–20 letters, digits or dashes is taken). */
export const REASON_CODES: readonly { v: string; l: string }[] = [
  { v: '4834', l: 'Duplicate processing' },
  { v: '4837', l: 'Fraudulent transaction' },
  { v: '4855', l: 'Service not rendered' },
  { v: '4831', l: 'Incorrect amount' },
];
export const reasonLabel = (code: string) => REASON_CODES.find((r) => r.v === code)?.l ?? null;

/** Statement minus platform, in paise (null when either side is missing). */
export function difference(m: Mismatch): number | null {
  if (!m.platform?.amount || !m.statement.amount) return null;
  return paiseOf(m.statement.amount) - paiseOf(m.platform.amount);
}

/** A signed amount: "−₹1,240.00" when negative. */
export function signed(m: SignedMoney | null | undefined): string {
  if (!m) return '—';
  return m.negative && paiseOf(m) ? `−${inr(m)}` : inr(m);
}
export const signedPaise = (m: SignedMoney | null | undefined) =>
  m ? (m.negative ? -paiseOf(m) : paiseOf(m)) : 0;

/** File size as the prototype shows it (RP.fmtSize). */
export function fileSize(b: number): string {
  return b >= 1_048_576
    ? `${(b / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;
}

/** The header row of a CSV file: its cells, unquoted and trimmed. */
export function csvHeader(text: string): string[] {
  const line = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** The mandatory columns a header lacks (compared without case, as the server does). */
export function missingColumns(header: readonly string[], required: readonly string[]): string[] {
  const have = new Set(header.map((h) => h.toLowerCase()));
  return required.filter((c) => !have.has(c.toLowerCase()));
}
