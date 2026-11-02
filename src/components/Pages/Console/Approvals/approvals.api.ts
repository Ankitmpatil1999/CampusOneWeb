/**
 * Maker-checker queue API (MKR-001…006; SRS 17, FR-MKC-01/03; ADR-0015). The console decides an
 * institution's requests; the back office decides the platform's own (corrections from members
 * whose account has no institution). Same shapes on both surfaces.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ApprovalSurface = 'console' | 'ops';

export interface ApprovalRow {
  readonly id: string;
  /** APR-0001, numbered per institution. */
  readonly no: string;
  /** MEMBER_SUSPENSION | MEMBER_DELINK | PII_CORRECTION. */
  readonly module: string;
  /** The area the queue shows as the module tag (Members). */
  readonly area: string;
  readonly action: string;
  readonly cr: string | null;
  readonly summary: string;
  readonly status: ApprovalStatus;
  readonly maker: {
    readonly id: string;
    readonly name: string;
    readonly you: boolean;
    readonly type: string;
  };
  readonly raisedAt: string;
  readonly checker: { readonly name: string } | null;
  readonly decidedAt: string | null;
  readonly remarks: string | null;
  /** ADR-0015: an administrator's own request, applied at once. */
  readonly appliedDirectly: boolean;
  readonly canDecide: boolean;
  readonly lastError: string | null;
  readonly version: number;
}

export interface ApprovalList {
  readonly counts: {
    readonly tabs: Readonly<Record<ApprovalStatus, number>>;
    readonly canDecide: number;
    readonly mine: number;
    readonly decided30: number;
  };
  readonly canDecide: boolean;
  readonly modules: readonly { code: string; label: string }[];
  readonly makers: readonly { id: string; name: string; you: boolean }[];
  readonly items: readonly ApprovalRow[];
  readonly nextCursor: string | null;
}

export interface ApprovalDetail extends ApprovalRow {
  readonly reason: string | null;
  readonly changes: readonly { label: string; from: string; to: string }[];
  readonly evidence: { readonly name: string; readonly url: string } | null;
  readonly subject: { readonly type: 'member' | 'account'; readonly id: string | null } | null;
}

const BASE: Readonly<Record<ApprovalSurface, string>> = {
  console: '/api/v1/console/approvals',
  ops: '/api/v1/ops/approvals',
};

@Injectable({ providedIn: 'root' })
export class ApprovalsApi {
  private readonly http = inject(HttpClient);

  list(surface: ApprovalSurface, q: Record<string, string | number | undefined>) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== '') params = params.set(k, String(v));
    }
    return firstValueFrom(this.http.get<ApprovalList>(BASE[surface], { params }));
  }

  detail(surface: ApprovalSurface, id: string) {
    return firstValueFrom(this.http.get<ApprovalDetail>(`${BASE[surface]}/${id}`));
  }

  decide(
    surface: ApprovalSurface,
    id: string,
    version: number,
    body: { decision: 'APPROVE' | 'REJECT'; remarks: string },
  ) {
    return firstValueFrom(
      this.http.post<ApprovalDetail>(`${BASE[surface]}/${id}/decision`, body, {
        headers: { 'If-Match': `"v${version}"`, 'Idempotency-Key': newIdempotencyKey() },
      }),
    );
  }
}
