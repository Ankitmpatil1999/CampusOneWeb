/** The academic calendar (ACA-004…008): one calendar per academic year. */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { YearRef } from '../Structure/academic-year';

export type AudienceKind = 'ALL' | 'CLASS' | 'SECTION' | 'MEMBER';
export type Recurrence = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ReminderCode = 'DAY_BEFORE' | 'HOUR_BEFORE' | 'MORNING_OF';

export interface CalendarEntry {
  readonly id: string;
  readonly type: string;
  readonly holidayType: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly allDay: boolean;
  readonly startDate: string;
  readonly endDate: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly location: string | null;
  readonly audience: {
    readonly kind: AudienceKind;
    readonly targets: readonly { kind: string; id: string; name: string }[];
  };
  readonly recurrence: Recurrence;
  readonly repeatUntil: string | null;
  readonly colour: string;
  readonly reminders: readonly ReminderCode[];
  readonly source: string | null;
  readonly createdBy: string | null;
  readonly createdAt: string | null;
  readonly deleted: { readonly at: string | null } | null;
  readonly version: number;
  /** The dated occurrences inside the asked range (repeats expanded). */
  readonly occurrences?: readonly { start: string; end: string }[];
}

export interface CalendarList {
  readonly year: YearRef;
  readonly from: string;
  readonly to: string;
  readonly types: readonly string[];
  readonly holidayTypes: readonly string[];
  readonly reminders: Readonly<Record<ReminderCode, string>>;
  readonly counts: {
    readonly entries: number;
    readonly holidays: number;
    readonly holidayDays: number;
    readonly exams: number;
  };
  readonly items: readonly CalendarEntry[];
}

export interface EntryInput {
  readonly yearId?: string;
  readonly type: string;
  readonly holidayType?: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly allDay: boolean;
  readonly startDate: string;
  readonly endDate: string;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly location?: string | null;
  readonly audience: { readonly kind: AudienceKind; readonly ids?: readonly string[] };
  readonly recurrence: Recurrence;
  readonly repeatUntil?: string | null;
  readonly colour: string;
  readonly reminders: readonly ReminderCode[];
}

export interface CalendarUploadReport {
  readonly year: YearRef;
  readonly committed: boolean;
  readonly accepted: number;
  readonly rejected: number;
  readonly imported: number;
  readonly rows: readonly {
    row: number;
    type: string;
    title: string;
    startDate: string;
    endDate: string;
    accepted: boolean;
    code: string | null;
  }[];
}

@Injectable({ providedIn: 'root' })
export class CalendarApi {
  private readonly http = inject(HttpClient);

  /** ACA-004: the year's entries, deleted ones included (the list's "Show deleted"). */
  list(yearId?: string) {
    return firstValueFrom(
      this.http.get<CalendarList>('/api/v1/console/calendar-events', {
        params: { ...(yearId ? { yearId } : {}), deleted: 'true' },
      }),
    );
  }

  create(body: EntryInput) {
    return firstValueFrom(
      this.http.post<CalendarEntry>('/api/v1/console/calendar-events', body, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }

  change(id: string, version: number, body: EntryInput | { restore: true }) {
    return firstValueFrom(
      this.http.patch<CalendarEntry>(`/api/v1/console/calendar-events/${id}`, body, {
        headers: { 'If-Match': `"v${version}"` },
      }),
    );
  }

  remove(id: string) {
    return firstValueFrom(this.http.delete<CalendarEntry>(`/api/v1/console/calendar-events/${id}`));
  }

  /** ACA-008: commit false checks every row; commit true imports the accepted rows. */
  upload(file: File, commit: boolean, key: string, yearId?: string) {
    const form = new FormData();
    form.set('commit', String(commit));
    if (yearId) form.set('yearId', yearId);
    form.set('file', file, file.name);
    return firstValueFrom(
      this.http.post<CalendarUploadReport>('/api/v1/console/calendar-events/uploads', form, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }
}
