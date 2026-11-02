/**
 * Section timetables, clashes and each teacher's week (ACA-024…026); and the timetable sheet
 * (client 2026-10-21), which gives each class-section in it the sheet's whole week.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import type { YearRef } from '../Structure/academic-year';

export interface TtPeriod {
  readonly id: string;
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly isBreak: boolean;
}

export interface TtSlot {
  readonly day: number;
  readonly periodId: string;
  readonly subject: { readonly id: string; readonly name: string; readonly colour: string };
  readonly teacher: { readonly id: string; readonly name: string };
}

/** ACA-024: a section's week, with the mapped subjects and their assigned teachers. */
export interface Timetable {
  readonly year: YearRef;
  readonly section: { readonly id: string; readonly label: string };
  readonly days: readonly { day: number; label: string }[];
  readonly periods: readonly TtPeriod[];
  readonly slots: readonly TtSlot[];
  readonly subjects: readonly {
    id: string;
    code: string;
    name: string;
    colour: string;
    teachers: readonly { id: string; name: string }[];
  }[];
  readonly version: number;
}

export interface SlotInput {
  readonly day: number;
  readonly periodId: string;
  readonly subjectId: string;
  readonly teacherId: string;
}

export interface Clash {
  readonly teacher: { readonly id: string; readonly name: string };
  readonly day: number;
  readonly period: { readonly id: string; readonly name: string };
  readonly sections: readonly { id: string; label: string; subject: string }[];
}

/** ACA-026: the year's clashes, and one teacher's week when asked. */
export interface ClashList {
  readonly year: YearRef;
  readonly clashes: readonly Clash[];
  readonly teacherWeek:
    | readonly {
        day: number;
        periodId: string;
        section: { id: string; label: string };
        subject: { name: string; colour: string };
      }[]
    | null;
}

/**
 * The timetable sheet's row report. A class-section with a refused row is skipped whole (its other
 * rows say so); a row with neither subject nor teacher is a free period.
 */
export interface TimetableUploadReport {
  readonly committed: boolean;
  readonly year: YearRef;
  readonly accepted: number;
  readonly rejected: number;
  /** Class-sections whose week is (or would be) replaced. */
  readonly sections: number;
  readonly skippedSections: number;
  readonly lessons: number;
  readonly rows: readonly {
    row: number;
    className: string;
    section: string;
    day: string;
    period: string;
    subject: string;
    teacher: string;
    teacherName: string | null;
    accepted: boolean;
    outcome: 'LESSON' | 'FREE' | null;
    code: string | null;
    params: Readonly<Record<string, string>>;
  }[];
}

@Injectable({ providedIn: 'root' })
export class TimetableApi {
  private readonly http = inject(HttpClient);

  timetable(sectionId: string, yearId?: string) {
    return firstValueFrom(
      this.http.get<Timetable>(`/api/v1/console/timetables/${sectionId}`, {
        params: yearId ? { yearId } : {},
      }),
    );
  }

  /** ACA-025: the section's whole week is saved at once (If-Match). */
  save(sectionId: string, version: number, slots: readonly SlotInput[], yearId?: string) {
    return firstValueFrom(
      this.http.put<Timetable>(
        `/api/v1/console/timetables/${sectionId}`,
        { ...(yearId ? { yearId } : {}), slots },
        { headers: { 'If-Match': `"v${version}"` } },
      ),
    );
  }

  clashes(yearId?: string, teacherId?: string) {
    return firstValueFrom(
      this.http.get<ClashList>('/api/v1/console/timetables/clashes', {
        params: { ...(yearId ? { yearId } : {}), ...(teacherId ? { teacherId } : {}) },
      }),
    );
  }

  /** The sheet: commit false checks every row; commit true replaces the weeks it carries. */
  upload(file: File, commit: boolean, key: string, yearId?: string) {
    const form = new FormData();
    form.set('commit', String(commit));
    if (yearId) form.set('yearId', yearId);
    form.set('file', file, file.name);
    return firstValueFrom(
      this.http.post<TimetableUploadReport>('/api/v1/console/timetables/uploads', form, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }

  /** The sheet's template (CSV): every class-section, day and teaching period, with the lessons. */
  template(year?: { readonly id: string; readonly label: string } | null) {
    const q = year ? `?${new URLSearchParams({ yearId: year.id }).toString()}` : '';
    return downloadFile(
      this.http,
      `/api/v1/console/timetables/uploads/template${q}`,
      `campusone-timetable${year ? '-' + year.label : ''}.csv`,
    );
  }
}
