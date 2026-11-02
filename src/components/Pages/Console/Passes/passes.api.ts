/** Console entry passes API (PAY-026…028). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export type PassStatus = 'ACTIVE' | 'AUTHORIZED' | 'USED' | 'EXPIRED' | 'CANCELLED';
/** Where the pass stands today (9.9.1). */
export type PassVisibility = 'VALID_TODAY' | 'VALID_IN_FUTURE' | 'EXPIRED' | 'USED' | 'CANCELLED';

/** PAY-026: one pass, bound to the holder's registered phone. */
export interface EntryPass {
  readonly id: string;
  readonly type: { readonly code: string; readonly label: string };
  readonly purpose: string;
  readonly description: string;
  readonly holder: {
    readonly id: string;
    readonly name: string;
    readonly admissionNo: string | null;
  };
  readonly validOn: string;
  readonly maxScans: number;
  readonly usedScans: number;
  readonly transferAllowed: boolean;
  readonly comments: string | null;
  readonly status: PassStatus;
  readonly visibility: PassVisibility;
  readonly authorisedUntil: string | null;
  readonly cancelReason: string | null;
  readonly createdAt: string;
  readonly version: number;
}

export interface PassList {
  readonly items: readonly EntryPass[];
  readonly counts: {
    readonly total: number;
    readonly active: number;
    readonly used: number;
    readonly expired: number;
    readonly cancelled: number;
  };
  /** The configured pass types (RNG-PAY-078). */
  readonly types: readonly { readonly code: string; readonly label: string }[];
}

/** PAY-027 body. */
export interface PassIssueInput {
  readonly type: string;
  readonly purpose: string;
  readonly description: string;
  readonly holderIds: readonly string[];
  readonly validOn: string;
  readonly maxScans?: number;
  readonly transferAllowed?: boolean;
  readonly comments?: string | null;
}

/** PAY-027: per holder — issued, or refused with a message key. */
export interface PassIssueResult {
  readonly issued: readonly { readonly holderId: string; readonly passId: string }[];
  readonly refused: readonly { readonly holderId: string; readonly code: string }[];
}

const params = (q: object) => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
  }
  return p;
};

@Injectable({ providedIn: 'root' })
export class PassesApi {
  private readonly http = inject(HttpClient);

  /** PAY-026: the passes (newest first), the counts and the pass types. */
  list(q: { status?: PassStatus; type?: string; date?: string } = {}) {
    return firstValueFrom(this.http.get<PassList>('/api/v1/console/passes', { params: params(q) }));
  }

  /** PAY-027 (Idempotency-Key: a retry never issues twice). */
  issue(body: PassIssueInput, key: string = newIdempotencyKey()) {
    return firstValueFrom(
      this.http.post<PassIssueResult>('/api/v1/console/passes', body, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }

  /** PAY-028: cancel a live pass with a reason. */
  cancel(id: string, reason: string) {
    return firstValueFrom(
      this.http.post<EntryPass>(`/api/v1/console/passes/${id}/cancellation`, { reason }),
    );
  }
}
