import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { I18n } from '../components/Utils/i18n';
import { type CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CAMPUSONE_WEB_CONFIG } from '../Config';
import { type StaffSurface } from '../components/Utils/navigation';
import { ApiProblem } from '../components/Utils/problem';
import { translate } from '../components/Utils/translate';
import {
  CSRF_HEADER,
  SURFACE_HEADER,
  type CookieSurface,
  csrfToken,
  forgetSession,
  noteRenewal,
  onSessionEnded,
  refreshSession,
} from '../components/Utils/web-session';
import type { PasswordPolicy } from '../components/Utils/patterns';

/** Used until the reference answers (the register defaults, 27.4 §5). */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = { minLength: 8, maxLength: 64 };

/** IDN-079: the console session (name, institution, roles, granted sub-tasks). */
export interface ConsoleSession {
  readonly name: string;
  readonly email: string | null;
  readonly institution: {
    readonly id: string;
    readonly name: string;
    readonly shortName: string;
    readonly city: string;
    /** The school's logo (INS-049, client 2026-10-15), or null when none is uploaded. */
    readonly logoUrl?: string | null;
  };
  readonly roles: readonly { code: string | null; name: string; readOnly: boolean }[];
  readonly subTasks: readonly string[];
  readonly preferredLang: string;
}

/**
 * An institution the person belongs to (client 2026-10-27: a person may belong to several, and is
 * asked which to open at sign-in).
 */
export interface InstitutionChoice {
  readonly id: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly city: string | null;
  readonly logoUrl: string | null;
}

/** IDN-080: the back-office session. */
export interface OpsSession {
  readonly name: string;
  readonly email: string | null;
  readonly role: { readonly code: string | null; readonly name: string };
  readonly subTasks: readonly string[];
  readonly preferredLang: string;
}

/** IDN-031 / IDN-035 (and the resends): the code that was sent. */
export interface StaffChallenge {
  readonly challengeId: string;
  readonly expiresAt: string;
  readonly resendAfterSeconds: number;
  readonly sentTo: string;
  readonly channel: 'SMS' | 'EMAIL';
  readonly emailFallback: string | null;
  readonly alreadySent?: boolean;
  /** Test mode only (OTP_TEST_SHOW_CODE; never in production). */
  readonly testCode?: string;
}

/** The school last signed in on this browser (shown on the console sign-in page, as the prototype). */
export interface RememberedSchool {
  readonly name: string;
  readonly city: string;
}
const SCHOOL_KEY = 'rp.console.school';

/**
 * All schools share one server and one console address (client 2026-10-03), so the sign-in page
 * cannot know the school from the address. It shows the school last signed in on this browser — a
 * per-browser convenience; it never decides access.
 */
export function rememberedSchool(): RememberedSchool | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SCHOOL_KEY) ?? 'null');
    if (v && typeof v === 'object' && typeof (v as RememberedSchool).name === 'string') {
      const s = v as RememberedSchool;
      return { name: s.name, city: typeof s.city === 'string' ? s.city : '' };
    }
  } catch {
    /* storage unavailable or unreadable: no school shown */
  }
  return null;
}

function rememberSchool(s: RememberedSchool) {
  try {
    localStorage.setItem(SCHOOL_KEY, JSON.stringify({ name: s.name, city: s.city }));
  } catch {
    /* storage unavailable (private mode): the generic sign-in page is shown next time */
  }
}

const AUTH = {
  console: '/api/v1/auth/console',
  ops: '/api/v1/ops/auth',
} as const;

/**
 * Who is signed in to the console and to the back office. Each surface has its own cookies, so a
 * browser can hold both; neither is known until its session endpoint answers.
 */
@Injectable({ providedIn: 'root' })
export class SessionContext {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly apiBase = inject(CAMPUSONE_WEB_CONFIG, { optional: true })?.apiBaseUrl ?? '';
  readonly console = signal<ConsoleSession | null>(null);
  readonly ops = signal<OpsSession | null>(null);

  constructor() {
    onSessionEnded((s, reason) => this.ended(s, reason));
  }

  /** Loads the session of a surface; false when signed out. */
  async load(surface: StaffSurface): Promise<boolean> {
    try {
      if (surface === 'console') {
        const s = await firstValueFrom(this.http.get<ConsoleSession>('/api/v1/console/session'));
        this.console.set(s);
        rememberSchool(s.institution);
        this.i18n.adopt(s.preferredLang);
      } else {
        const s = await firstValueFrom(this.http.get<OpsSession>('/api/v1/ops/session'));
        this.ops.set(s);
        this.i18n.adopt(s.preferredLang);
      }
      return true;
    } catch {
      this.clear(surface);
      return false;
    }
  }

  signIn(surface: StaffSurface, email: string, password: string) {
    return firstValueFrom(
      this.http.post<StaffChallenge>(`${AUTH[surface]}/signin`, { email, password }),
    );
  }

