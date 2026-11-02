/**
 * Console fee records API (FEE-010…018, FEE-024/025, FEE-039…041; GOV-006/007 for the tuition
 * auto-debit job).
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { Money } from '../Fees/fees.api';

export type { Money } from '../Fees/fees.api';

/** Fee record status (status register: fee_record). */
export type RecordStatus = 'DUE' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

/** FEE-043: a student a fee can be billed to. */
export interface FeeStudent {
  readonly id: string;
  readonly name: string;
  readonly admissionNo: string | null;
  readonly grade: { readonly class: string; readonly section: string | null } | null;
}

/** FEE-010: one record (an instalment billed to a student). */
export interface FeeRecord {
  readonly id: string;
  readonly student: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
    readonly classSection: string | null;
  };
  readonly year: { readonly id: string; readonly label: string };
  readonly source: 'STRUCTURE' | 'MANUAL' | 'UPLOAD';
  readonly structure: { readonly name: string; readonly version: number | null } | null;
  readonly instalment: { readonly seq: number; readonly label: string };
  readonly dueDate: string;
  readonly amount: Money;
  /** The late fine of the record (applies once it is overdue). */
  readonly lateFine: Money;
  /** The late fine once applied (overdue). */
  readonly fine: Money;
  readonly paid: Money;
  readonly outstanding: Money;
  readonly status: RecordStatus;
  readonly financed: boolean;
  readonly remarks: string | null;
  readonly pendingAttempt: {
    readonly id: string;
    readonly tries: number;
    readonly lastFailureCode: string | null;
    readonly lastTriedAt: string | null;
  } | null;
  readonly paidAt: string | null;
  readonly createdAt: string | null;
  readonly version: number;
}

/** FEE-011: a record with its heads, collections and payment attempts. */
export interface FeeRecordDetail extends FeeRecord {
  readonly heads: readonly { readonly name: string; readonly amount: Money }[];
  readonly collections: readonly {
    readonly reference: string;
    readonly amount: Money;
    readonly fine: Money;
    readonly source: 'CONSOLE' | 'JOB' | 'MEMBER';
    readonly status: 'COLLECTED' | 'SETTLED';
    readonly collectedAt: string | null;
  }[];
  readonly attempts: readonly {
    readonly reference: string;
    readonly status: string;
    readonly failureCode: string | null;
    readonly amount: Money;
    readonly at: string | null;
  }[];
}

export interface RecordQuery {
  readonly yearId?: string;
  readonly sectionId?: string;
  readonly studentId?: string;
  readonly status?: RecordStatus;
  readonly cursor?: string;
}

/** FEE-012 body. */
export interface RecordInput {
  readonly studentId: string;
  readonly yearId: string;
  readonly label: string;
  readonly dueDate: string;
  readonly amount: Money;
  readonly headId?: string;
  readonly remarks?: string | null;
}

/** FEE-013 body: what changes and why. */
export interface RecordChange {
  readonly amount?: Money;
  readonly dueDate?: string;
  readonly remarks?: string | null;
  readonly reason: string;
}

/** FEE-016: collected (201) or waiting for a top-up (202). */
export type Collection =
  | {
      readonly collected: true;
      readonly receipt: { readonly reference: string; readonly amount: Money };
      readonly record: FeeRecordDetail;
    }
  | {
      readonly collected: false;
      readonly pendingAttempt: {
        readonly id: string;
        readonly tries: number;
        readonly reasonCode: string;
      };
      readonly record: FeeRecordDetail;
    };

interface ReportRow {
  readonly students: number;
  readonly records: number;
  readonly billed: Money;
  readonly collected: Money;
  readonly outstanding: Money;
  readonly overdue: number;
}

/** FEE-017: billed, collected and outstanding by class and section. */
export interface CollectionReport {
  readonly rows: readonly (ReportRow & { readonly classSection: string })[];
  readonly totals: ReportRow | null;
}

