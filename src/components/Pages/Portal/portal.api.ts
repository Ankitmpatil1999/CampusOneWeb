/** Customer portal API (SAS-001…025, SAS-044…050; prototype s.*). */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PortalInstitutionStatus } from '../../../Context/PortalContext';
import { downloadFile } from '../../Utils/download';
import { newIdempotencyKey } from '../../Utils/ids';
import { SURFACE_HEADER } from '../../Utils/web-session';
import type { FeatureRow, Money } from '../Backoffice/Institutions/institutions.api';
import type { Invoice } from '../Backoffice/Plans/plans.api';
import type { ConsoleSubscriptionView } from '../Console/Subscription/subscription.api';

export type { Invoice, Money };

/** SAS-001: a plan one can sign up for (the terms in force). */
export interface PortalPlan {
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

export interface PortalPlans {
  readonly items: readonly PortalPlan[];
  readonly graceDays: number;
  readonly dueDays: number;
}

/** SAS-002: the code sent to the administrator's mobile. */
export interface SignupChallenge {
  readonly challengeId: string;
  readonly expiresAt: string;
  readonly resendAfterSeconds: number;
  readonly sentTo: string;
  readonly alreadySent?: boolean;
  /** Test mode only (OTP_TEST_SHOW_CODE; never in production). */
  readonly testCode?: string;
  /** A number without a CampusOne account: it is made on this site (SAS-051). */
  readonly newAccount?: boolean;
}

export interface SignupVerified {
  readonly signupToken: string;
  readonly expiresAt: string;
  /** True: no account yet — create it next (SAS-051) with this token. */
  readonly newAccount: boolean;
  readonly account: {
    readonly name: string;
    readonly email: string | null;
    readonly mobile: string;
  } | null;
  /** An institution registered in the back office waits for this e-mail (SAS-052/053). */
  readonly invited: boolean;
}

/** SAS-051: the administrator's CampusOne account made on the customer site. */
export interface SignupAccountInput {
  readonly signupToken: string;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly email: string;
  readonly password: string;
}

/** SAS-053: the e-mail confirmed; `joined` names the institution that now has this administrator. */
export interface SignupEmailVerified {
  readonly emailVerified: boolean;
  readonly joined: { readonly institution: string; readonly identifier: string } | null;
}

export interface ContactInput {
  readonly name: string;
  readonly email: string;
  readonly mobile: string;
}

export interface SignupInput {
  readonly signupToken: string;
  readonly institution: {
    readonly name: string;
    readonly address: string;
    readonly city: string;
    readonly pinCode: string;
    readonly board: string;
    readonly students: number;
  };
  readonly primaryContact: ContactInput;
  readonly secondaryContact?: ContactInput | null;
  readonly planId: string;
  readonly start: 'TRIAL' | 'PAY';
  readonly accept: {
    readonly subscription: boolean;
    readonly dataProcessing: boolean;
    readonly authorised: boolean;
  };
}

export interface SignedUp {
  readonly institutionId: string;
  readonly identifier: string;
  readonly name: string;
}

export type StepKey =
  | 'details'
  | 'plan'
  | 'bank'
  | 'toggles'
  | 'usertypes'
  | 'year'
  | 'feeacct'
  | 'branding'
  | 'firstusers';

/** SAS-008: the onboarding checklist. */
export interface Onboarding {
  readonly status: PortalInstitutionStatus;
  readonly startPreference: 'TRIAL' | 'PAY' | null;
  readonly steps: readonly {
    readonly key: StepKey;
    readonly label: string;
    readonly required: boolean;
    readonly byCampusOne: boolean;
    readonly done: boolean;
    readonly doneAt: string | null;
    readonly summary: string;
  }[];
  readonly done: number;
  readonly total: number;
  readonly canGoLive: boolean;
  readonly missing: readonly string[];
  readonly plan: { readonly id: string; readonly name: string; readonly code: string } | null;
  readonly features: readonly FeatureRow[];
  readonly version: number;
}

export type PortalUserTypeCategory =
  'STUDENT' | 'PARENT' | 'TEACHER' | 'STAFF' | 'MANAGEMENT' | 'CREW' | 'OTHER';

export type StepBody =
  | { readonly key: 'toggles'; readonly features: Readonly<Record<string, boolean>> }
  | {
      readonly key: 'usertypes';
      readonly userTypes: readonly {
        name: string;
        category: PortalUserTypeCategory;
        departments: readonly string[];
      }[];
    }
  | {
      readonly key: 'year';
      readonly label: string;
      readonly startsOn: string;
      readonly endsOn: string;
    }
  | {
      readonly key: 'feeacct';
      readonly name: string;
      readonly bank: string;
      readonly ifsc: string;
      readonly accountNo: string;
    }
  | { readonly key: 'branding'; readonly logoFileId?: string }
  | { readonly key: 'firstusers' };

export interface Notice {
  readonly action: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly reason: string;
  readonly at: string;
  readonly by: string;
}

export type PortalSubscription = ConsoleSubscriptionView;

/** SAS-007: the overview. */
export interface PortalAccount {
  readonly institution: {
    readonly id: string;
    readonly identifier: string;
    readonly name: string;
    readonly city: string;
    readonly status: PortalInstitutionStatus;
    readonly signupSource: 'OPERATOR' | 'PORTAL';
    readonly startPreference: 'TRIAL' | 'PAY' | null;
    readonly since: string | null;
  };
  readonly billing: PortalSubscription;
  readonly onboarding: {
    readonly done: number;
    readonly total: number;
    readonly canGoLive: boolean;
    readonly missing: readonly string[];
  };
  readonly notices: readonly Notice[];
}

export interface PortalContact {
  readonly name: string;
  readonly email: string | null;
  readonly mobile: string | null;
}

/** SAS-020: institution details, contacts, bank references and change requests. */
export interface InstitutionDetails {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly address: string;
  readonly city: string;
  readonly pinCode: string | null;
  readonly board: string | null;
  readonly status: PortalInstitutionStatus;
  readonly registeredAt: string | null;
  readonly signupSource: 'OPERATOR' | 'PORTAL';
  readonly contacts: {
    readonly primary: PortalContact | null;
    readonly secondary: PortalContact | null;
  };
  readonly administrator: { readonly name: string | null; readonly email: string | null } | null;
  readonly bank: {
    readonly corporateCode: string | null;
    readonly poolAccount: string | null;
    readonly feeAccount: string | null;
  };
  readonly changeRequests: readonly {
    readonly id: string;
    readonly no: string;
    readonly summary: string;
    readonly status: string;
    readonly remarks: string | null;
    readonly at: string;
    readonly decidedAt: string | null;
  }[];
  readonly version: number;
}

export type ExportClass = 'members' | 'financial' | 'academic' | 'attendance' | 'communication';

export interface DataExport {
  readonly id: string;
  readonly status: 'REQUESTED' | 'RUNNING' | 'READY' | 'EXPIRED' | 'FAILED';
  readonly counts: Readonly<Record<string, number>> | null;
  readonly requestedAt: string;
  readonly readyAt: string | null;
  readonly expiresAt: string | null;
  readonly file: { readonly name: string; readonly sizeBytes: number; readonly url: string } | null;
  readonly error: string | null;
}

export interface Cancellation {
  readonly status: string;
  readonly renewsOn: string | null;
  readonly unpaid: readonly {
    readonly invoiceNo: string;
    readonly total: string;
    readonly status: string;
  }[];
  /** Member wallets still holding money, refunded before closing (4.10). */
  readonly walletsToRefund: {
    readonly count: number;
    readonly amount: { readonly amount: string; readonly currency: 'INR' };
  };
  readonly request: {
    readonly id: string;
    readonly status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'WITHDRAWN';
    readonly effectiveOn: string;
    readonly reason: string;
    readonly requestedAt: string;
    readonly resolvedAt: string | null;
    readonly resolution: string | null;
    readonly version: number;
  } | null;
}

const P = '/api/v1/portal';
const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });

