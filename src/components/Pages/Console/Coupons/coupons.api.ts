/** Console coupons API (CPN-003…012). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

export type CouponKind = 'MEAL' | 'NUTRITION' | 'EVENT' | 'OTHER';
export type CouponPeriod = 'DAY' | 'WEEK' | 'MONTH';
/** What the console shows: active, used, expired (lapsed) or cancelled (CPN-010 `state`). */
export type CouponState = 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';

/** CPN-003: one coupon type. A meal type points at a slot; another type has its own window. */
export interface CouponType {
  readonly id: string;
  readonly name: string;
  readonly kind: CouponKind;
  readonly description: string | null;
  readonly slot: { readonly id: string; readonly name: string } | null;
  readonly window: { readonly start: string; readonly end: string };
  readonly value: Money;
  readonly holdMax: number;
  readonly redeemMax: number;
  readonly period: CouponPeriod;
  /** true: every regular merchant accepts it (no merchants listed). */
  readonly acceptsAll: boolean;
  readonly merchants: readonly { readonly id: string; readonly name: string }[];
  readonly issueFrom: string | null;
  readonly issueTo: string | null;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly version: number;
}

/** CPN-004 body; CPN-005 takes any part of it (If-Match). */
export interface CouponTypeInput {
  readonly name: string;
  readonly kind: CouponKind;
  readonly description?: string | null;
  readonly slotId?: string | null;
  readonly window?: { readonly start: string; readonly end: string } | null;
  readonly value?: Money;
  readonly holdMax: number;
  readonly redeemMax: number;
  readonly period?: CouponPeriod;
  /** Empty: every regular merchant. */
  readonly merchantIds?: readonly string[] | null;
  readonly issueFrom?: string | null;
  readonly issueTo?: string | null;
  readonly active?: boolean;
}

/** CPN-006: the institution's slots and how many types use each. */
export interface CouponSlot {
  readonly id: string;
  readonly name: string;
  readonly start: string;
  readonly end: string;
  readonly types: number;
}

/** CPN-010: one issued coupon. */
export interface Coupon {
  readonly id: string;
  readonly student: { readonly id: string; readonly name: string };
  readonly type: { readonly id: string; readonly name: string; readonly kind: CouponKind };
  readonly validOn: string;
  readonly window: { readonly start: string; readonly end: string };
  readonly status: 'ACTIVE' | 'USED' | 'EXPIRED';
  readonly state: CouponState;
  readonly usedAt: string | null;
  readonly merchant: string | null;
  readonly endedAt: string | null;
  readonly cancelReason: string | null;
}

export interface CouponPage {
  readonly items: readonly Coupon[];
  readonly nextCursor: string | null;
}

export interface CouponQuery {
  readonly typeId?: string;
  readonly studentId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly state?: CouponState;
  readonly cursor?: string;
}

/** CPN-008 body: types × days of the range less the excluded days × students. */
export interface CouponIssueInput {
  readonly typeIds: readonly string[];
  readonly from: string;
  readonly to: string;
  readonly excludedDates?: readonly string[];
  readonly studentIds: readonly string[];
}

export interface CouponIssueResult {
  readonly issuanceId: string;
  readonly created: number;
  readonly skipped: number;
  readonly perStudent: readonly {
    readonly studentId: string;
    readonly name: string;
    readonly created: number;
    readonly skipped: number;
    /** A message key: the student got nothing (CPN.HOLD_MAX, CPN.NO_STUDENTS, GEN.NOT_FOUND). */
    readonly refused: string | null;
  }[];
}

/** CPN-009: one row of the issuance log. */
export interface CouponIssuance {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly excludedDates: readonly string[];
  readonly types: readonly { readonly id: string; readonly name: string }[];
  readonly students: number;
  readonly created: number;
  readonly skipped: number;
  readonly refused: number;
  readonly issuedAt: string;
}

/** CPN-012 body: cancel students' future coupons in a range (optionally of some types). */
export interface CouponCancelInput {
  readonly studentIds: readonly string[];
  readonly from: string;
  readonly to: string;
  readonly typeIds?: readonly string[];
  readonly reason: string;
}

interface Tally {
  readonly issued: number;
  readonly used: number;
  readonly expired: number;
  readonly active: number;
}

/** CPN-011: coupons valid in a period (default: the last 14 days). */
export interface CouponReports {
  readonly from: string;
  readonly to: string;
  readonly kpis: Tally & { readonly cancelled: number };
  readonly byDay: readonly (Tally & { readonly date: string })[];
  readonly byType: readonly (Tally & { readonly type: string })[];
  readonly byMerchant: readonly { readonly merchant: string; readonly used: number }[];
  readonly perStudent: readonly (Tally & {
    readonly student: { readonly id: string; readonly name: string };
  })[];
}

const params = (q: object) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
};
const once = (key: string = newIdempotencyKey()) => ({ 'Idempotency-Key': key });

@Injectable({ providedIn: 'root' })
export class CouponsApi {
  private readonly http = inject(HttpClient);

  /** CPN-003 (the four meal types are created the first time). */
  types() {
    return firstValueFrom(
      this.http.get<{ items: readonly CouponType[] }>('/api/v1/console/coupon-types'),
    );
  }

  /** CPN-004. */
  createType(body: CouponTypeInput, key?: string) {
    return firstValueFrom(
      this.http.post<CouponType>('/api/v1/console/coupon-types', body, { headers: once(key) }),
    );
  }

  /** CPN-005 (If-Match). */
  updateType(t: { id: string; version: number }, body: Partial<CouponTypeInput>) {
    return firstValueFrom(
      this.http.patch<CouponType>(`/api/v1/console/coupon-types/${t.id}`, body, {
        headers: { 'If-Match': `"v${t.version}"` },
      }),
    );
  }

  /** CPN-006. */
  slots() {
    return firstValueFrom(
      this.http.get<{ items: readonly CouponSlot[] }>('/api/v1/console/coupon-slots'),
    );
  }

  /** CPN-007: the whole slot list (a slot a type uses can't be removed). */
  setSlots(slots: readonly { id?: string; name: string; start: string; end: string }[]) {
    return firstValueFrom(
      this.http.put<{ items: readonly CouponSlot[] }>('/api/v1/console/coupon-slots', { slots }),
    );
  }

  /** CPN-010: newest first, 100 a page (keyset cursor). */
  coupons(q: CouponQuery = {}) {
    return firstValueFrom(
      this.http.get<CouponPage>('/api/v1/console/coupons', { params: params(q) }),
    );
  }

  /** CPN-008 (Idempotency-Key: a retry never issues twice). */
  issue(body: CouponIssueInput, key?: string) {
    return firstValueFrom(
      this.http.post<CouponIssueResult>('/api/v1/console/coupon-issuances', body, {
        headers: once(key),
      }),
    );
  }

  /** CPN-009. */
  issuances() {
    return firstValueFrom(
      this.http.get<{ items: readonly CouponIssuance[] }>('/api/v1/console/coupon-issuances'),
    );
  }

  /** CPN-011. */
  reports(q: { from?: string; to?: string } = {}) {
    return firstValueFrom(
      this.http.get<CouponReports>('/api/v1/console/coupons/reports', { params: params(q) }),
    );
  }

  /** CPN-012. */
  cancel(body: CouponCancelInput, key?: string) {
    return firstValueFrom(
      this.http.post<{ cancelled: number }>('/api/v1/console/coupons/cancellations', body, {
        headers: once(key),
      }),
    );
  }
}