/** FEE-018: one collection waiting for a top-up. */
export interface CollectionAttempt {
  readonly id: string;
  readonly status: 'PENDING' | 'SUCCEEDED' | 'CANCELLED';
  readonly tries: number;
  readonly lastFailureCode: string | null;
  readonly lastTriedAt: string | null;
  readonly createdAt: string | null;
  readonly record: { readonly id: string; readonly label: string };
  readonly student: { readonly name: string };
  readonly outstanding: Money;
}

/** FEE-040: one fee sheet upload. */
export interface FeeUpload {
  readonly id: string;
  readonly fileName: string;
  readonly year: string;
  readonly status: 'VALIDATED' | 'COMMITTED';
  readonly total: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly recordsPlanned: number;
  readonly recordsCreated: number | null;
  readonly uploadedBy: string | null;
  readonly uploadedAt: string | null;
  readonly committedAt: string | null;
}

/** FEE-014 / FEE-041: an upload with its row report. */
export interface FeeUploadReport extends FeeUpload {
  readonly rows: readonly {
    readonly row: number;
    readonly name: string;
    readonly admissionNo: string;
    readonly classSection: string;
    readonly total: Money;
    readonly instalments: readonly Money[];
    readonly dueDate: string | null;
    readonly dueDefaulted: boolean;
    readonly paid: boolean;
    readonly accepted: boolean;
    readonly errors: readonly { readonly column: string; readonly message: string }[];
  }[];
}

export type FinancingStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

/** FEE-024: a student's registration with the financing partner. */
export interface FinancingRegistration {
  readonly id: string;
  readonly partnerRef: string;
  readonly partnerName: string;
  readonly status: FinancingStatus;
  readonly requestedBy: 'STAFF' | 'MEMBER';
  readonly failureReason: string | null;
  readonly student: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
  };
  readonly records: readonly {
    readonly id: string;
    readonly label: string;
    readonly dueDate: string;
    readonly amount: Money;
    readonly outstanding: Money;
    readonly status: string;
    readonly financed: boolean;
  }[];
  readonly total: Money;
  readonly createdAt: string | null;
  readonly decidedAt: string | null;
  readonly version: number;
}

export interface FinancingList {
  readonly items: readonly FinancingRegistration[];
  readonly partner: { readonly name: string; readonly mode: 'test' | 'live' };
}

/** GOV-006: one run of a scheduled job as it touched this institution. */
export interface InstitutionRun {
  readonly runId: string;
  readonly job: { readonly id: string; readonly name: string };
  readonly periodKey: string;
  readonly trigger: 'SCHEDULE' | 'MANUAL' | 'CATCH_UP';
  readonly runStatus: 'STARTED' | 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED';
  readonly status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  readonly processed: number;
  readonly failed: number;
  readonly note: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
}

/** GOV-007: the run started from the console and this institution's line. */
export interface InstitutionRunResult {
  readonly runId: string;
  readonly job: { readonly id: string; readonly name: string };
  readonly periodKey: string;
  readonly runStatus: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED';
  readonly status: string;
  readonly processed: number;
  readonly failed: number;
  readonly note: string | null;
}

/** The tuition auto-debit job (the retry of pending fee collections). */
export const AUTO_DEBIT_JOB = 'tuition-autodebit';

const params = (q: object) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
};
const once = (key: string = newIdempotencyKey()) => ({ 'Idempotency-Key': key });

@Injectable({ providedIn: 'root' })
export class FeeRecordsApi {
  private readonly http = inject(HttpClient);

  /** FEE-010: newest first, 100 a page (keyset cursor). */
  records(q: RecordQuery = {}) {
    return firstValueFrom(
      this.http.get<{ items: readonly FeeRecord[]; nextCursor: string | null }>(
        '/api/v1/console/fee-records',
        { params: params(q) },
      ),
    );
  }

  /** FEE-043: active students to bill, by name or admission number (no members.view needed). */
  students(q: { q?: string; yearId?: string } = {}) {
    return firstValueFrom(
      this.http.get<{ items: readonly FeeStudent[] }>('/api/v1/console/fee-records/students', {
        params: params(q),
      }),
    );
  }

  /** FEE-011. */
  record(id: string) {
    return firstValueFrom(this.http.get<FeeRecordDetail>(`/api/v1/console/fee-records/${id}`));
  }

