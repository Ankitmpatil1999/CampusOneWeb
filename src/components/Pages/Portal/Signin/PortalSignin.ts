import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DEFAULT_PASSWORD_POLICY, type StaffChallenge } from '../../../../Context/SessionContext';
import { PortalContext } from '../../../../Context/PortalContext';
import { Icon } from '../../../Shared/Icon';
import { OverlayHost, Overlays } from '../../../Shared/Overlays';
import { PATTERNS, isValidPassword } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PortalFlow } from '../Layout/PortalFlow';
import { PortalStore } from '../portal.store';
import { CodeBoxes, Field, shownStatus } from '../Shared/PortalUi';

type Step = 'cred' | 'code' | 'reset' | 'reset-done' | 'reset-bad';
const DIGITS = 4;

/**
 * s.signin — the portal sign-in (SRS 6.4, CR-05; SAS-005, SAS-006, SAS-045, SAS-046; prototype
 * s.signin): the e-mail and password of the administrator's CampusOne account, then a one-time code to
 * the mobile. The portal stays open while the institution is pending, on trial or suspended, so it
 * can always pay. With `data.mode = 'reset'` the page is the e-mailed "Forgot password?" link
 * (IDN-083): the new password, then "Password changed".
 */
@Component({
  selector: 'rp-portal-signin',
  imports: [CodeBoxes, Field, Icon, OverlayHost, PortalFlow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block; height: 100%' },
  template: `
    <rp-sp-flow>
      <ng-container flow-side>
        <div class="fs-hide">
          <h2>Welcome back</h2>
          <p class="mt8">
            Administrators sign in here to finish onboarding, go live, change plan, pay invoices and
            export data. The portal stays open even if your institution is suspended, so you can
            always pay.
          </p>
        </div>
      </ng-container>
      <ng-container flow-top>
        <span>New to CampusOne?</span>
        <button type="button" class="btn btn-accent btn-sm" (click)="go('/portal/signup')">
          <span>Start free trial</span>
        </button>
      </ng-container>

      @switch (step()) {
        @case ('cred') {
          <div>
            <h1>Sign in to your account</h1>
            <p class="sub">
              Use the e-mail of your CampusOne account and your password. We'll then send a one-time
              code to your mobile.
            </p>
          </div>
          @if (flash(); as f) {
            <div class="note" [class]="'note tone-' + f.tone" role="alert">
              <rp-icon [name]="f.tone === 'bad' ? 'alertc' : 'info'" [size]="17" />
              <div class="grow">{{ f.text }}</div>
            </div>
          }
          <div class="stack g14">
            <rp-sp-fld fid="sp-si-e" label="E-mail" [req]="true" [error]="emailError()">
              <input
                id="sp-si-e"
                type="email"
                placeholder="name@school.example.in"
                autocomplete="username"
                aria-describedby="sp-si-e-e"
                [value]="email()"
                (input)="email.set(value($event)); emailError.set('')"
                (keydown.enter)="signIn()"
              />
            </rp-sp-fld>
            <rp-sp-fld fid="sp-si-p" label="Password" [req]="true" [error]="passwordError()">
              <input
                id="sp-si-p"
                type="password"
                autocomplete="current-password"
                aria-describedby="sp-si-p-e"
                [value]="password()"
                (input)="password.set(value($event)); passwordError.set('')"
                (keydown.enter)="signIn()"
              />
            </rp-sp-fld>
          </div>
          <div class="sp-fnav">
            <button type="button" class="linkbtn" (click)="forgot()">Forgot password?</button>
            <span class="grow"></span>
            <button
              type="button"
              class="btn btn-pri btn-lg"
              id="sp-si-go"
              [class.is-busy]="busy()"
              (click)="signIn()"
            >
              <span>Continue</span><rp-icon name="arrowr" [size]="15" />
            </button>
          </div>
        }
        @case ('code') {
          @let c = challenge();
          <div>
            <button type="button" class="btn btn-ghost btn-sm" (click)="back()">
              <rp-icon name="arrowl" [size]="15" /><span>Use a different account</span>
            </button>
            <h1 style="margin-top: 8px">Verify it's you</h1>
            <p class="sub">
              We sent a {{ digits }}-digit code
              {{ c?.channel === 'EMAIL' ? 'by e-mail' : 'by SMS' }} to <b>{{ c?.sentTo }}</b
              >. It's valid for {{ validMinutes() }} minutes.
            </p>
          </div>
          <div class="stack g8">
            <rp-sp-otp
              [digits]="digits"
              [error]="codeError()"
              (typing)="codeError.set('')"
              (entered)="verify($event)"
            />
          </div>
          @if (c?.testCode; as test) {
            <div class="demo-hint">
              <rp-icon name="sparkles" [size]="14" /><span>Test code</span> <b>{{ test }}</b>
            </div>
          }
          <div class="sp-fnav">
            @if (resent()) {
              <span class="t-sm t-muted"
                ><rp-icon name="check" [size]="14" /> New code sent. The earlier code no longer
                works.</span
              >
            } @else if (resendLeft() > 0) {
              <span class="t-sm t-muted">Send a new code in {{ resendLeft() }} s</span>
            } @else {
              <button type="button" class="linkbtn" (click)="resend()">Send a new code</button>
            }
            <span class="grow"></span>
            <button
              type="button"
              class="btn btn-pri btn-lg"
              id="sp-si-vb"
              [class.is-busy]="busy()"
              (click)="verify()"
            >
              <span>Verify and sign in</span>
            </button>
          </div>
        }
        @case ('reset') {
          <div>
            <h1>New password</h1>
            <p class="sub">You'll be signed out of other devices.</p>
          </div>
          @if (flash(); as f) {
            <div class="note" [class]="'note tone-' + f.tone" role="alert">
              <rp-icon name="info" [size]="17" />
              <div class="grow">{{ f.text }}</div>
            </div>
          }
          <div class="stack g14">
            <input
              type="email"
              name="username"
              autocomplete="username"
              hidden
              aria-hidden="true"
              tabindex="-1"
            />
            <rp-sp-fld
              fid="sp-rp-p1"
              label="New password"
              [req]="true"
              [error]="newPasswordError()"
              [hint]="passwordHint()"
            >
              <input
                id="sp-rp-p1"
                type="password"
                autocomplete="new-password"
                aria-describedby="sp-rp-p1-e"
                [value]="newPassword()"
                (input)="newPassword.set(value($event)); newPasswordError.set('')"
              />
            </rp-sp-fld>
            <rp-sp-fld
              fid="sp-rp-p2"
              label="Confirm new password"
              [req]="true"
              [error]="confirmError()"
            >
              <input
                id="sp-rp-p2"
                type="password"
                autocomplete="new-password"
                aria-describedby="sp-rp-p2-e"
                [value]="confirmPassword()"
                (input)="confirmPassword.set(value($event)); confirmError.set('')"
                (keydown.enter)="savePassword()"
              />
            </rp-sp-fld>
          </div>
          <div class="sp-fnav">
            <span class="grow"></span>
            <button
              type="button"
              class="btn btn-pri btn-lg"
              [class.is-busy]="busy()"
              (click)="savePassword()"
            >
              <span>Save new password</span>
            </button>
          </div>
        }
        @case ('reset-done') {
          <div>
            <h1>Password changed</h1>
            <p class="sub">
              Use your new password next time you sign in. Other devices were signed out.
            </p>
          </div>
          <div class="sp-fnav">
            <span class="grow"></span>
            <button type="button" class="btn btn-pri btn-lg" (click)="toSignIn()">
              <span>Sign in</span><rp-icon name="arrowr" [size]="15" />
            </button>
          </div>
        }
        @case ('reset-bad') {
          <div>
            <h1>Reset password</h1>
            <p class="sub">{{ resetBadText() }}</p>
          </div>
          <div class="sp-fnav">
            <span class="grow"></span>
            <button type="button" class="btn btn-sec btn-lg" (click)="toSignIn()">
              <span>Back to sign-in</span>
            </button>
          </div>
        }
      }
    </rp-sp-flow>
    <rp-overlays [fixed]="true" />
  `,
})
export class PortalSignin implements OnInit {
  private readonly ctx = inject(PortalContext);
  private readonly store = inject(PortalStore);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);
  private readonly mode = inject(ActivatedRoute).snapshot.data['mode'] === 'reset';
  private readonly code = viewChild(CodeBoxes);

  protected readonly digits = DIGITS;
  protected readonly step = signal<Step>('cred');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly emailError = signal('');
  protected readonly passwordError = signal('');
  protected readonly flash = signal<{ text: string; tone: 'bad' | 'warn' | 'info' } | null>(null);
  protected readonly busy = signal(false);
  protected readonly challenge = signal<StaffChallenge | null>(null);
  protected readonly codeError = signal('');
  protected readonly resent = signal(false);
  private readonly now = signal(Date.now());
  private readonly sentAt = signal(Date.now());
  protected readonly resendLeft = computed(() =>
    Math.max(
      0,
      Math.ceil(
        ((this.challenge()?.resendAfterSeconds ?? 60) * 1000 - (this.now() - this.sentAt())) / 1000,
      ),
    ),
  );
  protected readonly validMinutes = computed(() => {
    const c = this.challenge();
    return c
      ? Math.max(1, Math.round((new Date(c.expiresAt).getTime() - this.sentAt()) / 60_000))
      : 5;
  });

  private resetToken = '';
  protected readonly newPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly newPasswordError = signal('');
  protected readonly confirmError = signal('');
  protected readonly resetBadText = signal('');
  private readonly policy = signal(DEFAULT_PASSWORD_POLICY);
  protected readonly passwordHint = computed(() =>
    translate('VALIDATION.PASSWORD', {
      min: this.policy().minLength,
      max: this.policy().maxLength,
    }),
  );

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  ngOnInit() {
    if (!this.mode) return;
    // The token arrives in the fragment (never in a server log); drop it from the address bar.
    const m = /(?:^#|&)token=([^&]+)/.exec(globalThis.location?.hash ?? '');
    this.resetToken = m?.[1] ? decodeURIComponent(m[1]) : '';
    try {
      history.replaceState(history.state, '', location.pathname);
    } catch {
      /* not in a browser */
    }
    if (!this.resetToken) {
      this.resetBadText.set(translate('IDN.RESET_LINK_INVALID'));
      this.step.set('reset-bad');
      return;
    }
    this.step.set('reset');
    void this.ctx.passwordPolicy().then((p) => this.policy.set(p));
  }

  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }

  private checkEmail(): string {
    const email = this.email().trim().toLowerCase();
    this.emailError.set(
      !email
        ? translate('VALIDATION.REQUIRED')
        : PATTERNS.email.test(email)
          ? ''
          : translate('VALIDATION.EMAIL'),
    );
    return this.emailError() ? '' : email;
  }

  /** SAS-046: the link goes to the e-mail typed above (the same answer for any address). */
  protected async forgot() {
    if (this.busy()) return;
    const email = this.checkEmail();
    if (!email) return;
    this.busy.set(true);
    this.flash.set(null);
    try {
      await this.ctx.forgotPassword(email);
      this.overlays.toast('Password reset link sent', {
        sub: `If ${email} has a portal account, a reset link is on its way.`,
        ms: 5000,
      });
    } catch (e) {
      this.flash.set({
        text: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'warn',
      });
    } finally {
      this.busy.set(false);
    }
  }

  /** SAS-005: e-mail and password → a code to the mobile. */
  protected async signIn() {
    if (this.busy()) return;
    const email = this.checkEmail();
    this.passwordError.set(this.password() ? '' : translate('VALIDATION.REQUIRED'));
    if (!email || this.passwordError()) return;
    this.busy.set(true);
    this.flash.set(null);
    try {
      const c = await this.ctx.signIn(email, this.password());
      this.password.set('');
      this.challenge.set(c);
      this.sentAt.set(Date.now());
      this.now.set(Date.now());
      this.codeError.set('');
      this.resent.set(false);
      this.step.set('code');
      this.overlays.toast('Code sent', {
        sub:
          c.channel === 'EMAIL'
            ? 'E-mail to your registered address'
            : 'SMS to your registered mobile',
        tone: 'info',
      });
    } catch (e) {
      this.refused(e);
    } finally {
      this.busy.set(false);
    }
  }

  private refused(e: unknown) {
    const text = e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
    const bad = e instanceof ApiProblem && [401, 423, 429].includes(e.status);
    this.flash.set({ text, tone: bad ? 'bad' : 'warn' });
    this.step.set('cred');
  }

  /** SAS-006: the code opens the session (or the "choose your password" step). */
  protected async verify(entered?: string) {
    const c = this.challenge();
    if (!c || this.busy()) return;
    const otp = entered ?? this.code()?.value() ?? '';
    if (otp.length < DIGITS) {
      this.codeError.set(translate('VALIDATION.OTP'));
      this.code()?.reset();
      return;
    }
    this.busy.set(true);
    try {
      const r = await this.ctx.verify(c.challengeId, otp);
      if (r.resetToken) {
        this.resetToken = r.resetToken;
        this.flash.set({
          text: 'Choose your own password to finish signing in. The temporary password stops working.',
          tone: 'info',
        });
        void this.ctx.passwordPolicy().then((p) => this.policy.set(p));
        this.step.set('reset');
        return;
      }
      const s = this.ctx.session();
      this.store.clear();
      await this.router.navigateByUrl(
        s?.institution.status === 'PENDING_ACTIVATION' ? '/portal/onboard' : '/portal/account',
      );
      if (s) {
        const suspended = s.institution.status === 'SUSPENDED';
        this.overlays.toast(`Signed in · ${s.institution.name}`, {
          sub: suspended
            ? 'Your institution is suspended — pay the overdue invoice to restore it'
            : `Status: ${shownStatus(s.institution.status, null)}`,
          tone: suspended ? 'warn' : 'ok',
        });
      }
    } catch (e) {
      if (
        e instanceof ApiProblem &&
        e.code === 'AUTH.OTP_INVALID' &&
        e.params['triesLeft'] != null
      ) {
        const left = Number(e.params['triesLeft']);
        this.codeError.set(`${e.detail} ${left} ${left === 1 ? 'try' : 'tries'} left.`);
        this.code()?.reset();
      } else if (
        e instanceof ApiProblem &&
        (e.status === 423 || e.status === 429 || e.code === 'IDN.SIGNIN_ATTEMPT_ENDED')
      ) {
        this.refused(e);
      } else {
        this.codeError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
        this.code()?.reset();
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** SAS-045: one resend after the countdown; the earlier code stops working. */
  protected async resend() {
    const c = this.challenge();
    if (!c) return;
    try {
      const next = await this.ctx.resend(c.challengeId);
      this.challenge.set(next);
      this.resent.set(true);
      this.overlays.toast('New code sent', {
        sub: 'The earlier code no longer works',
        tone: 'info',
      });
    } catch (e) {
      this.codeError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected back() {
    this.flash.set(null);
    this.challenge.set(null);
    this.step.set('cred');
  }

  /** IDN-083: the new password (the e-mailed link, or a temporary password after the code). */
  protected async savePassword() {
    if (this.busy()) return;
    const p1 = this.newPassword();
    const p2 = this.confirmPassword();
    this.newPasswordError.set(
      !p1
        ? translate('VALIDATION.REQUIRED')
        : isValidPassword(p1, this.policy())
          ? ''
          : translate('IDN.PASSWORD_FORMAT'),
    );
    this.confirmError.set(
      !p2
        ? translate('VALIDATION.REQUIRED')
        : p1 && p2 !== p1
          ? translate('IDN.PASSWORD_MISMATCH')
          : '',
    );
    if (this.newPasswordError() || this.confirmError()) return;
    this.busy.set(true);
    this.flash.set(null);
    try {
      await this.ctx.resetPassword(this.resetToken, p1);
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.step.set('reset-done');
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 401) {
        this.resetBadText.set(e.detail);
        this.step.set('reset-bad');
      } else if (e instanceof ApiProblem && e.status === 422) {
        this.newPasswordError.set(translate('IDN.PASSWORD_FORMAT'));
      } else {
        this.flash.set({
          text: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
          tone: 'warn',
        });
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected toSignIn() {
    this.flash.set(null);
    this.step.set('cred');
    if (this.mode) void this.router.navigateByUrl('/portal/signin');
  }
}
