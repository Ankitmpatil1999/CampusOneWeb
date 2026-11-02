/** Console set-up API: the session's institution (INS-010…013), user types (INS-014…016) and fields (INS-017…019). */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';
import { SURFACE_HEADER } from '../../../Utils/web-session';
import type {
  ChannelRow,
  Contact,
  ContactInput,
  FeatureRow,
  InstitutionStatus,
} from '../../Backoffice/Institutions/institutions.api';

export interface ConsoleInstitutionView {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly shortName: string;
  readonly address: string;
  readonly city: string;
  readonly pinCode: string | null;
  readonly board: string | null;
  readonly officePhone: string | null;
  readonly officeEmail: string | null;
  readonly status: InstitutionStatus;
  readonly contacts: { primary: Contact | null; secondary: Contact | null };
  readonly administrator: { name: string | null; email: string | null } | null;
  readonly corporateCode: string | null;
  readonly consentValidityMonths: number;
  readonly logo: { fileId: string; name: string; sizeBytes: number } | null;
  readonly feeAccount: { id: string; name: string } | null;
  readonly plan: { id: string; name: string; code: string } | null;
  readonly features: readonly FeatureRow[];
  readonly channels: readonly ChannelRow[];
  readonly version: number;
}

export interface ConsoleInstitutionUpdate {
  readonly name?: string;
  readonly address?: string;
  readonly city?: string;
  readonly pinCode?: string;
  readonly board?: string | null;
  readonly shortName?: string;
  readonly officePhone?: string | null;
  readonly officeEmail?: string;
  readonly primaryContact?: ContactInput;
  readonly secondaryContact?: ContactInput | null;
  readonly consentValidityMonths?: number;
  readonly channels?: Partial<Record<'EMAIL' | 'SMS' | 'WHATSAPP', boolean>>;
  readonly features?: Record<string, boolean>;
}

export type UserTypeCategory =
  | 'STUDENT'
  | 'PARENT'
  | 'TEACHER'
  | 'STAFF'
  | 'MERCHANT'
  | 'PRINCIPAL'
  | 'MANAGEMENT'
  | 'CREW'
  | 'OTHER';

export interface UserType {
  readonly id: string;
  readonly name: string;
  readonly category: UserTypeCategory;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly members: number;
  readonly departments: readonly { id: string; name: string; members: number }[];
  readonly version: number;
}

export type CfEntity = 'MEMBER' | 'FEE_STRUCTURE' | 'ADMISSION_APPLICATION' | 'MERCHANT';
export type CfType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'DROPDOWN'
  | 'MULTI_SELECT'
  | 'YES_NO'
  | 'EMAIL'
  | 'PHONE';

export interface CustomField {
  readonly id: string;
  readonly entity: CfEntity;
  readonly entityLabel: string;
  readonly label: string;
  readonly type: CfType;
  readonly typeLabel: string;
  readonly options: readonly string[];
  readonly required: boolean;
  readonly unique: boolean;
  readonly listColumn: boolean;
  readonly filter: boolean;
  readonly position: number;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly values: number;
  readonly definedBy: string | null;
  readonly definedAt: string;
  readonly version: number;
}

export interface CustomFieldInput {
  readonly entity: CfEntity;
  readonly label: string;
  readonly type: CfType;
  readonly options?: readonly string[];
  readonly required: boolean;
  readonly unique: boolean;
  readonly listColumn: boolean;
  readonly filter: boolean;
  readonly active: boolean;
  readonly noIdDocAck: boolean;
}

const ifMatch = (v: number) => ({ 'If-Match': `"v${v}"` });

@Injectable({ providedIn: 'root' })
export class InstitutionSetupApi {
  private readonly http = inject(HttpClient);

  institution() {
    return firstValueFrom(this.http.get<ConsoleInstitutionView>('/api/v1/console/institution'));
  }

  update(version: number, body: ConsoleInstitutionUpdate) {
    return firstValueFrom(
      this.http.patch<ConsoleInstitutionView>('/api/v1/console/institution', body, {
        headers: ifMatch(version),
      }),
    );
  }

  async uploadLogo(file: File) {
    const form = new FormData();
    form.append('purpose', 'logo');
    form.append('file', file);
    // /api/v1/files is shared by every surface: name the console so its cookie and CSRF token apply.
    const up = await firstValueFrom(
      this.http.post<{ fileId: string }>('/api/v1/files', form, {
        headers: { [SURFACE_HEADER]: 'console' },
      }),
    );
    return firstValueFrom(
      this.http.put<ConsoleInstitutionView>('/api/v1/console/institution/logo', {
        fileId: up.fileId,
      }),
    );
  }

  feeAccount(version: number, merchantId: string) {
    return firstValueFrom(
      this.http.put<ConsoleInstitutionView>(
        '/api/v1/console/institution/fee-account',
        { merchantId },
        { headers: ifMatch(version) },
      ),
    );
  }

  userTypes() {
    return firstValueFrom(this.http.get<{ items: UserType[] }>('/api/v1/console/user-types'));
  }

  createUserType(body: { name: string; category: UserTypeCategory; departments: string[] }) {
    return firstValueFrom(
      this.http.post<{ items: UserType[] }>('/api/v1/console/user-types', body, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }

  changeUserType(
    id: string,
    version: number,
    body: { name?: string; addDepartments?: string[]; removeDepartments?: string[] },
  ) {
    return firstValueFrom(
      this.http.patch<{ items: UserType[] }>(`/api/v1/console/user-types/${id}`, body, {
        headers: ifMatch(version),
      }),
    );
  }

  fields() {
    return firstValueFrom(
      this.http.get<{ maxActivePerEntity: number; items: CustomField[] }>(
        '/api/v1/console/custom-fields',
      ),
    );
  }

  createField(body: CustomFieldInput) {
    return firstValueFrom(
      this.http.post<CustomField>('/api/v1/console/custom-fields', body, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }

  changeField(id: string, version: number, body: Partial<CustomFieldInput>) {
    return firstValueFrom(
      this.http.patch<CustomField>(`/api/v1/console/custom-fields/${id}`, body, {
        headers: ifMatch(version),
      }),
    );
  }
}
