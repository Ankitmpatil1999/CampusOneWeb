/**
 * Teacher assignments (ACA-021…023): class teachers, subject teachers and coordinators of an
 * academic year; and the teachers to choose from (active members whose user type is a teacher or
 * the principal, ACA-078). Class and subject teachers can also come from a sheet (client
 * 2026-10-21).
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { YearRef } from '../Structure/academic-year';

export type AssignmentKind = 'CLASS_TEACHER' | 'SUBJECT_TEACHER' | 'COORDINATOR';
/** The assignments a sheet can carry (coordinators stay manual). */
export type SheetKind = 'CLASS_TEACHER' | 'SUBJECT_TEACHER';

export interface Assignment {
  readonly id: string;
  readonly kind: AssignmentKind;
  /** combined: a class teacher who also teaches a subject this year (one portal, CR-02). */
  readonly teacher: { readonly id: string; readonly name: string; readonly combined: boolean };
  readonly class: { readonly id: string; readonly name: string };
  readonly section: { readonly id: string; readonly name: string } | null;
  readonly subject: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly periodsAWeek: number;
  readonly since: string | null;
}

export interface ClassTeacherRow {
  readonly section: { readonly id: string; readonly name: string };
  readonly class: { readonly id: string; readonly name: string };
  readonly assignment: Assignment | null;
}

export interface AssignmentList {
  readonly year: YearRef;
  readonly classTeachers: readonly ClassTeacherRow[];
  readonly subjectTeachers: readonly Assignment[];
  readonly coordinators: readonly Assignment[];
  readonly combinedTeachers: number;
}

export interface AssignInput {
  readonly yearId?: string;
  readonly kind: AssignmentKind;
  readonly teacherId?: string;
  readonly sectionIds?: readonly string[];
  readonly classIds?: readonly string[];
  readonly subjectId?: string;
  readonly replace?: boolean;
  readonly copyFromYearId?: string;
}

/** A teacher to choose: name, employee number and user type. */
export interface TeacherOption {
  readonly id: string;
  readonly name: string;
  readonly employeeNo: string | null;
  readonly userType: string;
}

/**
 * The class- or subject-teacher sheet's row report: a check says what an import would do, the
 * import what it did. The teacher is written as an employee ID or a mobile number.
 */
export interface AssignmentUploadReport {
  readonly committed: boolean;
  readonly kind: SheetKind;
  readonly year: YearRef;
  /** Rows that are fine, including those that change nothing. */
  readonly accepted: number;
  readonly rejected: number;
  readonly created: number;
  /** Class teachers replaced (the previous one kept as history). */
  readonly replaced: number;
  readonly unchanged: number;
  readonly rows: readonly {
    row: number;
    className: string;
    /** The section; for subject teachers the cell as written ("A, B"). */
    sections: string;
    subject: string | null;
    teacher: string;
    teacherName: string | null;
    accepted: boolean;
    outcome: 'NEW' | 'REPLACE' | 'UNCHANGED' | null;
    code: string | null;
    params: Readonly<Record<string, string>>;
  }[];
}

@Injectable({ providedIn: 'root' })
export class TeachersApi {
  private readonly http = inject(HttpClient);

  assignments(yearId?: string) {
    return firstValueFrom(
      this.http.get<AssignmentList>('/api/v1/console/teacher-assignments', {
        params: yearId ? { yearId } : {},
      }),
    );
  }

  assign(body: AssignInput) {
    return firstValueFrom(
      this.http.post<AssignmentList & { created: number }>(
        '/api/v1/console/teacher-assignments',
        body,
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }

  withdraw(id: string) {
    return firstValueFrom(
      this.http.delete<AssignmentList>(`/api/v1/console/teacher-assignments/${id}`),
    );
  }

  /** The sheet: commit false checks every row; commit true imports the accepted rows. */
  upload(
    kind: SheetKind,
    file: File,
    commit: boolean,
    key: string,
    opts: { yearId?: string | undefined; replace?: boolean } = {},
  ) {
    const form = new FormData();
    form.set('kind', kind);
    form.set('commit', String(commit));
    if (opts.yearId) form.set('yearId', opts.yearId);
    if (opts.replace) form.set('replace', 'true');
    form.set('file', file, file.name);
    return firstValueFrom(
      this.http.post<AssignmentUploadReport>('/api/v1/console/teacher-assignments/uploads', form, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }

  /** The sheet's template (CSV), filled in with the year's current assignments. */
  template(kind: SheetKind, year?: { readonly id: string; readonly label: string } | null) {
    const q = new URLSearchParams({ kind, ...(year ? { yearId: year.id } : {}) });
    const what = kind === 'CLASS_TEACHER' ? 'class-teachers' : 'subject-teachers';
    return downloadFile(
      this.http,
      `/api/v1/console/teacher-assignments/uploads/template?${q.toString()}`,
      `campusone-${what}${year ? '-' + year.label : ''}.csv`,
    );
  }

  /**
   * ACA-078: the active teachers and principals. With the academics grant, not the member
   * directory's: the Academic Coordinator assigns teachers without seeing the members (client
   * 2026-10-13: their teacher lists said "No active teachers yet").
   */
  async teachers(): Promise<TeacherOption[]> {
    const r = await firstValueFrom(
      this.http.get<{ items: TeacherOption[] }>('/api/v1/console/teachers'),
    );
    return r.items;
  }
}