@Injectable({ providedIn: 'root' })
export class PortalApi {
  private readonly http = inject(HttpClient);

  // --- public: plans and sign-up (SAS-001…004) ---------------------------------------------------------
  plans() {
    return firstValueFrom(this.http.get<PortalPlans>(`${P}/plans`));
  }

  signupOtp(mobile: string) {
    return firstValueFrom(this.http.post<SignupChallenge>(`${P}/signup/otp`, { mobile }));
  }

  signupVerify(challengeId: string, otp: string, mobile?: string) {
    return firstValueFrom(
      this.http.post<SignupVerified>(`${P}/signup/otp/verify`, {
        challengeId,
        otp,
        ...(mobile ? { mobile } : {}),
      }),
    );
  }

  signupAccount(body: SignupAccountInput) {
    return firstValueFrom(this.http.post<SignupVerified>(`${P}/signup/account`, body));
  }

  signupEmailCode(signupToken: string) {
    return firstValueFrom(
      this.http.post<SignupChallenge>(`${P}/signup/email-code`, { signupToken }),
    );
  }

  signupEmailVerify(signupToken: string, challengeId: string, otp: string) {
    return firstValueFrom(
      this.http.post<SignupEmailVerified>(`${P}/signup/email-code/verify`, {
        signupToken,
        challengeId,
        otp,
      }),
    );
  }

