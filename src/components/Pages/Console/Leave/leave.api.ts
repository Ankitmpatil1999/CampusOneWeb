/**
 * Teacher leave for the academic coordinator's first review (ACA-042, ACA-043, ACA-076): the
 * requests of the year (scoped to the classes the signed-in coordinator coordinates) with their
 * counts, one request with the balance of its type and the periods it affects, and the
 * coordinator's recommendation or rejection (If-Match, Idempotency-Key).
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { YearRef } from '../Structure/academic-year';

export type LeaveType = 'CASUAL' | 'MEDICAL' | 'EARNED';
/** The request as people read it: the coordinator's and the final status together (27.2). */
export type LeaveState =
  'PENDING' | 'WITH_PRINCIPAL' | 'REJECTED_BY_COORDINATOR' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveDecisionView {
  readonly status: string;
  readonly by: string | null;
  readonly at: string | null;
  readonly remarks: string | null;
}

export interface StaffLeave {
  readonly id: string;
  /** TL-000123 */
  readonly reference: string;
  readonly staff: { readonly id: string; readonly name: string; readonly type: string };
  readonly type: LeaveType;
  /** "Casual leave" */
  readonly typeLabel: string;
  readonly from: string;
  readonly to: string;
  readonly dates: string;
  /** School days in the range (no Sundays, no holidays). */
  readonly days: number;
  readonly reason: string;
  readonly appliedAt: string | null;
  readonly needsCoordinator: boolean;
  readonly coordinator: (LeaveDecisionView & { status: 'APPROVED' | 'REJECTED' }) | null;
  readonly final: (LeaveDecisionView & { status: 'APPROVED' | 'REJECTED' | 'CANCELLED' }) | null;
  readonly state: LeaveState;
  readonly version: number;
}

export interface LeaveList {
  readonly year: YearRef;
  /** The list holds only the classes the signed-in coordinator coordinates (OI-ACA-49). */
  readonly scoped: boolean;
  readonly counts: {
    readonly pending: number;
    readonly withPrincipal: number;
    readonly awayThisWeek: number;
    readonly daysRequested: number;
  };
  readonly items: readonly StaffLeave[];
}

export interface LeaveBalance {
  readonly type: LeaveType;
  readonly label: string;
  readonly total: number;
  readonly used: number;
  readonly pending: number;
  readonly left: number;
}

/** ACA-076: one request with the balance of its type and the timetabled periods it affects. */
export interface LeaveDetail extends StaffLeave {
  readonly balance?: LeaveBalance;
  readonly periodsAffected: number;
}

@Injectable({ providedIn: 'root' })
export class LeaveApi {
  private readonly http = inject(HttpClient);

  list(status: 'PENDING' | 'REVIEWED' | 'all' = 'all', q = '') {
    return firstValueFrom(
      this.http.get<LeaveList>('/api/v1/console/teacher-leaves', {
        params: { status, ...(q ? { q } : {}) },
      }),
    );
  }

  detail(id: string) {
    return firstValueFrom(this.http.get<LeaveDetail>(`/api/v1/console/teacher-leaves/${id}`));
  }

  decide(id: string, version: number, decision: 'APPROVED' | 'REJECTED', remarks: string | null) {
    return firstValueFrom(
      this.http.post<LeaveDetail>(
        `/api/v1/console/teacher-leaves/${id}/coordinator-decision`,
        { decision, remarks },
        { headers: { 'If-Match': `"v${version}"`, 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }
}
