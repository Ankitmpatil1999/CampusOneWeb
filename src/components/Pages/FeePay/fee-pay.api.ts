/**
 * The public payment page of an instalment's link or QR code (FEE-049…051, FEE-055; client
 * 2026-10-19, 2026-10-22): what is paid, the payment, and the receipt once paid.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../Utils/download';
import { newIdempotencyKey } from '../../Utils/ids';
import type { FeeReceipt } from '../Console/FeeCollection/fee-collection.api';

export type { FeeReceipt };

export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

/** FEE-049 / FEE-051. */
export interface FeePayPage {
  readonly school: { readonly id: string; readonly name: string };
  readonly student: {
    readonly name: string;
    readonly admissionNo: string | null;
    readonly classSection: string | null;
  };
  readonly year: { readonly label: string } | null;
  readonly instalment: { readonly label: string; readonly dueDate: string };
  readonly amount: Money;
  /** PAID: paid through this link; CLOSED: paid another way, or withdrawn. */
  readonly status: 'OPEN' | 'PAID' | 'CLOSED';
  readonly receiptNo: string | null;
  readonly transactionId: string | null;
  /** Paid through this link: the receipt. */
  readonly receipt: FeeReceipt | null;
}

/** FEE-050. */
export interface FeePayOrder {
  readonly amount: Money;
  readonly gatewayOrder: {
    readonly orderId: string;
    readonly amount: Money;
    readonly mode: 'test' | 'live';
    /** Test mode: what a successful checkout would return. */
    readonly test?: { readonly paymentId: string; readonly signature: string };
    /** Live: the gateway's checkout with this public key. */
    readonly checkout?: { readonly keyId: string; readonly name: string };
  };
}

const TOKEN = 'X-Fee-Pay-Token';

@Injectable({ providedIn: 'root' })
export class FeePayApi {
  private readonly http = inject(HttpClient);

  /** FEE-049. */
  page(requestId: string, token: string) {
    return firstValueFrom(
      this.http.get<FeePayPage>(`/api/v1/public/fee-payments/${requestId}`, {
        headers: { [TOKEN]: token },
      }),
    );
  }

  /** FEE-050. */
  order(requestId: string, token: string) {
    return firstValueFrom(
      this.http.post<FeePayOrder>(
        `/api/v1/public/fee-payments/${requestId}/orders`,
        {},
        { headers: { [TOKEN]: token, 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }

  /** FEE-051. */
  verify(requestId: string, token: string, body: { gatewayPaymentId: string; signature: string }) {
    return firstValueFrom(
      this.http.post<FeePayPage>(`/api/v1/public/fee-payments/${requestId}/verify`, body, {
        headers: { [TOKEN]: token },
      }),
    );
  }

  /** FEE-055: the receipt PDF, saved as a file (the token travels in its header, not the URL). */
  receipt(requestId: string, token: string, receiptNo: string | null) {
    return downloadFile(
      this.http,
      `/api/v1/public/fee-payments/${requestId}/receipt`,
      `${(receiptNo ?? 'fee-receipt').replace(/\//g, '-')}.pdf`,
      { [TOKEN]: token },
    );
  }
}
