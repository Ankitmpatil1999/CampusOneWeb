/** Terminal API (POS MER-001…022, IDN-042; readers ATT-003/004, CPN-013/014). */
import { Injectable, inject } from '@angular/core';
import { TerminalDevice } from './terminal.device';

export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

export interface PosOperator {
  readonly id: string;
  readonly name: string;
  readonly mobile: string;
  readonly tag: string;
  readonly since: string | null;
  readonly expiresAt: string | null;
}

export interface PosItem {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string | null;
  readonly foodType: 'VEG' | 'NON_VEG' | null;
  readonly price: Money;
  readonly gstRate: number;
  readonly available: boolean;
  readonly version: number;
}

export interface PosCategory {
  readonly id: string;
  readonly name: string;
  readonly items: readonly PosItem[];
}

export interface PosOutlet {
  readonly id: string;
  readonly name: string;
  readonly merchant: string;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly gstin: string | null;
  readonly version: number;
}

export interface PosMenu {
  readonly terminal: { readonly id: string; readonly name: string };
  readonly outlet: PosOutlet;
  readonly operator: PosOperator | null;
  readonly pricesIncludeGst: boolean;
  readonly defaultGstRate: number;
  readonly gstRates: readonly number[];
  readonly categories: readonly PosCategory[];
}

export type OrderType = 'DINE_IN' | 'TAKEAWAY';
export type Instrument = 'WALLET' | 'ALLOWANCE' | 'COUPON';

export interface PosOrder {
  readonly id: string;
  readonly number: string;
  readonly type: OrderType;
  readonly status: 'CREATED' | 'PAID' | 'CANCELLED';
  readonly payment: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  readonly lastFailureCode: string | null;
  readonly lines: readonly {
    readonly itemId: string;
    readonly name: string;
    readonly qty: number;
    readonly unitPrice: Money;
    readonly gstRate: number;
    readonly net: Money;
    readonly tax: Money;
    readonly total: Money;
  }[];
  readonly subtotal: Money;
  readonly tax: Money;
  readonly cgst: Money;
  readonly sgst: Money;
  readonly total: Money;
  readonly instrument: Instrument | null;
  readonly payer: { readonly name: string } | null;
  readonly reference: string | null;
  readonly operator: string | null;
  readonly offline: boolean;
  readonly createdAt: string | null;
  readonly paidAt: string | null;
  readonly cancelledAt: string | null;
  readonly version: number;
}

export interface PosOrders {
  readonly date: string;
  readonly summary: {
    readonly orders: number;
    readonly collected: Money;
    readonly unpaid: { readonly count: number; readonly amount: Money };
    readonly offline: { readonly accepted: number; readonly refused: number };
    readonly lastSyncAt: string | null;
  };
  readonly items: readonly PosOrder[];
}

export interface PosRequest {
  readonly requestId: string;
  readonly orderId: string;
  readonly instrument: 'WALLET' | 'ALLOWANCE';
  readonly amount: Money;
  readonly nonce: string;
  readonly expiresAt: string;
  readonly ttlSeconds: number;
}

export interface PosCollection {
  readonly order: PosOrder;
  readonly receipt: {
    readonly reference: string;
    readonly amount: Money;
    readonly instrument: 'WALLET' | 'ALLOWANCE';
    readonly payer: { readonly name: string };
    readonly paidAt: string | null;
  } | null;
  readonly coupon: {
    readonly type: string;
    readonly holder: string;
    readonly redeemedAt: string;
  } | null;
  readonly replayed: boolean;
}

export interface PosTag {
  readonly id: string;
  readonly operatorName: string;
  readonly mobile: string;
  readonly tag: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly reissueCount: number;
  readonly reissueReason: string | null;
  readonly issuedAt: string | null;
  readonly endedAt: string | null;
  readonly signedInNow?: boolean;
}

