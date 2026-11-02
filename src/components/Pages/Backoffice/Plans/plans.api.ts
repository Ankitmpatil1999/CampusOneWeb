/** Back-office plans and billing API (SAS-027…032). */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { Money, Plan } from '../Institutions/institutions.api';

export interface PlanView extends Plan {
  readonly version: number;
  readonly platformFee: { readonly flat: Money; readonly upTo: Money; readonly percent: string };
  readonly institutions?: number;
  readonly etag: number;
}

export interface PlanInput {
  readonly name: string;
  readonly description: string | null;
  readonly cycle: 'MONTHLY' | 'ANNUAL';
  readonly price: Money;
  readonly trialDays: number;
  readonly modules: readonly string[];
  readonly allowances: { members: number; sms: number; whatsapp: number; storageGb: number };
  readonly platformFee: { flat: Money; upTo: Money; percent: string };
}

export type InvoiceStatus = 'DRAFT' | 'DUE' | 'GRACE' | 'OVERDUE' | 'PAID' | 'VOID';
export type InvoiceTrigger =
  'PLAN_ACTIVATION' | 'RENEWAL' | 'PLAN_CHANGE' | 'USAGE_OVERAGE' | 'MANUAL';

export interface Invoice {
  readonly id: string;
  readonly invoiceNo: string;
  readonly institution: { readonly id: string; readonly name: string };
  readonly trigger: InvoiceTrigger;
  readonly period: string;
  readonly amount: Money;
  readonly taxPercent: string;
  readonly tax: Money;
  readonly total: Money;
  readonly issuedOn: string;
  readonly dueOn: string;
  readonly graceUntilOn: string;
  readonly status: InvoiceStatus;
  readonly paidAt: string | null;
  /** A bank transfer the institution reported from the console, waiting for confirmation. */
  readonly transfer: {
    readonly utr: string;
    readonly paidOn: string;
    readonly reportedAt: string;
  } | null;
  readonly payment: {
    readonly method: 'BANK_TRANSFER' | 'GATEWAY';
    readonly reference: string | null;
    readonly paidOn: string;
  } | null;
  readonly lines: readonly { description: string; quantity: number; amount: Money }[];
  readonly version: number;
}

/** CampusOne's invoice and bank details (SAS-040/041); example values until the client supplies them. */
export interface BillingProfile {
  readonly legalName: string;
  readonly gstin: string;
  readonly address: string;
  readonly stateCode: string;
  readonly stateName: string | null;
  readonly sacCode: string;
  readonly payee: {
    readonly name: string;
    readonly bank: string;
    readonly accountNo: string;
    readonly ifsc: string;
  };
  readonly example: boolean;
  readonly updatedAt: string | null;
  readonly etag: number;
}

export type BillingProfileInput = Pick<
  BillingProfile,
  'legalName' | 'gstin' | 'address' | 'sacCode'
> & {
  readonly payee: BillingProfile['payee'];
};

/** Invoice status labels and tones (RC-09; prototype o.plans, c.subscription). */
export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  DUE: { label: 'Due', tone: 'warn' },
  GRACE: { label: 'Grace', tone: 'warn' },
  OVERDUE: { label: 'Overdue', tone: 'bad' },
  PAID: { label: 'Paid', tone: 'ok' },
  VOID: { label: 'Void', tone: 'neutral' },
};

export const INVOICE_TRIGGER: Record<InvoiceTrigger, string> = {
  PLAN_ACTIVATION: 'Plan activation',
  RENEWAL: 'Renewal',
  PLAN_CHANGE: 'Plan change (prorated)',
  USAGE_OVERAGE: 'Usage overage',
  MANUAL: 'Manual',
};

export interface BillingSettings {
  readonly gstBp: number;
  readonly smsPaise: number;
  readonly whatsappPaise: number;
  readonly dueDays: number;
  readonly graceDays: number;
}

export const BILLING_DEFAULTS: BillingSettings = {
  gstBp: 1800,
  smsPaise: 25,
  whatsappPaise: 80,
  dueDays: 15,
  graceDays: 14,
};

@Injectable({ providedIn: 'root' })
export class PlansApi {
  private readonly http = inject(HttpClient);

  list() {
    return firstValueFrom(
      this.http.get<{ modules: string[]; items: PlanView[] }>('/api/v1/ops/plans'),
    );
  }

  create(body: PlanInput) {
    return firstValueFrom(
      this.http.post<PlanView>('/api/v1/ops/plans', body, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }

  change(id: string, etag: number, body: PlanInput) {
    return firstValueFrom(
      this.http.patch<PlanView & { removedModules: string[] }>(`/api/v1/ops/plans/${id}`, body, {
        headers: { 'If-Match': `"v${etag}"` },
      }),
    );
  }

  invoices() {
    return firstValueFrom(this.http.get<{ items: Invoice[] }>('/api/v1/ops/invoices'));
  }

  generate(body: {
    institutionId: string;
    trigger: 'RENEWAL' | 'PLAN_ACTIVATION' | 'USAGE_OVERAGE';
    smsOver?: number;
    whatsappOver?: number;
  }) {
    return firstValueFrom(
      this.http.post<Invoice>('/api/v1/ops/invoices', body, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }

  pay(invoiceId: string, body: { utr: string; amount: Money; paidOn: string }) {
    return firstValueFrom(
      this.http.post<{ invoice: Invoice; institutionRestored: boolean }>(
        `/api/v1/ops/invoices/${invoiceId}/payments`,
        body,
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }

  profile() {
    return firstValueFrom(this.http.get<BillingProfile>('/api/v1/ops/billing-profile'));
  }

  updateProfile(etag: number, body: BillingProfileInput) {
    return firstValueFrom(
      this.http.put<BillingProfile>('/api/v1/ops/billing-profile', body, {
        headers: { 'If-Match': `"v${etag}"` },
      }),
    );
  }

  /** SAS-043: the GST invoice as a PDF. */
  pdf(invoice: { id: string; invoiceNo: string }) {
    return downloadFile(
      this.http,
      `/api/v1/ops/invoices/${invoice.id}/pdf`,
      `${invoice.invoiceNo}.pdf`,
    );
  }

  /** Billing settings in force (roles with "See platform settings"); the defaults otherwise. */
  async billingSettings(): Promise<BillingSettings> {
    try {
      const r = await firstValueFrom(
        this.http.get<{ items: { key: string; value: number }[] }>('/api/v1/ops/settings'),
      );
      const v = (k: string, d: number) => r.items.find((x) => x.key === k)?.value ?? d;
      return {
        gstBp: v('sas.invoice.gstBp', BILLING_DEFAULTS.gstBp),
        smsPaise: v('sas.overage.smsPaise', BILLING_DEFAULTS.smsPaise),
        whatsappPaise: v('sas.overage.whatsappPaise', BILLING_DEFAULTS.whatsappPaise),
        dueDays: v('sas.invoice.dueDays', BILLING_DEFAULTS.dueDays),
        graceDays: v('sas.invoice.graceDays', BILLING_DEFAULTS.graceDays),
      };
    } catch {
      return BILLING_DEFAULTS;
    }
  }
}
