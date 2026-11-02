/**
 * Console announcements (COM-001…006): the year's announcements with their dispatch and
 * acknowledgement counts, sending one (now or at a chosen time) to groups over the institution's
 * channels, its detail with the per-channel outcomes, who has acknowledged, a reminder to those who
 * haven't, and withdrawing it (kept on record).
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';
import { SURFACE_HEADER } from '../../../Utils/web-session';

export type Channel = 'IN_APP' | 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PUSH';
export type Group = 'ALL' | 'STUDENTS' | 'PARENTS' | 'TEACHERS' | 'STAFF';
export type DispatchStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Category {
  readonly code: string;
  readonly label: string;
  readonly colour: string;
}

export interface Announcement {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly text: string;
  readonly category: Category;
  readonly important: boolean;
  readonly ackRequired: boolean;
  readonly channels: readonly Channel[];
  readonly targets: {
    readonly groups: readonly Group[];
    readonly classIds?: readonly string[];
    readonly sectionIds?: readonly string[];
    readonly userTypeIds?: readonly string[];
  };
  readonly source: string;
  readonly classSection: string | null;
  readonly author: string | null;
  readonly sendAt: string;
  readonly scheduled: boolean;
  readonly dispatch: {
    readonly status: DispatchStatus;
    readonly recipients: number;
    readonly success: number;
    readonly skipped: number;
    readonly failed: number;
    readonly at: string | null;
    readonly reason: string | null;
  };
  readonly acknowledgements: { readonly acknowledged: number; readonly of: number } | null;
  readonly withdrawn: { readonly at: string; readonly reason: string } | null;
  readonly createdAt: string;
  readonly version: number;
}

export interface AnnouncementDetail extends Announcement {
  readonly perChannel: readonly {
    readonly channel: Channel;
    readonly success: number;
    readonly skipped: number;
    readonly failed: number;
  }[];
}

export interface AnnouncementList {
  readonly categories: readonly Category[];
  /** The channels switched on for the institution. */
  readonly channels: readonly Channel[];
  readonly items: readonly Announcement[];
  readonly nextCursor: string | null;
}

export interface Ack {
  readonly member: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
    readonly class: string | null;
    readonly section: string | null;
    readonly type: string;
  };
  readonly acknowledgedAt: string | null;
  readonly channel: string | null;
}

export interface AckPage {
  readonly items: readonly Ack[];
  readonly nextCursor: string | null;
}

export interface NewAnnouncement {
  readonly title: string;
  readonly text: string;
  readonly category: string;
  readonly important: boolean;
  readonly ackRequired: boolean;
  readonly targets: { readonly groups: readonly Group[] };
  readonly channels: readonly Channel[];
  readonly sendAt?: string | null;
  readonly attachmentFileId?: string | null;
}

const BASE = '/api/v1/console/announcements';
const clean = (p: Record<string, string | undefined | null>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => !!v)) as Record<string, string>;

@Injectable({ providedIn: 'root' })
export class AnnouncementsApi {
  private readonly http = inject(HttpClient);

  list(q: { yearId?: string; category?: string; cursor?: string | null }) {
    return firstValueFrom(this.http.get<AnnouncementList>(BASE, { params: clean(q) }));
  }

  get(id: string) {
    return firstValueFrom(this.http.get<AnnouncementDetail>(`${BASE}/${encodeURIComponent(id)}`));
  }

  create(body: NewAnnouncement) {
    return firstValueFrom(
      this.http.post<Announcement>(BASE, body, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }

  withdraw(a: Pick<Announcement, 'id' | 'version'>, reason: string) {
    return firstValueFrom(
      this.http.patch<AnnouncementDetail>(
        `${BASE}/${encodeURIComponent(a.id)}`,
        { withdrawn: true, reason },
        { headers: { 'If-Match': `"v${a.version}"` } },
      ),
    );
  }

  acknowledgements(id: string, q: { acked?: 'true' | 'false'; cursor?: string | null } = {}) {
    return firstValueFrom(
      this.http.get<AckPage>(`${BASE}/${encodeURIComponent(id)}/acknowledgements`, {
        params: clean(q),
      }),
    );
  }

  remind(id: string, channels: readonly Channel[]) {
    return firstValueFrom(
      this.http.post<{ reminded: number }>(
        `${BASE}/${encodeURIComponent(id)}/reminders`,
        { channels },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }

  /** The attachment (2 MB, PDF or image, CR-07) through the shared file store. */
  upload(file: File) {
    const form = new FormData();
    form.append('purpose', 'document');
    form.append('file', file);
    return firstValueFrom(
      this.http.post<{ fileId: string }>('/api/v1/files', form, {
        headers: { [SURFACE_HEADER]: 'console' },
      }),
    );
  }
}
