/**
 * Display helpers of the grievance screens (prototype 31_c_money §11: PRI, priChip, the ticket
 * status tones, tsCell; 40_o_backoffice o.support): register labels with the prototype's tones,
 * the RC-20 moves the update form offers, and the prototype's date formats.
 */
import { formatDate, formatTime } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import type { CallDirection, TicketChannel, TicketKind, TicketStatus } from './grievances.api';

/** The register labels (status.ticket.*) with the prototype's tones (Open warn, Escalated bad …). */
export const TICKET_STATUS: Readonly<
  Record<TicketStatus, { readonly l: () => string; readonly tone: string }>
> = {
  OPEN: { l: () => translate('status.ticket.open'), tone: 'warn' },
  ESCALATED_VENDOR: { l: () => translate('status.ticket.escalated_vendor'), tone: 'bad' },
  ESCALATED_INTERNAL: { l: () => translate('status.ticket.escalated_internal'), tone: 'bad' },
  RESOLVED: { l: () => translate('status.ticket.resolved'), tone: 'ok' },
  CLOSED: { l: () => translate('status.ticket.closed'), tone: 'neutral' },
};
export const statusOf = (s: TicketStatus) => TICKET_STATUS[s] ?? { l: () => s, tone: 'neutral' };

/** RC-20: the moves from each status (config/registers/status/grievances.ts). Closed is final. */
export const TICKET_MOVES: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  OPEN: ['ESCALATED_VENDOR', 'ESCALATED_INTERNAL', 'RESOLVED', 'CLOSED'],
  ESCALATED_VENDOR: ['ESCALATED_INTERNAL', 'RESOLVED', 'CLOSED'],
  ESCALATED_INTERNAL: ['ESCALATED_VENDOR', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};
/** Resolved and Closed need a reason or the resolution text. */
export const DONE: readonly TicketStatus[] = ['RESOLVED', 'CLOSED'];

/** The prototype's priority chip (priChip): Priority 1 bad, 2 warn, 3 neutral; no dot. */
export const priorityTone = (p: number) => (p === 1 ? 'bad' : p === 2 ? 'warn' : 'neutral');
export const PRIORITIES: readonly number[] = [1, 2, 3];

export const KIND_LABEL: Readonly<Record<TicketKind, string>> = {
  TRANSACTION: 'Transaction',
  FEEDBACK: 'Feedback',
  FRAUD: 'Fraud report',
};

export const CHANNEL_LABEL: Readonly<Record<TicketChannel, string>> = {
  APP: 'App',
  WEB: 'Web',
  PHONE: 'Phone',
};

/** The console's call directions (prototype cm.call.new: Incoming / Outgoing). */
export const DIRECTION_LABEL: Readonly<Record<CallDirection, string>> = {
  INBOUND: 'Incoming',
  OUTBOUND: 'Outgoing',
};

/** Ledger movement types a ticket can be raised on, as the prototype names them. */
const TXN_TYPE: Readonly<Record<string, string>> = {
  PAYMENT: 'Payment',
  TRANSFER: 'Transfer',
  TUITION: 'Tuition',
  EVENT: 'Event',
  ALLOWANCE_PAYMENT: 'Allowance payment',
  ALLOWANCE_CREDIT: 'Allowance credit',
  BANK_CREDIT: 'Bank credit',
  REFUND: 'Refund',
  REVERSAL: 'Reversal',
  ADJUSTMENT: 'Adjustment',
  COUPON: 'Coupon',
};
export const txnType = (t: string | null | undefined) =>
  t ? (TXN_TYPE[t] ?? `${t.charAt(0)}${t.slice(1).toLowerCase().replace(/_/g, ' ')}`) : '—';

/** fmt.dt: "27 Sep 2026, 12:55 PM" (IST). */
export const dt = (v: string | null | undefined) =>
  v ? `${formatDate(v)}, ${formatTime(v)}` : '—';

/** "1 ticket", "15 tickets" (fmt.plural). */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString('en-IN')} ${noun}${n === 1 ? '' : 's'}`;
}

/** Ticket numbers of the three kinds (TKT-, FBK-, FRD-) and a ten-digit mobile. */
export const TICKET_NO = /^(TKT|FBK|FRD)-\d{1,10}$/i;

/** Rupees typed by a person → paise, or null (two decimals at most, no sign). */
export function rupeesToPaise(v: string): number | null {
  const s = v.trim().replace(/,/g, '');
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(s)) return null;
  const [r = '0', f = ''] = s.split('.');
  return Number(r) * 100 + Number(`${f}00`.slice(0, 2));
}
