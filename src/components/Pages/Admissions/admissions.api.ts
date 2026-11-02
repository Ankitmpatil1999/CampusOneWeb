/**
 * Public admissions API (ADM-001…012, ADM-025; prototype p.admission, p.form, p.pay, p.done,
 * p.status). A family reaches its applications only through a token: the resume token (ADM-003 or
 * ADM-004) or an admission-fee payment link token, sent as `X-Admission-Token`.
 */
import { HttpClient, HttpEventType, type HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, filter, map, tap } from 'rxjs';
import { downloadFile } from '../../Utils/download';
import { newIdempotencyKey } from '../../Utils/ids';

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

export const TOKEN_HEADER = 'X-Admission-Token';

export type AppStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type DocType =
  | 'PHOTO'
  | 'BIRTH'
  | 'ADDRESS'
  | 'REPORT'
  | 'TC'
  | 'OTHER'
  // The Aadhaar and PAN cards, front and back: the student's, each parent's and the local
  // guardian's (client 2026-10-13).
  | `${CardOwner}_${'AADHAAR' | 'PAN'}_${'FRONT' | 'BACK'}`;
export type CardOwner = 'STUDENT' | 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'LOCAL_GUARDIAN';

/** A person's Aadhaar and PAN, masked ("XXXX XXXX 1234", "••••••234F"); null when not given. */
export interface MaskedIds {
  readonly aadhaar: string | null;
  readonly pan: string | null;
}

/** ADM-034: a short-lived link to open an attachment. */
export interface DocumentLink {
  readonly url: string;
  readonly expiresAt: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}
export type FeeType = 'APPLICATION' | 'ADMISSION';
export type FeeStatus = 'PENDING' | 'PAID' | 'FAILED';
export type Relation = 'FATHER' | 'MOTHER' | 'GUARDIAN';

/** ADM-001: a year open for admission (regular, or mid-term when it has started). */
export interface OpenYear {
  readonly id: string;
  readonly label: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly kind: 'REGULAR' | 'MID_TERM';
  readonly fees: {
    readonly applicationFee: Money;
    readonly applicationMandatory: boolean;
    readonly admissionFee: Money;
  } | null;
}

export interface LandingClass {
  readonly id: string;
  readonly name: string;
  readonly ageBand: { readonly min: number; readonly max: number } | null;
}

export interface LandingField {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly required: boolean;
  readonly options: readonly { readonly id: string; readonly label: string }[];
}

/** ADM-001: the landing of a link — only what a family needs (RNG-GOV-007). */
export interface Landing {
  readonly institution: {
    readonly name: string;
    readonly shortName: string | null;
    readonly city: string | null;
    /** The school's logo (INS-049, client 2026-10-15), or null when none is uploaded. */
    readonly logoUrl?: string | null;
  };
  readonly preselectedYearId: string | null;
  readonly years: readonly OpenYear[];
  readonly classes: readonly LandingClass[];
  readonly customFields: readonly LandingField[];
  /** The school's pick-up stops, for a family opting for transport (client 2026-10-12). */
  readonly transportStops?: readonly {
    readonly id: string;
    readonly name: string;
    readonly landmark: string | null;
  }[];
  readonly rules: {
    readonly ageMeasuredOn: string;
    readonly documents: { readonly maxBytes: number; readonly types: readonly string[] };
    readonly references: { readonly max: number; readonly midTermMin: number };
  };
}

/** ADM-002 */
export interface ResumeSent {
  readonly challengeId: string;
  readonly requestToken: string;
  readonly sentTo: string | null;
  /** Test mode only (OTP_TEST_SHOW_CODE; never in production). */
  readonly testCode?: string;
}

/** ADM-003: one of the family's applications — masked, no personal record. */
export interface ResumeMatch {
  readonly id: string;
  readonly applicationNo: string;
  readonly status: AppStatus;
  readonly name: string;
  readonly classApplied: string | null;
  readonly year: string;
  readonly midTerm: boolean;
  readonly step: number;
  readonly updatedAt: string | null;
}

