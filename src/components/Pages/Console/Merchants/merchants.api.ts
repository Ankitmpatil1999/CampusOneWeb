/** Console merchants and QR codes API (PAY-016…024, PAY-029, PAY-031). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import { newIdempotencyKey } from '../../../Utils/ids';
import { SURFACE_HEADER } from '../../../Utils/web-session';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

export type MerchantSubType = 'REGULAR' | 'VENDOR';
export type MerchantStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type QrKind = 'PAYMENT' | 'ALLOWANCE' | 'COUPON';
export type QrStatus = 'ACTIVE' | 'INACTIVE';

/** PAY-016: one merchant of the list. */
export interface Merchant {
  readonly id: string;
  readonly displayName: string;
  readonly uniqueId: string;
  readonly subType: MerchantSubType;
  readonly status: MerchantStatus;
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
  /** The institution's fee account: it can't be deactivated (MER.FEE_ACCOUNT_PROTECTED). */
  readonly isFeeAccount: boolean;
  readonly today: { readonly amount: Money; readonly count: number };
  readonly onboardedAt: string | null;
  readonly version: number;
}

export interface MerchantList {
  readonly items: readonly Merchant[];
  readonly nextCursor: string | null;
  readonly kpis: {
    readonly total: number;
    readonly active: number;
    readonly collectionsToday: Money;
    readonly paymentsToday: number;
  };
}

/** PAY-021: a static code; `svg` is drawn by our own API (trusted markup). */
export interface MerchantQr {
  readonly id: string;
  readonly kind: QrKind;
  readonly status: QrStatus;
  readonly statusReason: string | null;
  readonly createdAt: string;
  readonly statusChangedAt: string | null;
  readonly payload: string;
  readonly svg: string;
  readonly version: number;
}

/** PAY-031: the drawer. The account number arrives masked (last four digits only). */
export interface MerchantDetail extends Merchant {
  readonly bank: {
    readonly holderName: string | null;
    readonly bankName: string | null;
    readonly accountNumber: string | null;
    readonly ifsc: string;
    readonly chequeFileId: string | null;
  } | null;
  readonly wallet: {
    readonly walletNo: string;
    readonly status: string;
    readonly balance: Money;
  } | null;
  readonly qrCodes: readonly MerchantQr[];
}

export interface MerchantQuery {
  readonly q?: string;
  readonly subType?: MerchantSubType;
  readonly status?: MerchantStatus;
  readonly cursor?: string;
  readonly limit?: number;
}

/** PAY-017 body. */
export interface MerchantInput {
  readonly displayName: string;
  readonly operatorFirstName: string;
  readonly operatorLastName?: string | null;
  readonly subType: MerchantSubType;
  readonly departmentId?: string | null;
  readonly mobile: string;
  readonly email?: string | null;
  readonly acceptsAllowance?: boolean;
  readonly acceptsCoupon?: boolean;
  readonly bank?: {
    readonly holderName: string;
    readonly bankName?: string | null;
    readonly accountNumber: string;
    readonly ifsc: string;
  } | null;
  readonly chequeFileId?: string | null;
  readonly logoFileId?: string | null;
}

/** PAY-018 body (If-Match). */
export interface MerchantPatch {
  readonly displayName?: string;
  readonly acceptsAllowance?: boolean;
  readonly acceptsCoupon?: boolean;
}

const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });
const ifMatch = (version: number) => ({ 'If-Match': `"v${version}"` });

@Injectable({ providedIn: 'root' })
export class MerchantsApi {
  private readonly http = inject(HttpClient);

  /** PAY-016: the list with the KPIs. */
  list(q: MerchantQuery = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== '') params = params.set(k, String(v));
    }
    return firstValueFrom(this.http.get<MerchantList>('/api/v1/console/merchants', { params }));
  }

  /** PAY-031: the drawer. */
  detail(id: string) {
    return firstValueFrom(this.http.get<MerchantDetail>(`/api/v1/console/merchants/${id}`));
  }

  /** PAY-017: register a merchant (opens its wallet). */
  create(body: MerchantInput) {
    return firstValueFrom(
      this.http.post<{ merchantId: string; uniqueId: string }>('/api/v1/console/merchants', body, {
        headers: once(),
      }),
    );
  }

  /** PAY-018: rename or change what the merchant accepts. */
  update(id: string, version: number, body: MerchantPatch) {
    return firstValueFrom(
      this.http.patch<MerchantDetail>(`/api/v1/console/merchants/${id}`, body, {
        headers: ifMatch(version),
      }),
    );
  }

  /** PAY-019: activate, or deactivate with a reason (the fee account is refused). */
  status(id: string, body: { to: 'ACTIVE' | 'INACTIVE'; reason: string | null }) {
    return firstValueFrom(
      this.http.post<MerchantDetail>(`/api/v1/console/merchants/${id}/status`, body),
    );
  }

  /** PAY-020: dynamic QR and NFC collection on or off. */
  channels(id: string, version: number, body: { dynamicQr: boolean; nfc: boolean }) {
    return firstValueFrom(
      this.http.put<MerchantDetail>(`/api/v1/console/merchants/${id}/channels`, body, {
        headers: ifMatch(version),
      }),
    );
  }

  /** PAY-022: generate a static code of a kind (once per kind). */
  generateQr(id: string, kind: QrKind) {
    return firstValueFrom(
      this.http.post<MerchantQr>(
        `/api/v1/console/merchants/${id}/qr-codes`,
        { kind },
        { headers: once() },
      ),
    );
  }

  /** PAY-023: activate, or deactivate with a reason (If-Match). */
  qrStatus(qr: { id: string; version: number }, body: { status: QrStatus; reason: string | null }) {
    return firstValueFrom(
      this.http.patch<MerchantQr>(`/api/v1/console/qr-codes/${qr.id}`, body, {
        headers: ifMatch(qr.version),
      }),
    );
  }

  /** PAY-024: e-mail the active codes of some merchants (or all) to their e-mail addresses. */
  emailQrs(body: { merchantIds: readonly string[] } | { all: true }) {
    return firstValueFrom(
      this.http.post<{ sent: number; skipped: number }>('/api/v1/console/qr-codes/emails', body, {
        headers: once(),
      }),
    );
  }

  /** PAY-029: the printable card as a PDF, fetched with the console session. */
  card(qrId: string, fileName: string) {
    return downloadFile(this.http, `/api/v1/console/qr-codes/${qrId}/card.pdf`, fileName);
  }

  /** A cheque (purpose `document`) or a logo (purpose `logo`); 2 MB, type-checked (CR-07). */
  upload(purpose: 'document' | 'logo', file: File) {
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('file', file, file.name);
    // /api/v1/files is shared by every surface: name the console so its cookie and CSRF token apply.
    return firstValueFrom(
      this.http.post<{ fileId: string }>('/api/v1/files', form, {
        headers: { [SURFACE_HEADER]: 'console' },
      }),
    );
  }
}
