/** Back-office institutions API (INS-001…009, INS-036, SAS-027). */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export type InstitutionStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
export type LifecycleAction = 'START_TRIAL' | 'ACTIVATE' | 'SUSPEND' | 'REACTIVATE' | 'CANCEL';

export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

export interface Plan {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly cycle: 'MONTHLY' | 'ANNUAL';
  readonly price: Money;
  readonly trialDays: number;
  readonly modules: readonly string[];
  readonly allowances: {
    readonly members: number;
    readonly sms: number;
    readonly whatsapp: number;
    readonly storageGb: number;
  };
  readonly platformFee?: { readonly flat: Money; readonly upTo: Money; readonly percent: string };
}

/** An institution's request for another plan (SAS-037). */
export interface PlanRequest {
  readonly id: string;
  readonly plan: { readonly id: string; readonly name: string };
  readonly timing: 'NOW' | 'RENEWAL';
  readonly note: string | null;
  readonly status: 'PENDING' | 'APPLIED' | 'DECLINED' | 'WITHDRAWN';
  readonly requestedAt: string;
  readonly requestedBy: string | null;
  readonly resolvedAt: string | null;
  readonly resolution: string | null;
}

export interface PlanChangeResult {
  readonly plan: string;
  readonly effective: 'NOW' | 'RENEWAL';
  readonly effectiveOn: string;
  readonly switchedOff: readonly string[];
  readonly invoice: { id: string; invoiceNo: string; total: Money; dueOn: string } | null;
}

export interface InstitutionRow {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly shortName: string;
  readonly institutionType?: string;
  readonly affiliation?: string | null;
  readonly city: string;
  readonly status: InstitutionStatus;
  readonly statusSince: string | null;
  readonly plan: { id: string; code: string; name: string; cycle: 'MONTHLY' | 'ANNUAL' } | null;
  readonly subscriptionStatus: string | null;
  readonly trialEndsOn: string | null;
  readonly members: number;
  readonly checklist: { done: number; total: number };
  readonly registeredAt: string;
}

export interface Contact {
  readonly name: string;
  readonly email: string | null;
  readonly mobile: string | null;
}

export interface ChecklistStep {
  readonly key: string;
  readonly label: string;
  readonly owner: 'Operator' | 'Institution';
  readonly required: boolean;
  readonly ref: string;
  readonly done: boolean;
  readonly doneAt: string | null;
  readonly note: string | null;
}

export interface InstitutionDetail {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly shortName: string;
  readonly institutionType?: string;
  readonly affiliation?: string | null;
  readonly city: string;
  readonly address: string;
  readonly pinCode: string | null;
  readonly board: string | null;
  readonly status: InstitutionStatus;
  readonly suspendedAt: string | null;
  readonly cancelledAt: string | null;
  readonly registeredAt: string;
  readonly corporateCode: string | null;
  readonly poolAccountRef: string | null;
  readonly plan: Plan | null;
  readonly subscription: {
    status: string | null;
    trialEndsOn: string | null;
    renewsOn: string | null;
    scheduledChange: { plan: string; on: string } | null;
  } | null;
  readonly planRequests: readonly PlanRequest[];
  readonly contacts: { primary: Contact | null; secondary: Contact | null };
  /** `pending`: registered before the administrator's CampusOne account exists (client 2026-10-06). */
  readonly administrator: {
    name: string | null;
    email: string | null;
    pending?: boolean;
  } | null;
  readonly members: number;
  readonly checklist: readonly ChecklistStep[];
  readonly missing: readonly string[];
  readonly actions: readonly { action: LifecycleAction; label: string; blocked: boolean }[];
  readonly history: readonly {
    action: string;
    step: string | null;
    from: string | null;
    to: string | null;
    reason: string | null;
    at: string;
    by: string;
  }[];
  readonly version: number;
}

export interface Lock {
  readonly kind: 'PLAN' | 'NEEDS' | 'ALWAYS_ON';
  readonly text: string;
}

export interface FeatureRow {
  readonly key: string;
  readonly label: string;
  readonly sub: string;
  readonly consoleLabel: string;
  readonly consoleSub: string;
  readonly icon: string;
  readonly module: string | null;
  readonly group: 'Money' | 'Campus';
  readonly cr: string | null;
  readonly enabled: boolean;
  readonly lock: Lock | null;
}

export interface ChannelRow {
  readonly key: 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';
  readonly label: string;
  readonly consoleSub: string;
  readonly icon: string;
  readonly allowance: number | null;
  readonly enabled: boolean;
  readonly lock: Lock | null;
}

