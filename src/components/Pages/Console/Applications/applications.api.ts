/**
 * Console admissions API (SRS 19; ADM-013…020, ADM-026…030): the applications with their counts
 * and key figures, one application in full, the counsellor's form, a section's edit, submission,
 * the transfer certificate, documents, references, approval, rejection, the existing-students
 * import, and an admitted student's record (its sections and documents, from the Members page).
 */
import { HttpClient, HttpEventType, HttpParams, type HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { filter, firstValueFrom, map, tap } from 'rxjs';
import type { ContactCodeSent, Landing } from '../../Admissions/admissions.api';
import { downloadFile } from '../../../Utils/download';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { Money } from '../Fees/fees.api';

export type { Money } from '../Fees/fees.api';

/** Application status (status register: admission_application). */
export type AppStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type AppSource = 'PUBLIC' | 'COUNSELLOR' | 'IMPORT';
/** Fee status (status register: admission_payment). */
export type FeeStatus = 'PENDING' | 'PAID' | 'FAILED';
export type FeeType = 'APPLICATION' | 'ADMISSION';
export type PaymentState = 'PENDING' | 'PAID' | 'CONFIRMED';
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
export type Relation = 'FATHER' | 'MOTHER' | 'GUARDIAN';
/** A person's Aadhaar and PAN, masked; null when not given. */
export interface MaskedIds {
  readonly aadhaar: string | null;
  readonly pan: string | null;
}
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type Board = 'CBSE' | 'ICSE' | 'STATE' | 'IB' | 'OTHER';
export type Category = 'GENERAL' | 'OBC' | 'SC' | 'ST' | 'OTHER';
/** ADM-019 reason codes. */
export type RejectReason =
  'AGE_BAND' | 'SEATS_FULL' | 'DOCUMENTS' | 'INTERACTION' | 'DUPLICATE' | 'WITHDRAWN' | 'OTHER';

/** ADM-013: one application in the list. */
export interface ApplicationRow {
  readonly id: string;
  readonly applicationNo: string;
  readonly source: AppSource;
  readonly status: AppStatus;
  readonly name: string | null;
  readonly primaryContact: {
    readonly name: string | null;
    readonly relation: Relation | null;
    readonly mobile: string | null;
  };
  readonly class: { readonly id: string; readonly name: string } | null;
  readonly section: string | null;
  readonly admissionNo: string | null;
  readonly year: { readonly id: string; readonly label: string };
  readonly midTerm: boolean;
  readonly joiningDate: string | null;
  readonly submittedAt: string | null;
  readonly createdAt: string | null;
  readonly applicationFee: { readonly amount: Money; readonly status: FeeStatus } | null;
}

export interface ApplicationKpis {
  readonly awaitingReview: number;
  readonly approved: number;
  readonly midTermThisYear: number;
  readonly midTermToDecide: number;
  readonly applicationFeesReceived: Money;
  readonly applicationFeesPaid: number;
}

export interface ApplicationList {
  readonly items: readonly ApplicationRow[];
  readonly nextCursor: string | null;
  /** By status, with every filter but the status applied. */
  readonly counts: Partial<Record<AppStatus, number>>;
  readonly kpis: ApplicationKpis | null;
}

export interface ListQuery {
  readonly status?: AppStatus;
  readonly yearId?: string;
  readonly classId?: string;
  readonly midTerm?: boolean;
  readonly q?: string;
  readonly cursor?: string;
}

export interface Person {
  readonly name: string;
  readonly mobile?: string | null;
  readonly email?: string | null;
  readonly occupation?: string | null;
  /** The father's and the mother's, in rupees (client 2026-10-14). */
  readonly annualIncome?: number | null;
  /** Sent only (client 2026-10-13): shown masked on `identityNumbers`. */
  readonly aadhaar?: string;
  readonly pan?: string;
}

export interface Address {
  readonly line1: string;
  readonly line2?: string | null;
  readonly city: string;
  readonly state: string;
  readonly pin: string;
}

export interface Parents {
  readonly father?: Person | null;
  readonly mother?: Person | null;
  readonly guardian?: (Person & { readonly relation: string }) | null;
  readonly primary: Relation;
  /** Whether the parents have a single child or more (client 2026-10-12). */
  readonly children?: 'SINGLE' | 'MORE' | null;
  /** School transport (client 2026-10-12); absent on applications from before. */
  readonly transport?: boolean;
  readonly transportStop?: { readonly id: string; readonly name: string } | null;
  /** Sent only: the pick-up stop chosen. */
  readonly transportStopId?: string | null;
  readonly hostel?: boolean;
  readonly localGuardian?: {
    readonly name: string;
    readonly relation: string;
    readonly mobile: string;
    readonly address: string;
  } | null;
}

export interface Previous {
  readonly school?: string | null;
  readonly lastClass?: string | null;
  readonly result?: string | null;
  readonly board?: Board | null;
  readonly otherBoard?: string | null;
}

export interface Addresses {
  readonly residential: Address;
  readonly sameAsResidential: boolean;
  readonly correspondence?: Address | null;
}

export interface StudentSection {
  readonly firstName: string;
  readonly middleName?: string | null;
  readonly lastName: string;
  readonly gender: Gender;
  readonly dob: string;
  /** Write-only and optional (client 2026-10-12): omitted keeps what is stored; null clears it. */
  readonly aadhaar?: string | null;
  readonly pan?: string | null;
  readonly category?: Category | null;
  readonly medium?: string | null;
  readonly bloodGroup?: string | null;
  readonly allergies?: string | null;
  readonly health?: string | null;
}

export interface ClassSection {
  readonly yearId: string;
  readonly classId: string;
  readonly joiningDate?: string | null;
  readonly midTermReason?: string | null;
}

/** ADM-014: the full application (identity number masked). */
export interface Application {
  readonly id: string;
  readonly applicationNo: string;
  readonly source: AppSource;
  readonly status: AppStatus;
  readonly step: number;
  readonly year: { readonly id: string; readonly label: string };
  readonly class: { readonly id: string; readonly name: string } | null;
  readonly section: { readonly id: string; readonly name: string } | null;
  readonly midTerm: boolean;
  readonly joiningDate: string | null;
  readonly midTermReason: string | null;
  readonly student: {
    readonly firstName: string | null;
    readonly middleName: string | null;
    readonly lastName: string | null;
    readonly gender: Gender | null;
    readonly dob: string | null;
    /** Masked ("XXXX XXXX 1234", "••••••234F"): the numbers are never read back. */
    readonly aadhaar?: string | null;
    readonly pan?: string | null;
    readonly category?: Category | null;
    readonly medium?: string | null;
    readonly bloodGroup?: string | null;
    readonly allergies?: string | null;
    readonly health?: string | null;
    /** The student's own contact (client 2026-10-23). */
    readonly mobile?: string | null;
    readonly email?: string | null;
  };
  /** Age on 1 June of the year's start, or on the joining date mid-term, and the class's band. */
  readonly age: {
    readonly years: number;
    readonly on: string;
    readonly band: { readonly min: number; readonly max: number } | null;
    readonly withinBand: boolean | null;
  } | null;
  readonly addresses: Addresses | null;
  readonly previous: Previous | null;
  readonly parents: Parents | null;
  readonly primaryContact: {
    readonly name: string | null;
    readonly relation: Relation | null;
    readonly mobile: string | null;
    readonly email: string | null;
    /** Masked, like the student's. */
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
  /** Field id → value (the institution's own fields, CR-12). */
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
    /** A signed link (console only). */
    readonly url: string | null;
  }[];
  readonly fees: readonly {
    readonly id: string;
    readonly feeType: FeeType;
    readonly amount: Money;
    readonly status: FeeStatus;
    readonly mode: 'ONLINE' | 'CASH' | null;
    readonly receiptNo: string | null;
    /** The payment gateway's transaction ID of an online payment (client 2026-10-16). */
    readonly transactionId?: string | null;
    readonly paidAt: string | null;
    readonly paidBy: string | null;
    /** Accounts confirmed the receipt (client 2026-10-09). */
    readonly confirmedAt?: string | null;
    readonly failureReason: string | null;
  }[];
  /**
   * The fees together: PENDING (one not paid), PAID (all paid, waiting for Accounts), CONFIRMED (all
   * confirmed — the admission number and section can be assigned).
   */
  readonly paymentStatus?: PaymentState;
  /** The admission fee still to pay when nothing is started for it yet. */
  readonly admissionFeeDue?: Money | null;
  readonly declaration: { readonly at: string | null; readonly by: string | null } | null;
  /** When the family agreed that what was collected registers their CampusOne account. */
  readonly registrationConsentAt?: string | null;
  /**
   * The primary contact's mobile was verified with a one-time code (client 2026-10-27); false
   * again as soon as the primary contact or their mobile changes. Needed to submit and approve.
   */
  readonly contactVerified: boolean;
  readonly submittedAt: string | null;
  readonly decidedAt: string | null;
  readonly rejection: { readonly reasonCode: RejectReason; readonly remarks: string | null } | null;
  readonly admissionNo: string | null;
  readonly memberId: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly version: number;
}

/** ADM-015 body: the same model as the public form; `submit` submits it straight away. */
export interface ApplicationInput {
  readonly class: ClassSection;
  readonly student?: Partial<StudentSection>;
  readonly addresses?: Addresses;
  readonly previous?: Previous;
  readonly parents?: Parents;
  readonly customFields?: Readonly<Record<string, unknown>>;
  readonly submit?: boolean;
}

export type SectionName =
  'class' | 'student' | 'addresses' | 'previous' | 'parents' | 'customFields';
/** The sections of an admitted student's record that can change: all but the class. */
export type RecordSection = Exclude<SectionName, 'class'>;

/** ADM-030: submitted, or a declared draft waiting for the application fee. */
export interface Submitted {
  readonly status: 'DRAFT' | 'SUBMITTED';
  readonly applicationNo: string;
  readonly feeDue: { readonly amount: string; readonly mandatory: boolean } | null;
  readonly application: Application;
}

export interface ReferenceInput {
  readonly name: string;
  readonly relation?: string | null;
  readonly mobile: string;
  readonly email?: string | null;
}

export interface TcInput {
  readonly mode: 'TC' | 'UNDERTAKING';
  readonly number?: string | null;
  readonly date?: string | null;
  readonly dueDate?: string | null;
}

/** ADM-018 body. */
export interface ApprovalInput {
  readonly userTypeId: string;
  readonly departmentId?: string | null;
  readonly sectionId: string;
  readonly admissionNo: string;
  readonly joiningDate?: string | null;
}

/** ADM-020: the import's row report. */
export interface ImportReport {
  readonly uploadId: string;
  readonly total: number;
  readonly imported: number;
  readonly rejected: number;
  readonly rows: readonly {
    readonly row: number;
    readonly name: string;
    readonly outcome: 'IMPORTED' | 'REJECTED';
    readonly applicationNo?: string;
    readonly errors: readonly { readonly column: string; readonly message: string }[];
  }[];
}

const params = (q: object) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) p = p.set(k, String(v));
  }
  return p;
};
const once = (key: string = newIdempotencyKey()) => ({ 'Idempotency-Key': key });
const ifMatch = (v: number) => ({ 'If-Match': `"v${v}"` });
const base = '/api/v1/console/applications';

