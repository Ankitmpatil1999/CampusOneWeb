/**
 * The teacher's homework and class announcements (ACA-048…051, ACA-075, COM-022/023/027…029) — the
 * app's teacher routes, reached with the console session.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SURFACE_HEADER } from '../../../Utils/web-session';
import { TeachingHttp } from './teaching.http';

export type HomeworkKind = 'HOMEWORK' | 'CLASSWORK';
export type HomeworkFilter = 'all' | 'review' | HomeworkKind;
export interface FileRef {
  readonly name: string;
  readonly sizeBytes: number;
  readonly url: string | null;
}
export interface Homework {
  readonly id: string;
  readonly kind: HomeworkKind;
  readonly title: string;
  readonly instructions: string;
  readonly section: { readonly id: string; readonly label: string };
  readonly subject: { readonly id: string; readonly name: string; readonly colour: string };
  readonly dueAt: string;
  readonly dueDate: string;
  readonly closed: boolean;
  readonly wholeClass: boolean;
  readonly file: FileRef | null;
  readonly link: string | null;
  readonly counts: {
    readonly students: number;
    readonly reviewed: number;
    readonly toReview: number;
    readonly notSubmitted: number;
  };
  readonly createdAt: string;
  readonly version: number;
}
export interface HomeworkChoice {
  readonly section: { readonly id: string; readonly label: string };
  readonly subject: { readonly id: string; readonly name: string };
  readonly classTeacher: boolean;
  readonly students: number;
}
export interface HomeworkList {
  readonly year: { readonly id: string; readonly label: string };
  readonly counts: {
    readonly all: number;
    readonly review: number;
    readonly homework: number;
    readonly classwork: number;
  };
  readonly grades: readonly string[];
  readonly items: readonly Homework[];
  readonly choices: readonly HomeworkChoice[];
}
export interface Submission {
  readonly id: string;
  readonly status: 'SUBMITTED' | 'REVIEWED';
  readonly late: boolean;
  readonly submittedAt: string | null;
  readonly file: FileRef | null;
  readonly link: string | null;
  readonly note: string | null;
  readonly grade: string | null;
  readonly feedback: string | null;
  readonly reviewedAt: string | null;
  readonly version: number;
}
export interface SubmissionRow {
  readonly student: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
  };
  readonly record: string;
  readonly submission: Submission | null;
}
export interface Submissions {
  readonly homework: Homework;
  readonly grades: readonly string[];
  readonly rows: readonly SubmissionRow[];
}
export interface HomeworkInput {
  readonly classSectionId: string;
  readonly subjectId: string;
  readonly type: HomeworkKind;
  readonly title: string;
  readonly instructions: string;
  readonly dueDate: string;
  readonly fileId?: string | null;
  readonly link?: string | null;
  /** Chosen students of the section (client 2026-10-15); left out for the whole class. */
  readonly studentIds?: readonly string[];
}

export interface ClassAnnouncement {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly text: string;
  readonly ackRequired: boolean;
  readonly classSection: string | null;
  readonly sendAt: string;
  readonly dispatch: {
    readonly status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    readonly recipients: number;
    readonly success: number;
    readonly failed: number;
  };
  readonly acknowledgements: { readonly acknowledged: number; readonly of: number } | null;
  readonly withdrawn: { readonly at: string; readonly reason: string } | null;
  readonly createdAt: string;
}
export interface AckRow {
  readonly member: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
    readonly class: string | null;
    readonly section: string | null;
    readonly type: string;
  };
  readonly acknowledgedAt: string | null;
}
export interface AnnounceOptions {
  readonly limits: {
    readonly titleMin: number;
    readonly titleMax: number;
    readonly textMin: number;
    readonly textMax: number;
  };
}

@Injectable({ providedIn: 'root' })
export class WorkApi {
  private readonly http = inject(TeachingHttp);
  private readonly raw = inject(HttpClient);

  homework(filter: HomeworkFilter, sectionId: string | null = null) {
    return this.http.get<HomeworkList>('/teacher/homework', { filter, classSectionId: sectionId });
  }
  setHomework(input: HomeworkInput) {
    return this.http.send<Homework>('POST', '/teacher/homework', input);
  }
  submissions(id: string) {
    return this.http.get<Submissions>(`/teacher/homework/${encodeURIComponent(id)}/submissions`);
  }
  remind(id: string) {
    return this.http.send<{ students: number; notifications: number }>(
      'POST',
      `/teacher/homework/${encodeURIComponent(id)}/reminders`,
      {},
    );
  }
  review(submissionId: string, version: number, grade: string, feedback: string | null) {
    return this.http.send<SubmissionRow>(
      'PATCH',
      `/teacher/submissions/${encodeURIComponent(submissionId)}`,
      { grade, feedback },
      { version },
    );
  }
  /** The material (2 MB, PDF or image, CR-07) through the shared file store. */
  upload(file: File) {
    const form = new FormData();
    form.append('purpose', 'document');
    form.append('file', file);
    return firstValueFrom(
      this.raw.post<{ fileId: string }>('/api/v1/files', form, {
        headers: { [SURFACE_HEADER]: 'console' },
      }),
    );
  }

  announcements() {
    return this.http.get<{ items: readonly ClassAnnouncement[] }>('/teacher/class-announcements');
  }
  options() {
    return this.http.get<AnnounceOptions>('/me/announcement-options');
  }
  announce(input: { classSectionId: string; title: string; text: string; ackRequired: boolean }) {
    return this.http.send<{ announcementId: string; recipientsEstimated: number; sendAt: string }>(
      'POST',
      '/teacher/class-announcements',
      input,
    );
  }
  acknowledgements(id: string, acked: boolean | null) {
    return this.http.get<{ items: readonly AckRow[]; nextCursor: string | null }>(
      `/teacher/class-announcements/${encodeURIComponent(id)}/acknowledgements`,
      { acked: acked === null ? null : String(acked) },
    );
  }
  remindAnnouncement(id: string) {
    return this.http.send<{ reminded: number }>(
      'POST',
      `/teacher/class-announcements/${encodeURIComponent(id)}/reminders`,
      {},
    );
  }
}
