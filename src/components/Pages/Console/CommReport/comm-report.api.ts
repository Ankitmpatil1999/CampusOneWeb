/**
 * The communication report (COM-007, COM-008, CR-16): every message sent for the institution —
 * kind, channel, who raised it, the recipient, subject, outcome and reason (never a direct message's
 * text or a one-time code) — with totals over the filtered set, the date from which the record is
 * complete, and a CSV export of exactly the filtered rows (read through RPT-005).
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { translate } from '../../../Utils/translate';
import { newIdempotencyKey } from '../../../Utils/ids';

export type CommKind = 'ANNOUNCEMENT' | 'DIRECT_MESSAGE' | 'NOTIFICATION' | 'OTP' | 'TRANSACTIONAL';
export type CommChannel = 'IN_APP' | 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PUSH';
export type CommOutcome = 'SUCCESS' | 'SKIPPED' | 'FAILED';

export interface CommRow {
  readonly id: string;
  readonly at: string;
  readonly kind: CommKind;
  readonly channel: CommChannel;
  readonly raisedBy: { readonly name: string | null; readonly event: string | null };
  readonly recipient: { readonly name: string | null; readonly address: string | null };
  /** null for a direct message (its text is never reported). */
  readonly subject: string | null;
  readonly outcome: CommOutcome;
  readonly reason: string | null;
}

export interface CommReport {
  readonly period: { readonly from: string; readonly to: string };
  readonly completeFrom: string;
  readonly retention: {
    readonly purging: boolean;
    readonly successDays: number;
    readonly failedDays: number;
  };
  readonly unrecorded: number;
  readonly totals: {
    readonly attempts: number;
    readonly byKind: Readonly<Partial<Record<CommKind, number>>>;
    readonly byChannel: Readonly<Partial<Record<CommChannel, number>>>;
    readonly byOutcome: Readonly<Partial<Record<CommOutcome, number>>>;
    readonly recipients: number;
    readonly failedShare: number;
  };
  readonly items: readonly CommRow[];
  readonly nextCursor: string | null;
}

export interface CommFilters {
  readonly from?: string;
  readonly to?: string;
  readonly kind?: CommKind | '';
  readonly channel?: CommChannel | '';
  readonly outcome?: CommOutcome | '';
}

const clean = (p: Record<string, string | undefined | null>) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => !!v)) as Record<string, string>;

@Injectable({ providedIn: 'root' })
export class CommReportApi {
  private readonly http = inject(HttpClient);

  list(f: CommFilters, cursor: string | null = null) {
    return firstValueFrom(
      this.http.get<CommReport>('/api/v1/console/communication-log', {
        params: clean({ ...f, cursor, limit: '50' }),
      }),
    );
  }

  exportLog(f: CommFilters) {
    return firstValueFrom(
      this.http.post<{ exportId: string; status: string }>(
        '/api/v1/console/communication-log/exports',
        { filters: clean({ ...f }) },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }
}

/** The prototype's kinds (KINDS, KIND_TONE). */
export const KINDS: readonly { v: CommKind; l: string; many: string; tone: string }[] = [
  { v: 'ANNOUNCEMENT', l: 'Announcement', many: 'Announcements', tone: 'brand' },
  { v: 'NOTIFICATION', l: 'Notification', many: 'Notifications', tone: 'info' },
  { v: 'DIRECT_MESSAGE', l: 'Direct message', many: 'Direct messages', tone: 'violet' },
  { v: 'OTP', l: 'One-time password', many: 'One-time passwords', tone: 'accent' },
  { v: 'TRANSACTIONAL', l: 'Operational alert', many: 'Operational alerts', tone: 'neutral' },
];
export const kindOf = (k: string) =>
  KINDS.find((x) => x.v === k) ?? { v: k as CommKind, l: k, many: k, tone: 'neutral' };

/** The outcome as the register names it (status.commLog.*). */
export const OUTCOME: Readonly<Record<CommOutcome, { l: () => string; tone: string }>> = {
  SUCCESS: { l: () => translate('status.commLog.success'), tone: 'ok' },
  SKIPPED: { l: () => translate('status.commLog.skipped'), tone: 'neutral' },
  FAILED: { l: () => translate('status.commLog.failed'), tone: 'bad' },
};