@Injectable({ providedIn: 'root' })
export class ApplicationsApi {
  private readonly http = inject(HttpClient);

  /** ADM-013: newest first, 50 a page (keyset cursor). */
  list(q: ListQuery = {}) {
    return firstValueFrom(this.http.get<ApplicationList>(base, { params: params(q) }));
  }

  /** ADM-014. */
  detail(id: string) {
    return firstValueFrom(this.http.get<Application>(`${base}/${id}`));
  }

  /**
   * ADM-035: what the application form needs (client 2026-10-15: the counsellor's form is the
   * public one) — the years open, classes, institution fields, stops and rules.
   */
  form() {
    return firstValueFrom(this.http.get<Landing>(`${base}/form`));
  }

  /** ADM-015. */
  create(body: ApplicationInput & { step?: number }, key?: string) {
    return firstValueFrom(this.http.post<Application>(base, body, { headers: once(key) }));
  }

  /** ADM-016: one section of a draft or submitted application (If-Match). */
  update(
    a: Pick<Application, 'id' | 'version'>,
    section: SectionName,
    data: unknown,
    step?: number,
  ) {
    return firstValueFrom(
      this.http.patch<Application>(
        `${base}/${a.id}`,
        { section, data, ...(step === undefined ? {} : { step }) },
        { headers: ifMatch(a.version) },
      ),
    );
  }

