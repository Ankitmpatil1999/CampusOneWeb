/**
 * The one HTTP interceptor for API calls (brief §7.1):
 * - prefixes the API base URL and sends cookies (web sessions use `__Host-` cookies, ADR-0011);
 * - sends the user's language, and the session's CSRF token on state-changing requests (the surface
 *   comes from the path, or from an explicit `X-CampusOne-Surface` header for shared paths such as
 *   /api/v1/files);
 * - renews an expired session once (refresh cookie) and retries the request; a refused renewal
 *   reports the session as ended (the area returns to its sign-in page), one that got no answer
 *   reports the server as unreachable;
 * - retries GET only, on network failure or 503, with backoff;
 * - turns every failure into an `ApiProblem` with register wording and the correlation id.
 */
import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, retry, switchMap, throwError, timer } from 'rxjs';
import { CAMPUSONE_WEB_CONFIG } from '../../Config';
import { toApiProblem } from './problem';
import {
  CSRF_HEADER,
  SURFACE_HEADER,
  csrfToken,
  renewSession,
  sessionEnded,
  surfaceOfPath,
  type CookieSurface,
} from './web-session';

const isApiPath = (url: string) => url.startsWith('/api/') || url.startsWith('/health');
/** A failure as "no answer" (status 0), which the retry below and the wording treat as such. */
const unreachable = (e: HttpErrorResponse) =>
  new HttpErrorResponse({ status: 0, headers: e.headers, url: e.url ?? undefined });
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const SURFACES: readonly string[] = ['console', 'ops', 'portal'];
const surfaceOfHeader = (v: string | null) =>
  v && SURFACES.includes(v) ? (v as CookieSurface) : undefined;

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiPath(req.url)) return next(req);
  const config = inject(CAMPUSONE_WEB_CONFIG);
  const lang = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en';
  const surface = surfaceOfPath(req.url) ?? surfaceOfHeader(req.headers.get(SURFACE_HEADER));
  const build = () => {
    const token = surface && !SAFE.has(req.method) ? csrfToken(surface) : undefined;
    return req.clone({
      url: `${config.apiBaseUrl}${req.url}`,
      withCredentials: true,
      setHeaders: { 'Accept-Language': lang, ...(token ? { [CSRF_HEADER]: token } : {}) },
    });
  };
  const retryable = req.method === 'GET';
  return next(build()).pipe(
    catchError((error: unknown) =>
      surface && error instanceof HttpErrorResponse && error.status === 401
        ? from(renewSession(surface, config.apiBaseUrl)).pipe(
            switchMap((r) => {
              if (r === 'renewed') return next(build());
              if (r === 'refused') {
                sessionEnded(surface);
                return throwError(() => error);
              }
              // The renewal got no answer (offline, the server restarting): nothing has ended, so
              // the page reports the server as unreachable — a GET is tried again below — instead
              // of signing the person out (client 2026-10-13).
              return throwError(() => unreachable(error));
            }),
          )
        : throwError(() => error),
    ),
    retry({
      count: retryable ? 2 : 0,
      delay: (error: unknown, attempt) =>
        error instanceof HttpErrorResponse && (error.status === 0 || error.status === 503)
          ? timer(300 * 2 ** (attempt - 1))
          : throwError(() => error),
    }),
    catchError((error: unknown) =>
      throwError(() => (error instanceof HttpErrorResponse ? toApiProblem(error) : error)),
    ),
  );
};
