/** Console settlements API (STL-010, STL-011, STL-014): the institution's view, read-only. */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

/** The settlement register (27.2; RC-35): no "Paid out" — the payout UTR is an attribute of approved. */
export type SettlementStatus = 'PENDING' | 'APPROVAL_STAGE_1' | 'APPROVED' | 'FAILED';

/** Who approved, finally approved or rejected, when, and with which remarks. */
export interface Decision {
  readonly by: string;
  readonly at: string | null;
  readonly remarks: string | null;
}

/** STL-010: one settlement of the list. */
export interface Settlement {
  readonly id: string;
  readonly settlementNo: string;
  readonly institution: { readonly id: string; readonly name: string; readonly identifier: string };
  /** The business date ("YYYY-MM-DD"). */
  readonly date: string;
  /** The end of the run's window (23:30 IST of the date). */
  readonly windowTo: string | null;
  readonly status: SettlementStatus;
  readonly lines: number;
  readonly merchants: number;
  readonly gross: Money;
  readonly fee: Money;
  /** Refunds and chargebacks deducted (Q14 M3). */
  readonly adjustments: Money;
  /** Gross − fee − adjustments; may be negative. */
  readonly net: Money;
  /** Lines of a rejected settlement collected again (Q14 M17). */
  readonly recollected: number;
  readonly stage1: Decision | null;
  readonly final: Decision | null;
  readonly rejection: Decision | null;
  readonly payout: {
    readonly utr: string;
    readonly amount: Money;
    readonly at: string | null;
    readonly by: string;
  } | null;
  readonly createdAt: string | null;
  readonly version: number;
}

export interface SettlementList {
  readonly items: readonly Settlement[];
  readonly nextCursor: string | null;
}

export interface SettlementMerchant {
  readonly id: string;
  readonly uniqueId: string | null;
  readonly name: string;
  readonly lines: number;
  readonly gross: Money;
  readonly fee: Money;
  readonly adjustments: Money;
  readonly net: Money;
  readonly suspended: boolean;
  /** A suspended merchant's lines carried to a later run (Q14 M4). */
  readonly carried: boolean;
  readonly paid: boolean;
}

export interface SettlementLine {
  readonly id: string;
  readonly reference: string;
  readonly merchantId: string;
  readonly type: string;
  /** A refund or chargeback deducted (Q14 M3). */
  readonly adjustment: boolean;
  readonly amount: Money;
  readonly fee: Money;
  readonly net: Money;
  readonly remarks: string | null;
  readonly at: string | null;
  readonly recollected: boolean;
  readonly carried: boolean;
  readonly payoutReference: string | null;
}

/** STL-011: the settlement with its merchants, lines and statement files. */
export interface SettlementDetail extends Settlement {
  readonly payableNow: Money;
  readonly merchantsList: readonly SettlementMerchant[];
  readonly linesList: readonly SettlementLine[];
  readonly statements: readonly {
    readonly fileNo: number;
    readonly kind: string;
    readonly name: string;
  }[];
}

export interface SettlementQuery {
  readonly status?: SettlementStatus;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
}

@Injectable({ providedIn: 'root' })
export class SettlementsApi {
  private readonly http = inject(HttpClient);

  /** STL-010: newest first, 50 at a time. */
  list(q: SettlementQuery = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== '') params = params.set(k, String(v));
    }
    return firstValueFrom(this.http.get<SettlementList>('/api/v1/console/settlements', { params }));
  }

  /** STL-011. */
  detail(id: string) {
    return firstValueFrom(
      this.http.get<SettlementDetail>(`/api/v1/console/settlements/${encodeURIComponent(id)}`),
    );
  }

  /** STL-014: a statement file as a signed link, then the file itself saved under its name. */
  async statement(id: string, fileNo: number) {
    const link = await firstValueFrom(
      this.http.get<{ name: string; url: string; expiresAt: string }>(
        `/api/v1/console/settlements/${encodeURIComponent(id)}/statements/${fileNo}`,
      ),
    );
    await downloadFile(this.http, link.url, link.name);
    return link.name;
  }
}
