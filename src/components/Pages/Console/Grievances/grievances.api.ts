/** Console grievances API (GRV-006…010): the ticket queue, a ticket, its update and the call log. */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

/** The ticket register (RC-20). "Awaiting approval" is a pending request, not a status. */
export type TicketStatus =
  'OPEN' | 'ESCALATED_VENDOR' | 'ESCALATED_INTERNAL' | 'RESOLVED' | 'CLOSED';
export type TicketKind = 'TRANSACTION' | 'FEEDBACK' | 'FRAUD';
export type TicketChannel = 'APP' | 'WEB' | 'PHONE';
/** The queue's status filter: a register status, both escalations, or a pending Priority-1 request. */
export type TicketFilter = TicketStatus | 'ESCALATED' | 'AWAITING_APPROVAL';
export type CallDirection = 'INBOUND' | 'OUTBOUND';

/** GRV-006: one ticket of the queue. */
export interface Ticket {
  readonly id: string;
  readonly ticketNo: string;
  readonly kind: TicketKind;
  readonly category: string | null;
  readonly categoryLabel: string | null;
  readonly issue: string;
  readonly channel: TicketChannel;
  readonly status: TicketStatus;
  readonly statusLabel: string;
  readonly priority: number;
  /** The pending Priority-1 (or refund) request, if any. */
  readonly awaitingApproval: string | null;
  readonly reasonCode: string | null;
  readonly resolution: string | null;
  readonly member: { readonly id: string; readonly name: string; readonly mobile: string | null };
  readonly transaction: {
    readonly reference: string;
    readonly type: string | null;
    readonly amount: Money | null;
    readonly at: string | null;
  } | null;
  readonly fraud: { readonly happenedOn: string | null; readonly location: string | null } | null;
  readonly hasAttachment: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly closedAt: string | null;
  readonly ageDays: number;
  /** Not resolved and older than grv.ageing.days. */
  readonly old: boolean;
  readonly version: number;
}

/** A tile of the queue: the count and its share of every ticket (%). */
export interface Tile {
  readonly count: number;
  readonly share: number;
}

/** The reasons offered per status (OI-GRV-10); "OTHER" needs the resolution text. */
export type Reasons = Readonly<
  Record<Exclude<TicketStatus, 'OPEN'>, Readonly<Record<string, string>>>
>;

export interface TicketList {
  readonly tiles: {
    readonly total: number;
    readonly open: Tile;
    readonly escalated: Tile;
    readonly awaitingApproval: Tile;
    readonly resolved: Tile;
    readonly closed: Tile;
    readonly priority1Open: Tile;
    readonly olderThanAgeing: Tile;
    readonly ageingDays: number;
  };
  readonly reasons: Reasons;
  readonly items: readonly Ticket[];
  readonly nextCursor: string | null;
}

export interface HistoryRow {
  readonly status: TicketStatus;
  readonly statusLabel: string;
  readonly priority: number;
  readonly reasonCode: string | null;
  readonly resolution: string | null;
  readonly comment: string | null;
  readonly by: string;
  readonly byType: 'MEMBER' | 'STAFF' | 'OPERATOR' | 'SYSTEM';
  /** Applied by a checker's approval. */
  readonly approved: boolean;
  readonly at: string | null;
}

/** GRV-009: a logged call. */
export interface CallLog {
  readonly id: string;
  readonly direction: CallDirection;
  readonly caller: string;
  readonly minutes: number;
  readonly summary: string;
  /** Logged on the console, or by CampusOne's support desk. */
  readonly source: 'CONSOLE' | 'SUPPORT';
  readonly ticket: { readonly id: string; readonly ticketNo: string | null } | null;
  readonly loggedBy: string | null;
  readonly at: string | null;
}

/** A movement of the member's wallets (FR-GRV-04). */
export interface MemberTxn {
  readonly reference: string;
  readonly type: string;
  readonly direction: 'CREDIT' | 'DEBIT';
  readonly amount: Money;
  readonly remarks: string | null;
  readonly at: string | null;
}

/** GRV-007: the ticket with the member's last five transactions, its history and calls (ETag). */
export interface TicketDetail extends Ticket {
  readonly member: Ticket['member'] & {
    readonly transactions: { readonly total: number; readonly items: readonly MemberTxn[] };
  };
  /** A refund resolution is possible (a ledger movement the institution can refund). */
  readonly refundable: boolean;
  readonly reasons: Reasons;
  /** Newest first. */
  readonly history: readonly HistoryRow[];
  readonly calls: readonly CallLog[];
}

/** GRV-008 body. */
export interface TicketUpdate {
  readonly status: TicketStatus;
  readonly priority: number;
  readonly reasonCode?: string | null;
  readonly resolution?: string | null;
  readonly comment: string;
  /** A refund resolution (Priority 1 only): the amount, or the whole transaction. */
  readonly refund?: { readonly amount?: Money } | null;
}

/** GRV-008: 200 applied (or applied directly), 202 sent for checker approval. */
export interface TicketUpdated {
  readonly approvalId: string | null;
  readonly appliedDirectly: boolean;
  /** GRV.UPDATED or GRV.SENT_FOR_APPROVAL. */
  readonly code: string;
  readonly ticket: TicketDetail;
}

/** GRV-010 body. */
export interface CallInput {
  readonly ticketId?: string | null;
  readonly direction: CallDirection;
  readonly caller: string;
  readonly minutes: number;
  readonly summary: string;
}

export interface TicketQuery {
  readonly status?: TicketFilter;
  readonly priority?: number;
  readonly kind?: TicketKind;
  readonly q?: string;
  readonly cursor?: string;
}

const params = (q: object) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== '' && v !== null) p = p.set(k, String(v));
  }
  return p;
};

@Injectable({ providedIn: 'root' })
export class GrievancesApi {
  private readonly http = inject(HttpClient);

  /** GRV-006: newest first, 50 at a time, with the tiles and the reasons. */
  list(q: TicketQuery = {}) {
    return firstValueFrom(
      this.http.get<TicketList>('/api/v1/console/tickets', { params: params(q) }),
    );
  }

  /** GRV-007. */
  detail(id: string) {
    return firstValueFrom(
      this.http.get<TicketDetail>(`/api/v1/console/tickets/${encodeURIComponent(id)}`),
    );
  }

  /** GRV-008 (If-Match; one Idempotency-Key per attempt, kept by the form for a retry). */
  update(id: string, version: number, body: TicketUpdate, key: string) {
    return firstValueFrom(
      this.http.patch<TicketUpdated>(`/api/v1/console/tickets/${encodeURIComponent(id)}`, body, {
        headers: { 'If-Match': `"v${version}"`, 'Idempotency-Key': key },
      }),
    );
  }

  /** GRV-009: newest first, 50 at a time (optionally one ticket's). */
  calls(q: { ticketId?: string; cursor?: string } = {}) {
    return firstValueFrom(
      this.http.get<{ items: readonly CallLog[]; nextCursor: string | null }>(
        '/api/v1/console/call-logs',
        { params: params(q) },
      ),
    );
  }

  /** GRV-010. */
  logCall(body: CallInput, key: string) {
    return firstValueFrom(
      this.http.post<CallLog>('/api/v1/console/call-logs', body, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }
}
