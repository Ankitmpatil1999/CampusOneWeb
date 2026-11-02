/**
 * Console accounting API (FEE-034…037; SRS 13.13, FR-INT-06): the vouchers written for the
 * institution's accounting package, a retry, and the company with the ledger mapping. The package
 * is an example contract until it is chosen (OQ-04): `mode: test` means it is simulated.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

/** The voucher register (RC-36): Pending Transfer, Transferred, Failed. */
export type VoucherStatus = 'PENDING' | 'TRANSFERRED' | 'FAILED';
/** The postings an institution can send to its books. */
export type AccountingEvent = 'TUITION' | 'EVENT' | 'ALLOWANCE_CREDIT' | 'REFUND';
/** test: the package is simulated (OQ-04 open); off: nothing is sent. */
export type PackageMode = 'test' | 'off';

/** FEE-034: one voucher (one mapped ledger posting). */
export interface Voucher {
  readonly id: string;
  /** The posting's ledger reference. */
  readonly reference: string;
  readonly event: AccountingEvent;
  readonly eventLabel: string;
  /** The voucher date ("YYYY-MM-DD"). */
  readonly date: string;
  readonly amount: Money;
  readonly company: string;
  readonly debitLedger: string;
  readonly creditLedger: string;
  readonly narration: string | null;
  readonly status: VoucherStatus;
  readonly statusLabel: string;
  readonly attempts: number;
  readonly lastError: string | null;
  /** The next automatic try of a failed voucher; null when none is left. */
  readonly nextAttemptAt: string | null;
  readonly externalRef: string | null;
  readonly transferredAt: string | null;
  readonly createdAt: string | null;
  readonly version: number;
}

export interface VoucherList {
  readonly mode: PackageMode;
  readonly counts: {
    readonly pending: number;
    readonly transferred: number;
    readonly failed: number;
  };
  readonly items: readonly Voucher[];
  readonly nextCursor: string | null;
}

/** FEE-036: the company, transfers on or off, and each posting's ledgers (ETag; version 0 = none). */
export interface Mappings {
  readonly mode: PackageMode;
  readonly company: string | null;
  readonly enabled: boolean;
  readonly enabledAt: string | null;
  readonly events: readonly {
    readonly event: AccountingEvent;
    readonly label: string;
    readonly debitLedger: string | null;
    readonly creditLedger: string | null;
  }[];
  readonly version: number;
}

/** FEE-037 body. */
export interface MappingsInput {
  readonly companyName: string;
  readonly enabled: boolean;
  readonly mappings: readonly {
    readonly event: AccountingEvent;
    readonly debitLedger: string;
    readonly creditLedger: string;
  }[];
}

export interface VoucherQuery {
  readonly status?: VoucherStatus;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
}

@Injectable({ providedIn: 'root' })
export class VouchersApi {
  private readonly http = inject(HttpClient);

  /** FEE-034: newest first, 50 at a time, with the counts by status. */
  list(q: VoucherQuery = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== '') params = params.set(k, String(v));
    }
    return firstValueFrom(
      this.http.get<VoucherList>('/api/v1/console/accounting/vouchers', { params }),
    );
  }

  /** FEE-035: send a failed voucher again now (202 with the voucher as it is after the try). */
  retry(id: string, key: string) {
    return firstValueFrom(
      this.http.post<Voucher>(
        `/api/v1/console/accounting/vouchers/${encodeURIComponent(id)}/retries`,
        {},
        { headers: { 'Idempotency-Key': key } },
      ),
    );
  }

  /** FEE-036. */
  mappings() {
    return firstValueFrom(this.http.get<Mappings>('/api/v1/console/accounting/mappings'));
  }

  /** FEE-037 (If-Match; "v0" when nothing is set yet). */
  saveMappings(version: number, body: MappingsInput) {
    return firstValueFrom(
      this.http.put<Mappings>('/api/v1/console/accounting/mappings', body, {
        headers: { 'If-Match': `"v${version}"` },
      }),
    );
  }
}