  signup(body: SignupInput) {
    return firstValueFrom(this.http.post<SignedUp>(`${P}/signup`, body));
  }

  // --- signed in -----------------------------------------------------------------------------------------
  account() {
    return firstValueFrom(this.http.get<PortalAccount>(`${P}/account`));
  }

  onboarding() {
    return firstValueFrom(this.http.get<Onboarding>(`${P}/onboarding`));
  }

  step(input: StepBody) {
    const { key, ...body } = input;
    return firstValueFrom(this.http.put<Onboarding>(`${P}/onboarding/steps/${key}`, body));
  }

  /** The logo file (purpose `logo`); /api/v1/files is shared, so the surface is named. */
  async uploadLogo(file: File) {
    const form = new FormData();
    form.append('purpose', 'logo');
    form.append('file', file);
    return firstValueFrom(
      this.http.post<{ fileId: string }>('/api/v1/files', form, {
        headers: { [SURFACE_HEADER]: 'portal' },
      }),
    );
  }

  goLive(mode: 'TRIAL' | 'PAY') {
    return firstValueFrom(
      this.http.post<{
        status: string;
        invoice: { id: string; invoiceNo: string; total: Money; dueOn: string } | null;
      }>(`${P}/go-live`, { mode }, { headers: once() }),
    );
  }

  subscription() {
    return firstValueFrom(this.http.get<PortalSubscription>(`${P}/subscription`));
  }

  changePlan(planId: string, timing: 'NOW' | 'RENEWAL') {
    return firstValueFrom(
      this.http.post<PortalSubscription>(
        `${P}/subscription/plan-changes`,
        { planId, timing },
        { headers: once() },
      ),
    );
  }

  undoScheduledChange() {
    return firstValueFrom(this.http.delete<void>(`${P}/subscription/scheduled-change`));
  }

  invoices() {
    return firstValueFrom(this.http.get<{ items: Invoice[] }>(`${P}/invoices`));
  }

  invoice(id: string) {
    return firstValueFrom(this.http.get<Invoice>(`${P}/invoices/${id}`));
  }

  pdf(invoice: { id: string; invoiceNo: string }) {
    return downloadFile(this.http, `${P}/invoices/${invoice.id}/pdf`, `${invoice.invoiceNo}.pdf`);
  }

  /** SAS-017: a bank transfer is reported; online payment answers SAS.GATEWAY_UNAVAILABLE (Q17). */
  pay(
    invoiceId: string,
    body: { method: 'BANK_TRANSFER'; utr: string; paidOn: string } | { method: 'GATEWAY' },
  ) {
    return firstValueFrom(
      this.http.post<Invoice>(`${P}/invoices/${invoiceId}/payments`, body, { headers: once() }),
    );
  }

  notices() {
    return firstValueFrom(this.http.get<{ items: Notice[] }>(`${P}/notices`));
  }

  details() {
    return firstValueFrom(this.http.get<InstitutionDetails>(`${P}/institution-details`));
  }

  saveContacts(
    version: number,
    body: { primaryContact: ContactInput; secondaryContact: ContactInput | null },
  ) {
    return firstValueFrom(
      this.http.put<InstitutionDetails>(`${P}/institution-details/contacts`, body, {
        headers: { 'If-Match': `"v${version}"` },
      }),
    );
  }

  requestDetailsChange(body: {
    field: 'NAME' | 'ADDRESS' | 'BOARD';
    value: string;
    reason: string;
  }) {
    return firstValueFrom(
      this.http.post<{ approvalId: string; no: string }>(
        `${P}/institution-details/change-requests`,
        body,
        { headers: once() },
      ),
    );
  }

  exports() {
    return firstValueFrom(this.http.get<{ items: DataExport[] }>(`${P}/data-exports`));
  }

  requestExport(classes: readonly ExportClass[]) {
    return firstValueFrom(
      this.http.post<DataExport>(`${P}/data-exports`, { classes }, { headers: once() }),
    );
  }

  cancellation() {
    return firstValueFrom(this.http.get<Cancellation>(`${P}/cancellation`));
  }

  requestCancellation(body: {
    when: 'END_OF_CYCLE' | 'ASAP' | 'DATE';
    effectiveOn?: string;
    reason: string;
  }) {
    return firstValueFrom(
      this.http.post<{ id: string; effectiveOn: string; status: 'PENDING' }>(
        `${P}/cancellation-requests`,
        body,
        { headers: once() },
      ),
    );
  }

  withdrawCancellation(id: string) {
    return firstValueFrom(this.http.delete<void>(`${P}/cancellation-requests/${id}`));
  }
}