  /** FEE-012. */
  create(body: RecordInput, key?: string) {
    return firstValueFrom(
      this.http.post<FeeRecordDetail>('/api/v1/console/fee-records', body, { headers: once(key) }),
    );
  }

  /** FEE-013: waits for a checker, or applies directly (an administrator's own request). */
  requestChange(id: string, body: RecordChange, key?: string) {
    return firstValueFrom(
      this.http.post<{
        approvalId: string;
        no: string;
        appliedDirectly: boolean;
        record: FeeRecordDetail;
      }>(`/api/v1/console/fee-records/${id}/change-requests`, body, { headers: once(key) }),
    );
  }

  /** FEE-016 (Idempotency-Key: a retry never collects twice). */
  collect(id: string, key?: string) {
    return firstValueFrom(
      this.http.post<Collection>(
        `/api/v1/console/fee-records/${id}/collections`,
        {},
        { headers: once(key) },
      ),
    );
  }

  /** FEE-017 (?yearId; ?from and ?to on the due date). */
  report(q: { yearId?: string; from?: string; to?: string } = {}) {
    return firstValueFrom(
      this.http.get<CollectionReport>('/api/v1/console/fee-collections/report', {
        params: params(q),
      }),
    );
  }

  /** FEE-018 (default: the pending ones). */
  attempts(status?: CollectionAttempt['status']) {
    return firstValueFrom(
      this.http.get<{ items: readonly CollectionAttempt[] }>(
        '/api/v1/console/fee-collection-attempts',
        { params: params({ status }) },
      ),
    );
  }

  /** FEE-039: the fee sheet template (CSV). */
  template() {
    return downloadFile(
      this.http,
      '/api/v1/console/fee-records/uploads/template',
      'campusone-fee-sheet-template.csv',
    );
  }

  /** FEE-014: the sheet is checked row by row; nothing is created until it is committed. */
  upload(file: File, key?: string) {
    const form = new FormData();
    form.set('file', file, file.name);
    return firstValueFrom(
      this.http.post<FeeUploadReport>('/api/v1/console/fee-records/uploads', form, {
        headers: once(key),
      }),
    );
  }

  /** FEE-040. */
  uploads() {
    return firstValueFrom(
      this.http.get<{ items: readonly FeeUpload[] }>('/api/v1/console/fee-records/uploads'),
    );
  }

  /** FEE-041. */
  uploadReport(id: string) {
    return firstValueFrom(
      this.http.get<FeeUploadReport>(`/api/v1/console/fee-records/uploads/${id}`),
    );
  }

  /** FEE-015: all rows (only when none was rejected) or the accepted rows. */
  commit(id: string, mode: 'ALL' | 'ACCEPTED', key?: string) {
    return firstValueFrom(
      this.http.post<{ created: number; skipped: number }>(
        `/api/v1/console/fee-records/uploads/${id}/commit`,
        { mode },
        { headers: once(key) },
      ),
    );
  }

  /** FEE-024. */
  financing() {
    return firstValueFrom(this.http.get<FinancingList>('/api/v1/console/financing-applications'));
  }

  /** FEE-025: the student's unpaid records of the current year. */
  register(studentProfileId: string, key?: string) {
    return firstValueFrom(
      this.http.post<FinancingRegistration & { sent: boolean; test: boolean }>(
        '/api/v1/console/financing-applications',
        { studentProfileId },
        { headers: once(key) },
      ),
    );
  }

  /** GOV-006: this institution's runs of the auto-debit job. */
  runs() {
    return firstValueFrom(
      this.http.get<{ items: readonly InstitutionRun[]; nextCursor: string | null }>(
        '/api/v1/console/job-runs',
        { params: params({ jobId: AUTO_DEBIT_JOB }) },
      ),
    );
  }

  /** GOV-007: run the auto-debit now for this institution only (fees.collect). */
  runAutoDebit(reason: string, key?: string) {
    return firstValueFrom(
      this.http.post<InstitutionRunResult>(
        `/api/v1/console/jobs/${AUTO_DEBIT_JOB}/runs`,
        { reason },
        { headers: once(key) },
      ),
    );
  }
}
