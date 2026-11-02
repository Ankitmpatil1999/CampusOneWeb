/**
 * Console exams and marks (ACA-034…041): the year's exams, the exam names, exams created for
 * class-sections × subjects, an exam's change or withdrawal (If-Match), the marks status by exam name
 * and class-section, the coordinator's validation of saved marks and the server-computed academic
 * report.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { YearRef } from '../Structure/academic-year';

/** Derived from the date (27.2): no date yet, after today, today, or held. */
export type ExamSchedule = 'Scheduled' | 'Upcoming' | 'Today' | 'Completed';
/** Marks progress of one exam: nothing saved, some marks still Created, or every mark Valid. */
export type MarksState = 'NOT_UPLOADED' | 'AWAITING_VALIDATION' | 'VALIDATED';

/** ACA-034: one subject of one class-section in a year. */
export interface Exam {
  readonly id: string;
  readonly name: { readonly id: string; readonly name: string };
  readonly year: { readonly id: string; readonly label: string };
  readonly class: { readonly id: string; readonly name: string };
  readonly section: { readonly id: string; readonly name: string; readonly label: string };
  readonly subject: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly colour: string;
  };
  /** YYYY-MM-DD, or null while the date is still to be set. */
  readonly date: string | null;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly maxMarks: number;
  readonly passMarks: number;
  readonly schedule: ExamSchedule;
  readonly marks: {
    /** Students enrolled in the class-section that year. */
    readonly students: number;
    /** Marks saved (a mark or absent). */
    readonly entered: number;
    readonly valid: number;
    readonly status: MarksState;
  };
  readonly published: { readonly at: string } | null;
  readonly withdrawn: boolean;
  readonly version: number;
}

export interface ExamList {
  readonly year: YearRef;
  readonly items: readonly Exam[];
}

/** ACA-037: an exam name with its exams this year and in every year. */
export interface ExamName {
  readonly id: string;
  readonly name: string;
  readonly examsThisYear: number;
  readonly examsAllYears: number;
}

export interface ExamNameList {
  readonly year: YearRef;
  readonly items: readonly ExamName[];
}

export interface ExamItemInput {
  readonly subjectId: string;
  readonly date?: string | null;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly maxMarks: number;
  readonly passMarks: number;
}

export interface ExamsInput {
  readonly yearId?: string;
  readonly examNameId: string;
  readonly sectionIds: readonly string[];
  readonly items: readonly ExamItemInput[];
}

export interface ExamEdit {
  readonly date?: string | null;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly maxMarks?: number;
  readonly passMarks?: number;
  readonly withdraw?: boolean;
}

/** ACA-039: marks progress of one exam name in one class-section. */
export interface MarksGroup {
  readonly key: string;
  readonly examName: string;
  readonly section: string;
  readonly firstDate: string | null;
  readonly exams: number;
  /** Exams held so far (dated today or earlier). */
  readonly due: number;
  readonly uploaded: number;
  readonly validated: number;
  readonly awaiting: number;
  /** Held exams with no marks saved. */
  readonly missing: number;
  readonly examIds: readonly string[];
}

export interface MarksStatus {
  readonly year: YearRef;
  readonly items: readonly MarksGroup[];
}

/** ACA-041: per subject, percentages of the maximum marks (one decimal). */
export interface ReportSubject {
  readonly subject: { readonly id: string; readonly name: string; readonly colour: string };
  readonly students: number;
  readonly absent: number;
  readonly highest: number | null;
  readonly lowest: number | null;
  readonly average: number | null;
  readonly passed: number;
  readonly failed: number;
  readonly passRate: number | null;
  readonly top: { readonly id: string; readonly name: string } | null;
}

export interface AcademicReport {
  readonly year: YearRef;
  readonly includesPending: boolean;
  readonly pendingMarks: number;
  readonly classAverage: number | null;
  readonly passedEverySubject: number;
  readonly students: readonly {
    readonly id: string;
    readonly name: string;
    readonly percentage: number;
    readonly failedSubjects: number;
  }[];
  readonly subjects: readonly ReportSubject[];
}

const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });
const year = (yearId?: string): Record<string, string> => (yearId ? { yearId } : {});

@Injectable({ providedIn: 'root' })
export class ExamsApi {
  private readonly http = inject(HttpClient);

  exams(yearId?: string) {
    return firstValueFrom(
      this.http.get<ExamList>('/api/v1/console/exams', { params: year(yearId) }),
    );
  }

  names(yearId?: string) {
    return firstValueFrom(
      this.http.get<ExamNameList>('/api/v1/console/exam-names', { params: year(yearId) }),
    );
  }

  addName(name: string) {
    return firstValueFrom(
      this.http.post<ExamName>('/api/v1/console/exam-names', { name }, { headers: once() }),
    );
  }

  /** ACA-035: every section × subject is created, or none. */
  create(body: ExamsInput) {
    return firstValueFrom(
      this.http.post<{ created: number; items: Exam[] }>('/api/v1/console/exams', body, {
        headers: once(),
      }),
    );
  }

  change(id: string, version: number, body: ExamEdit) {
    return firstValueFrom(
      this.http.patch<Exam>(`/api/v1/console/exams/${id}`, body, {
        headers: { 'If-Match': `"v${version}"` },
      }),
    );
  }

  marksStatus(scope: 'due' | 'all', yearId?: string) {
    return firstValueFrom(
      this.http.get<MarksStatus>('/api/v1/console/marks-status', {
        params: { ...year(yearId), scope },
      }),
    );
  }

  /** ACA-040: the exam's Created marks become Valid. */
  validate(id: string) {
    return firstValueFrom(
      this.http.post<Exam>(`/api/v1/console/exams/${id}/marks-validation`, {}, { headers: once() }),
    );
  }

  report(q: {
    yearId?: string;
    examNameId?: string;
    sectionId?: string;
    includePending?: boolean;
  }) {
    const params: Record<string, string> = { ...year(q.yearId) };
    if (q.examNameId) params['examNameId'] = q.examNameId;
    if (q.sectionId) params['sectionId'] = q.sectionId;
    if (q.includePending) params['includePending'] = 'true';
    return firstValueFrom(
      this.http.get<AcademicReport>('/api/v1/console/academic-reports', { params }),
    );
  }
}
