/** Console members API (IDN-044…055, IDN-057…059; ACA-001, ACA-009). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { downloadFile } from '../../../Utils/download';
import { newIdempotencyKey } from '../../../Utils/ids';
import { SURFACE_HEADER } from '../../../Utils/web-session';
import type { FamilyLookup } from '../../../Shared/FamilyFound';
import type { Application } from '../Applications/applications.api';

export type MemberKind = 'STUDENTS' | 'PARENTS' | 'STAFF' | 'MERCHANTS';
export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type CfValue = string | number | boolean | readonly string[] | null;

export interface MemberRow {
  readonly id: string;
  readonly memberNo: string;
  readonly name: string;
  readonly kind: MemberKind;
  readonly userType: { readonly id: string; readonly name: string; readonly category: string };
  readonly department: { readonly id: string; readonly name: string } | null;
  readonly admissionNo: string | null;
  readonly employeeNo: string | null;
  readonly grade: { readonly class: string; readonly section: string | null } | null;
  readonly mobile: string | null;
  readonly children?: readonly { id: string; name: string; grade: string | null }[];
  readonly relation?: string | null;
  readonly linked: boolean;
  readonly status: MemberStatus;
  /** IDN-044: the campus (or merchant) wallet, read live; null when the member has none yet. */
  readonly wallet: MemberWalletSummary | null;
  readonly pending: { readonly suspension: boolean; readonly delink: boolean };
  readonly customFields: Readonly<Record<string, string>>;
}

/** The campus (or merchant) wallet on the list and the drawer (IDN-044, IDN-045). */
export interface MemberWalletSummary {
  readonly status: MemberStatus;
  readonly balance: Money;
}

/** IDN-045: payments on or off for the profile (BR-13, IDN-056); on until someone turns it off. */
export interface PermissionView {
  readonly enabled: boolean;
  readonly reason: string | null;
  readonly changedAt: string | null;
}

export interface MemberList {
  readonly year: { readonly id: string; readonly label: string } | null;
  readonly columns: readonly { id: string; label: string }[];
  readonly filters: readonly { id: string; label: string; options: readonly string[] }[];
  readonly counts: {
    readonly tabs: Readonly<Record<MemberKind | 'ALL', number>>;
    readonly statuses: Readonly<Record<MemberStatus, number>>;
  };
  readonly items: readonly MemberRow[];
  readonly nextCursor: string | null;
}

export interface MemberDetail {
  readonly id: string;
  readonly memberNo: string;
  readonly name: string;
  readonly firstName: string;
  readonly lastName: string | null;
  readonly kind: MemberKind;
  readonly userType: { readonly id: string; readonly name: string; readonly category: string };
  readonly department: { readonly id: string; readonly name: string } | null;
  readonly gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  readonly dateOfBirth: string | null;
  readonly admissionNo: string | null;
  readonly employeeNo: string | null;
  readonly joinedOn: string | null;
  readonly grade: {
    readonly class: string;
    readonly classId: string;
    readonly section: string | null;
    readonly sectionId: string;
    readonly year: string | null;
  } | null;
  readonly contact: { readonly mobile: string | null; readonly email: string | null };
  readonly account: { readonly linked: boolean; readonly mobileMasked: string | null };
  readonly guardians: readonly {
    id: string;
    name: string;
    relation: string;
    mobile: string | null;
    primary: boolean;
    status: MemberStatus;
  }[];
  readonly wards: readonly {
    id: string;
    name: string;
    relation: string;
    grade: string | null;
    status: MemberStatus;
  }[];
  readonly roles: readonly { code: string; name: string }[];
  readonly status: MemberStatus;
  readonly statusReason: string | null;
  readonly statusChangedAt: string | null;
  readonly transactionPermission: PermissionView;
  readonly wallet: MemberWalletSummary | null;
  readonly pending: { readonly suspension: boolean; readonly delink: boolean };
  readonly customFields: readonly {
    id: string;
    label: string;
    type: string;
    required: boolean;
    unique: boolean;
    options: readonly string[];
    value: CfValue;
  }[];
  /** A student's school transport (client 2026-10-15); null for others. */
  readonly transport?: StudentTransport | null;
  readonly onboardedAt: string;
  readonly lastChangedAt: string | null;
  readonly version: number;
}

/** IDN-045: the allocation in force and today's trips on its route. */
export interface StudentTransport {
  readonly allocation: {
    readonly route: { readonly code: string; readonly name: string; readonly type: string };
    readonly stop: { readonly name: string; readonly landmark: string | null };
    readonly pickUp: string | null;
    readonly drop: string | null;
    readonly from: string | null;
    readonly to: string | null;
  } | null;
  readonly trips: readonly {
    readonly session: string;
    readonly direction: string;
    readonly startTime: string;
    readonly vehicle: { readonly name: string; readonly registration: string };
    readonly driver: { readonly name: string; readonly mobile: string | null };
    readonly attendant: string | null;
  }[];
}

