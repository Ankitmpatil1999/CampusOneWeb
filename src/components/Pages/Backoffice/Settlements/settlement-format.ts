/**
 * Settlement labels, money and the "what you can do here" rules of the back office (prototype
 * stlPerms). The rules mirror the server's (STL-003…006); the server still decides every action.
 */
import { formatInr } from '../../../Utils/format';
import { parseAmount } from '../../../Utils/money';
import { translate } from '../../../Utils/translate';
import type { Money, Settlement, SettlementStatus } from './settlements.api';

/** Register labels (status.settlement.*) and the prototype's chip tones. */
export const STATUS_TONE: Readonly<Record<SettlementStatus, string>> = {
  PENDING: 'warn',
  APPROVAL_STAGE_1: 'info',
  APPROVED: 'ok',
  FAILED: 'bad',
};
export const statusLabel = (s: SettlementStatus) =>
  translate(`status.settlement.${s.toLowerCase()}`);

/** The operator sub-tasks (access register names), for the refusal wording. */
export const SUB_TASK: Readonly<Record<string, string>> = {
  'settle.view': 'View queue and statements',
  'settle.stage1': 'Stage-1 approval (maker)',
  'settle.final': 'Final approval (checker)',
  'settle.reject': 'Reject a settlement (checker)',
  'settle.payout': 'Record payout reference (checker)',
  'recon.upload': 'Upload external statements',
  'recon.resolve': 'Resolve mismatches and refunds',
  'recon.chargeback': 'Raise and complete chargebacks',
  'jobs.view': 'View runs and run logs',
  'plans.edit': 'Create and edit plans',
};

/** The prototype's refusal: the role, the sub-task it lacks and who can grant it. */
export function refusal(role: string, sub: string): string {
  return `Your role (${role}) doesn’t hold “${SUB_TASK[sub] ?? sub}”. Ask a Platform Administrator to grant it in Roles & tasks.`;
}

/** Paise of an API amount ("1240.50", "-12.00"); 0 when missing. */
export function paiseOf(m: Pick<Money, 'amount'> | null | undefined): number {
  if (!m) return 0;
  const neg = m.amount.startsWith('-');
  const v = parseAmount(neg ? m.amount.slice(1) : m.amount, { allowZero: true });
  return neg ? -v : v;
}

export const inr = (m: Pick<Money, 'amount'> | null | undefined) => formatInr(paiseOf(m));
export const inrPaise = (p: number) => formatInr(p);
export const sumOf = <T>(list: readonly T[], f: (x: T) => Pick<Money, 'amount'>) =>
  list.reduce((a, x) => a + paiseOf(f(x)), 0);

/** Approved, paid by the bank, and no UTR on record yet. */
export const payoutDue = (s: Settlement) => s.status === 'APPROVED' && !s.payout;

export function plural(n: number, w: string) {
  return `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : w.endsWith('ch') ? 'es' : 's'}`;
}

/** Same person? The view names the approvers (no ids): compared without case or spacing. */
export const samePerson = (a: string | null | undefined, b: string | null | undefined) =>
  !!a &&
  !!b &&
  a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

export interface Perm {
  readonly ok: boolean;
  readonly why: string;
}
export interface Perms {
  readonly stage1: Perm;
  readonly final: Perm;
  readonly reject: Perm;
  readonly payout: Perm;
}

/** The prototype's stlPerms for the signed-in operator. */
export function permsOf(
  s: Settlement,
  me: { name: string; role: string; subTasks: readonly string[] },
): Perms {
  const has = (sub: string) => me.subTasks.includes(sub);
  const need = (sub: string): Perm => ({ ok: false, why: refusal(me.role, sub) });
  const label = statusLabel(s.status);
  const approvedByMe = [s.stage1?.by, s.final?.by].some((by) => samePerson(by, me.name));
  return {
    stage1:
      s.status !== 'PENDING'
        ? { ok: false, why: `Stage 1 is only for Pending settlements — this one is ${label}.` }
        : !has('settle.stage1')
          ? need('settle.stage1')
          : { ok: true, why: 'You hold the maker task and the settlement is Pending.' },
    final:
      s.status !== 'APPROVAL_STAGE_1'
        ? {
            ok: false,
            why:
              s.status === 'PENDING'
                ? 'Final approval comes after stage 1.'
                : `The settlement is ${label} — final approval isn’t available.`,
          }
        : !has('settle.final')
          ? need('settle.final')
          : samePerson(s.stage1?.by, me.name)
            ? {
                ok: false,
                why: 'You gave stage-1 approval, so a different person must give final approval.',
              }
            : {
                ok: true,
                why: `Stage 1 was given by ${s.stage1?.by ?? 'another operator'} — you are a different person.`,
              },
    reject:
      s.status !== 'PENDING' && s.status !== 'APPROVAL_STAGE_1'
        ? { ok: false, why: `${label} settlements are final and can’t be rejected.` }
        : !has('settle.reject')
          ? need('settle.reject')
          : approvedByMe
            ? { ok: false, why: 'You approved a stage of this settlement, so you can’t reject it.' }
            : { ok: true, why: 'Pending or Stage-1 approved, and you haven’t approved any stage.' },
    payout:
      s.status !== 'APPROVED'
        ? { ok: false, why: 'A payout reference is recorded only after final approval.' }
        : s.payout
          ? { ok: false, why: `Already recorded: ${s.payout.utr}.` }
          : !has('settle.payout')
            ? need('settle.payout')
            : { ok: true, why: 'Approved and waiting for the bank’s reference.' },
  };
}

/** The four statement files (RNG-STL-066…070) with the prototype's titles and columns. */
export const STATEMENTS: Readonly<Record<string, { l: string; cols: string }>> = {
  transactions: {
    l: 'Transaction file',
    cols: 'Transaction id, merchant id, date, status, amount, type, remarks, fee, net',
  },
  merchant_summary: {
    l: 'Merchant summary',
    cols: 'Per merchant: counts and amounts by status, fee, net settlement, date, settlement id and status',
  },
  summary_report: {
    l: 'Summary report',
    cols: 'Merchant id, name, successful transactions, total, commission, net to merchant + aggregate line',
  },
  settlement_report: {
    l: 'Settlement report',
    cols: 'Transaction id, merchant id, date, status, amount, fee, net',
  },
};

/** "23:30" in IST (24-hour), as the prototype's run log shows the run times. */
export function hm24(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 330 * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** A calendar date "YYYY-MM-DD" shifted by whole days. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
/** The prototype's fmt.dlong for a calendar date: "Tuesday, 29 September 2026". */
export function longDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
