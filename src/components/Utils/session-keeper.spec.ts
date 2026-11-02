import { renewalDue, sessionLapsed } from './session-keeper';
import {
  forgetSession,
  noteRenewal,
  onSessionEnded,
  refreshSession,
  renewSession,
  sessionEnded,
  sessionTiming,
} from './web-session';

const MIN = 60_000;
const T0 = Date.parse('2026-10-08T12:00:00.000Z');
/** A renewal at T0 with the defaults: access token and idle limit both 15 minutes. */
const fresh = { renewedAt: T0, accessUntil: T0 + 15 * MIN, refreshUntil: T0 + 15 * MIN };

afterEach(async () => {
  forgetSession('console');
  document.cookie = 'rp_console_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  vi.unstubAllGlobals();
  // A finished renewal is dropped on the next turn (parallel callers share it until then).
  await new Promise((r) => setTimeout(r, 0));
});

describe('session timing', () => {
  it('keeps the expiry times on this browser’s clock, whatever the server clock says', () => {
    // The PC's clock runs 20 minutes ahead of the server.
    const now = T0 + 20 * MIN;
    noteRenewal(
      'console',
      {
        accessTokenExpiresAt: '2026-10-08T12:15:00.000Z',
        refreshTokenExpiresAt: '2026-10-08T12:15:00.000Z',
      },
      'Thu, 08 Oct 2026 12:00:00 GMT',
      now,
    );
    expect(sessionTiming('console')).toEqual({
      renewedAt: now,
      accessUntil: now + 15 * MIN,
      refreshUntil: now + 15 * MIN,
    });
  });

  it('forgets the timing when a response has no expiry times, and when the session ends', () => {
    const iso = new Date(Date.now() + 15 * MIN).toISOString();
    noteRenewal('console', { accessTokenExpiresAt: iso, refreshTokenExpiresAt: iso }, null);
    expect(sessionTiming('console')).not.toBeNull();
    noteRenewal('console', { name: 'X' }, null);
    expect(sessionTiming('console')).toBeNull();
    noteRenewal('console', { accessTokenExpiresAt: iso, refreshTokenExpiresAt: iso }, null);
    const seen: string[] = [];
    const off = onSessionEnded((s) => seen.push(s));
    sessionEnded('console');
    off();
    expect(sessionTiming('console')).toBeNull();
    expect(seen).toEqual(['console']);
  });
});

describe('renewalDue', () => {
  it('does not renew a page that was not used since the last renewal (the idle limit holds)', () => {
    expect(renewalDue(fresh, T0 - 1, T0 + 14 * MIN)).toBe(false);
  });

  it('renews a page in use once a third of the token’s life has passed', () => {
    expect(renewalDue(fresh, T0 + 1 * MIN, T0 + 4 * MIN)).toBe(false);
    expect(renewalDue(fresh, T0 + 1 * MIN, T0 + 5 * MIN)).toBe(true);
  });

  it('renews a page in use before the token lapses, never after the idle limit', () => {
    const long = { ...fresh, refreshUntil: T0 + 60 * MIN, accessUntil: T0 + 2 * MIN };
    expect(renewalDue(long, T0 + 1, T0 + 1.5 * MIN)).toBe(true);
    expect(renewalDue(fresh, T0 + 1, T0 + 15 * MIN)).toBe(false);
  });

  it('renews on the first use when the timing is unknown (a session from before this release)', () => {
    expect(renewalDue(null, 0, T0)).toBe(false);
    expect(renewalDue(null, T0, T0)).toBe(true);
  });

  it('calls a session past its idle limit lapsed (with a little grace)', () => {
    expect(sessionLapsed(fresh, T0 + 15 * MIN)).toBe(false);
    expect(sessionLapsed(fresh, T0 + 15 * MIN + 5_000)).toBe(true);
    expect(sessionLapsed(null, T0 + 99 * MIN)).toBe(false);
  });
});

describe('refreshSession', () => {
  it('renews with the CSRF cookie and records the new expiry times', async () => {
    document.cookie = 'rp_console_csrf=tok; path=/';
    const fetchMock = vi.fn(async () =>
      Response.json({
        accessTokenExpiresAt: new Date(Date.now() + 15 * MIN).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 15 * MIN).toISOString(),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(refreshSession('console')).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/auth/token/refresh');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok');
    const t = sessionTiming('console')!;
    expect(t.refreshUntil - t.renewedAt).toBeGreaterThan(14 * MIN);
  });

  it('does not ask the server without the CSRF cookie (the cookies have lapsed)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(refreshSession('console')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A plain-HTTP address has no Web Locks, so two tabs can renew at once (client 2026-10-13).
  it('goes on with the other tab’s renewal when its own was superseded', async () => {
    document.cookie = 'rp_console_csrf=tok; path=/';
    const iso = new Date(Date.now() + 15 * MIN).toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        // The other tab's renewal lands while this one is refused.
        setTimeout(
          () =>
            noteRenewal('console', { accessTokenExpiresAt: iso, refreshTokenExpiresAt: iso }, null),
          150,
        );
        return Response.json({ code: 'AUTH.REFRESH_SUPERSEDED' }, { status: 401 });
      }),
    );
    const ended: string[] = [];
    const off = onSessionEnded((s) => ended.push(s));
    await expect(refreshSession('console')).resolves.toBe(true);
    off();
    expect(ended).toEqual([]);
    expect(sessionTiming('console')).not.toBeNull();
  });

  // 2026-10-13: a renewal cut off by a reload left the old cookies; it now finishes regardless.
  it('renews with a request that outlives the page', async () => {
    document.cookie = 'rp_console_csrf=tok; path=/';
    const fetchMock = vi.fn(async () =>
      Response.json({ accessTokenExpiresAt: 'x', refreshTokenExpiresAt: 'x' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await renewSession('console');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.keepalive).toBe(true);
  });

  // 2026-10-13: signed out whenever the server was restarting or the connection dropped.
  it('tells a refusal from no answer: only a refusal ends the session', async () => {
    document.cookie = 'rp_console_csrf=tok; path=/';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(renewSession('console')).resolves.toBe('unreachable');
    await new Promise((r) => setTimeout(r, 0));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad gateway', { status: 502 })),
    );
    await expect(renewSession('console')).resolves.toBe('unreachable');
    await new Promise((r) => setTimeout(r, 0));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: 'AUTH.UNAUTHENTICATED' }, { status: 401 })),
    );
    await expect(renewSession('console')).resolves.toBe('refused');
  });

  it('says a session past its idle limit ended for want of use', () => {
    const past = new Date(Date.now() - MIN).toISOString();
    noteRenewal('console', { accessTokenExpiresAt: past, refreshTokenExpiresAt: past }, null);
    const seen: (string | undefined)[] = [];
    const off = onSessionEnded((_s, reason) => seen.push(reason));
    sessionEnded('console');
    off();
    expect(seen).toEqual(['AUTH.SESSION_IDLE']);
  });

  it('passes the server’s reason on when the session ended (signed in elsewhere)', async () => {
    document.cookie = 'rp_console_csrf=tok; path=/';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: 'AUTH.SIGNED_IN_ELSEWHERE' }, { status: 401 })),
    );
    await expect(refreshSession('console')).resolves.toBe(false);
    const seen: (string | undefined)[] = [];
    const off = onSessionEnded((_s, reason) => seen.push(reason));
    sessionEnded('console');
    // Said once: a later end without a reason is the plain one.
    sessionEnded('console');
    off();
    expect(seen).toEqual(['AUTH.SIGNED_IN_ELSEWHERE', undefined]);
  });
});
