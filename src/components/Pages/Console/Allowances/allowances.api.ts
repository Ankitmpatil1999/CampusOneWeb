/** Console allowances API (ALW-002…005). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

/** What the console shows: issued and not yet credited, in force, expired or cancelled. */
export type AllowanceState = 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface DailyLimits {
  readonly count: number | null;
  readonly amount: Money | null;
}

/** ALW-002: one grant. `balance` is the allowance wallet's while the grant is in force. */
export interface AllowanceGrant {
  readonly id: string;
  readonly student: {
    readonly id: string;
    readonly name: string;
    readonly grade: string | null;
    readonly admissionNo: string | null;
  };
  readonly name: string | null;
  readonly amount: Money;
  readonly startDate: string;
  readonly expiryDate: string;
  readonly dailyLimits: DailyLimits | null;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly state: AllowanceState;
  readonly walletNo: string;
  readonly walletStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  readonly balance: Money | null;
  readonly spent: Money;
  /** Today's (IST) allowance payments: the drawer's "Spent today". */
  readonly today: { readonly spent: Money; readonly count: number };
  readonly issuedBy: { readonly name: string } | null;
  readonly issuedAt: string;
  readonly expired: Money | null;
  readonly creditedAt: string | null;
  readonly endedAt: string | null;
  readonly cancelReason: string | null;
  readonly version: number;
}

export interface AllowanceList {
  readonly items: readonly AllowanceGrant[];
  readonly kpis: {
    readonly active: number;
    readonly scheduled: number;
    readonly issuedThisYear: Money;
    readonly balanceHeld: Money;
  };
  /** The daily limits the issue form proposes (limits register, adjustable). */
  readonly defaults: { readonly dailyCount: number; readonly dailyAmount: Money };
}

export interface AllowanceQuery {
  readonly state?: AllowanceState;
  readonly classId?: string;
  readonly q?: string;
}

/** ALW-003 body. */
export interface AllowanceIssueInput {
  readonly studentIds: readonly string[];
  readonly name?: string | null;
  readonly amount: Money;
  readonly startDate: string;
  readonly expiryDate: string;
  readonly dailyLimits?: { readonly count: number; readonly amount: Money } | null;
}

/** ALW-003: per-student results (OI-ALW-04). */
export interface AllowanceIssueResult {
  readonly created: readonly { studentId: string; grantId: string; name: string }[];
  readonly duplicates: readonly { studentId: string; name: string }[];
  readonly refused: readonly { studentId: string; code: string }[];
}

/** ALW-004 body (If-Match): new daily limits (null removes them), or a cancellation. */
export interface AllowancePatch {
  readonly dailyLimits?: { readonly count: number; readonly amount: Money } | null;
  readonly status?: 'INACTIVE';
  readonly reason?: string;
}

export interface StudentRef {
  readonly id: string;
  readonly name: string;
  readonly grade: string | null;
}

/** ALW-005: issued, spent and expired in a period (default: the last 14 days). */
export interface AllowanceReports {
  readonly from: string;
  readonly to: string;
  readonly kpis: {
    readonly issued: Money;
    readonly spent: Money;
    readonly expired: Money;
    readonly scheduled: Money;
  };
  readonly byDay: readonly { date: string; spent: Money }[];
  readonly byMerchant: readonly { merchant: string; spent: Money }[];
  readonly byClass: readonly { class: string; issued: Money; spent: Money }[];
  readonly perStudent: readonly {
    student: StudentRef;
    issued: Money;
    spent: Money;
    balance: Money;
    expired: Money;
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
export class AllowancesApi {
  private readonly http = inject(HttpClient);

  /** ALW-002: the grants with the key figures and the issue form's default limits. */
  list(q: AllowanceQuery = {}) {
    return firstValueFrom(
      this.http.get<AllowanceList>('/api/v1/console/allowances', { params: params(q) }),
    );
  }

  /** ALW-003: one grant per student (Idempotency-Key: a retry never issues twice). */
  issue(body: AllowanceIssueInput, key: string = newIdempotencyKey()) {
    return firstValueFrom(
      this.http.post<AllowanceIssueResult>('/api/v1/console/allowances', body, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }

  /** ALW-004: change the daily limits, or cancel a grant not yet credited. */
  update(grant: { id: string; version: number }, body: AllowancePatch) {
    return firstValueFrom(
      this.http.patch<AllowanceGrant>(`/api/v1/console/allowances/${grant.id}`, body, {
        headers: { 'If-Match': `"v${grant.version}"` },
      }),
    );
  }

  /** ALW-005. */
  reports(q: { from?: string; to?: string } = {}) {
    return firstValueFrom(
      this.http.get<AllowanceReports>('/api/v1/console/allowances/reports', { params: params(q) }),
    );
  }
}
