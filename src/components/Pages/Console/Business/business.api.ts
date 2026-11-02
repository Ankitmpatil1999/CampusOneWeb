/**
 * A merchant's counter on the web (client 2026-10-13): the merchant app's routes — home (PAY-007),
 * static QR codes with their card and e-mail (PAY-008, PAY-030, PAY-013), payment requests by dynamic
 * QR or campus card (PAY-009…012), collections (PAY-014), settlements (STL-012, STL-013), the wallet
 * and its statement (WAL-001, WAL-002, WAL-004, WAL-005) and a vendor merchant's approved assets
 * (PAY-015) — reached with the console session holding the Merchant or Vendor merchant role.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { MoneyDto } from '../../../Utils/money';
import { SURFACE_HEADER } from '../../../Utils/web-session';
import { TeachingHttp } from '../Teaching/teaching.http';

export interface Merchant {
  readonly id: string;
  readonly displayName: string;
  readonly uniqueId: string;
  readonly subType: 'REGULAR' | 'VENDOR';
  readonly status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  readonly statusReason: string | null;
  readonly department: string | null;
  readonly operator: string;
  readonly mobile: string | null;
  readonly email: string | null;
  readonly accepts: {
    readonly wallet: boolean;
    readonly allowance: boolean;
    readonly coupon: boolean;
  };
  readonly channels: { readonly dynamicQr: boolean; readonly nfc: boolean };
  readonly isFeeAccount: boolean;
  readonly today: { readonly amount: MoneyDto; readonly count: number };
  readonly onboardedAt: string | null;
  readonly version: number;
}

/** What a static QR code takes: wallet payments, allowances or coupons. */
export const QR_KIND: Readonly<Record<string, string>> = {
  PAYMENT: 'Payments',
  ALLOWANCE: 'Allowances',
  COUPON: 'Coupons',
};

export interface MerchantHome {
  readonly merchant: Merchant;
  readonly today: { readonly gross: MoneyDto; readonly count: number };
  readonly pendingSettlement: MoneyDto | null;
  readonly wallet: {
    readonly walletNo: string;
    readonly status: string;
    readonly balance: MoneyDto;
  } | null;
  readonly qr: readonly {
    readonly id: string;
    readonly kind: string;
    readonly status: 'ACTIVE' | 'INACTIVE';
  }[];
  readonly openRequests: number;
}

export interface QrCode {
  readonly id: string;
  readonly kind: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly statusReason: string | null;
  readonly createdAt: string;
  readonly statusChangedAt: string | null;
  readonly payload: string;
  readonly svg: string;
  readonly version: number;
}

// --- payment requests -------------------------------------------------------------------------------

export type RequestKind = 'DYNAMIC_QR' | 'NFC';
export type RequestStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED';

export interface RequestCreated {
  readonly requestId: string;
  readonly kind: RequestKind;
  readonly amount: MoneyDto;
  readonly qrPayload: string | null;
  readonly svg: string | null;
  /** NFC: the one-time nonce the card tap presents. */
  readonly nonce: string | null;
  readonly expiresAt: string;
  readonly ttlSeconds: number;
}

export interface RequestState {
  readonly requestId: string;
  readonly kind: RequestKind;
  readonly amount: MoneyDto;
  readonly status: RequestStatus;
  readonly failureCode: string | null;
  readonly expiresAt: string;
  readonly payer: string | null;
  readonly receipt: { readonly reference: string } | null;
}

export interface TapResult {
  readonly receipt: {
    readonly id: string;
    readonly reference: string;
    readonly status: 'PENDING' | 'SUCCESS' | 'FAILURE';
    readonly channel: string;
    readonly amount: MoneyDto;
    readonly merchant: { readonly name: string; readonly code: string };
    readonly paidAt: string;
  };
  readonly replayed: boolean;
}

// --- collections and settlements --------------------------------------------------------------------

export type CollectionStatus = 'SUCCESS' | 'FAILURE' | 'PENDING';

export interface Collection {
  readonly id: string;
  readonly reference: string;
  readonly channel: string;
  readonly amount: MoneyDto;
  readonly status: CollectionStatus;
  readonly failureCode: string | null;
  readonly payer: string;
  readonly at: string;
}

export interface Collections {
  readonly items: readonly Collection[];
  readonly nextCursor: string | null;
  readonly totals: { readonly amount: MoneyDto; readonly count: number };
}

export interface Settlement {
  readonly id: string;
  readonly settlementNo: string;
  readonly date: string;
  readonly status: string;
  readonly statusLabel: string;
  readonly lines: number;
  readonly gross: MoneyDto;
  readonly fee: MoneyDto;
  readonly adjustments: MoneyDto;
  readonly net: MoneyDto;
  readonly paidOut: { readonly utr: string | null; readonly at: string | null } | null;
  readonly carriedForward: boolean;
}