export interface ResumeVerified {
  readonly applications: readonly ResumeMatch[];
  readonly resumeToken: string;
  readonly expiresAt: string;
}

export interface Address {
  readonly line1: string;
  readonly line2?: string | null;
  readonly city: string;
  readonly state: string;
  readonly pin: string;
}

export interface Person {
  readonly name: string;
  readonly mobile?: string | null;
  readonly email?: string | null;
  readonly occupation?: string | null;
  /** The father's and the mother's, in rupees (client 2026-10-14). */
  readonly annualIncome?: number | null;
  readonly relation?: string;
}

export interface FeeRow {
  readonly id: string;
  readonly feeType: FeeType;
  readonly amount: Money;
  readonly status: FeeStatus;
  readonly mode: 'ONLINE' | 'CASH' | null;
  readonly receiptNo: string | null;
  /** The payment gateway's transaction ID of an online payment (client 2026-10-16). */
  readonly transactionId?: string | null;
  readonly paidAt: string | null;
  readonly failureReason: string | null;
}

/** ADM-025 (resume token): the family's application. */
export interface Application {
  readonly id: string;
  readonly applicationNo: string;
  readonly status: AppStatus;
  readonly step: number;
  readonly year: { readonly id: string; readonly label: string };
  readonly class: { readonly id: string; readonly name: string } | null;
  readonly midTerm: boolean;
  readonly joiningDate: string | null;
  readonly midTermReason: string | null;
  readonly student: {
    readonly firstName: string | null;
    readonly middleName: string | null;
    readonly lastName: string | null;
    readonly gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
    readonly dob: string | null;
    /** Masked ("XXXX XXXX 1234"): the numbers are never read back (client 2026-10-12). */
    readonly aadhaar?: string | null;
    readonly pan?: string | null;
    readonly category?: string | null;
    readonly medium?: string | null;
    readonly bloodGroup?: string | null;
    readonly allergies?: string | null;
    readonly health?: string | null;
    /** The student's own contact (client 2026-10-23). */
    readonly mobile?: string | null;
    readonly email?: string | null;
  };
  readonly addresses: {
    readonly residential: Address;
    readonly sameAsResidential: boolean;
    readonly correspondence?: Address | null;
  } | null;
  readonly previous: {
    readonly school?: string | null;
    readonly lastClass?: string | null;
    readonly result?: string | null;
    readonly board?: string | null;
    readonly otherBoard?: string | null;
  } | null;
  readonly parents: {
    readonly father?: Person | null;
    readonly mother?: Person | null;
    readonly guardian?: Person | null;
    readonly primary: Relation;
    /** Whether the parents have a single child or more (client 2026-10-12). */
    readonly children?: 'SINGLE' | 'MORE' | null;
    /** School transport (client 2026-10-12); absent on applications from before. */
    readonly transport?: boolean;
    readonly transportStop?: { readonly id: string; readonly name: string } | null;
    readonly hostel?: boolean;
    readonly localGuardian?: {
      readonly name: string;
      readonly relation: string;
      readonly mobile: string;
      readonly address: string;
    } | null;
  } | null;
  readonly primaryContact: {
    readonly name: string | null;
    readonly relation: Relation | null;
    readonly mobile: string | null;
    readonly email: string | null;
    /** The primary contact's Aadhaar and PAN, masked (client 2026-10-12). */
    readonly aadhaar?: string | null;
    readonly pan?: string | null;
  };
  /** Each person's Aadhaar and PAN, masked (client 2026-10-13); absent from older servers. */
  readonly identityNumbers?: {
    readonly father: MaskedIds;
    readonly mother: MaskedIds;
    readonly guardian: MaskedIds;
    readonly localGuardian: MaskedIds;
  };
  readonly customFields: Readonly<Record<string, unknown>>;
  readonly tc: {
    readonly mode: 'TC' | 'UNDERTAKING';
    readonly number: string | null;
    readonly date: string | null;
    readonly dueDate: string | null;
  } | null;
  readonly references: readonly {
    readonly id: string;
    readonly name: string;
    readonly relation: string | null;
    readonly mobile: string;
    readonly email: string | null;
  }[];
  readonly documents: readonly {
    readonly type: DocType;
    readonly name: string;
    readonly sizeBytes: number;
    readonly mimeType: string;
    readonly addedAt: string | null;
  }[];
  readonly fees: readonly FeeRow[];
  /** The admission fee still to pay — with the submitted form, or later (client 2026-10-09). */
  readonly admissionFeeDue?: Money | null;
  readonly declaration: { readonly at: string | null; readonly by: string | null } | null;
  /** When the family agreed that what was collected registers their CampusOne account. */
  readonly registrationConsentAt?: string | null;
  /**
   * The primary contact's mobile was verified with a one-time code (client 2026-10-27); false
   * again as soon as the primary contact or their mobile changes. Needed to submit.
   */
  readonly contactVerified: boolean;
  readonly submittedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly version: number;
}

