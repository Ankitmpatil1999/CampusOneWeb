/** Console Plan & billing API (SAS-026, SAS-037…039). */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { Money, Plan, PlanRequest } from '../../Backoffice/Institutions/institutions.api';
import type { Invoice } from '../../Backoffice/Plans/plans.api';

export interface ConsoleSubscriptionView {
  readonly institution: { readonly name: string; readonly status: string };
  readonly subscription: {
    readonly status: 'TRIAL' | 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'CANCELLED' | null;
    readonly since: string | null;
    readonly periodStart: string | null;
    readonly periodEnd: string | null;
    readonly renewsOn: string | null;
    readonly trialEndsOn: string | null;
  } | null;
  readonly plan: Plan | null;
  readonly modules: readonly { readonly module: string; readonly included: boolean }[];
  readonly scheduledChange: { readonly plan: string; readonly on: string } | null;
  readonly usage: {
    readonly members: number;
    readonly sms: number | null;
    readonly whatsapp: number | null;
    readonly storageBytes: number;
  };
  readonly billing: {
    readonly renewalBillDaysBefore: number;
    readonly dueDays: number;
    readonly graceDays: number;
    readonly gstPercent: string;
    readonly smsOverage: Money;
    readonly whatsappOverage: Money;
  };
  readonly payee: {
    readonly name: string;
    readonly bank: string;
    readonly accountNo: string;
    readonly ifsc: string;
    readonly example: boolean;
  };
  readonly plans: readonly Plan[];
  readonly invoices: readonly Invoice[];
  readonly requests: readonly PlanRequest[];
}

@Injectable({ providedIn: 'root' })
export class SubscriptionApi {
  private readonly http = inject(HttpClient);

  summary() {
    return firstValueFrom(this.http.get<ConsoleSubscriptionView>('/api/v1/console/subscription'));
  }

  request(body: { planId: string; timing: 'NOW' | 'RENEWAL'; note: string | null }) {
    return firstValueFrom(
      this.http.post<{ id: string; status: 'PENDING' }>(
        '/api/v1/console/subscription/plan-change-requests',
        body,
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }

  withdraw(id: string) {
    return firstValueFrom(
      this.http.delete<void>(`/api/v1/console/subscription/plan-change-requests/${id}`),
    );
  }

  /** SAS-042: the GST invoice as a PDF. */
  pdf(invoice: { id: string; invoiceNo: string }) {
    return downloadFile(
      this.http,
      `/api/v1/console/invoices/${invoice.id}/pdf`,
      `${invoice.invoiceNo}.pdf`,
    );
  }

  reportTransfer(invoiceId: string, body: { utr: string; paidOn: string }) {
    return firstValueFrom(
      this.http.post<Invoice>(`/api/v1/console/invoices/${invoiceId}/transfer-reports`, body),
    );
  }
}
