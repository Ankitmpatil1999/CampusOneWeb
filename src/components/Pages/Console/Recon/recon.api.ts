/**
 * Console "Transactions & MIS" API (REC-013…017): the institution's transactions with an export,
 * the payer ↔ merchant matching, a merchant's statement, the pool balance and the ledger check.
 * Everything here reads; nothing changes a balance.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import type { Money } from '../Settlements/settlements.api';

export type AttemptStatus = 'SUCCESS' | 'FAILURE' | 'PENDING';

/** REC-013: one payment or transfer. */
export interface Txn {
  readonly id: string;
  readonly at: string | null;
  readonly description: string;
  readonly payer: string;
  readonly payee: string;
  readonly reference: string;
  readonly amount: Money;
  readonly status: AttemptStatus;
  readonly statusLabel: string;
  readonly channel: string;
  readonly remarks: string | null;
}

export interface TxnPage {
  readonly from: string;
  readonly to: string;
  readonly tiles: {
    readonly total: number;
    readonly success: { readonly count: number; readonly share: number };
    readonly failure: { readonly count: number; readonly share: number };
    readonly pending: { readonly count: number; readonly share: number };
  };
  readonly items: readonly Txn[];
  readonly nextCursor: string | null;
}

export interface TxnQuery {
  readonly from?: string;
  readonly to?: string;
  readonly status?: AttemptStatus;
  readonly channel?: string;
  readonly q?: string;
  readonly cursor?: string;
}

export type MatchKind = 'MATCHED' | 'UNMATCHED' | 'MISMATCHED';

/** REC-014: a payment with its payer and merchant sides. */
export interface MatchRow {
  readonly reference: string;
  readonly at: string | null;
  readonly match: MatchKind;
  readonly payer: { readonly name: string; readonly amount: Money; readonly status: string };
  readonly merchant: {
    readonly name: string;
    readonly amount: Money;
    readonly status: string;
  } | null;
  readonly settled: boolean;
}

export interface MatchPage {
  readonly from: string;
  readonly to: string;
  readonly counts: {
    readonly matched: number;
    readonly unmatched: number;
    readonly mismatched: number;
  };
  readonly items: readonly MatchRow[];
  readonly nextCursor: string | null;
}

export interface MatchQuery {
  readonly from?: string;
  readonly to?: string;
  readonly status?: AttemptStatus;
  readonly view?: 'matched' | 'unmatched' | 'mismatched';
  readonly cursor?: string;
}

/** REC-015: a ledger movement of the merchant's wallet with its settlement line. */
export interface StatementLine {
  readonly reference: string;
  readonly at: string | null;
  readonly type: string;
  readonly typeLabel: string;
  readonly direction: 'CREDIT' | 'DEBIT';
  readonly amount: Money;
  readonly balanceAfter: Money | null;
  readonly settlement: {
    readonly settlementNo: string;
    readonly status: 'PENDING' | 'APPROVAL_STAGE_1' | 'APPROVED' | 'FAILED';
    readonly paidOut: boolean;
    readonly fee: Money;
    readonly net: Money;
  } | null;
  readonly remarks: string | null;
}

export interface MerchantStatement {
  readonly merchant: { readonly id: string; readonly name: string; readonly uniqueId: string };
  readonly from: string;
  readonly to: string;
  readonly totals: {
    readonly collections: Money;
    readonly fees: Money;
    readonly adjustments: Money;
    readonly paidOut: Money;
  };
  readonly items: readonly StatementLine[];
  readonly nextCursor: string | null;
}

/** Money with its sign (pool balances can be negative). */
export interface SignedMoney extends Money {
  readonly negative: boolean;
}

/** REC-016. */
export interface PoolBalance {
  readonly asOf: string;
  readonly bankFeed: boolean;
  readonly institution: { readonly id: string; readonly name: string };
  readonly received: SignedMoney;
  readonly paidOut: SignedMoney;
  readonly chargebacks: SignedMoney;
  /** What the pool account should hold per the ledger. */
  readonly poolExpected: SignedMoney;
  /** Stored wallet balances (the day's closing for a date); null when that day wasn't rolled over. */
  readonly wallets: SignedMoney | null;
  readonly walletsPerLedger: SignedMoney;
  readonly otherAccounts: readonly { readonly kind: string; readonly balance: SignedMoney }[];
  readonly heldFor: SignedMoney;
  /** Zero unless stored balances drifted from the ledger. */
  readonly difference: SignedMoney;
  /** The bank's own balance: needs its balance feed (OI-REC-05, Q17). */
  readonly bankReported: SignedMoney | null;
}

/** REC-017. */
export interface LedgerCheck {
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

const params = (q: object) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
};

@Injectable({ providedIn: 'root' })
export class ReconApi {
  private readonly http = inject(HttpClient);

  /** REC-013: 50 at a time with the status tiles. */
  transactions(q: TxnQuery = {}) {
    return firstValueFrom(
      this.http.get<TxnPage>('/api/v1/console/recon/transactions', { params: params(q) }),
    );
  }

  /** REC-013 as a CSV file (at most 10,000 rows), saved under the server's name for the range. */
  async exportTransactions(q: TxnQuery, fileName: string) {
    const p = params({ ...q, cursor: undefined, format: 'csv' });
    await downloadFile(this.http, `/api/v1/console/recon/transactions?${p.toString()}`, fileName);
  }

  /** REC-014: 100 at a time with the counts. */
  matching(q: MatchQuery = {}) {
    return firstValueFrom(
      this.http.get<MatchPage>('/api/v1/console/recon/mis', { params: params(q) }),
    );
  }

  /** REC-015: 100 movements at a time with the period's totals. */
  statement(q: { merchantId: string; from?: string; to?: string; cursor?: string }) {
    return firstValueFrom(
      this.http.get<MerchantStatement>('/api/v1/console/recon/merchant-statement', {
        params: params(q),
      }),
    );
  }

  /** REC-016: now, or a past date's closing balances. */
  pool(date?: string) {
    return firstValueFrom(
      this.http.get<PoolBalance>('/api/v1/console/recon/pool-balance', {
        params: params({ date }),
      }),
    );
  }

  /** REC-017: only the wallets that differ. */
  ledgerCheck() {
    return firstValueFrom(this.http.get<LedgerCheck>('/api/v1/console/recon/ledger-check'));
  }
}