  resend(surface: StaffSurface, challengeId: string, channel?: 'EMAIL') {
    return firstValueFrom(
      this.http.post<StaffChallenge>(`${AUTH[surface]}/otp/resend`, {
        challengeId,
        ...(channel ? { channel } : {}),
      }),
    );
  }

  /**
   * The code opens the session — or, for a temporary password (onboarded staff, OI-IDN-20), returns
   * the token of the "choose your password" step instead. The console's answer lists the person's
   * institutions; the session starts at the first (client 2026-10-27).
   */
  async verify(
    surface: StaffSurface,
    challengeId: string,
    otp: string,
  ): Promise<{ resetToken?: string; institutions?: readonly InstitutionChoice[] }> {
    const res = await firstValueFrom(
      this.http.post<{
        name: string;
        passwordChangeRequired?: boolean;
        resetToken?: string;
        institutions?: readonly InstitutionChoice[];
      }>(`${AUTH[surface]}/otp/verify`, { challengeId, otp }, { observe: 'response' }),
    );
    const r = res.body ?? { name: '' };
    if (r.passwordChangeRequired && r.resetToken) return { resetToken: r.resetToken };
    noteRenewal(surface, r, res.headers.get('Date'));
    await this.load(surface);
    return { institutions: r.institutions ?? [] };
  }

  /** The institutions this person belongs to (client 2026-10-27), for "Switch institution". */
  async myInstitutions(): Promise<readonly InstitutionChoice[]> {
    const r = await firstValueFrom(
      this.http.get<{ current: unknown; institutions: readonly InstitutionChoice[] }>(
        '/api/v1/console/me/institutions',
      ),
    );
    return r.institutions;
  }

  /**
   * Moves the console session to another of the person's institutions (client 2026-10-27), then
   * renews the tokens so they carry that institution and its sub-tasks. The page then opens the
   * console (the area's guard loads the session).
   */
  async chooseInstitution(institutionId: string): Promise<void> {
    await firstValueFrom(
      this.http.put<{ institutionId: string; profileId: string }>(
        '/api/v1/console/me/institution',
        { institutionId },
      ),
    );
    if (!(await refreshSession('console', this.apiBase))) {
      throw new ApiProblem(0, 'GEN.UNAVAILABLE', translate('GEN.UNAVAILABLE'), null);
    }
  }

  /**
   * Opens the console afresh — a full page load, so no page or list keeps the previous
   * institution's data. Overridden in tests.
   */
  restart(url = '/console'): void {
    location.assign(url);
  }

  /** IDN-034 / IDN-082: the same answer whether or not the account exists. */
  async forgotPassword(surface: StaffSurface, email: string): Promise<void> {
    const path =
      surface === 'console'
        ? '/api/v1/auth/console/password/forgot'
        : '/api/v1/ops/auth/password/forgot';
    await firstValueFrom(this.http.post(path, { email }));
  }

  /** IDN-083: the new password from the e-mailed link; every session of the account ends. */
  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post('/api/v1/auth/staff/password/reset', { resetToken, newPassword }),
    );
  }

  /** Password rules (27.4 §5; settings idn.password.*) from the public reference. */
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

  /** IDN-009: ends the session on this surface (the server clears the cookies). */
  async signOut(surface: StaffSurface): Promise<void> {
    const token = csrfToken(surface);
    try {
      await firstValueFrom(
        this.http.post('/api/v1/auth/signout', null, {
          headers: { [SURFACE_HEADER]: surface, ...(token ? { [CSRF_HEADER]: token } : {}) },
        }),
      );
    } finally {
      forgetSession(surface);
      this.clear(surface);
    }
  }

  /**
   * A session that ended while in use (idle limit, signed in elsewhere, ended by an administrator):
   * back to the area's sign-in page, which says so — with the server's reason when it gave one
   * (signed in on another device) — instead of pages that can no longer load.
   */
  private ended(surface: CookieSurface, reason?: string) {
    if (surface === 'portal' || !(surface === 'console' ? this.console() : this.ops())) return;
    this.clear(surface);
    void this.router.navigateByUrl(
      surface === 'console' ? '/console/signin' : '/backoffice/signin',
      {
        state: { sessionEnded: true, ...(reason ? { reason } : {}) },
      },
    );
  }

  private clear(surface: StaffSurface) {
    if (surface === 'console') this.console.set(null);
    else this.ops.set(null);
  }
}

/** Area guard: a signed-out visitor goes to the area's sign-in page. */
export const staffSession =
  (surface: StaffSurface): CanActivateFn =>
  async () => {
    const sessions = inject(SessionContext);
    const router = inject(Router);
    return (await sessions.load(surface))
      ? true
      : router.createUrlTree([surface === 'console' ? '/console/signin' : '/backoffice/signin']);
  };
