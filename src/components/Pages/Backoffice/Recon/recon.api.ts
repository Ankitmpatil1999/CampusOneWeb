/**
 * Back-office reconciliation (REC-001…012, REC-018/019): statement uploads and their layouts,
 * mismatches and their resolution, refunds, chargebacks, the MIS, pool balances and the
 * balance-against-ledger check.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { Money } from '../Settlements/settlements.api';

export type StatementKind = 'VA_CREDITS' | 'PAYOUTS' | 'GATEWAY';
export type MismatchKind = 'MISSING_ON_PLATFORM' | 'MISSING_IN_STATEMENT' | 'AMOUNT' | 'STATUS';
export type Resolution = 'EXPLAINED' | 'REFUND' | 'CHARGEBACK' | 'ADJUSTED';
export type RefundStatus = 'REQUESTED' | 'PROCESSED' | 'REJECTED';
export type ChargebackStatus = 'RAISED' | 'ACCEPTED' | 'DISPUTED' | 'COMPLETED';

/** Who and when (names; ids are not shown). */
export interface Who {
  readonly by: string | null;
  readonly at: string | null;
}

/** REC-001/002: one uploaded statement. */
export interface Statement {
  readonly id: string;
  readonly kind: StatementKind;
  readonly fileName: string;
  readonly rows: number;
  readonly matched: number;
  readonly mismatchedRows: number;
  readonly mismatches: number;
  readonly openMismatches: number;
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  readonly uploadedBy: string | null;
  readonly uploadedAt: string | null;
}

/** The statement layouts (an example contract until the banks and the gateway are chosen). */
export type Layouts = Readonly<
  Record<
    StatementKind,
    { readonly columns: readonly string[]; readonly required: readonly string[] }
  >
>;

/** REC-003: one difference between a statement and the platform. */
export interface Mismatch {
  readonly id: string;
  readonly kind: MismatchKind;
  readonly status: 'OPEN' | 'RESOLVED';
  readonly statement: {
    readonly id: string;
    readonly kind: StatementKind;
    readonly fileName: string;
    readonly rowNo: number | null;
    readonly key: string | null;
    readonly date: string | null;
    readonly status: string | null;
    readonly amount: Money | null;
  };
  readonly platform: {
    readonly type: string;
    readonly reference: string | null;
    readonly amount: Money | null;
  } | null;
  readonly institution: { readonly id: string; readonly name: string | null } | null;
  readonly resolution: Resolution | null;
  readonly remarks: string | null;
  readonly refundId: string | null;
  readonly chargebackId: string | null;
  readonly resolved: Who | null;
  readonly createdAt: string | null;
  readonly version: number;
}

export interface Party {
  readonly walletNo: string;
  readonly name: string;
}

/** REC-008: a refund (Requested → Processed / Rejected). */
export interface Refund {
  readonly id: string;
  readonly institution: { readonly id: string; readonly name: string };
  readonly originalReference: string;
  readonly from: Party;
  readonly to: Party;
  readonly amount: Money;
  readonly status: RefundStatus;
  readonly source: 'MISMATCH' | 'GRIEVANCE' | 'MANUAL';
  readonly reason: string;
  readonly requested: Who;
  readonly decided: (Who & { readonly remarks: string | null }) | null;
  readonly refundReference: string | null;
  readonly version: number;
}

/** REC-005: a chargeback (Raised → Accepted / Disputed → Completed). */
export interface Chargeback {
  readonly id: string;
  readonly institution: { readonly id: string; readonly name: string };
  readonly originalReference: string;
  readonly wallet: Party;
  readonly amount: Money;
  readonly reasonCode: string;
  readonly status: ChargebackStatus;
  readonly outcome: 'REVERSED' | 'UPHELD' | null;
  readonly remarks: string | null;
  readonly raised: Who;
  readonly decided: Who | null;
  readonly completed: Who | null;
  readonly reversalReference: string | null;
  readonly version: number;
}

export interface SignedMoney extends Money {
  readonly negative: boolean;
}

