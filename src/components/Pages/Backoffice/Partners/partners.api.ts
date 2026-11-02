/**
 * Back-office partner API clients, their tokens and the token lifetime (INT-001…008), and the
 * platform's messaging channels (INT-009/010).
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';

export type PartnerKind = 'SPONSOR_BANK' | 'PAYMENT_GATEWAY' | 'OTHER';
export type ClientStatus = 'ACTIVE' | 'INACTIVE';

/** INT-001: one client. The secret itself is never returned after creation or rotation. */
export interface ApiClient {
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  readonly partner: PartnerKind | string;
  readonly scopes: readonly string[];
  readonly ipAllowlist: readonly string[];
  readonly status: ClientStatus;
  readonly statusReason: string | null;
  readonly secretRotatedAt: string;
  /** After a rotation, until when the previous secret still works (int.secret.overlapHours). */
  readonly previousSecretValidUntil: string | null;
  /** HASH: imported with the earlier application's bcrypt hash of its secret (INT-009). */
  readonly secretKind?: 'ENCRYPTED' | 'HASH';
  readonly createdAt: string;
  readonly lastTokenAt?: string | null;
  readonly version: number;
}

/** INT-005: one token request, issued or refused (with the reason). */
export interface TokenRecord {
  readonly id: string;
  readonly outcome: 'ISSUED' | 'REFUSED';
  readonly reason: string | null;
  readonly scopes: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  readonly live: boolean;
}

export interface TokenPage {
  readonly items: readonly TokenRecord[];
  readonly nextCursor: string | null;
}

/** INT-007: the partner token lifetime (auth.partner.tokenMinutes) and its bounds. */
export interface TokenPolicy {
  readonly minutes: number;
  readonly min: number;
  readonly max: number;
  readonly version: number;
}

/** INT-002 body. */
export interface ApiClientInput {
  readonly name: string;
  readonly partner: PartnerKind;
  readonly scopes: readonly string[];
  readonly ipAllowlist: readonly string[];
}

/** INT-009 body: a client created elsewhere, with its client id and its secret's bcrypt hash. */
export interface ApiClientImport extends ApiClientInput {
  readonly clientId: string;
  readonly secretHash: string;
}

/** INT-003 body (If-Match). A reason is required to suspend (INACTIVE). */
export interface ApiClientPatch {
  readonly name?: string;
  readonly scopes?: readonly string[];
  readonly ipAllowlist?: readonly string[];
  readonly status?: ClientStatus;
  readonly reason?: string | null;
}

/** INT-009: one messaging channel (in-app, SMS, e-mail, WhatsApp, push) and its platform switch. */
export interface MessagingChannel {
  readonly channel: 'IN_APP' | 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PUSH';
  /** The configured provider (null: none integrated, so it can't be switched on). */
  readonly provider: string | null;
  /** The provider only writes to the server's log (a test server). */
  readonly testMode: boolean;
  readonly integrated: boolean;
  readonly enabled: boolean;
  readonly templateSet: string;
  readonly updatedAt: string | null;
  readonly version: number;
}

const once = () => ({ 'Idempotency-Key': newIdempotencyKey() });
const ifMatch = (version: number) => ({ 'If-Match': `"v${version}"` });

@Injectable({ providedIn: 'root' })
export class PartnersApi {
  private readonly http = inject(HttpClient);

  /** INT-001. */
  list() {
    return firstValueFrom(
      this.http.get<{ items: readonly ApiClient[] }>('/api/v1/ops/api-clients'),
    );
  }

  /** INT-002: the secret in the answer is shown once and never kept. */
  create(body: ApiClientInput) {
    return firstValueFrom(
      this.http.post<{ id: string; clientId: string; secret: string }>(
        '/api/v1/ops/api-clients',
        body,
        { headers: once() },
      ),
    );
  }

  /** INT-009: the partner keeps the credentials it already has; no secret is shown. */
  importClient(body: ApiClientImport) {
    return firstValueFrom(
      this.http.post<ApiClient>('/api/v1/ops/api-clients/imports', body, { headers: once() }),
    );
  }

  /** INT-003: scopes, allow-list, or the status (suspend with a reason). */
  update(c: { id: string; version: number }, body: ApiClientPatch) {
    return firstValueFrom(
      this.http.patch<ApiClient>(`/api/v1/ops/api-clients/${c.id}`, body, {
        headers: ifMatch(c.version),
      }),
    );
  }

  /** INT-004: a new secret (shown once); the previous one works until `previousSecretValidUntil`. */
  rotate(id: string, body: { overlapHours?: number } = {}) {
    return firstValueFrom(
      this.http.post<{ secret: string; previousSecretValidUntil: string | null }>(
        `/api/v1/ops/api-clients/${id}/secret-rotations`,
        body,
        { headers: once() },
      ),
    );
  }

  /** INT-005: newest first, 50 a page. */
  tokens(id: string, cursor?: string) {
    const params = cursor ? new HttpParams().set('cursor', cursor) : undefined;
    return firstValueFrom(
      this.http.get<TokenPage>(`/api/v1/ops/api-clients/${id}/tokens`, params ? { params } : {}),
    );
  }

  /** INT-006: end every live token of the client. */
  revokeTokens(id: string, reason: string) {
    return firstValueFrom(
      this.http.post<void>(`/api/v1/ops/api-clients/${id}/token-revocations`, { reason }),
    );
  }

  /** INT-007. */
  tokenPolicy() {
    return firstValueFrom(this.http.get<TokenPolicy>('/api/v1/ops/token-policy'));
  }

  /** INT-008 (If-Match). */
  setTokenPolicy(version: number, body: { minutes: number; reason: string }) {
    return firstValueFrom(
      this.http.put<TokenPolicy>('/api/v1/ops/token-policy', body, { headers: ifMatch(version) }),
    );
  }

  /** INT-009: the messaging channels with their provider and the platform switch. */
  channels() {
    return firstValueFrom(
      this.http.get<{ items: readonly MessagingChannel[] }>('/api/v1/ops/messaging-providers'),
    );
  }

  /** INT-010 (If-Match): switch a channel on or off. */
  setChannel(c: MessagingChannel, enabled: boolean) {
    return firstValueFrom(
      this.http.put<MessagingChannel>(
        `/api/v1/ops/messaging-providers/${c.channel.toLowerCase()}`,
        { enabled },
        { headers: ifMatch(c.version) },
      ),
    );
  }
}
