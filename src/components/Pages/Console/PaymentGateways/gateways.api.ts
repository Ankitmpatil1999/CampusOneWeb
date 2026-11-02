/** The school's own payment gateways (INS-038…041; client 2026-10-09). */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

/** One gateway account: never a secret, only a masked key id. */
export interface PaymentGatewayView {
  readonly id: string;
  readonly provider: string;
  readonly providerName: string;
  readonly label: string;
  readonly keyIdHint: string;
  readonly environment: 'TEST' | 'LIVE';
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly isDefault: boolean;
  readonly hasWebhookSecret: boolean;
  readonly hasMerchantId: boolean;
  /** The address to enter in the gateway dashboard's webhooks. */
  readonly webhookUrl: string;
  readonly lastCheck: {
    readonly at: string;
    readonly ok: boolean;
    readonly note: string | null;
  } | null;
  readonly version: number;
  readonly updatedAt: string;
}

export interface GatewayList {
  readonly providers: readonly { readonly code: string; readonly name: string }[];
  readonly items: readonly PaymentGatewayView[];
  /** Razorpay by default: with no gateway of its own, payments use CampusOne's Razorpay account. */
  readonly platform?: { readonly provider: string; readonly inUse: boolean };
}

/** INS-039 body; INS-040 takes any part of it (a secret left out is kept). */
export interface GatewayInput {
  provider?: string;
  label?: string;
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string | null;
  merchantId?: string | null;
  isDefault?: boolean;
  status?: 'ACTIVE' | 'DISABLED';
}

const BASE = '/api/v1/console/payment-gateways';

@Injectable({ providedIn: 'root' })
export class GatewaysApi {
  private readonly http = inject(HttpClient);

  list() {
    return firstValueFrom(this.http.get<GatewayList>(BASE));
  }

  add(body: GatewayInput, key: string = newIdempotencyKey()) {
    return firstValueFrom(
      this.http.post<PaymentGatewayView>(BASE, body, { headers: { 'Idempotency-Key': key } }),
    );
  }

  change(g: PaymentGatewayView, body: GatewayInput) {
    return firstValueFrom(
      this.http.patch<PaymentGatewayView>(`${BASE}/${g.id}`, body, {
        headers: { 'If-Match': `"v${g.version}"` },
      }),
    );
  }

  check(g: PaymentGatewayView) {
    return firstValueFrom(this.http.post<PaymentGatewayView>(`${BASE}/${g.id}/check`, {}));
  }
}