  /**
   * ADM-030: submits a draft with the declaration and the family's consent to register their
   * CampusOne account with what was collected (or leaves it waiting for the fee).
   */
  submit(id: string, key?: string) {
    return firstValueFrom(
      this.http.post<Submitted>(
        `${base}/${id}/submission`,
        { declarationAccepted: true, registrationConsent: true },
        { headers: once(key) },
      ),
    );
  }

  /**
   * A one-time code to the primary contact's saved mobile, which the family reads out to the office
   * (client 2026-10-27); ADM.CONTACT_MOBILE_MISSING while none is saved.
   */
  contactOtp(id: string) {
    return firstValueFrom(this.http.post<ContactCodeSent>(`${base}/${id}/contact-otp`, {}));
  }

  /** The code entered: the application, its primary contact verified (client 2026-10-27). */
  verifyContactOtp(id: string, body: { challengeId: string; otp: string }) {
    return firstValueFrom(
      this.http.post<{ application: Application }>(`${base}/${id}/contact-otp/verify`, body),
    );
  }

  /** ADM-017: the transfer certificate received, or an undertaking with its due date. */
  transferCertificate(id: string, body: TcInput) {
    return firstValueFrom(this.http.put<Application>(`${base}/${id}/transfer-certificate`, body));
  }

