/**
 * Console fee collection details API (FEE-044…048, FEE-052…057): what each student paid in an
 * academic year, Collect fee — cash, a payment link, the gateway at the desk — with the receipt, and
 * the year's receipts.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { CashEntry } from '../AdmissionFees/CashCollection';
import type { GatewayAnswer, GatewayOrder } from '../Fees/desk-checkout';
import type { Money } from '../Fees/fees.api';

/** A fee, what was collected of it and what is still to pay. */
export interface Sums {
  readonly amount: Money;
  readonly collected: Money;
  readonly pending: Money;
}

/** An application or admission fee: the payment made, or the admission fee still owed. */
export interface EntryFee extends Sums {
  readonly status: 'PENDING' | 'PAID' | 'FAILED';
  readonly mode: 'ONLINE' | 'CASH' | null;
  readonly receiptNo: string | null;
}

/** The filters (FEE-044): the year (current by default), class, section, structure, name, page. */
export interface CollectionQuery {
  readonly yearId?: string;
  readonly structureId?: string;
  readonly classId?: string;
  readonly sectionId?: string;
  readonly q?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/** How an instalment was paid: at the desk in cash, online, or from the campus wallet. */
export type CollectionMode = 'CASH' | 'ONLINE' | 'WALLET';

/** The receipts' filters (FEE-057): no structure; `q` matches the receipt number too; the mode. */
export interface ReceiptQuery extends Omit<CollectionQuery, 'structureId'> {
  readonly mode?: CollectionMode;
}

/** FEE-044: a year's students head by head, the entry fees, the cards and one page of rows. */
export interface FeeCollectionView {
  readonly year: { readonly id: string; readonly label: string };
  readonly structure: {
    readonly id: string;
    readonly name: string;
    readonly version: number;
  } | null;
  readonly heads: readonly { readonly id: string; readonly name: string }[];
  /** Over every student the filters keep, not only this page's. */
  readonly cards: {
    readonly heads: readonly { readonly headId: string; readonly collected: Money }[];
    readonly applicationFee: Sums;
    readonly admissionFee: Sums;
    readonly total: Sums;
  };
  readonly students: readonly CollectionStudent[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface CollectionStudent {
  readonly id: string;
  readonly name: string;
  readonly admissionNo: string | null;
  readonly classSection: string | null;
  /** One per head, in the heads' order; null when the student has nothing under the head. */
  readonly heads: readonly ((Sums & { readonly headId: string }) | null)[];
  readonly applicationFee: EntryFee | null;
  readonly admissionFee: EntryFee | null;
  readonly total: Sums;
  /** What the instalments still owe: open, not financed. */
  readonly due: Money;
  /** Something to collect (due > 0): Collect fee is offered. */
  readonly collectable: boolean;
}

/** A head's line of an instalment. */
export type LineStatus = 'DUE' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID' | 'FINANCED';

/** FEE-045: one student's heads, each with its instalments. */
export interface FeeCollectionStudent {
  readonly student: Pick<CollectionStudent, 'id' | 'name' | 'admissionNo' | 'classSection'>;
  readonly heads: readonly (Sums & {
    readonly id: string;
    readonly name: string;
    readonly instalments: readonly (Sums & {
      readonly seq: number;
      readonly label: string;
      readonly dueDate: string;
      readonly status: LineStatus;
    })[];
  })[];
}

/** FEE-046: Collect Fee — the student's VAN, the year's instalments, where a link would go. */
export interface CollectStudent {
  readonly year: { readonly id: string; readonly label: string };
  readonly student: Pick<CollectionStudent, 'id' | 'name' | 'admissionNo' | 'classSection'>;
  readonly van: { readonly number: string; readonly active: boolean } | null;
  /** Masked; null when the student has none (nor their parent). */
  readonly sendTo: { readonly mobile: string | null; readonly email: string | null };
  readonly instalments: readonly CollectInstalment[];
}

export interface CollectInstalment {
  readonly recordId: string;
  readonly label: string;
  readonly dueDate: string;
  readonly amount: Money;
  readonly fine: Money;
  readonly paid: Money;
  readonly outstanding: Money;
  readonly status: 'DUE' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  readonly financed: boolean;
  /** Open, not financed, something to collect. */
  readonly collectable: boolean;
  /** What was collected on it, oldest first; each has its receipt (FEE-056). */
  readonly collections: readonly InstalmentCollection[];
}

/** A collection on an instalment (FEE-046): its receipt number, when, how and how much. */
export interface InstalmentCollection {
  readonly collectionId: string;
  readonly receiptNo: string;
  readonly paidAt: string;
  readonly mode: CollectionMode;
  readonly total: Money;
}

/**
 * An instalment's receipt (FEE-047, FEE-053, FEE-051, FEE-056): what it shows and its PDF prints. A
 * wallet collection's receipt number is its payment reference (RPEP…).
 */
export interface FeeReceipt {
  readonly collectionId: string;
  readonly receiptNo: string;
  readonly paidAt: string;
  readonly mode: CollectionMode;
  /** Cash: who paid at the desk. */
  readonly paidBy: string | null;
  /** Online: the payment gateway's own ID. */
  readonly transactionId: string | null;
  readonly school: { readonly name: string };
  readonly student: {
    readonly name: string;
    readonly admissionNo: string | null;
    readonly classSection: string | null;
  };
  readonly year: string | null;
  readonly instalment: { readonly label: string; readonly dueDate: string };
  /** The fee part, the late fine and the two together. */
  readonly amount: Money;
  readonly fine: Money;
  readonly total: Money;
}

/** FEE-047: cash received, with its receipt. */
export interface CashCollected {
  readonly receiptNo: string;
  readonly amount: Money;
  readonly mode: 'CASH';
  readonly recordId: string;
  readonly status: 'PAID';
  readonly collectionId: string;
  readonly receipt: FeeReceipt;
}

/**
 * FEE-048: a payment link (valid fee.payLink.days, 1 day), sent to the student and every parent
 * (client 2026-10-22).
 */
export interface PaymentRequest {
  readonly id: string;
  readonly channel: 'LINK' | 'QR';
  readonly link: string;
  readonly amount: Money;
  readonly expiresAt: string;
  readonly qrSvg?: string;
  /** Where it went (masked): SMS, e-mail, and how many app accounts got it in the app. */
  readonly sentTo?: {
    readonly mobiles: readonly string[];
    readonly emails: readonly string[];
    readonly inApp: number;
  };
}

/** FEE-052: Pay now — an order with the school's gateway for the instalment (no link). */
export interface FeeOrder {
  readonly requestId: string;
  readonly amount: Money;
  readonly gatewayOrder: GatewayOrder;
}

/** FEE-053: paid through the gateway at the desk, with its receipt. */
export interface OnlineCollected {
  readonly receiptNo: string;
  readonly transactionId: string;
  readonly amount: Money;
  readonly mode: 'ONLINE';
  readonly recordId: string;
  readonly status: 'PAID';
  readonly collectionId: string;
  readonly receipt: FeeReceipt;
}

/** A receipt of the year (FEE-057). */
export interface ReceiptRow {
  readonly collectionId: string;
  readonly receiptNo: string;
  readonly paidAt: string;
  readonly mode: CollectionMode;
  readonly paidBy: string | null;
  readonly transactionId: string | null;
  readonly amount: Money;
  readonly fine: Money;
  readonly total: Money;
  readonly student: Pick<CollectionStudent, 'id' | 'name' | 'admissionNo' | 'classSection'>;
  readonly instalment: { readonly recordId: string; readonly label: string };
}

/** FEE-057: a page of the year's receipts, newest first, with the totals. */
export interface ReceiptsView {
  readonly year: { readonly id: string; readonly label: string };
  readonly items: readonly ReceiptRow[];
  /** Over every receipt the filters keep, not only this page's. */
  readonly totals: {
    readonly count: number;
    readonly collected: Money;
    readonly cash: ModeTotal;
    readonly online: ModeTotal;
    readonly wallet: ModeTotal;
  };
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ModeTotal {
  readonly count: number;
  readonly amount: Money;
}

const once = (key: string = newIdempotencyKey()) => ({ 'Idempotency-Key': key });

/** The query's filled-in values, in a fixed order. */
const paramsOf = (q: CollectionQuery & ReceiptQuery) => {
  let params = new HttpParams();
  for (const k of [
    'yearId',
    'structureId',
    'classId',
    'sectionId',
    'q',
    'mode',
    'page',
    'pageSize',
  ] as const) {
    const v = q[k];
    if (v !== undefined && v !== '') params = params.set(k, String(v));
  }
  return params;
};

@Injectable({ providedIn: 'root' })
export class FeeCollectionApi {
  private readonly http = inject(HttpClient);

  /** FEE-044. */
  view(q: CollectionQuery) {
    return firstValueFrom(
      this.http.get<FeeCollectionView>('/api/v1/console/fee-collection', {
        params: paramsOf(q),
      }),
    );
  }

  /** FEE-046. */
  collectView(studentId: string, yearId: string) {
    return firstValueFrom(
      this.http.get<CollectStudent>(
        `/api/v1/console/fee-collection/students/${studentId}/collect`,
        { params: paramsOf({ yearId }) },
      ),
    );
  }

  /** FEE-047: the day, the counterfoil's receipt number (empty: CampusOne numbers it) and who paid. */
  cash(recordId: string, body: CashEntry, key?: string) {
    return firstValueFrom(
      this.http.post<CashCollected>(`/api/v1/console/fee-records/${recordId}/cash`, body, {
        headers: once(key),
      }),
    );
  }

  /** FEE-048. */
  paymentRequest(recordId: string, channel: 'LINK' | 'QR', key?: string) {
    return firstValueFrom(
      this.http.post<PaymentRequest>(
        `/api/v1/console/fee-records/${recordId}/payment-requests`,
        { channel },
        { headers: once(key) },
      ),
    );
  }

  /** FEE-052. */
  order(recordId: string, key?: string) {
    return firstValueFrom(
      this.http.post<FeeOrder>(
        `/api/v1/console/fee-records/${recordId}/orders`,
        {},
        { headers: once(key) },
      ),
    );
  }

  /** FEE-053. */
  verify(recordId: string, requestId: string, body: GatewayAnswer, key?: string) {
    return firstValueFrom(
      this.http.post<OnlineCollected>(
        `/api/v1/console/fee-records/${recordId}/orders/${requestId}/verify`,
        body,
        { headers: once(key) },
      ),
    );
  }

  /** FEE-056: a collection's receipt. */
  receipt(collectionId: string) {
    return firstValueFrom(
      this.http.get<FeeReceipt>(`/api/v1/console/fee-collections/${collectionId}`),
    );
  }

  /** FEE-057: the year's receipts. */
  receipts(q: ReceiptQuery) {
    return firstValueFrom(
      this.http.get<ReceiptsView>('/api/v1/console/fee-collections', { params: paramsOf(q) }),
    );
  }

  /** FEE-054: the receipt PDF. */
  receiptPdf(collectionId: string, receiptNo: string) {
    return downloadFile(
      this.http,
      `/api/v1/console/fee-collections/${collectionId}/receipt`,
      `${receiptNo.replace(/\//g, '-')}.pdf`,
    );
  }

  /** FEE-045. */
  student(studentId: string, q: Pick<CollectionQuery, 'yearId' | 'structureId'>) {
    return firstValueFrom(
      this.http.get<FeeCollectionStudent>(`/api/v1/console/fee-collection/students/${studentId}`, {
        params: paramsOf(q),
      }),
    );
  }
}
