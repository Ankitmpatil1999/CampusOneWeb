/**
 * Web sessions (ADR-0011, docs/06): the tokens live in `__Host-` cookies the page cannot read; the
 * page reads only the CSRF cookie and echoes it in `X-CSRF-Token` on every state-changing request.
 * An expired access token is renewed once with the refresh cookie (IDN-008), then the request is
 * retried; a failed renewal means the session has ended.
 *
 * The access token and the idle limit lapse together (15 minutes each by default), so a renewal
 * after a 401 comes too late: the refresh cookie is gone by then. While someone is using a page
 * the session is therefore renewed ahead of time (SessionKeeper).
 */
export type CookieSurface = 'console' | 'ops' | 'portal';

export const SURFACE_HEADER = 'X-CampusOne-Surface';
export const CSRF_HEADER = 'X-CSRF-Token';

/** The surface of an API path: /api/v1/console/… → console, /api/v1/ops/… → ops. */
export function surfaceOfPath(url: string): CookieSurface | undefined {
  const m = /^\/api\/v1\/(console|ops|portal)(\/|$)/.exec(url);
  return m ? (m[1] as CookieSurface) : undefined;
}

export function csrfToken(surface: CookieSurface, cookies = globalThis.document?.cookie ?? '') {
  const parts = cookies.split(';').map((c) => c.trim());
  // `__Host-` over HTTPS and on localhost; without the prefix on a plain-HTTP test server (LAN).
  for (const name of [`__Host-rp_${surface}_csrf=`, `rp_${surface}_csrf=`]) {
    const part = parts.find((c) => c.startsWith(name));
    if (part) return decodeURIComponent(part.slice(name.length));
  }
  return undefined;
}

/**
 * When the session was last renewed and when its tokens lapse, on this browser's clock (the
 * server's times shifted by the clock difference its `Date` header shows). Kept in localStorage so
 * every tab and a reloaded page know it.
 */
export interface SessionTiming {
  readonly renewedAt: number;
  readonly accessUntil: number;
  /** The idle limit: past it the session cannot be renewed. */
  readonly refreshUntil: number;
}

const TIMING_KEY = (s: CookieSurface) => `rp.session.${s}`;
/** Fallback when storage is unavailable (private mode): this tab only. */
const timings = new Map<CookieSurface, SessionTiming>();

export function sessionTiming(surface: CookieSurface): SessionTiming | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(TIMING_KEY(surface)) ?? 'null');
    if (v && typeof v === 'object') {
      const t = v as SessionTiming;
      if ([t.renewedAt, t.accessUntil, t.refreshUntil].every(Number.isFinite)) return t;
    }
  } catch {
    /* storage unavailable or unreadable: this tab's copy */
  }
  return timings.get(surface) ?? null;
}

/** Records a sign-in or renewal from its response (body with the expiry times, `Date` header). */
export function noteRenewal(
  surface: CookieSurface,
  body: unknown,
  serverDate?: string | null,
  now = Date.now(),
): void {
  const b = (body ?? {}) as { accessTokenExpiresAt?: unknown; refreshTokenExpiresAt?: unknown };
  const at = Date.parse(String(b.accessTokenExpiresAt));
  const rt = Date.parse(String(b.refreshTokenExpiresAt));
  if (!Number.isFinite(at) || !Number.isFinite(rt)) return forgetSession(surface);
  const server = serverDate ? Date.parse(serverDate) : NaN;
  const skew = Number.isFinite(server) ? now - server : 0;
  const t: SessionTiming = { renewedAt: now, accessUntil: at + skew, refreshUntil: rt + skew };
  timings.set(surface, t);
  try {
    localStorage.setItem(TIMING_KEY(surface), JSON.stringify(t));
  } catch {
    /* this tab keeps its copy */
  }
}

export function forgetSession(surface: CookieSurface): void {
  timings.delete(surface);
  try {
    localStorage.removeItem(TIMING_KEY(surface));
  } catch {
    /* nothing stored */
  }
}

/** The server's reason for the last refused renewal (e.g. AUTH.SIGNED_IN_ELSEWHERE), per surface. */
const refusals = new Map<CookieSurface, string>();

/** `reason`: the register code saying why, when the server gave one. */
type EndedListener = (surface: CookieSurface, reason?: string) => void;
const endedListeners = new Set<EndedListener>();

/** Called when a surface's session has ended (renewal refused); returns the unsubscribe. */
export function onSessionEnded(fn: EndedListener): () => void {
  endedListeners.add(fn);
  return () => endedListeners.delete(fn);
}