  /** ADM-028 (multipart: documentType + file; 2 MB), with upload progress when asked. */
  addDocument(
    id: string,
    documentType: DocType,
    file: File,
    key?: string,
    progress?: (pct: number) => void,
  ) {
    const form = new FormData();
    form.set('documentType', documentType);
    form.set('file', file, file.name);
    if (!progress) {
      return firstValueFrom(
        this.http.post<Application>(`${base}/${id}/documents`, form, { headers: once(key) }),
      );
    }
    return firstValueFrom(
      this.http
        .post<Application>(`${base}/${id}/documents`, form, {
          headers: once(key),
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

  /**
   * One section of an admitted student's record (members.edit, If-Match): the identity fields as
   * stored and no Aadhaar or PAN (else IDN.PII_READ_ONLY on the field); the rest checked as ADM-016.
   */
  updateRecord(a: Pick<Application, 'id' | 'version'>, section: RecordSection, data: unknown) {
    return firstValueFrom(
      this.http.patch<Application>(
        `${base}/${a.id}/record`,
        { section, data },
        { headers: ifMatch(a.version) },
      ),
    );
  }

  /** A document added to an admitted student's record, or replacing its type (multipart; 2 MB). */
  addRecordDocument(id: string, documentType: DocType, file: File, key?: string) {
    const form = new FormData();
    form.set('documentType', documentType);
    form.set('file', file, file.name);
    return firstValueFrom(
      this.http.post<Application>(`${base}/${id}/record-documents`, form, { headers: once(key) }),
    );
  }

  /** ADM-036: an attachment removed from a draft (client 2026-10-15). */
  removeDocument(id: string, documentType: DocType) {
    return firstValueFrom(this.http.delete<Application>(`${base}/${id}/documents/${documentType}`));
  }

  /** ADM-026. */
  addReference(id: string, body: ReferenceInput, key?: string) {
    return firstValueFrom(
      this.http.post<Application>(`${base}/${id}/references`, body, { headers: once(key) }),
    );
  }

  /** ADM-027. */
  removeReference(id: string, refId: string) {
    return firstValueFrom(this.http.delete<Application>(`${base}/${id}/references/${refId}`));
  }

  /**
   * ADM-018 (If-Match): the member, wallets, the verified primary contact's parent link and the
   * enrolment in one transaction (client 2026-10-27: the other parents keep a CampusOne account only).
   */
  approve(a: Pick<Application, 'id' | 'version'>, body: ApprovalInput, key?: string) {
    return firstValueFrom(
      this.http.post<{ memberId: string; application: Application }>(
        `${base}/${a.id}/approval`,
        body,
        { headers: { ...once(key), ...ifMatch(a.version) } },
      ),
    );
  }

  /** ADM-019 (If-Match). */
  reject(
    a: Pick<Application, 'id' | 'version'>,
    body: { reasonCode: RejectReason; remarks: string },
    key?: string,
  ) {
    return firstValueFrom(
      this.http.post<Application>(`${base}/${a.id}/rejection`, body, {
        headers: { ...once(key), ...ifMatch(a.version) },
      }),
    );
  }

  /** ADM-029: the existing-students template (CSV). */
  template() {
    return downloadFile(
      this.http,
      `${base}/imports/template`,
      'campusone-existing-students-template.csv',
    );
  }

  /** ADM-020: each passing row is enrolled straight away; refused rows are reported. */
  import(file: File, key?: string) {
    const form = new FormData();
    form.set('file', file, file.name);
    return firstValueFrom(
      this.http.post<ImportReport>(`${base}/imports`, form, { headers: once(key) }),
    );
  }
}
