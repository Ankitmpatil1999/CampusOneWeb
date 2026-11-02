/** Console events API (FEE-028…031). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import { newIdempotencyKey } from '../../../Utils/ids';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

export type EventStatus = 'ACTIVE' | 'INACTIVE';

/** FEE-028: one paid event. The payee is the institution's fee account. */
export interface PaidEvent {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly startDate: string;
  /** Inclusive to 23:59:59 IST. */
  readonly endDate: string;
  readonly heads: readonly { readonly name: string; readonly amount: Money }[];
  readonly total: Money;
  readonly merchant: string;
  /** null: the whole institution. */
  readonly audience: readonly { readonly id: string; readonly name: string }[] | null;
  readonly status: EventStatus;
  readonly payments: { readonly count: number; readonly collected: Money };
  readonly createdAt: string;
  readonly version: number;
}

export interface EventList {
  readonly items: readonly PaidEvent[];
  readonly kpis: {
    readonly live: number;
    readonly upcoming: number;
    readonly collected: Money;
    readonly payments: number;
  };
}

/** FEE-029 body; FEE-030 takes any part of it plus a status (If-Match). */
export interface EventInput {
  readonly title: string;
  readonly description?: string | null;
  readonly startDate: string;
  readonly endDate: string;
  readonly heads: readonly { readonly name: string; readonly amount: Money }[];
  /** Class ids; null or empty: the whole institution. */
  readonly audienceClassIds?: readonly string[] | null;
}

export type EventPatch = Partial<EventInput> & { readonly status?: EventStatus };

/** FEE-031: the event's payments (successful and failed). */
export interface EventReport {
  readonly event: { readonly id: string; readonly title: string };
  readonly totals: { readonly paid: number; readonly failed: number; readonly collected: Money };
  readonly items: readonly {
    readonly reference: string;
    readonly payer: string;
    readonly admissionNo: string | null;
    readonly grade: string | null;
    readonly amount: Money;
    readonly status: 'SUCCESS' | 'FAILURE';
    readonly failureCode: string | null;
    readonly at: string;
  }[];
}

const params = (q: object) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
};

@Injectable({ providedIn: 'root' })
export class EventsApi {
  private readonly http = inject(HttpClient);

  /** FEE-028: the events with the key figures. */
  list(q: { status?: EventStatus } = {}) {
    return firstValueFrom(
      this.http.get<EventList>('/api/v1/console/events', { params: params(q) }),
    );
  }

  /** FEE-029 (Idempotency-Key: a retry never creates twice). */
  create(body: EventInput, key: string = newIdempotencyKey()) {
    return firstValueFrom(
      this.http.post<PaidEvent>('/api/v1/console/events', body, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }

  /** FEE-030: edit, activate or deactivate (heads and start date only before the first payment). */
  update(e: { id: string; version: number }, body: EventPatch) {
    return firstValueFrom(
      this.http.patch<PaidEvent>(`/api/v1/console/events/${e.id}`, body, {
        headers: { 'If-Match': `"v${e.version}"` },
      }),
    );
  }

  /** FEE-031. */
  report(id: string, q: { from?: string; to?: string; status?: 'SUCCESS' | 'FAILURE' } = {}) {
    return firstValueFrom(
      this.http.get<EventReport>(`/api/v1/console/events/${id}/report`, { params: params(q) }),
    );
  }

  /** FEE-031 as CSV (the server names the file; ours is the fallback). */
  reportCsv(e: { id: string; title: string }) {
    return downloadFile(
      this.http,
      `/api/v1/console/events/${e.id}/report?format=csv`,
      `${e.title.replace(/[^A-Za-z0-9]+/g, '_')}_payments.csv`,
    );
  }
}
