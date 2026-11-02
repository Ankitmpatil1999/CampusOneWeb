/** Back-office settlement queue, approvals, payout and statements (STL-001…008; GOV-002 runs). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

/** The settlement register (27.2; status.settlement.*). */
export type SettlementStatus = 'PENDING' | 'APPROVAL_STAGE_1' | 'APPROVED' | 'FAILED';

/** A decision: who (a name), when and the remarks. */
export interface Decision {
  readonly by: string;
  readonly at: string | null;
  readonly remarks: string | null;
}

/** STL-001: one settlement of an institution for a date. */
export interface Settlement {
  readonly id: string;
  readonly settlementNo: string;
  readonly institution: { readonly id: string; readonly name: string; readonly identifier: string };
  readonly date: string;
  readonly windowTo: string | null;
  readonly status: SettlementStatus;
  readonly lines: number;
  readonly merchants: number;
  readonly gross: Money;
  readonly fee: Money;
  /** Refunds and chargebacks deducted (Q14 M3). */
  readonly adjustments: Money;
  /** Gross − fee − adjustments; may be negative. */
  readonly net: Money;
  /** Lines of a rejected settlement collected again (Q14 M17). */
  readonly recollected: number;
  readonly stage1: Decision | null;
  readonly final: Decision | null;
  readonly rejection: Decision | null;
  readonly payout: {
    readonly utr: string;
    readonly amount: Money;
    readonly at: string | null;
    readonly by: string;
  } | null;
  readonly createdAt: string | null;
  readonly version: number;
}

export interface SettlementMerchant {
  readonly id: string;
  readonly uniqueId: string | null;
  readonly name: string;
  readonly lines: number;
  readonly gross: Money;
  readonly fee: Money;
  readonly adjustments: Money;
  readonly net: Money;
  readonly suspended: boolean;
  readonly carried: boolean;
  readonly paid: boolean;
}

export interface SettlementLine {
  readonly id: string;
  readonly reference: string;
  readonly merchantId: string;
  readonly type: string;
  readonly adjustment: boolean;
  readonly amount: Money;
  readonly fee: Money;
  readonly net: Money;
  readonly remarks: string | null;
  readonly at: string | null;
  readonly recollected: boolean;
  readonly carried: boolean;
  readonly payoutReference: string | null;
}

/** STL-002: the settlement with its merchants, lines and statement files. */
export interface SettlementDetail extends Settlement {
  /** Net of the merchants paid at payout (suspended ones carried forward). */
  readonly payableNow: Money;
  readonly merchantsList: readonly SettlementMerchant[];
  readonly linesList: readonly SettlementLine[];
  readonly statements: readonly { fileNo: number; kind: string; name: string }[];
}

export interface SettlementPage {
  readonly items: readonly Settlement[];
  readonly nextCursor: string | null;
}

/** STL-008: the platform fee rule (flat up to the threshold, a percentage above). */
export interface FeeRule {
  readonly thresholdAmount: Money;
  readonly flatFee: Money;
  /** Whether an amount equal to the threshold takes the flat fee (OQ-06). */
  readonly boundary?: 'INCLUSIVE' | 'EXCLUSIVE';
  readonly basisPoints?: number;
  /** Percent with two decimals ("0.50"). */
  readonly percent: string;
  readonly chargeTuition: boolean;
  /** The collection types charged (PAYMENT, TUITION, EVENT …). */
  readonly appliesTo: readonly string[] | string;
}

/** STL-008: the default rule and each plan's (a plan may carry its own versions, STL-009). */
export interface FeeRules {
  readonly default: FeeRule;
  readonly plans?: readonly {
    readonly id: string;
    readonly name: string;
    readonly rule: FeeRule;
    readonly override: boolean;
  }[];
}

/** GOV-002: one run of the settlement job. */
export interface JobRun {
  readonly id: string;
  readonly jobId: string;
  readonly period: string;
  readonly trigger: 'SCHEDULE' | 'MANUAL' | 'CATCH_UP';
  readonly status: 'STARTED' | 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED';
  readonly processed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly startedAt: string;
  readonly endedAt: string | null;
}

export interface ListFilter {
  readonly status?: SettlementStatus;
  readonly institutionId?: string;
  readonly from?: string;
  readonly to?: string;
}

/** Pages read for one list (50 a page): the queue of a fortnight stays far below this. */
const MAX_PAGES = 20;
const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });
const ifMatch = (version: number) => ({ 'If-Match': `"v${version}"`, ...once() });

@Injectable({ providedIn: 'root' })
export class SettlementsApi {
  private readonly http = inject(HttpClient);

  /** STL-001, one page (newest first, 50 a page). */
  page(f: ListFilter, cursor?: string) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(f)) if (v) params = params.set(k, String(v));
    if (cursor) params = params.set('cursor', cursor);
    return firstValueFrom(this.http.get<SettlementPage>('/api/v1/ops/settlements', { params }));
  }

  /** STL-001, every page (up to MAX_PAGES). */
  async all(f: ListFilter): Promise<Settlement[]> {
    const out: Settlement[] = [];
    let cursor: string | undefined;
    for (let n = 0; n < MAX_PAGES; n++) {
      const p = await this.page(f, cursor);
      out.push(...p.items);
      if (!p.nextCursor) break;
      cursor = p.nextCursor;
    }
    return out;
  }

  /** STL-002 (ETag = version). */
  detail(id: string) {
    return firstValueFrom(this.http.get<SettlementDetail>(`/api/v1/ops/settlements/${id}`));
  }

  /** STL-003 / STL-004 / STL-005: remarks, If-Match and an idempotency key. */
  decide(s: { id: string; version: number }, step: 'stage1' | 'final' | 'reject', remarks: string) {
    const path = { stage1: 'stage1-approval', final: 'final-approval', reject: 'rejection' }[step];
    return firstValueFrom(
      this.http.post<SettlementDetail>(
        `/api/v1/ops/settlements/${s.id}/${path}`,
        { remarks },
        { headers: ifMatch(s.version) },
      ),
    );
  }

  /** STL-006: the bank's UTR and the amount paid (the net payable now). */
  payout(id: string, body: { utr: string; amount: string }) {
    return firstValueFrom(
      this.http.post<SettlementDetail>(
        `/api/v1/ops/settlements/${id}/payout`,
        { utr: body.utr, amount: { amount: body.amount, currency: 'INR' } },
        { headers: once() },
      ),
    );
  }

  /** STL-007: a signed link to one statement file. */
  statement(id: string, fileNo: number) {
    return firstValueFrom(
      this.http.get<{ name: string; url: string; expiresAt: string }>(
        `/api/v1/ops/settlements/${id}/statements/${fileNo}`,
      ),
    );
  }

  /** STL-008 (plans.edit). */
  feeRules() {
    return firstValueFrom(this.http.get<FeeRules>('/api/v1/ops/platform-fee-rules'));
  }

  /** GOV-002: the settlement job's runs (jobs.view). */
  runs() {
    return firstValueFrom(
      this.http.get<{ items: readonly JobRun[] }>('/api/v1/ops/jobs/settlement-run/runs'),
    );
  }
}
