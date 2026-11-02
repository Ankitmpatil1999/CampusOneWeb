/** Bank credits held for suspended or inactive wallets (WAL-010, CR-08; grant recon.view). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Money } from './members.api';

export type HeldStatus = 'HELD' | 'PROCESSED' | 'RETURNED';

/** One credit that was held: still held, posted after the wallet became active, or returned. */
export interface HeldCredit {
  readonly id: string;
  readonly amount: Money;
  readonly member: { readonly id: string; readonly name: string };
  /** The wallet number arrives masked ("•••• 0981"). */
  readonly wallet: { readonly number: string; readonly status: string };
  readonly vaNumber: string;
  readonly utr: string;
  readonly mode: string;
  readonly sender: string | null;
  readonly creditedAt: string;
  readonly status: HeldStatus | 'RECEIVED' | 'FAILED';
  readonly reason: string | null;
  readonly resolvedAt: string | null;
}

export interface HeldCreditPage {
  readonly items: readonly HeldCredit[];
  readonly nextCursor: string | null;
}

@Injectable({ providedIn: 'root' })
export class HeldCreditsApi {
  private readonly http = inject(HttpClient);

  /** WAL-010: the institution's held credits, newest first, 50 a page. */
  list(q: { status?: HeldStatus; cursor?: string } = {}) {
    let params = new HttpParams();
    if (q.status) params = params.set('status', q.status);
    if (q.cursor) params = params.set('cursor', q.cursor);
    return firstValueFrom(
      this.http.get<HeldCreditPage>('/api/v1/console/held-credits', { params }),
    );
  }

  /**
   * One member's held credits. WAL-010 has no member filter, so the pages are read (at most
   * `pages` of them, newest first) and filtered here.
   */
  async ofMember(memberId: string, pages = 4): Promise<HeldCredit[]> {
    const out: HeldCredit[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < pages; i++) {
      const p = await this.list(cursor ? { cursor } : {});
      out.push(...p.items.filter((c) => c.member.id === memberId));
      if (!p.nextCursor) break;
      cursor = p.nextCursor;
    }
    return out;
  }
}
