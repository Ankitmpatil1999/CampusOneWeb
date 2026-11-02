/**
 * Console admission link API (SRS 19.2, FR-ADM-01; INS-027…029): the current link with its QR
 * (drawn by our own API), the replaced links, generating a link (which replaces the current one)
 * and e-mailing it.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export interface AdmissionLink {
  readonly id: string;
  readonly status: 'ACTIVE' | 'REPLACED';
  /** The public form's address (current link only). */
  readonly url: string | null;
  /** The QR as SVG markup from our API (current link only; trusted). */
  readonly qrSvg: string | null;
  /** The academic year the form opens on, when one was chosen. */
  readonly year: string | null;
  readonly expiresAt: string | null;
  readonly expired: boolean;
  readonly createdAt: string | null;
  readonly replacedAt: string | null;
}

export interface AdmissionLinks {
  readonly current: AdmissionLink | null;
  readonly history: readonly AdmissionLink[];
}

const once = (key: string = newIdempotencyKey()) => ({ 'Idempotency-Key': key });

@Injectable({ providedIn: 'root' })
export class AdmissionLinksApi {
  private readonly http = inject(HttpClient);

  /** INS-027. */
  links() {
    return firstValueFrom(this.http.get<AdmissionLinks>('/api/v1/console/admission-links'));
  }

  /** INS-028: the earlier link stops working and stays in the history. */
  generate(body: { yearId?: string | null; expiresAt?: string | null }, key?: string) {
    return firstValueFrom(
      this.http.post<AdmissionLink>('/api/v1/console/admission-links', body, {
        headers: once(key),
      }),
    );
  }

  /** INS-029. */
  email(linkId: string, emails: readonly string[], key?: string) {
    return firstValueFrom(
      this.http.post<{ sent: number }>(
        `/api/v1/console/admission-links/${linkId}/email`,
        { emails },
        { headers: once(key) },
      ),
    );
  }
}