/** REC-011: an institution's pool against what it holds for wallets and the platform. */
export interface Pool {
  readonly institution: { readonly id: string; readonly name: string };
  readonly received: SignedMoney;
  readonly paidOut: SignedMoney;
  readonly chargebacks: SignedMoney;
  /** What the pool account should hold per the ledger. */
  readonly poolExpected: SignedMoney;
  /** Stored wallet balances (the day's closing for a date; null when no roll-over that day). */
  readonly wallets: SignedMoney | null;
  readonly walletsPerLedger: SignedMoney;
  readonly otherAccounts: readonly { kind: string; balance: SignedMoney }[];
  readonly heldFor: SignedMoney;
  readonly difference: SignedMoney;
  /** The bank's own balance: needs its balance feed. */
  readonly bankReported: SignedMoney | null;
}

/** REC-012: every wallet's stored balance against its ledger. */
export interface BalanceCheck {
  readonly checkedAt: string;
  readonly checked: number;
  readonly differences: readonly {
    readonly walletId: string;
    readonly walletNo: string;
    readonly kind: string;
    readonly institution: { readonly id: string; readonly name: string | null } | null;
    readonly stored: Money;
    readonly ledger: Money;
    readonly ledgerNegative: boolean;
    readonly difference: Money;
    readonly differenceSign: number;
    readonly entries: number;
  }[];
}

interface CountAmount {
  readonly count: number;
  readonly amount: Money;
}

/** REC-010: one institution's figures for the range. */
export interface MisRow {
  readonly institution: { readonly id: string; readonly name: string };
  readonly transactions: {
    readonly success: CountAmount;
    readonly failure: CountAmount;
    readonly pending: CountAmount;
  };
  readonly merchantCollections: CountAmount;
  readonly bankCredits: CountAmount;
  readonly settlements: {
    readonly count: number;
    readonly gross: Money;
    readonly fee: Money;
    readonly adjustments: Money;
    readonly net: Money;
    readonly paidOut: Money;
  };
  readonly refunds: CountAmount;
  readonly chargebacks: CountAmount;
}

interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

const MAX_PAGES = 20;
const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });
const ifMatch = (version: number) => ({ 'If-Match': `"v${version}"`, ...once() });
const amountOf = (a: string | undefined) =>
  a ? { amount: { amount: a, currency: 'INR' as const } } : {};

@Injectable({ providedIn: 'root' })
export class ReconApi {
  private readonly http = inject(HttpClient);

  /** Every page of a cursor list (newest first, 50 a page; up to MAX_PAGES). */
  private async all<T>(url: string, query: Record<string, string | undefined> = {}) {
    const out: T[] = [];
    let cursor: string | undefined;
    for (let n = 0; n < MAX_PAGES; n++) {
      let params = new HttpParams();
      for (const [k, v] of Object.entries(query)) if (v) params = params.set(k, v);
      if (cursor) params = params.set('cursor', cursor);
      const p = await firstValueFrom(this.http.get<Page<T>>(url, { params }));
      out.push(...p.items);
      if (!p.nextCursor) break;
      cursor = p.nextCursor;
    }
    return out;
  }

  /** REC-002: the uploads (every page) and the layouts. */
  async uploads() {
    const first = await firstValueFrom(
      this.http.get<Page<Statement> & { layouts: Layouts }>('/api/v1/ops/recon/statement-uploads'),
    );
    const items = [...first.items];
    let cursor = first.nextCursor;
    for (let n = 1; cursor && n < MAX_PAGES; n++) {
      const p = await firstValueFrom(
        this.http.get<Page<Statement>>('/api/v1/ops/recon/statement-uploads', {
          params: new HttpParams().set('cursor', cursor),
        }),
      );
      items.push(...p.items);
      cursor = p.nextCursor;
    }
    return { items, layouts: first.layouts };
  }

  /** REC-001: the file is taken whole or not at all. */
  upload(kind: StatementKind, file: File) {
    const form = new FormData();
    form.set('type', kind);
    form.set('file', file, file.name);
    return firstValueFrom(
      this.http.post<Statement>('/api/v1/ops/recon/statement-uploads', form, { headers: once() }),
    );
  }

  /** REC-003. */
  mismatches() {
    return this.all<Mismatch>('/api/v1/ops/recon/mismatches');
  }

