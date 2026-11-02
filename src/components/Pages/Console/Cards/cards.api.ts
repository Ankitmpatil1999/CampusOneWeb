/** Console campus cards API (ATT-005…007, ATT-027). */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

/** The register's card statuses (27.2 "NFC card (status)": 1 / 0). */
export type CardStatus = 'ACTIVE' | 'INACTIVE';

/** Why a card is re-issued (ATT-007). */
export type ReissueReason = 'LOST' | 'DAMAGED' | 'STOLEN' | 'DEFECTIVE' | 'EXPIRED';

/** ATT-005: one card. A member holds one active card; replaced cards stay on record. */
export interface Card {
  readonly id: string;
  readonly member: { readonly id: string; readonly name: string };
  /** Masked ("NFC••••0055"). */
  readonly token: string;
  readonly status: CardStatus;
  /** NEW_REGISTRATION, or the re-issue reason the card was written for. */
  readonly issueReason: string;
  readonly reissueCount: number;
  readonly statusReason: string | null;
  readonly blockedAt: string | null;
  readonly issuedAt: string;
  readonly lastTapAt: string | null;
}

/** ATT-007: the card-issue reader may write the member's new card until `expiresAt`. */
export interface CardReissued {
  readonly pairingForWrite: { readonly code: string; readonly expiresAt: string };
}

/** The most pages of 50 the register reads (5,000 cards). */
const MAX_PAGES = 100;

@Injectable({ providedIn: 'root' })
export class CardsApi {
  private readonly http = inject(HttpClient);

  /** ATT-005: one page (50, newest first). */
  list(q: { status?: CardStatus; q?: string; cursor?: string } = {}) {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(q)) if (v) params = params.set(k, String(v));
    return firstValueFrom(
      this.http.get<{ items: Card[]; nextCursor: string | null }>('/api/v1/console/cards', {
        params,
      }),
    );
  }

  /** Every card of the institution (the register's figures and views are worked out from it). */
  async all(q: { q?: string } = {}): Promise<Card[]> {
    const out: Card[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await this.list({ ...q, ...(cursor ? { cursor } : {}) });
      out.push(...page.items);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return out;
  }

  /** ATT-006: block or reactivate with a reason (audited; the holder is told). */
  status(id: string, body: { action: 'BLOCK' | 'REACTIVATE'; reason: string }) {
    return firstValueFrom(this.http.post<Card>(`/api/v1/console/cards/${id}/status`, body));
  }

  /**
   * ATT-027: issue the member's card from the console; CampusOne Card Reader writes the returned token
   * on this computer's USB reader. The same key on a retry gives the same token back.
   */
  issue(memberId: string, hardwareUid: string, key: string) {
    return firstValueFrom(
      this.http.post<{ cardId: string; cardToken: string }>(
        '/api/v1/console/cards',
        { memberId, hardwareUid },
        { headers: { 'Idempotency-Key': key } },
      ),
    );
  }

  /** ATT-007: the card is made inactive and a card-issue reader may write a new one. */
  reissue(id: string, reasonCode: ReissueReason, key: string = newIdempotencyKey()) {
    return firstValueFrom(
      this.http.post<CardReissued>(
        `/api/v1/console/cards/${id}/reissue`,
        { reasonCode },
        { headers: { 'Idempotency-Key': key } },
      ),
    );
  }
}