export interface Eligibility {
  readonly eligible: boolean;
  readonly code: string;
  readonly account: boolean;
  /**
   * The mobile is already at another institution — no longer a refusal (client 2026-10-27): the
   * person keeps one CampusOne login for both.
   */
  readonly elsewhere?: boolean;
  readonly profiles: readonly {
    id: string;
    category: string;
    name: string;
    userType: string;
    status: MemberStatus;
  }[];
}

export interface ClassView {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly sections: readonly {
    id: string;
    name: string;
    capacity: number | null;
    students: number;
  }[];
  readonly students: number;
  readonly version: number;
}

export interface UploadReport {
  readonly id: string;
  readonly kind: 'MEMBERS' | 'STAFF';
  readonly fileName: string;
  readonly status: 'VALIDATED' | 'COMMITTED';
  readonly total: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly committed: number | null;
  readonly rows: readonly {
    row: number;
    name: string;
    accepted: boolean;
    errors: readonly { column: string; message: string }[];
  }[];
}

/** How a member appears on an admission form: the student, or one of the parents. */
export type AdmissionRelation = 'STUDENT' | 'FATHER' | 'MOTHER' | 'GUARDIAN';

/**
 * An admission form a member is on — a student's own, a parent's child's — from the public form,
 * the counsellor's desk or the members bulk upload, with its documents (ADM-014's view).
 */
export interface AdmissionRecord {
  readonly relation: AdmissionRelation;
  /** The student the form is for (their member id). */
  readonly student: { readonly id: string; readonly name: string };
  /** The caller may edit it (members.edit) and the student is admitted. */
  readonly editable: boolean;
  readonly application: Application;
}

/** The display-only identity fields a correction can change (IDN-057, CR-06). */
export type CorrectionField = 'FULL_NAME' | 'DOB' | 'GENDER' | 'ADMISSION_NO' | 'EMPLOYEE_NO';

export interface CorrectionRequest {
  readonly field: CorrectionField;
  /** DOB as YYYY-MM-DD; GENDER as MALE | FEMALE | OTHER. */
  readonly proposedValue: string;
  /** 10–300 characters. */
  readonly reason: string;
  readonly evidenceFileId: string;
}

/** 202: waits for an Institution Administrator; 200: applied directly (ADR-0015). */
export interface CorrectionResult {
  readonly approvalId: string;
  readonly no: string;
  readonly applied: boolean;
}

export interface HistoryItem {
  readonly action: string;
  readonly at: string;
  readonly by: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly reason: string | null;
}

/** API money: rupees as a decimal string (never a float), always INR. */
export interface Money {
  readonly amount: string;
  readonly currency: 'INR';
}

export type WalletKind = 'CAMPUS' | 'ALLOWANCE' | 'PERSONAL' | 'MERCHANT';

/** WAL-008: one of the member's wallets (read-only in the console). */
export interface Wallet {
  readonly id: string;
  readonly kind: WalletKind;
  readonly walletNo: string;
  readonly status: MemberStatus;
  readonly balance: Money;
  /** Bank credits held while the member is suspended (OI-WAL-24). */
  readonly held: Money;
  readonly virtualAccount: string | null;
  readonly spentToday: Money;
  readonly spentThisMonth: Money;
}

/** WAL-009: one movement on the statement, newest first. */
export interface StatementRow {
  readonly id: string;
  readonly reference: string;
  readonly type: string;
  readonly title: string;
  readonly channel: string;
  readonly channelLabel: string;
  readonly direction: 'DEBIT' | 'CREDIT';
  readonly amount: Money;
  readonly balanceAfter: Money | null;
  readonly counterparty: string | null;
  readonly narration: string | null;
  readonly at: string;
}

export interface Statement {
  readonly items: readonly StatementRow[];
  readonly openingBalance: Money | null;
  readonly closingBalance: Money | null;
  readonly nextCursor: string | null;
}

/** WAL-009 query: dates as YYYY-MM-DD (IST business dates); the cursor from the previous page. */
export interface StatementQuery {
  readonly from?: string;
  readonly to?: string;
  readonly walletId?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/** IDN-056: the member's transaction permission after a change (BR-13). */
export interface TransactionPermission {
  readonly enabled: boolean;
  readonly reason: string;
  readonly changedAt: string;
  /** The member's new row version (send as If-Match on the next change). */
  readonly version: number;
}

const once = () => ({ headers: { 'Idempotency-Key': newIdempotencyKey() } });

@Injectable({ providedIn: 'root' })
export class MembersApi {
  private readonly http = inject(HttpClient);