export interface CaptureIn {
  readonly captureKey: string;
  readonly orderId?: string;
  readonly order?: {
    readonly type: OrderType;
    readonly lines: readonly { itemId: string; qty: number }[];
  };
  readonly cardToken: string;
  readonly instrument: 'WALLET' | 'ALLOWANCE';
  readonly amount: Money;
  readonly capturedAt: string;
  readonly signature: string;
}

export interface PosBatch {
  readonly batchId: string;
  readonly receivedAt: string | null;
  readonly summary: {
    readonly accepted: number;
    readonly refused: number;
    readonly replayed: number;
  };
  readonly captures: readonly {
    readonly captureKey: string;
    readonly outcome: 'PROCESSING' | 'ACCEPTED' | 'REFUSED';
    readonly replayed: boolean;
    readonly code: string | null;
    readonly reference: string | null;
    readonly order: { readonly id: string; readonly number: string } | null;
    readonly amount: Money;
    readonly card: string | null;
    readonly capturedAt: string | null;
  }[];
}

/** ATT-003: the holder and the campus and allowance balances. */
export interface KioskBalance {
  readonly member: { readonly id: string; readonly name: string };
  readonly campus: { readonly balance: Money; readonly status: string } | null;
  readonly allowance: { readonly balance: Money; readonly status: string } | null;
}

/** ATT-002: what an attendance tap recorded. */
export interface AttendanceTap {
  readonly member: { readonly name: string; readonly classSection: string | null };
  readonly result: 'CHECKED_IN' | 'CHECKED_OUT' | 'PERIOD_RECORDED' | 'LOCATION_RECORDED' | string;
  readonly status?: string;
  readonly at: string;
}

export interface CouponTap {
  readonly holder: {
    readonly maskedName: string;
    readonly classSection: string | null;
    readonly admissionNo: string | null;
  };
  readonly eligibleTypes: readonly {
    readonly id: string;
    readonly name: string;
    readonly window: { readonly start: string; readonly end: string };
  }[];
  readonly chooseWithinSec: number;
}

export interface CouponRedeemed {
  readonly id: string;
  readonly coupon: { readonly id: string; readonly type: string };
  readonly merchant: { readonly id: string; readonly name: string };
  readonly holder: { readonly id: string; readonly name: string };
  readonly redeemedAt: string;
}

@Injectable({ providedIn: 'root' })
export class TerminalApi {
  private readonly device = inject(TerminalDevice);
  private readonly base = '/api/v1/terminal';

