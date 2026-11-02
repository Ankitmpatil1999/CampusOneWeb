/**
 * Console admission fees API (SRS 19.8, FR-FEE-12, BR-36; ADM-021…024, ADM-037/038): the
 * application and admission fees with their totals, cash at the accounts desk, a payment link for
 * the admission fee (sent to the family), the gateway's checkout at the desk, and a paid fee's
 * receipt (PDF).
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import { newIdempotencyKey } from '../../../Utils/ids';
import type {
  Application,
  AppStatus,
  FeeStatus,
  FeeType,
  Money,
} from '../Applications/applications.api';
import type { GatewayAnswer, GatewayOrder } from '../Fees/desk-checkout';

/** ADM-021: one fee of one application. */
export interface AdmissionFee {
  readonly applicationId: string;
  readonly applicationNo: string;
  readonly applicationStatus: AppStatus;
  readonly student: string | null;
  readonly admissionNo: string | null;
  /** "Grade 6" or, once a section is set, "Grade 6 A". */
  readonly class: string | null;
  readonly year: string;
  readonly feeType: FeeType;
  readonly paymentId: string | null;
  readonly amount: Money;
  readonly status: FeeStatus;
  readonly mode: 'ONLINE' | 'CASH' | null;
  readonly receiptNo: string | null;
  /** The payment gateway's transaction ID of an online payment (client 2026-10-16). */
  readonly transactionId?: string | null;
  readonly paidAt: string | null;
  /** Who paid at the desk (cash). */
  readonly paidBy: string | null;
  /** Accounts confirmed the receipt (client 2026-10-09); null while it waits. */
  readonly confirmedAt?: string | null;
}

export interface AdmissionFees {
  readonly items: readonly AdmissionFee[];
  readonly totals: {
    readonly collected: Money;
    readonly pending: Money;
    readonly paidCount: number;
    readonly pendingCount: number;
    /** Paid fees waiting for Accounts to confirm them. */
    readonly toConfirmCount?: number;
  } | null;
}

/** The confirmation answer: when, and the application as it now stands. */
export interface FeeConfirmation {
  readonly paymentId: string;
  readonly confirmedAt: string;
  readonly application: Application;
}

/** ADM-022 body. */
export interface CashInput {
  readonly feeType: FeeType;
  readonly receivedAt: string;
  /** Empty: CampusOne numbers the receipt. */
  readonly receiptNo?: string | null;
  readonly paidBy: string;
}

/** ADM-022 answer. */
export interface CashReceipt {
  readonly receipt: {
    readonly paymentId: string;
    readonly receiptNo: string;
    readonly amount: Money;
    readonly feeType: FeeType;
  };
  readonly application: Application;
}

/**
 * ADM-023 answer: the link (valid adm.payLink.days, 1 day), already sent to the student and
 * parents (client 2026-10-22).
 */
export interface PaymentLink {
  readonly paymentLink: string;
  readonly amount: Money;
  readonly expiresAt: string;
  readonly sendTo: { readonly mobile: string | null; readonly email: string | null };
  /** Where it went (masked): SMS, e-mail, and how many app accounts got it in the app. */
  readonly sent?: {
    readonly sms: readonly string[];
    readonly email: readonly string[];
    readonly inApp: number;
  };
}

/** ADM-037: the gateway's order for a fee, paid at the desk now (no link). */
export interface AdmissionOrder {
  readonly paymentId: string;
  readonly feeType: FeeType;
  readonly includes: readonly FeeType[];
  readonly amount: Money;
  readonly gatewayOrder: GatewayOrder;
}

/** ADM-038: the fee paid. */
export interface AdmissionPaid {
  readonly status: 'PAID';
  readonly receiptNo: string | null;
  readonly transactionId: string;
  readonly receipts: readonly { readonly feeType: FeeType; readonly receiptNo: string | null }[];
  readonly applicationStatus: AppStatus;
}

const once = (key: string = newIdempotencyKey()) => ({ 'Idempotency-Key': key });

@Injectable({ providedIn: 'root' })
export class AdmissionFeesApi {
  private readonly http = inject(HttpClient);

  /** ADM-021 (?yearId, ?feeType, ?status). */
  fees(q: { yearId?: string; feeType?: FeeType; status?: FeeStatus } = {}) {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(q)) if (v) p = p.set(k, String(v));
    return firstValueFrom(
      this.http.get<AdmissionFees>('/api/v1/console/admission-fees', { params: p }),
    );
  }

  /** ADM-022: recorded once; a paid application fee submits a declared draft. */
  cash(applicationId: string, body: CashInput, key?: string) {
    return firstValueFrom(
      this.http.post<CashReceipt>(
        `/api/v1/console/applications/${applicationId}/admission-fee/cash`,
        body,
        { headers: once(key) },
      ),
    );
  }

  /** ADM-023: the link, sent to the student and parents by SMS, e-mail and in the app. */
  paymentLink(applicationId: string, key?: string) {
    return firstValueFrom(
      this.http.post<PaymentLink>(
        `/api/v1/console/applications/${applicationId}/admission-fee/online`,
        {},
        { headers: once(key) },
      ),
    );
  }

  /** ADM-037: Pay now — an order with the school's gateway for the fee. */
  order(applicationId: string, feeType: FeeType, key?: string, withAdmission = false) {
    return firstValueFrom(
      this.http.post<AdmissionOrder>(
        `/api/v1/console/applications/${applicationId}/admission-fee/orders`,
        // The admission fee with the application fee in one payment (client 2026-10-23).
        { feeType, ...(withAdmission ? { withAdmission: true } : {}) },
        { headers: once(key) },
      ),
    );
  }

  /** ADM-038: the checkout's answer, verified on the server. */
  verify(applicationId: string, paymentId: string, body: GatewayAnswer, key?: string) {
    return firstValueFrom(
      this.http.post<AdmissionPaid>(
        `/api/v1/console/applications/${applicationId}/admission-fee/orders/${paymentId}/verify`,
        body,
        { headers: once(key) },
      ),
    );
  }

  /** ADM-031: Accounts confirms a paid fee was received (once). */
  confirm(paymentId: string, key?: string) {
    return firstValueFrom(
      this.http.post<FeeConfirmation>(
        `/api/v1/console/admission-payments/${paymentId}/confirmation`,
        {},
        { headers: once(key) },
      ),
    );
  }

  /** ADM-024: the receipt PDF. */
  receipt(paymentId: string, receiptNo: string | null) {
    return downloadFile(
      this.http,
      `/api/v1/console/admission-receipts/${paymentId}`,
      `${(receiptNo ?? paymentId).replace(/\//g, '-')}.pdf`,
    );
  }
}