export interface SettlementDetail extends Settlement {
  readonly transactions: readonly {
    readonly reference: string;
    readonly type: string;
    readonly adjustment: boolean;
    readonly amount: MoneyDto;
    readonly fee: MoneyDto;
    readonly net: MoneyDto;
    readonly remarks: string | null;
    readonly at: string;
    readonly carried: boolean;
  }[];
}

// --- wallet -----------------------------------------------------------------------------------------

export interface Wallet {
  readonly id: string;
  readonly kind: string;
  readonly walletNo: string;
  readonly status: string;
  readonly balance: MoneyDto;
  readonly held: MoneyDto;
  readonly virtualAccount: string | null;
  readonly spentToday: MoneyDto;
  readonly spentThisMonth: MoneyDto;
}

export interface Wallets {
  readonly profile: { readonly id: string; readonly name: string; readonly memberNo: string };
  readonly wallets: readonly Wallet[];
}

export interface StatementLine {
  readonly id: string;
  readonly reference: string;
  readonly type: string;
  readonly title: string;
  readonly channel: string;
  readonly channelLabel: string;
  readonly direction: 'DEBIT' | 'CREDIT';
  readonly amount: MoneyDto;
  readonly balanceAfter: MoneyDto | null;
  readonly counterparty: string | null;
  readonly narration: string | null;
  readonly at: string;
}

export interface Statement {
  readonly items: readonly StatementLine[];
  readonly openingBalance: MoneyDto | null;
  readonly closingBalance: MoneyDto | null;
  readonly nextCursor: string | null;
}

export interface Asset {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly description: string | null;
  readonly group: { readonly id: string; readonly name: string } | null;
}

@Injectable({ providedIn: 'root' })
export class BusinessApi {
  private readonly http = inject(TeachingHttp);
  private readonly raw = inject(HttpClient);

  home() {
    return this.http.get<MerchantHome>('/merchant/home');
  }

  qrCodes() {
    return this.http.get<{ items: QrCode[] }>('/merchant/qr-codes');
  }
  /** PAY-030: the printable QR card. */
  qrCard(id: string) {
    return firstValueFrom(
      this.raw.get(`/api/v1/merchant/qr-codes/${encodeURIComponent(id)}/card.pdf`, {
        headers: { [SURFACE_HEADER]: 'console' },
        responseType: 'blob',
      }),
    );
  }
  emailQr(id: string, email: string | null) {
    return this.http.send<{ sentTo: string }>(
      'POST',
      `/merchant/qr-codes/${encodeURIComponent(id)}/email`,
      email ? { email } : {},
    );
  }

  request(kind: RequestKind, amount: MoneyDto) {
    return this.http.send<RequestCreated>('POST', '/merchant/payment-requests', {
      kind,
      amount,
      instrument: 'WALLET',
    });
  }
  requestState(id: string) {
    return this.http.get<RequestState>(`/merchant/payment-requests/${encodeURIComponent(id)}`);
  }
  cancelRequest(id: string) {
    return this.http.send<RequestState>(
      'POST',
      `/merchant/payment-requests/${encodeURIComponent(id)}/cancellation`,
      {},
    );
  }
  /** PAY-012: the campus card read from the reader, with the request's one-time nonce. */
  tap(id: string, cardToken: string, nonce: string) {
    return this.http.send<TapResult>(
      'POST',
      `/merchant/payment-requests/${encodeURIComponent(id)}/nfc-taps`,
      { cardToken, nonce },
    );
  }

  collections(q: {
    from?: string | null;
    to?: string | null;
    status?: CollectionStatus | null;
    channel?: string | null;
    cursor?: string | null;
  }) {
    return this.http.get<Collections>('/merchant/collections', { ...q, limit: 50 });
  }

  settlements() {
    return this.http.get<{ items: Settlement[] }>('/merchant/settlements');
  }
  settlement(id: string) {
    return this.http.get<SettlementDetail>(`/merchant/settlements/${encodeURIComponent(id)}`);
  }

  wallets() {
    return this.http.get<Wallets>('/me/wallets');
  }
  statement(
    walletId: string,
    q: { from?: string | null; to?: string | null; cursor?: string | null },
  ) {
    return this.http.get<Statement>(`/me/wallets/${encodeURIComponent(walletId)}/statement`, {
      ...q,
      limit: 30,
    });
  }
  /** WAL-005: a movement's receipt. */
  receipt(reference: string) {
    return firstValueFrom(
      this.raw.get(`/api/v1/me/transactions/${encodeURIComponent(reference)}/receipt.pdf`, {
        headers: { [SURFACE_HEADER]: 'console' },
        responseType: 'blob',
      }),
    );
  }

  assets() {
    return this.http.get<{ items: Asset[] }>('/merchant/assets');
  }
}

/** Saves a downloaded file under its name. */
export function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
