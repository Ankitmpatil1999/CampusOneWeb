/**
 * Keeps a staff session alive while someone is using it. The access token and the idle limit lapse
 * together (15 minutes each by default), and the refresh cookie lapses with them, so a renewal after
 * a 401 is too late. The keeper renews ahead of time instead — only when the person has used the
 * page (pointer, keys, wheel, touch) since the last renewal, so an unused page still ends at the
 * idle limit. Past the limit the session is reported as ended and the area returns to its sign-in
 * page instead of leaving pages that can no longer load.
 */
import { Injectable } from '@angular/core';
import {
  type CookieSurface,
  type SessionTiming,
  renewSession,
  sessionEnded,
  sessionTiming,
} from './web-session';

/** How often the keeper looks; also on any use and on returning to the tab. */
const TICK_MS = 15_000;
/** Renew at the latest this long before the access token lapses. */
const MARGIN_MS = 60_000;
/** Past the idle limit by this much, the session is over. */
const GRACE_MS = 5_000;
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Renew when the page was used since the last renewal and a third of the token's life has passed
 * (or it is about to lapse): the server's idle deadline then trails the last use by at most a third
 * of the limit. Unknown timing (a session opened before this release) renews on the first use.
 */
export function renewalDue(t: SessionTiming | null, lastActive: number, now: number): boolean {
  if (lastActive <= (t?.renewedAt ?? 0)) return false;
  if (!t) return true;
  if (now >= t.refreshUntil) return false;
  return now - t.renewedAt >= (t.accessUntil - t.renewedAt) / 3 || t.accessUntil - now <= MARGIN_MS;
}

export function sessionLapsed(t: SessionTiming | null, now: number): boolean {
  return !!t && now >= t.refreshUntil + GRACE_MS;
}

@Injectable({ providedIn: 'root' })
export class SessionKeeper {
  private surface: CookieSurface | null = null;
  private lastActive = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  /** After a failed renewal, not again before the next tick (keys would otherwise retry it). */
  private retryAt = 0;

  private readonly onActivity = () => {
    this.lastActive = Date.now();
    this.check();
  };
  private readonly onVisible = () => {
    if (!document.hidden) this.check();
  };

  /** Starts for a signed-in area; opening it counts as use. */
  start(surface: CookieSurface) {
    this.stop();
    if (typeof document === 'undefined') return;
    this.surface = surface;
    this.lastActive = Date.now();
    this.retryAt = 0;
    for (const e of ACTIVITY) {
      document.addEventListener(e, this.onActivity, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', this.onVisible);
    this.timer = setInterval(() => this.check(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.surface = null;
    if (typeof document === 'undefined') return;
    for (const e of ACTIVITY) document.removeEventListener(e, this.onActivity, { capture: true });
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  private check() {
    const surface = this.surface;
    const now = Date.now();
    if (!surface || this.busy || now < this.retryAt) return;
    const t = sessionTiming(surface);
    const lapsed = sessionLapsed(t, now);
    if (lapsed || renewalDue(t, this.lastActive, now)) void this.renew(surface, lapsed);
  }

  private async renew(surface: CookieSurface, lapsed: boolean) {
    this.busy = true;
    try {
      const r = await renewSession(surface);
      if (r === 'renewed') return;
      // Refused (signed in elsewhere, ended by an administrator), or past the idle limit: it is
      // over. Without an answer (offline, the server restarting) the next tick tries again.
      if (r === 'refused' || lapsed) {
        this.stop();
        sessionEnded(surface);
      } else this.retryAt = Date.now() + TICK_MS;
    } finally {
      this.busy = false;
    }
  }
}