/** The code sent to the primary contact's saved mobile (client 2026-10-27). */
export interface ContactCodeSent {
  readonly challengeId: string;
  readonly sentTo: string;
  readonly expiresAt: string;
  /** Seconds before another code can be asked for, when the server says. */
  readonly resendAfterSeconds?: number;
  /** Test mode only (OTP_TEST_SHOW_CODE; never in production). */
  readonly testCode?: string;
}

/** ADM-025 (payment link token): the checkout summary only. */
export interface PaySummary {
  readonly id: string;
  readonly applicationNo: string;
  readonly status: AppStatus;
  readonly year: { readonly id: string; readonly label: string };
  readonly class: { readonly id: string; readonly name: string } | null;
  readonly student: { readonly name: string };
  readonly fees: readonly FeeRow[];
  readonly version: number;
}

export type SectionName =
  'class' | 'student' | 'addresses' | 'previous' | 'parents' | 'customFields';

/** ADM-004 */
export interface Created {
  readonly application: Application;
  readonly resumeToken: string;
  readonly expiresAt: string;
}

/** ADM-009 */
export interface Submitted {
  readonly status: 'DRAFT' | 'SUBMITTED';
  readonly applicationNo: string;
  readonly feeDue: {
    readonly amount: string;
    readonly currency: 'INR';
    readonly mandatory: boolean;
  } | null;
}

/** ADM-010: the gateway order for one fee row (a new gateway order each try). */
export interface PaymentOrder {
  readonly paymentId: string;
  readonly feeType: FeeType;
  /** The fees this order pays: the application and admission fees together when chosen. */
  readonly includes?: readonly FeeType[];
  /** The order's total. */
  readonly amount: Money;
  readonly gatewayOrder: {
    readonly orderId: string;
    readonly amount: Money;
    readonly mode: 'test' | 'live';
    /** Test mode only: the payment id and signature a successful checkout would return. */
    readonly test?: { readonly paymentId: string; readonly signature: string };
    /** Live (Razorpay, client 2026-10-09): open the gateway's checkout with this public key. */
    readonly checkout?: { readonly keyId: string; readonly name: string };
  };
}

/** ADM-011 */
export interface PaymentVerified {
  readonly status: 'PAID';
  readonly receiptNo: string | null;
  /** The payment gateway's transaction ID (client 2026-10-16). */
  readonly transactionId?: string | null;
  /** Each fee the order paid, with its own receipt. */
  readonly receipts?: readonly { readonly feeType: FeeType; readonly receiptNo: string | null }[];
  readonly applicationStatus: AppStatus;
}

type FeeState = {
  readonly status: FeeStatus | 'NOT_DUE';
  readonly amount: Money;
  /** The payment gateway's transaction ID of an online payment (client 2026-10-16). */
  readonly transactionId?: string | null;
} | null;