/**
 * Without the server's reason, a session whose idle limit has passed on the recorded timing ended
 * for want of use — said so, not a bare "no active sessions" (client 2026-10-13).
 */
export function sessionEnded(
  surface: CookieSurface,
  reason = refusals.get(surface) ?? (idleOver(surface) ? 'AUTH.SESSION_IDLE' : undefined),
): void {
  refusals.delete(surface);
  forgetSession(surface);
  for (const fn of endedListeners) fn(surface, reason);
}

function idleOver(surface: CookieSurface, now = Date.now()): boolean {
  const t = sessionTiming(surface);
  return !!t && now >= t.refreshUntil;
}

/** How long a tab that lost a renewal race waits for the winning tab's renewal to land. */
const RACE_WAIT_MS = 3000;

/**
 * Another tab renewed with the same refresh cookie a moment earlier (AUTH.REFRESH_SUPERSEDED): the
 * session goes on with that tab's cookies. Waits until its renewal is recorded (shared storage), so
 * the request is retried with the new cookies; past the wait it is retried anyway.
 */
async function renewedElsewhere(surface: CookieSurface, seen: number): Promise<boolean> {
  const until = Date.now() + RACE_WAIT_MS;
  while (Date.now() < until) {
    if ((sessionTiming(surface)?.renewedAt ?? 0) > seen) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

/** Serialises renewals across tabs (Web Locks); where unsupported, this tab only. */
function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request(name, fn) : fn();
}

/**
 * How a renewal went: `refused` — the server answered that the session cannot go on (it has
 * ended); `unreachable` — no answer that says so (offline, the server restarting behind its proxy,
 * a server error), which ends nothing: the session may well be alive (client 2026-10-13).
 */
export type Renewal = 'renewed' | 'refused' | 'unreachable';

const inFlight = new Map<CookieSurface, Promise<Renewal>>();

/**
 * Renews the session once per surface at a time: parallel 401s share one refresh, and a tab that
 * waited while another tab renewed uses that renewal (the cookies are shared) instead of presenting
 * the rotated refresh token again. Web Locks exist only on https:// pages and localhost; on a
 * plain-HTTP address two tabs can still renew at once — the server then refuses the later one as
 * superseded and keeps the cookies, and that tab goes on with the other's renewal (client 2026-10-13).
 */
export function renewSession(surface: CookieSurface, base = ''): Promise<Renewal> {
  const running = inFlight.get(surface);
  if (running) return running;
  const seen = sessionTiming(surface)?.renewedAt ?? 0;
  const p = withLock(`rp-refresh-${surface}`, async (): Promise<Renewal> => {
    if ((sessionTiming(surface)?.renewedAt ?? 0) > seen) return 'renewed';
    const token = csrfToken(surface);
    if (!token) return 'refused';
    try {
      const r = await fetch(`${base}/api/v1/auth/token/refresh`, {
        method: 'POST',
        credentials: 'include',
        // Finishes even when the page is reloaded or closed meanwhile, so the rotated cookies are
        // kept; a renewal cut off half-way left the old ones, and the server then took them for a
        // stolen token and ended the session (client 2026-10-13). Same-origin only: a keep-alive
        // request that needs a CORS preflight is refused by some browsers.
        keepalive: !base || base === globalThis.location?.origin,
        headers: {
          'Content-Type': 'application/json',
          [SURFACE_HEADER]: surface,
          [CSRF_HEADER]: token,
        },
        body: '{}',
      });
      if (r.ok) {
        noteRenewal(surface, await r.json().catch(() => null), r.headers.get('Date'));
        refusals.delete(surface);
        return 'renewed';
      }
      if (r.status !== 401 && r.status !== 403) return 'unreachable';
      const code: unknown = await r
        .json()
        .then((b: { code?: unknown } | null) => b?.code)
        .catch(() => undefined);
      if (code === 'AUTH.REFRESH_SUPERSEDED') {
        return (await renewedElsewhere(surface, seen)) ? 'renewed' : 'refused';
      }
      if (typeof code === 'string' && code !== 'AUTH.UNAUTHENTICATED') refusals.set(surface, code);
      else refusals.delete(surface);
      return 'refused';
    } catch {
      return 'unreachable';
    }
  }).finally(() => setTimeout(() => inFlight.delete(surface), 0));
  inFlight.set(surface, p);
  return p;
}

/** Renews the session; true when renewed. */
export function refreshSession(surface: CookieSurface, base = ''): Promise<boolean> {
  return renewSession(surface, base).then((r) => r === 'renewed');
}
