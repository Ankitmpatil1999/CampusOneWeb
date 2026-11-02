/**
 * Enrolments, transfers, corrections into a closed year and the year roll-over (ACA-027…033).
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { YearRef } from '../Structure/academic-year';

export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type Outcome = 'PROMOTED' | 'REPEATED' | 'LEFT';

export interface Enrolment {
  readonly id: string;
  readonly student: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
    readonly status: MemberStatus;
  };
  readonly class: { readonly id: string; readonly name: string };
  readonly section: { readonly id: string; readonly name: string };
  readonly enrolledOn: string | null;
  /** How the student came into this year at the roll-over (promoted or repeating). */
  readonly outcome: Outcome | null;
  /** Transfers and corrections in the year. */
  readonly moves: number;
  /** The approval request of a correction waiting for the administrator. */
  readonly correctionPending: string | null;
}

export interface EnrolmentList {
  readonly year: YearRef;
  readonly total: number;
  readonly items: readonly Enrolment[];
  readonly nextCursor: string | null;
}

export interface CorrectionResult {
  readonly approvalId: string;
  readonly appliedDirectly: boolean;
  readonly enrolment: Enrolment;
}

export interface RolloverItem {
  readonly student: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
    readonly status: MemberStatus;
  };
  /** "Grade 7 B" in the year rolled from. */
  readonly from: string;
  readonly outcome: Outcome;
  readonly to: { readonly sectionId: string; readonly label: string } | null;
  readonly amended: boolean;
}

/** ACA-031: the roll-over from a year into the next, drawn once from the class order. */
export interface Rollover {
  readonly id: string;
  readonly status: 'PROPOSED' | 'COMMITTED';
  readonly from: YearRef;
  readonly to: YearRef;
  readonly committedAt: string | null;
  readonly counts: { readonly promoted: number; readonly repeated: number; readonly left: number };
  readonly items: readonly RolloverItem[];
  readonly version: number;
}

const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });

@Injectable({ providedIn: 'root' })
export class EnrolmentsApi {
  private readonly http = inject(HttpClient);

  list(q: { yearId?: string; cursor?: string }) {
    const params: Record<string, string> = {};
    if (q.yearId) params['yearId'] = q.yearId;
    if (q.cursor) params['cursor'] = q.cursor;
    return firstValueFrom(this.http.get<EnrolmentList>('/api/v1/console/enrolments', { params }));
  }

  /** Every enrolment of the year (pages of 100, at most 5,000 students). */
  async all(yearId?: string): Promise<{ list: EnrolmentList; items: Enrolment[] }> {
    let list = await this.list({ ...(yearId ? { yearId } : {}) });
    const items = [...list.items];
    for (let i = 0; list.nextCursor && i < 50; i++) {
      list = await this.list({ ...(yearId ? { yearId } : {}), cursor: list.nextCursor });
      items.push(...list.items);
    }
    return { list, items };
  }

  enrol(body: { yearId?: string; studentId: string; sectionId: string; enrolledOn?: string }) {
    return firstValueFrom(
      this.http.post<Enrolment>('/api/v1/console/enrolments', body, { headers: once() }),
    );
  }

  transfer(id: string, body: { sectionId: string; effectiveOn: string; reason: string }) {
    return firstValueFrom(
      this.http.post<Enrolment>(`/api/v1/console/enrolments/${id}/transfers`, body, {
        headers: once(),
      }),
    );
  }

  /** ACA-030: 202 when sent to the approvals queue, 200 when an administrator's request applies. */
  correct(body: { enrolmentId: string; sectionId: string; reason: string }) {
    return firstValueFrom(
      this.http.post<CorrectionResult>('/api/v1/console/closed-year-corrections', body, {
        headers: once(),
      }),
    );
  }

  proposal() {
    return firstValueFrom(this.http.get<Rollover>('/api/v1/console/rollover-proposals'));
  }

  amend(
    rolloverId: string,
    studentId: string,
    version: number,
    body: { outcome: Outcome; sectionId: string | null },
  ) {
    return firstValueFrom(
      this.http.patch<Rollover>(
        `/api/v1/console/rollover-proposals/${rolloverId}/items/${studentId}`,
        body,
        { headers: { 'If-Match': `"v${version}"` } },
      ),
    );
  }

  commit(rolloverId: string, version: number) {
    return firstValueFrom(
      this.http.post<Rollover>(
        `/api/v1/console/rollover-proposals/${rolloverId}/commit`,
        {},
        { headers: { ...once(), 'If-Match': `"v${version}"` } },
      ),
    );
  }
}