/** ADM-012: progress only — never the family's details (RNG-GOV-007). */
export interface StatusView {
  readonly applicationNo: string;
  readonly status: AppStatus;
  readonly name: string;
  readonly classApplied: string | null;
  readonly year: string;
  readonly midTerm: boolean;
  readonly joiningDate: string | null;
  readonly createdAt: string | null;
  readonly submittedAt: string | null;
  readonly decidedAt: string | null;
  readonly admissionNo: string | null;
  readonly rejectionReason: string | null;
  readonly tc: { readonly mode: 'TC' | 'UNDERTAKING'; readonly dueDate: string | null } | null;
  readonly fees: { readonly application: FeeState; readonly admission: FeeState };
}

const base = '/api/v1/public/admissions';
const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });
const tok = (token: string) => ({ [TOKEN_HEADER]: token });

@Injectable({ providedIn: 'root' })
export class AdmissionsApi {
  private readonly http = inject(HttpClient);

  /** ADM-001 */
  landing(link: string) {
    return firstValueFrom(this.http.get<Landing>(`${base}/${encodeURIComponent(link)}`));
  }

  /** ADM-002: by the primary contact's mobile (client 2026-10-12). */
  resumeAsk(link: string, body: { mobile: string }) {
    return firstValueFrom(
      this.http.post<ResumeSent>(`${base}/${encodeURIComponent(link)}/resume`, body),
    );
  }

  /** ADM-003 */
  resumeVerify(link: string, body: { challengeId: string; requestToken: string; otp: string }) {
    return firstValueFrom(
      this.http.post<ResumeVerified>(`${base}/${encodeURIComponent(link)}/resume/verify`, body),
    );
  }

  /** ADM-004: a draft with the class section (and the step reached). */
  create(link: string, body: { class: unknown; step?: number }) {
    return firstValueFrom(
      this.http.post<Created>(`${base}/${encodeURIComponent(link)}/applications`, body, {
        headers: once(),
      }),
    );
  }

  /** ADM-025 */
  read<T = Application>(id: string, token: string) {
    return firstValueFrom(
      this.http.get<T>(`${base}/applications/${encodeURIComponent(id)}`, { headers: tok(token) }),
    );
  }

  /** ADM-032: the submitted application form as a PDF, saved by the browser (client 2026-10-13). */
  formPdf(id: string, token: string, applicationNo: string) {
    return downloadFile(
      this.http,
      `${base}/applications/${encodeURIComponent(id)}/form.pdf`,
      `Application-${applicationNo.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`,
      tok(token),
    );
  }

  /** ADM-005: one section of the draft. */
  save(id: string, token: string, body: { section: SectionName; data: unknown; step?: number }) {
    return firstValueFrom(
      this.http.patch<Application>(`${base}/applications/${encodeURIComponent(id)}`, body, {
        headers: tok(token),
      }),
    );
  }

  /** ADM-006: a document (2 MB, PDF/JPG/PNG; replaces the same type), with upload progress. */
  document(
    id: string,
    token: string,
    type: DocType,
    file: File,
    progress: (pct: number) => void = () => undefined,
  ) {
    const form = new FormData();
    form.append('documentType', type);
    form.append('file', file, file.name);
    return firstValueFrom(
      this.http
        .post<Application>(`${base}/applications/${encodeURIComponent(id)}/documents`, form, {
          headers: { ...tok(token), ...once() },
          reportProgress: true,
          observe: 'events',
        })
        .pipe(
          tap((e: HttpEvent<Application>) => {
            if (e.type === HttpEventType.UploadProgress && e.total) {
              progress(Math.round((100 * e.loaded) / e.total));
            }
          }),
          filter((e) => e.type === HttpEventType.Response),
          map((e) => (e as { body: Application }).body),
        ),
    );
  }

  /** ADM-033: an attachment removed from the draft (client 2026-10-13). */
  removeDocument(id: string, token: string, type: DocType) {
    return firstValueFrom(
      this.http.delete<Application>(
        `${base}/applications/${encodeURIComponent(id)}/documents/${type}`,
        { headers: tok(token) },
      ),
    );
  }

