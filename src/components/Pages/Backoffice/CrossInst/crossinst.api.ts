/**
 * Cross-institution reporting (RPT-009…012, CR-18, RNG-GOV-030…034): aggregated figures side by side
 * for a stated selection (named institutions or a status) and period with a reason; a drill-through
 * into one institution of a comparison (a separate recorded access); and the access record of every
 * run — refusals included — with its export (read through RPT-005).
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export type XiFigure =
  | 'members'
  | 'admissions'
  | 'attendance'
  | 'fees'
  | 'wallets'
  | 'settlement'
  | 'communication'
  | 'tickets';
export type XiStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
export type XiUnit = 'count' | 'paise' | 'percent' | 'days';

export interface XiColumn {
  readonly key: string;
  readonly label: string;
  readonly unit: XiUnit;
  readonly definition: string;
  readonly figure: XiFigure;
}

export type XiValues = Readonly<Record<string, number | null>>;

export interface XiComparison {
  readonly accessId: string;
  readonly accessNo: string;
  readonly period: { readonly from: string; readonly to: string };
  readonly columns: readonly XiColumn[];
  readonly rows: readonly {
    readonly institutionId: string;
    readonly name: string;
    readonly shortName: string;
    readonly identifier: string;
    readonly status: string;
    readonly values: XiValues;
  }[];
  readonly totals: XiValues;
  readonly averages: XiValues;
  readonly unavailable: readonly string[];
}

export interface XiBreakdownItem {
  readonly label: string;
  readonly value: number;
}

export interface XiDrill {
  readonly accessId: string;
  readonly accessNo: string;
  readonly institution: { readonly institutionId: string; readonly name: string };
  readonly period: { readonly from: string; readonly to: string };
  readonly figures: {
    readonly values: XiValues;
    readonly breakdowns: Readonly<Partial<Record<string, readonly XiBreakdownItem[]>>>;
  };
}

export interface XiRequest {
  readonly selection: { readonly institutionIds?: readonly string[]; readonly status?: XiStatus };
  readonly period: { readonly from: string; readonly to: string };
  readonly figures?: readonly XiFigure[];
  readonly reason: string;
}

export interface AccessRecord {
  readonly accessId: string;
  readonly accessNo: string;
  readonly kind: string;
  readonly parentAccessNo: string | null;
  readonly actor: { readonly id: string; readonly name: string; readonly role: string | null };
  readonly selection: string;
  readonly institutions: readonly string[];
  readonly figures: readonly string[];
  readonly period: { readonly from: string | null; readonly to: string | null } | null;
  readonly outcome: 'Returned' | 'Refused';
  readonly reason: string | null;
  readonly note: string | null;
  readonly at: string;
}

export interface AccessFilters {
  readonly actor?: string;
  readonly outcome?: 'Returned' | 'Refused' | '';
  readonly from?: string;
  readonly to?: string;
}

export interface OpsInstitution {
  readonly id: string;
  readonly name: string;
  readonly identifier: string;
  readonly status: XiStatus;
  readonly subscriptionStatus: string | null;
}

const BASE = '/api/v1/ops/cross-institution-reports';
const clean = (p: Record<string, string | undefined | null>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => !!v)) as Record<string, string>;

@Injectable({ providedIn: 'root' })
export class CrossInstApi {
  private readonly http = inject(HttpClient);

  institutions() {
    return firstValueFrom(
      this.http.get<{ items: readonly OpsInstitution[] }>('/api/v1/ops/institutions'),
    );
  }

  compare(body: XiRequest) {
    return firstValueFrom(
      this.http.post<XiComparison>(BASE, body, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }

  drill(accessId: string, institutionId: string, reason: string) {
    return firstValueFrom(
      this.http.post<XiDrill>(
        `${BASE}/${encodeURIComponent(accessId)}/drill-throughs`,
        { institutionId, reason },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }

  records(f: AccessFilters, cursor: string | null = null) {
    return firstValueFrom(
      this.http.get<{ items: readonly AccessRecord[]; nextCursor: string | null }>(
        '/api/v1/ops/access-records',
        { params: clean({ ...f, cursor, limit: '50' }) },
      ),
    );
  }

  exportRecords(f: AccessFilters) {
    return firstValueFrom(
      this.http.post<{ exportId: string; status: string }>(
        '/api/v1/ops/access-records/exports',
        { filters: clean({ ...f }) },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }
}