  // --- POS ----------------------------------------------------------------------------------------
  operatorSignIn(operatorTag: string) {
    return this.device.call<{ operator: PosOperator }>(
      'POST',
      `${this.base}/pos/operators/signin`,
      {
        body: { operatorTag },
      },
    );
  }
  operatorSignOut() {
    return this.device.call<void>('POST', `${this.base}/pos/operators/signout`);
  }
  menu() {
    return this.device.call<PosMenu>('GET', `${this.base}/pos/menu`);
  }
  addCategory(name: string) {
    return this.device.call<PosCategory>('POST', `${this.base}/pos/categories`, {
      body: { name },
      idempotent: true,
    });
  }
  addItem(body: {
    categoryId: string;
    name: string;
    price: Money;
    gstRate?: number;
    available?: boolean;
  }) {
    return this.device.call<PosItem>('POST', `${this.base}/pos/items`, { body, idempotent: true });
  }
  patchItem(id: string, version: number, body: Partial<{ available: boolean; price: Money }>) {
    return this.device.call<PosItem>('PATCH', `${this.base}/pos/items/${id}`, {
      body,
      ifMatch: version,
    });
  }
  saveOutlet(
    version: number,
    body: { name: string; opensAt: string; closesAt: string; gstin: string | null },
  ) {
    return this.device.call<PosOutlet>('PUT', `${this.base}/pos/outlet`, {
      body,
      ifMatch: version,
    });
  }
  createOrder(type: OrderType, lines: readonly { itemId: string; qty: number }[]) {
    return this.device.call<PosOrder>('POST', `${this.base}/pos/orders`, {
      body: { type, lines },
      idempotent: true,
    });
  }
  orders(date?: string) {
    return this.device.call<PosOrders>(
      'GET',
      `${this.base}/pos/orders${date ? `?date=${date}` : ''}`,
    );
  }
  cancelOrder(id: string) {
    return this.device.call<PosOrder>('POST', `${this.base}/pos/orders/${id}/cancellation`, {
      body: {},
    });
  }
  createRequest(orderId: string, instrument: 'WALLET' | 'ALLOWANCE') {
    return this.device.call<PosRequest>(
      'POST',
      `${this.base}/pos/orders/${orderId}/payment-requests`,
      {
        body: { instrument },
        idempotent: true,
      },
    );
  }
  cancelRequest(requestId: string) {
    return this.device.call<{ requestId: string; status: 'CANCELLED' }>(
      'POST',
      `${this.base}/pos/payment-requests/${requestId}/cancellation`,
    );
  }
  collect(
    orderId: string,
    body: { instrument: Instrument; cardToken: string; requestId?: string; nonce?: string },
  ) {
    return this.device.call<PosCollection>(
      'POST',
      `${this.base}/pos/orders/${orderId}/collections`,
      {
        body,
        idempotent: true,
      },
    );
  }
  sync(batchId: string, captures: readonly CaptureIn[]) {
    return this.device.call<PosBatch>('POST', `${this.base}/pos/offline-batches`, {
      body: { batchId, captures },
      idempotent: true,
    });
  }
  tags() {
    return this.device.call<{ items: readonly PosTag[] }>('GET', `${this.base}/pos/operator-tags`);
  }
  registerTag(operatorName: string, operatorMobile: string) {
    return this.device.call<{ tag: PosTag; tagToken: string }>(
      'POST',
      `${this.base}/pos/operator-tags`,
      { body: { operatorName, operatorMobile }, idempotent: true },
    );
  }
  reissueTag(id: string, reason: string) {
    return this.device.call<{ tag: PosTag; tagToken: string }>(
      'POST',
      `${this.base}/pos/operator-tags/${id}/reissue`,
      { body: { reason }, idempotent: true },
    );
  }

  // --- readers ------------------------------------------------------------------------------------
  balance(cardToken: string) {
    return this.device.call<KioskBalance>('POST', `${this.base}/reader/balance-checks`, {
      body: { cardToken },
    });
  }
  /** ATT-002: a gate, period or location attendance tap. */
  attendanceTap(cardToken: string, tapId: string) {
    return this.device.call<AttendanceTap>('POST', `${this.base}/reader/taps`, {
      body: { cardToken, tapId },
      idempotent: true,
    });
  }
  couponTap(cardToken: string, tapId: string) {
    return this.device.call<CouponTap>('POST', `${this.base}/reader/coupon-taps`, {
      body: { cardToken, tapId },
      idempotent: true,
    });
  }
  couponRedeem(tapId: string, couponTypeId: string) {
    return this.device.call<CouponRedeemed>('POST', `${this.base}/reader/coupon-redemptions`, {
      body: { tapId, couponTypeId },
      idempotent: true,
    });
  }
}

/** Money as paise (integers only). */
export const paiseOf = (m: Money) => {
  const [r, p = ''] = m.amount.split('.');
  return Number(r) * 100 + Number((p + '00').slice(0, 2));
};
export const money = (paise: number): Money => ({
  amount: `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`,
  currency: 'INR',
});

/**
 * An order line priced as the server prices it (12.8; pos.service priceLine): GST added to the
 * price, or contained in it; half a paisa rounds up, per line. Used for the cart preview and the
 * offline capture's amount — the server prices again and refuses a different total.
 */
export function priceLine(unitPaise: number, qty: number, gstBp: number, inclusive: boolean) {
  const gross = unitPaise * qty;
  if (inclusive) {
    const den = 10_000 + gstBp;
    const tax = Math.floor((gross * gstBp * 2 + den) / (2 * den));
    return { net: gross - tax, tax, total: gross };
  }
  const tax = Math.floor((gross * gstBp + 5_000) / 10_000);
  return { net: gross, tax, total: gross + tax };
}
