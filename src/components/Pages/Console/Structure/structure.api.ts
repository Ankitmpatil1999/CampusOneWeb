/**
 * Console academic structure API: classes and sections (ACA-009…011), the class sheet (ACA-014),
 * subjects (ACA-015…017), the subjects each class studies (ACA-018) and the bell schedule
 * (ACA-019/020).
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export interface SectionView {
  readonly id: string;
  readonly name: string;
  readonly capacity: number | null;
  /** Active students placed in the section this (current) year. */
  readonly students: number;
}

export interface ClassView {
  readonly id: string;
  readonly name: string;
  /** Promotion order, from 0 (shown from 1, as the prototype). */
  readonly order: number;
  readonly sections: readonly SectionView[];
  readonly students: number;
  readonly version: number;
}

export interface ClassList {
  readonly year: { readonly id: string; readonly label: string } | null;
  readonly items: readonly ClassView[];
}

export interface SectionInput {
  /** Present for a kept (possibly renamed) section; absent for a new one. */
  readonly id?: string;
  readonly name: string;
  readonly capacity?: number | null;
}

export interface ClassInput {
  readonly name: string;
  readonly order: number;
  readonly sections: readonly SectionInput[];
}

/** ACA-015: a subject with the classes it is mapped to, the year's teachers and periods a week. */
export interface SubjectView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly colour: string;
  readonly classes: number;
  readonly teachers: number;
  readonly periodsAWeek: number;
  readonly version: number;
}

export interface SubjectList {
  readonly year: { readonly id: string; readonly label: string } | null;
  readonly items: readonly SubjectView[];
}

/** ACA-018: the subjects a class studies; `version` is the class's (If-Match). */
export interface ClassSubjects {
  readonly class: { readonly id: string; readonly name: string };
  readonly subjects: readonly { id: string; code: string; name: string }[];
  readonly version: number;
}

/** ACA-019: a period or break of the bell schedule. */
export interface PeriodView {
  readonly id: string;
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly isBreak: boolean;
  readonly minutes: number;
  readonly timetableSlots: number;
}

export interface PeriodList {
  readonly items: readonly PeriodView[];
  readonly summary: {
    readonly teachingPeriods: number;
    readonly teachingMinutes: number;
    readonly breakMinutes: number;
  };
  readonly version: number;
}

export interface PeriodInput {
  readonly id?: string;
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly isBreak: boolean;
}

/** ACA-014: the class sheet's row report. */
export interface ClassUploadReport {
  readonly committed: boolean;
  readonly accepted: number;
  readonly rejected: number;
  readonly created: number;
  readonly extended: number;
  readonly rows: readonly {
    row: number;
    className: string;
    sections: readonly string[];
    newSections: readonly string[];
    accepted: boolean;
    code: string | null;
  }[];
}

const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });
const ifMatch = (version: number) => ({ 'If-Match': `"v${version}"` });

@Injectable({ providedIn: 'root' })
export class StructureApi {
  private readonly http = inject(HttpClient);

  classes() {
    return firstValueFrom(this.http.get<ClassList>('/api/v1/console/classes'));
  }

  createClass(body: ClassInput) {
    return firstValueFrom(
      this.http.post<ClassView>('/api/v1/console/classes', body, { headers: once() }),
    );
  }

  /** Renames or reorders a class and sets its sections (a section with students is kept). */
  changeClass(id: string, version: number, body: ClassInput) {
    return firstValueFrom(
      this.http.patch<ClassView>(`/api/v1/console/classes/${id}`, body, {
        headers: ifMatch(version),
      }),
    );
  }

  /** ACA-014: commit false checks every row; commit true imports the accepted rows. */
  uploadClasses(file: File, commit: boolean, key: string) {
    const form = new FormData();
    form.set('commit', String(commit));
    form.set('file', file, file.name);
    return firstValueFrom(
      this.http.post<ClassUploadReport>('/api/v1/console/classes/uploads', form, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }

  subjects(yearId?: string) {
    return firstValueFrom(
      this.http.get<SubjectList>('/api/v1/console/subjects', {
        params: yearId ? { yearId } : {},
      }),
    );
  }

  createSubject(body: { code: string; name: string; colour: string }) {
    return firstValueFrom(
      this.http.post<SubjectView>('/api/v1/console/subjects', body, { headers: once() }),
    );
  }

  changeSubject(id: string, version: number, body: { name: string; colour: string }) {
    return firstValueFrom(
      this.http.patch<SubjectView>(`/api/v1/console/subjects/${id}`, body, {
        headers: ifMatch(version),
      }),
    );
  }

  classSubjects(classId: string) {
    return firstValueFrom(
      this.http.get<ClassSubjects>(`/api/v1/console/classes/${classId}/subjects`),
    );
  }

  setClassSubjects(classId: string, version: number, subjectIds: readonly string[]) {
    return firstValueFrom(
      this.http.put<ClassSubjects>(
        `/api/v1/console/classes/${classId}/subjects`,
        { subjectIds },
        { headers: ifMatch(version) },
      ),
    );
  }

  periods() {
    return firstValueFrom(this.http.get<PeriodList>('/api/v1/console/periods'));
  }

  /** ACA-020: the whole bell schedule replaces the old one. */
  setPeriods(version: number, periods: readonly PeriodInput[]) {
    return firstValueFrom(
      this.http.put<PeriodList>(
        '/api/v1/console/periods',
        { periods },
        { headers: ifMatch(version) },
      ),
    );
  }
}