  /** ADM-034: a short-lived link to open an attachment (client 2026-10-13). */
  documentLink(id: string, token: string, type: DocType) {
    return firstValueFrom(
      this.http.get<DocumentLink>(
        `${base}/applications/${encodeURIComponent(id)}/documents/${type}`,
        { headers: tok(token) },
      ),
    );
  }

  /** The attachment itself, through its short-lived link, to show it in the page (2026-10-14). */
  documentFile(url: string) {
    return firstValueFrom(this.http.get(url, { responseType: 'blob' }));
  }

  /** ADM-007 */
  addReference(
    id: string,
    token: string,
    body: { name: string; relation: string | null; mobile: string; email: string | null },
  ) {
    return firstValueFrom(
      this.http.post<Application>(
        `${base}/applications/${encodeURIComponent(id)}/references`,
        body,
        {
          headers: { ...tok(token), ...once() },
        },
      ),
    );
  }

  /** ADM-008 */
  removeReference(id: string, token: string, refId: string) {
    return firstValueFrom(
      this.http.delete<void>(
        `${base}/applications/${encodeURIComponent(id)}/references/${encodeURIComponent(refId)}`,
        { headers: tok(token) },
      ),
    );
  }

  /** ADM-009 */
  /**
   * The declaration and the consent to register the family's CampusOne account with what was
   * collected (client 2026-10-12) are both required. `payLater`: submitted at once, the
   * application fee paid in cash at the desk later.
   */
  submit(id: string, token: string, payLater = false) {
    return firstValueFrom(
      this.http.post<Submitted>(
        `${base}/applications/${encodeURIComponent(id)}/submission`,
        {
          declarationAccepted: true,
          registrationConsent: true,
          ...(payLater ? { payLater: true } : {}),
        },
        { headers: { ...tok(token), ...once() } },
      ),
    );
  }

  /**
   * A one-time code to the primary contact's saved mobile (client 2026-10-27); ADM.CONTACT_MOBILE_
   * MISSING while none is saved.
   */
  contactOtp(id: string, token: string) {
    return firstValueFrom(
      this.http.post<ContactCodeSent>(
        `${base}/applications/${encodeURIComponent(id)}/contact-otp`,
        {},
        { headers: tok(token) },
      ),
    );
  }

  /** The code entered: the application, its primary contact verified (client 2026-10-27). */
  verifyContactOtp(id: string, token: string, body: { challengeId: string; otp: string }) {
    return firstValueFrom(
      this.http.post<{ application: Application }>(
        `${base}/applications/${encodeURIComponent(id)}/contact-otp/verify`,
        body,
        { headers: tok(token) },
      ),
    );
  }

  /** ADM-010 */
  /** `withAdmission`: the admission fee joins the application fee in the same order. */
  startPayment(id: string, token: string, feeType?: FeeType, withAdmission = false) {
    return firstValueFrom(
      this.http.post<PaymentOrder>(
        `${base}/applications/${encodeURIComponent(id)}/fee-payments`,
        { ...(feeType ? { feeType } : {}), ...(withAdmission ? { withAdmission: true } : {}) },
        { headers: { ...tok(token), ...once() } },
      ),
    );
  }

  /** ADM-011: the gateway's answer, verified on the server. */
  verifyPayment(
    id: string,
    token: string,
    paymentId: string,
    body: { gatewayPaymentId: string; signature: string },
  ) {
    return firstValueFrom(
      this.http.post<PaymentVerified>(
        `${base}/applications/${encodeURIComponent(id)}/fee-payments/${encodeURIComponent(paymentId)}/verify`,
        body,
        { headers: tok(token) },
      ),
    );
  }

  /** ADM-012 */
  status(body: { applicationNo: string; mobile: string }) {
    return firstValueFrom(this.http.post<StatusView>(`${base}/status`, body));
  }
}