  list(q: Record<string, string | number | undefined>) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== '') params = params.set(k, String(v));
    }
    return firstValueFrom(this.http.get<MemberList>('/api/v1/console/members', { params }));
  }

  detail(id: string) {
    return firstValueFrom(this.http.get<MemberDetail>(`/api/v1/console/members/${id}`));
  }

  update(id: string, version: number, body: Record<string, unknown>) {
    return firstValueFrom(
      this.http.patch<MemberDetail>(`/api/v1/console/members/${id}`, body, {
        headers: { 'If-Match': `"v${version}"` },
      }),
    );
  }

  status(id: string, body: { to: MemberStatus; reason?: string | null }) {
    return firstValueFrom(
      this.http.post<{ status: MemberStatus | null; approvalId: string | null }>(
        `/api/v1/console/members/${id}/status-changes`,
        body,
        once(),
      ),
    );
  }

  delink(id: string, reason: string) {
    return firstValueFrom(
      this.http.post<{ delinked: boolean; approvalId: string | null }>(
        `/api/v1/console/members/${id}/delink-requests`,
        { reason },
        once(),
      ),
    );
  }

  history(id: string) {
    return firstValueFrom(
      this.http.get<{ items: HistoryItem[] }>(`/api/v1/console/members/${id}/history`),
    );
  }

  /**
   * The admission forms the member is on: a student's own, newest first, or each of a parent's
   * children's; none for staff or a member onboarded without one.
   */
  admission(id: string) {
    return firstValueFrom(
      this.http.get<{ records: AdmissionRecord[] }>(`/api/v1/console/members/${id}/admission`),
    );
  }

  /** WAL-008: the member's wallets and balances (read-only). */
  wallets(id: string) {
    return firstValueFrom(
      this.http.get<{ wallets: Wallet[] }>(`/api/v1/console/members/${id}/wallets`),
    );
  }

  /** WAL-009: the statement (the campus wallet unless `walletId` names another), newest first. */
  statement(id: string, q: StatementQuery = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== '') params = params.set(k, String(v));
    }
    return firstValueFrom(
      this.http.get<Statement>(`/api/v1/console/members/${id}/statement`, { params }),
    );
  }

  /** IDN-056: grant or revoke the member's transaction permission with a reason (If-Match). */
  setPermission(id: string, version: number, body: { enabled: boolean; reason: string }) {
    return firstValueFrom(
      this.http.put<TransactionPermission>(
        `/api/v1/console/members/${id}/transaction-permission`,
        body,
        { headers: { 'If-Match': `"v${version}"` } },
      ),
    );
  }

  /** Evidence for a correction: PDF, PNG or JPEG up to 2 MB, type-checked from the bytes (CR-07). */
  uploadEvidence(file: File) {
    const form = new FormData();
    form.append('purpose', 'evidence');
    form.append('file', file, file.name);
    // /api/v1/files is shared by every surface: name the console so its cookie and CSRF token apply.
    return firstValueFrom(
      this.http.post<{ fileId: string }>('/api/v1/files', form, {
        headers: { [SURFACE_HEADER]: 'console' },
      }),
    );
  }

  /** IDN-057: a correction request for a display-only identity field (CR-06). */
  correct(id: string, body: CorrectionRequest) {
    return firstValueFrom(
      this.http.post<CorrectionResult>(
        `/api/v1/console/members/${id}/pii-corrections`,
        body,
        once(),
      ),
    );
  }

  /** IDN-090: who a mobile belongs to here (a family, a staff member), for the forms. */
  familyLookup(mobile: string) {
    return firstValueFrom(
      this.http.post<FamilyLookup>('/api/v1/console/members/family-lookup', { mobile }),
    );
  }

  eligibility(mobile: string) {
    return firstValueFrom(
      this.http.post<Eligibility>('/api/v1/console/members/eligibility', { mobile }),
    );
  }

  onboard(body: Record<string, unknown>) {
    return firstValueFrom(
      this.http.post<{ id: string; memberNo: string; guardians: string[] }>(
        '/api/v1/console/members',
        body,
        once(),
      ),
    );
  }

  staff(body: Record<string, unknown>) {
    return firstValueFrom(
      this.http.post<{
        id: string;
        memberNo: string;
        employeeNo: string;
        newAccount: boolean;
        /** Shown once (client 2026-10-07); never answered again. */
        temporaryPassword?: string;
        /** The console role given with the profile (client 2026-10-22), by name. */
        role?: string | null;
      }>('/api/v1/console/staff', body, once()),
    );
  }

  template(kind: 'members' | 'staff') {
    return downloadFile(
      this.http,
      `/api/v1/console/members/uploads/templates/${kind}`,
      `campusone-${kind}-template.csv`,
    );
  }

  upload(kind: 'MEMBERS' | 'STAFF', file: File) {
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file, file.name);
    return firstValueFrom(
      this.http.post<UploadReport>('/api/v1/console/members/uploads', form, once()),
    );
  }

  commit(id: string, mode: 'ALL' | 'ACCEPTED') {
    return firstValueFrom(
      this.http.post<{
        created: number;
        skipped: number;
        /** New staff accounts' temporary passwords, shown once (client 2026-10-07). */
        passwords?: {
          name: string;
          email: string;
          employeeNo: string;
          temporaryPassword: string;
        }[];
      }>(`/api/v1/console/members/uploads/${id}/commit`, { mode }, once()),
    );
  }

  classes() {
    return firstValueFrom(
      this.http.get<{ year: { id: string; label: string } | null; items: ClassView[] }>(
        '/api/v1/console/classes',
      ),
    );
  }
}