  /** REC-004 (If-Match): explained, adjusted, or a refund or chargeback request. */
  resolve(
    m: { id: string; version: number },
    body: {
      action: Resolution;
      remarks: string;
      transactionRef?: string;
      amount?: string;
      reasonCode?: string;
    },
  ) {
    const { amount, ...rest } = body;
    return firstValueFrom(
      this.http.post<Mismatch>(
        `/api/v1/ops/recon/mismatches/${m.id}/resolution`,
        { ...rest, ...amountOf(amount) },
        { headers: ifMatch(m.version) },
      ),
    );
  }

  /** REC-008. */
  refunds() {
    return this.all<Refund>('/api/v1/ops/recon/refunds');
  }

  /** REC-018: a refund of a payment or transfer between two wallets. */
  requestRefund(body: { transactionRef: string; amount?: string; reason: string }) {
    const { amount, ...rest } = body;
    return firstValueFrom(
      this.http.post<Refund>(
        '/api/v1/ops/recon/refunds',
        { ...rest, ...amountOf(amount) },
        { headers: once() },
      ),
    );
  }

  /** REC-009 (If-Match): processed or rejected by an officer other than the requester. */
  decideRefund(
    r: { id: string; version: number },
    decision: 'PROCESS' | 'REJECT',
    remarks: string,
  ) {
    return firstValueFrom(
      this.http.post<Refund>(
        `/api/v1/ops/recon/refunds/${r.id}/processing`,
        { decision, remarks },
        { headers: ifMatch(r.version) },
      ),
    );
  }

  /** REC-005. */
  chargebacks() {
    return this.all<Chargeback>('/api/v1/ops/recon/chargebacks');
  }

  /** REC-006: once per movement that credited a wallet. */
  raiseChargeback(body: { transactionRef: string; reasonCode: string; amount?: string }) {
    const { amount, ...rest } = body;
    return firstValueFrom(
      this.http.post<Chargeback>(
        '/api/v1/ops/recon/chargebacks',
        { ...rest, ...amountOf(amount) },
        { headers: once() },
      ),
    );
  }

  /** REC-019 (If-Match). */
  decideChargeback(
    c: { id: string; version: number },
    decision: 'ACCEPT' | 'DISPUTE',
    remarks: string,
  ) {
    return firstValueFrom(
      this.http.post<Chargeback>(
        `/api/v1/ops/recon/chargebacks/${c.id}/decision`,
        { decision, remarks },
        { headers: ifMatch(c.version) },
      ),
    );
  }

  /** REC-007 (If-Match): reversed through the ledger, or upheld. */
  completeChargeback(
    c: { id: string; version: number },
    outcome: 'REVERSED' | 'UPHELD',
    remarks: string,
  ) {
    return firstValueFrom(
      this.http.post<Chargeback>(
        `/api/v1/ops/recon/chargebacks/${c.id}/completion`,
        { outcome, remarks },
        { headers: ifMatch(c.version) },
      ),
    );
  }

  /** REC-010: by institution for a range (the month so far by default). */
  mis(from?: string, to?: string) {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return firstValueFrom(
      this.http.get<{ from: string; to: string; items: readonly MisRow[] }>(
        '/api/v1/ops/recon/mis',
        { params },
      ),
    );
  }

  /** REC-011: now, or a date's closing balances; one institution or all. */
  pool(o: { date?: string; institutionId?: string } = {}) {
    let params = new HttpParams();
    if (o.date) params = params.set('date', o.date);
    if (o.institutionId) params = params.set('institutionId', o.institutionId);
    return firstValueFrom(
      this.http.get<{ asOf: string; bankFeed: boolean; items: readonly Pool[] }>(
        '/api/v1/ops/recon/pool-balances',
        { params },
      ),
    );
  }

  /** REC-012: differences are reported, never corrected. */
  balanceCheck(institutionId?: string) {
    let params = new HttpParams();
    if (institutionId) params = params.set('institutionId', institutionId);
    return firstValueFrom(
      this.http.get<BalanceCheck>('/api/v1/ops/recon/balance-vs-ledger', { params }),
    );
  }
}