export interface FeaturePermissions {
  readonly institution: { id: string; name: string; shortName: string; status: InstitutionStatus };
  readonly plan: { id: string; name: string; code: string } | null;
  readonly features: readonly FeatureRow[];
  readonly channels: readonly ChannelRow[];
  readonly version: number;
}

export interface FeatureChange {
  readonly id: string;
  readonly institutionId: string;
  readonly institution: string;
  readonly key: string;
  readonly label: string;
  readonly from: boolean;
  readonly to: boolean;
  readonly reason: string | null;
  readonly by: string;
  readonly at: string;
}

export interface ContactInput {
  readonly name: string;
  readonly email: string;
  readonly mobile: string;
}

export interface RegisterInput {
  readonly name: string;
  readonly address: string;
  readonly city: string;
  readonly institutionType?: string;
  readonly board?: string;
  readonly affiliation?: string;
  readonly primaryContact: ContactInput;
  readonly secondaryContact?: ContactInput;
  readonly adminEmail: string;
  readonly adminName?: string;
  readonly adminMobile?: string;
  readonly planId?: string;
}

const ifMatch = (v: number) => ({ 'If-Match': `"v${v}"` });
const BASE = '/api/v1/ops/institutions';

@Injectable({ providedIn: 'root' })
export class InstitutionsApi {
  private readonly http = inject(HttpClient);

  plans() {
    return firstValueFrom(this.http.get<{ items: Plan[] }>('/api/v1/ops/plans'));
  }

  list() {
    return firstValueFrom(this.http.get<{ items: InstitutionRow[] }>(BASE));
  }

  detail(id: string) {
    return firstValueFrom(this.http.get<InstitutionDetail>(`${BASE}/${id}`));
  }

  register(body: RegisterInput) {
    return firstValueFrom(
      this.http.post<{
        id: string;
        identifier: string;
        version: number;
        administrator?: {
          email: string;
          pending: boolean;
          accountCreated?: boolean;
          /** Shown once (client 2026-10-07); never answered again. */
          temporaryPassword?: string;
        };
      }>(BASE, body, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }

  edit(id: string, version: number, body: { planId?: string; reason?: string }) {
    return firstValueFrom(
      this.http.patch<{ id: string; version: number }>(`${BASE}/${id}`, body, {
        headers: ifMatch(version),
      }),
    );
  }

  /** SAS-034: a plan change once the subscription runs (now or at renewal). */
  changePlan(id: string, body: { planId: string; timing: 'NOW' | 'RENEWAL'; reason: string }) {
    return firstValueFrom(
      this.http.post<PlanChangeResult>(`${BASE}/${id}/plan-changes`, body, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }

  /** SAS-035 */
  cancelScheduled(id: string, reason: string) {
    return firstValueFrom(
      this.http.post<void>(`${BASE}/${id}/plan-changes/scheduled/cancel`, { reason }),
    );
  }

  /** SAS-036 */
  declineRequest(requestId: string, reason: string) {
    return firstValueFrom(
      this.http.post<{ status: 'DECLINED' }>(
        `/api/v1/ops/plan-change-requests/${requestId}/decline`,
        { reason },
      ),
    );
  }

  lifecycle(id: string, action: LifecycleAction, reason: string) {
    return firstValueFrom(
      this.http.post<{
        status: InstitutionStatus;
        version: number;
        notified: string[];
        invoice: { id: string; invoiceNo: string; total: Money; dueOn: string } | null;
      }>(
        `${BASE}/${id}/lifecycle-events`,
        { action, reason },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      ),
    );
  }

  bank(id: string, version: number, body: { corporateCode: string; poolAccountRef: string }) {
    return firstValueFrom(
      this.http.put<{ corporateCode: string; version: number }>(
        `${BASE}/${id}/bank-arrangement`,
        body,
        { headers: ifMatch(version) },
      ),
    );
  }

  markStep(id: string, step: string) {
    return firstValueFrom(
      this.http.post<{ step: string; done: number; total: number }>(
        `${BASE}/${id}/checklist/${step}`,
        {},
      ),
    );
  }

  features(id: string) {
    return firstValueFrom(this.http.get<FeaturePermissions>(`${BASE}/${id}/features`));
  }

  changeFeatures(
    id: string,
    version: number,
    changes: readonly { key: string; enabled: boolean }[],
    reason?: string,
  ) {
    return firstValueFrom(
      this.http.patch<FeaturePermissions>(
        `${BASE}/${id}/features`,
        { changes, ...(reason ? { reason } : {}) },
        { headers: ifMatch(version) },
      ),
    );
  }

  featureLog(institutionId: string) {
    return firstValueFrom(
      this.http.get<{ items: FeatureChange[] }>(
        `/api/v1/ops/feature-change-log?institutionId=${institutionId}`,
      ),
    );
  }
}
