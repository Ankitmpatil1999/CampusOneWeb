/**
 * A school's corporate codes and the classes each serves (INS-043…048; client 2026-10-13/14): the
 * console's own school, or any school from the back office — the same calls under another base.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export interface CorporateCodeView {
  readonly id: string;
  /** Null for a code carried over from the single-code set-up, until filled in. */
  readonly bankName: string | null;
  readonly ifsc: string | null;
  readonly corporateCode: string;
  readonly poolAccountRef: string | null;
  readonly isDefault: boolean;
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly classes: readonly { readonly id: string; readonly name: string }[];
  readonly version: number;
  readonly updatedAt: string;
}

export interface CorporateCodeList {
  readonly maxLength: number;
  readonly items: readonly CorporateCodeView[];
  /** Every class of the school, with the code it is mapped to (null: the default). */
  readonly classes: readonly {
    readonly id: string;
    readonly name: string;
    readonly codeId: string | null;
  }[];
}

export interface CorporateCodeInput {
  bankName?: string;
  ifsc?: string | null;
  corporateCode?: string;
  poolAccountRef?: string | null;
  isDefault?: boolean;
  status?: 'ACTIVE' | 'DISABLED';
  classIds?: string[];
}

/** The console's own school. */
export const CONSOLE_CODES = '/api/v1/console/corporate-codes';
/** A school in the back office. */
export const opsCodes = (institutionId: string) =>
  `/api/v1/ops/institutions/${institutionId}/corporate-codes`;

@Injectable({ providedIn: 'root' })
export class CorporateCodesApi {
  private readonly http = inject(HttpClient);

  list(base: string) {
    return firstValueFrom(this.http.get<CorporateCodeList>(base));
  }

  add(base: string, body: CorporateCodeInput, key: string = newIdempotencyKey()) {
    return firstValueFrom(
      this.http.post<CorporateCodeView>(base, body, { headers: { 'Idempotency-Key': key } }),
    );
  }

  change(base: string, code: CorporateCodeView, body: CorporateCodeInput) {
    return firstValueFrom(
      this.http.patch<CorporateCodeView>(`${base}/${code.id}`, body, {
        headers: { 'If-Match': `"v${code.version}"` },
      }),
    );
  }
}
