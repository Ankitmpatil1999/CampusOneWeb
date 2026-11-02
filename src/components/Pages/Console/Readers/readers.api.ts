/** Console readers and POS terminals API (INS-030…034, MER-012). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

/** What a terminal is for (RC-16): the reader shows it, and every capture records it. */
export type TerminalPurpose =
  | 'ATTENDANCE'
  | 'PERIOD_ATTENDANCE'
  | 'LOCATION'
  | 'COUPON'
  | 'BALANCE_CHECK'
  | 'CARD_ISSUE'
  | 'POS';

/** The register's terminal statuses (RC-29). Online, offline and awaiting pairing are derived. */
export type TerminalStatus = 'ACTIVE' | 'DISABLED';

/** INS-030: one reader or POS terminal. */
export interface Terminal {
  readonly id: string;
  readonly name: string;
  readonly location: string | null;
  readonly purpose: TerminalPurpose;
  /** Coupon counters and POS terminals: the merchant. */
  readonly merchant: { readonly id: string; readonly name: string } | null;
  /** Period attendance: the class section ("Grade 6 A"). */
  readonly section: { readonly id: string; readonly name: string } | null;
  /** Location attendance: library, laboratory … */
  readonly locationType: string | null;
  readonly status: TerminalStatus;
  readonly statusReason: string | null;
  readonly paired: boolean;
  readonly pairedAt: string | null;
  /** The last characters of the device fingerprint ("…A1B2C3"). */
  readonly device: string | null;
  readonly lastSeenAt: string | null;
  /** Seen within the setting trm.online.minutes (INS-030). */
  readonly online?: boolean;
  readonly version: number;
}

/** INS-031 body; INS-032 takes any part of it (If-Match). */
export interface TerminalInput {
  readonly name: string;
  readonly location?: string | null;
  readonly purpose: TerminalPurpose;
  readonly merchantId?: string | null;
  readonly sectionId?: string | null;
  readonly locationType?: string | null;
}

/** INS-033: shown once; valid for trm.pairing.minutes. */
export interface PairingCode {
  readonly code: string;
  readonly expiresAt: string;
}

/** MER-012: a POS counter with today's figures. */
export interface PosCounter {
  readonly id: string;
  readonly name: string;
  readonly location: string | null;
  readonly status: TerminalStatus;
  readonly merchant: string | null;
  readonly outlet: string | null;
  /** The operator signed in at the counter now. */
  readonly operator: string | null;
  readonly lastSeenAt: string | null;
  readonly lastSyncAt: string | null;
  readonly today: {
    readonly orders: number;
    readonly paid: number;
    readonly collected: Money;
    readonly unpaid: number;
    readonly offlineAccepted: number;
    readonly offlineRefused: number;
  };
}

@Injectable({ providedIn: 'root' })
export class ReadersApi {
  private readonly http = inject(HttpClient);

  /** INS-030: every reader and POS terminal of the institution, by name. */
  list(q: { purpose?: TerminalPurpose; status?: TerminalStatus } = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) if (v) params = params.set(k, String(v));
    return firstValueFrom(
      this.http.get<{ items: Terminal[] }>('/api/v1/console/readers', { params }),
    );
  }

  /** INS-031: register a reader or POS terminal (Idempotency-Key: a retry never registers twice). */
  register(body: TerminalInput, key: string = newIdempotencyKey()) {
    return firstValueFrom(
      this.http.post<{ readerId: string }>('/api/v1/console/readers', body, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }

  /** INS-032: rename, move or change the purpose; the history is kept. */
  update(t: { id: string; version: number }, body: Partial<TerminalInput>) {
    return firstValueFrom(
      this.http.patch<Terminal>(`/api/v1/console/readers/${t.id}`, body, {
        headers: { 'If-Match': `"v${t.version}"` },
      }),
    );
  }

  /** INS-033: a one-time pairing code; pairing with it replaces the device paired before. */
  pairingCode(id: string) {
    return firstValueFrom(
      this.http.post<PairingCode>(
        `/api/v1/console/readers/${id}/pairing-codes`,
        {},
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }

  /** INS-034: disable (a reason; the device must pair again) or enable. */
  status(id: string, body: { enabled: boolean; reason?: string | null }) {
    return firstValueFrom(this.http.post<Terminal>(`/api/v1/console/readers/${id}/status`, body));
  }

  /** MER-012: the POS counters with today's orders, collections and offline outcomes. */
  pos() {
    return firstValueFrom(
      this.http.get<{ date: string; items: PosCounter[] }>('/api/v1/console/pos-terminals'),
    );
  }
}
