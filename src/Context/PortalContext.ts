import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  CSRF_HEADER,
  REQUIRE_TAB_SESSION,
  SURFACE_HEADER,
  clearTabSession,
  csrfToken,
  hasTabSession,
  markTabSession,
} from '../components/Utils/web-session';
import type { PasswordPolicy } from '../components/Utils/patterns';
import { DEFAULT_PASSWORD_POLICY, type StaffChallenge } from './SessionContext';

export type PortalInstitutionStatus = 'PENDING_ACTIVATION' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

/** SAS-044: who is signed in to the customer portal and the institution with its status. */
export interface PortalSession {
  readonly name: string;
  readonly email: string | null;
  readonly mobile: string;
  readonly institution: {
    readonly id: string;
    readonly name: string;
    readonly shortName: string;
    readonly city: string;
    readonly identifier: string;
    readonly status: PortalInstitutionStatus;
  };
  readonly preferredLang: string;
}

const AUTH = '/api/v1/portal/auth';

/**
 * The customer portal session (SAS-005, SAS-006, SAS-044…046). The portal has its own cookies
 * (`__Host-rp_portal_*`), separate from the console and the back office, so one browser can hold
 * all three. `/api/v1/portal/…` requests carry the portal's CSRF token automatically (api.ts);
 * shared routes such as sign-out name the surface in `X-CampusOne-Surface`.
 */
@Injectable({ providedIn: 'root' })
export class PortalContext {
  private readonly http = inject(HttpClient);
  private readonly requireTabSession = inject(REQUIRE_TAB_SESSION);
  readonly session = signal<PortalSession | null>(null);
  /** Bumped after a change that the frame (status, menu counts) shows; the frame reloads then. */
  readonly changes = signal(0);

  /** Loads the session; false when signed out. */
  async load(): Promise<boolean> {
    try {
      this.session.set(
        await firstValueFrom(this.http.get<PortalSession>('/api/v1/portal/session')),
      );
      return true;
    } catch {
      this.session.set(null);
      return false;
    }
  }

  /**
   * Public pages show "Your account" when a session exists. Without the portal's CSRF cookie there
   * is none, so no request is made (no 401 on every visit to the website).
   */
  async loadQuietly(): Promise<boolean> {
    if (this.session()) return true;
    if (this.requireTabSession && !hasTabSession('portal')) return false;
    if (!csrfToken('portal')) return false;
    return this.load();
  }

  /** The frame and menus reload (status, onboarding progress, unpaid invoices). */
  changed() {
    this.changes.update((n) => n + 1);
  }

  signIn(email: string, password: string) {
    return firstValueFrom(this.http.post<StaffChallenge>(`${AUTH}/signin`, { email, password }));
  }

  resend(challengeId: string) {
    return firstValueFrom(this.http.post<StaffChallenge>(`${AUTH}/otp/resend`, { challengeId }));
  }

  /**
   * The code opens the session — or, for a temporary password, returns the token of the "choose
   * your password" step instead (as the console, OI-IDN-20).
   */
  async verify(challengeId: string, otp: string): Promise<{ resetToken?: string }> {
    const r = await firstValueFrom(
      this.http.post<{ name: string; passwordChangeRequired?: boolean; resetToken?: string }>(
        `${AUTH}/otp/verify`,
        { challengeId, otp },
      ),
    );
    if (r.passwordChangeRequired && r.resetToken) return { resetToken: r.resetToken };
    markTabSession('portal');
    await this.load();
    return {};
  }

  /** SAS-046: the same answer whether or not the account exists. */
  async forgotPassword(email: string): Promise<void> {
    await firstValueFrom(this.http.post(`${AUTH}/password/forgot`, { email }));
  }

  /** IDN-083: the new password from the e-mailed link; every session of the account ends. */
  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/v1/auth/staff/password/reset', { resetToken, newPassword }),
    );
  }

  /** Password rules (27.4 §5) from the public reference. */
  async passwordPolicy(): Promise<PasswordPolicy> {
    try {
      const r = await firstValueFrom(
        this.http.get<{ password: PasswordPolicy }>('/api/v1/auth/member/signup/reference'),
      );
      return r.password;
    } catch {
      return DEFAULT_PASSWORD_POLICY;
    }
  }

  /** After sign-up the server has set the portal cookies: read the new session. */
  async signedUp(): Promise<void> {
    markTabSession('portal');
    await this.load();
  }

  /** IDN-009: ends the portal session (the server clears the cookies). */
  async signOut(): Promise<void> {
    const token = csrfToken('portal');
    try {
      await firstValueFrom(
        this.http.post('/api/v1/auth/signout', null, {
          headers: { [SURFACE_HEADER]: 'portal', ...(token ? { [CSRF_HEADER]: token } : {}) },
        }),
      );
    } finally {
      clearTabSession('portal');
      this.session.set(null);
    }
  }
}

/** Signed-in portal pages: a signed-out visitor (or new tab without active sign-in) goes to portal sign-in. */
export const portalSession: CanActivateFn = async () => {
  const ctx = inject(PortalContext);
  const router = inject(Router);
  const requireTab = inject(REQUIRE_TAB_SESSION);
  if (requireTab && !hasTabSession('portal')) {
    return router.createUrlTree(['/portal/signin']);
  }
  return (await ctx.load()) ? true : router.createUrlTree(['/portal/signin']);
};
