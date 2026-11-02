/**
 * Support desk API (GRV-011…013; SRS 16, FR-GRV-04; RNG-GOV-008): tickets by number or mobile
 * across institutions, a member's last transactions, and a support call log. Every look-up needs a
 * reason, which the server records with the access.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  CallDirection,
  CallLog,
  MemberTxn,
  Ticket,
} from '../../Console/Grievances/grievances.api';

/** GRV-011: a ticket with the institution it belongs to. */
export interface SupportTicket extends Ticket {
  readonly institution: { readonly id: string; readonly name: string };
}

/** GRV-012: the member's last five movements and their total count. */
export interface SupportTransactions {
  readonly institution: { readonly id: string; readonly name: string };
  readonly member: { readonly id: string; readonly name: string };
  readonly total: number;
  readonly items: readonly MemberTxn[];
}

/** GRV-013 body. */
export interface SupportCallInput {
  readonly institutionId: string;
  readonly ticketId?: string | null;
  readonly direction: CallDirection;
  readonly caller: string;
  readonly minutes: number;
  readonly summary: string;
}

@Injectable({ providedIn: 'root' })
export class SupportApi {
  private readonly http = inject(HttpClient);

  /** GRV-011: at most 20, newest first; recorded with the reason. */
  tickets(q: { ticketNo?: string; mobile?: string; institutionId?: string; reason: string }) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) if (v) params = params.set(k, String(v));
    return firstValueFrom(
      this.http.get<{ items: readonly SupportTicket[] }>('/api/v1/ops/support/tickets', { params }),
    );
  }

  /** GRV-012: recorded with the reason. */
  transactions(institutionId: string, memberId: string, reason: string) {
    return firstValueFrom(
      this.http.get<SupportTransactions>(
        `/api/v1/ops/support/members/${encodeURIComponent(institutionId)}/${encodeURIComponent(memberId)}/transactions`,
        { params: new HttpParams().set('reason', reason) },
      ),
    );
  }

  /** GRV-013. */
  logCall(body: SupportCallInput, key: string) {
    return firstValueFrom(
      this.http.post<CallLog>('/api/v1/ops/support/call-logs', body, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }
}
