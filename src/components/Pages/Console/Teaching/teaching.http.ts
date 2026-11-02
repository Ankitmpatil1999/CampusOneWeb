/**
 * Calls to the teacher routes (`/api/v1/teacher/…`, Phase 10): the same APIs as the app, reached
 * with the console's cookie session. They sit outside `/console`, so every call names the session's
 * surface (`X-CampusOne-Surface: console`); the interceptor then adds the CSRF token to changes. Changes
 * that create carry an Idempotency-Key; edits of a versioned record send If-Match.
 */
import { HttpClient, type HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { newIdempotencyKey } from '../../../Utils/ids';
import { SURFACE_HEADER } from '../../../Utils/web-session';

type Params = Record<string, string | number | boolean | undefined | null>;
const clean = (p: Params = {}) =>
  Object.fromEntries(
    Object.entries(p)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  );

@Injectable({ providedIn: 'root' })
export class TeachingHttp {
  private readonly http = inject(HttpClient);
  private readonly surface = { [SURFACE_HEADER]: 'console' };

  get<T>(path: string, params?: Params) {
    return firstValueFrom(
      this.http.get<T>(`/api/v1${path}`, { headers: this.surface, params: clean(params) }),
    );
  }

  /** A change: Idempotency-Key always (the teacher routes require it on creates), If-Match when versioned. */
  send<T>(
    method: 'POST' | 'PUT' | 'PATCH',
    path: string,
    body: unknown,
    opts: { version?: number; params?: Params } = {},
  ) {
    const headers: Record<string, string> = {
      ...this.surface,
      'Idempotency-Key': newIdempotencyKey(),
      ...(opts.version !== undefined ? { 'If-Match': `"v${opts.version}"` } : {}),
    };
    return firstValueFrom(
      this.http.request<T>(method, `/api/v1${path}`, {
        body,
        headers: headers as unknown as HttpHeaders,
        params: clean(opts.params),
      }),
    );
  }
}
