import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  DestroyRef,
  type OnInit,
  computed,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  DEFAULT_PASSWORD_POLICY,
  SessionContext,
  rememberedSchool,
  type InstitutionChoice,
  type StaffChallenge,
} from '../../Context/SessionContext';
import type { StaffSurface } from '../Utils/navigation';
import { ApiProblem } from '../Utils/problem';
import { translate } from '../Utils/translate';
import { PATTERNS, isValidPassword } from '../Utils/patterns';
import { Avatar } from './Avatar';
import { Countdown } from './Countdown';
import { Icon } from './Icon';
import { InstitutionList } from './InstitutionList';
import { LanguageMenu } from './LanguageMenu';
import { Mark } from './Mark';
import { OverlayHost, Overlays } from './Overlays';

type Step = 'cred' | 'code' | 'pick' | 'locked' | 'reset' | 'reset-done' | 'reset-bad';
const DIGITS = 4;

/**
 * The prototype's console and back-office sign-in (authDef — c.signin / o.signin; SRS 6.4, CR-05):
 * a brand panel and a card with three steps — work e-mail and password; "Verify it's you" with the
 * 4-digit code, resend countdown and e-mail fallback; and "Account locked". Someone at several
 * institutions then chooses the one to open (client 2026-10-27). Wording of refusals comes from the
 * message register (Q22); screen texts are the prototype's.
 *
 * `mode="reset"` is the page the e-mailed "Forgot password?" link opens (IDN-083): the prototype's
 * "New password" step and "Password changed" result (m.forgot) in the same layout.
 */
@Component({
  selector: 'rp-staff-signin',
  imports: [Avatar, Countdown, Icon, InstitutionList, Mark, OverlayHost, LanguageMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:block;height:100vh;height:100dvh' },
  template: `
    <div class="cp-auth" [class.op]="isOps()">
      <aside class="cp-ab">
        @if (isOps()) {
          <div class="cp-ab-top">
            <rp-mark [size]="40" />
            <div><b>CampusOne</b><small>Back office · platform operator</small></div>
          </div>
          <div class="cp-ab-mid">
            <h2>Operate every institution, safely.</h2>
            <ul>
              <li>
                <rp-icon name="bank" [size]="17" /><span
                  >Two-stage settlement approval and payout references</span
                >
              </li>
              <li>
                <rp-icon name="scale" [size]="17" /><span
                  >Reconciliation, refunds and chargebacks</span
                >
              </li>
              <li>
                <rp-icon name="shieldck" [size]="17" /><span
                  >Every cross-institution view is recorded</span
                >
              </li>
            </ul>
          </div>
          <div class="cp-ab-foot">
            Operator staff only. Institution staff use their institution console.
          </div>
        } @else {
          <div class="cp-ab-top">
            @if (school(); as s) {
              <rp-av [name]="s.name" [sq]="true" [px]="44" color="#0C6F7D" />
              <div>
                <b style="font-size: 18px">{{ s.name }}</b>
                <small style="opacity: 0.85">School Console{{ s.city ? ' · ' + s.city : '' }}</small>
              </div>
            } @else {
              <rp-mark [size]="44" />
              <div>
                <b style="font-size: 20px">CampusOne</b>
                <small style="opacity: 0.85">Smart School Management System</small>
              </div>
            }
          </div>

          <div class="cp-school-showcase">
            <div class="cp-hero-frame">
              <img
                src="images/school-campus-hero.png"
                alt="CampusOne School Campus"
                class="cp-hero-img"
              />
              <div class="cp-hero-pill">
                <rp-icon name="grad" [size]="15" />
                <span>Next-Gen Smart Campus ERP</span>
              </div>
            </div>

            <div class="cp-ab-mid">
              <h2>Run your whole school from one unified portal.</h2>
              <p class="cp-ab-desc">
                Everything you need to automate student records, biometric attendance, fees, academics, and transport safety.
              </p>

              <div class="cp-feat-grid">
                <div class="cp-feat-item">
                  <span class="cp-feat-ic"><rp-icon name="users" [size]="16" /></span>
                  <div>
                    <b>Student & Staff Lifecycle</b>
                    <small>Admissions, biometric RFID attendance & profiles</small>
                  </div>
                </div>
                <div class="cp-feat-item">
                  <span class="cp-feat-ic"><rp-icon name="receipt" [size]="16" /></span>
                  <div>
                    <b>Fee Collections & Invoicing</b>
                    <small>Instant receipts, online payment gateways & ledger</small>
                  </div>
                </div>
                <div class="cp-feat-item">
                  <span class="cp-feat-ic"><rp-icon name="book" [size]="16" /></span>
                  <div>
                    <b>Academics & Timetables</b>
                    <small>Class scheduling, homework, exams & report cards</small>
                  </div>
                </div>
                <div class="cp-feat-item">
                  <span class="cp-feat-ic"><rp-icon name="bus" [size]="16" /></span>
                  <div>
                    <b>Fleet & Transport Safety</b>
                    <small>Live GPS bus tracking, student boarding logs & routes</small>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="cp-ab-foot">
            <rp-icon name="shieldck" [size]="16" />
            <span>Secure 256-bit encrypted school console · Session protected</span>
          </div>
        }
      </aside>
      <main class="cp-am">
        <div class="row" style="justify-content: flex-end; margin-bottom: 12px">
          <rp-lang-menu />
        </div>
        <div class="cp-af">
          @switch (step()) {
            @case ('cred') {
              <div class="cp-af-h">
                @if (!isOps()) {
                  <div class="cp-school-badge">
                    <rp-mark [size]="26" />
                    <span>School Administration Portal</span>
                  </div>
                }
                <h1>{{ isOps() ? 'Back office sign-in' : 'Sign in to Console' }}</h1>
                <p>
                  {{
                    isOps()
                      ? 'CampusOne platform operator'
                      : school()
                        ? school()!.name + ' · School Portal'
                        : 'Access student records, daily attendance, fees, and campus operations.'
                  }}
                </p>
              </div>

              @if (!isOps()) {
                <div class="cp-demo-banner">
                  <div class="cp-demo-content">
                    <span class="cp-demo-tag">Demo Admin</span>
                    <span class="cp-demo-txt">prakash.shetty@tvps.example.in</span>
                  </div>
                  <button
                    type="button"
                    class="btn btn-sm btn-sec cp-demo-btn"
                    (click)="fillDemo('admin')"
                  >
                    <span>Auto-Fill</span>
                  </button>
                </div>
              }
              @if (flash(); as f) {
                <div class="note" [class]="'tone-' + f.tone" role="alert">
                  <rp-icon [name]="f.tone === 'ok' ? 'checkc' : 'alert'" [size]="17" />
                  <div class="grow">{{ f.text }}</div>
                </div>
              }
              <form class="stack g16" novalidate (submit)="$event.preventDefault(); signIn()">
                <div class="fld" [class.invalid]="emailError()">
                  <label class="fld-l" for="cp-au-email"
                    >Work e-mail<span class="req">*</span></label
                  >
                  <div class="fld-in">
                    <input
                      id="cp-au-email"
                      name="email"
                      type="email"
                      placeholder="name@school.example.in"
                      autocomplete="username"
                      aria-describedby="cp-au-email-e"
                      [value]="email()"
                      (input)="email.set(asValue($event)); emailError.set('')"
                    />
                  </div>
                  <div class="fld-e" id="cp-au-email-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ emailError() }}</span>
                  </div>
                </div>
                <div class="fld" [class.invalid]="passwordError()">
                  <label class="fld-l" for="cp-au-pw">Password<span class="req">*</span></label>
                  <div class="fld-in">
                    <input
                      id="cp-au-pw"
                      name="password"
                      [type]="showPassword() ? 'text' : 'password'"
                      placeholder="Your console password"
                      autocomplete="current-password"
                      aria-describedby="cp-au-pw-e"
                      [value]="password()"
                      (input)="password.set(asValue($event)); passwordError.set('')"
                    />
                    <span class="suf plain">
                      <button
                        type="button"
                        class="cp-eye"
                        [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                        (click)="showPassword.set(!showPassword())"
                      >
                        <rp-icon [name]="showPassword() ? 'eyeoff' : 'eye'" [size]="16" />
                      </button>
                    </span>
                  </div>
                  <div class="fld-e" id="cp-au-pw-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ passwordError() }}</span>
                  </div>
                </div>
                <div class="row between">
                  <span class="t-xs t-muted">Next, we'll send a one-time code to your mobile.</span>
                  <button type="button" class="linkbtn cp-lk" (click)="forgot()">
                    Forgot password?
                  </button>
                </div>
                <button
                  type="submit"
                  class="btn btn-pri btn-lg btn-block"
                  id="cp-au-go"
                  [class.is-busy]="busy()"
                >
                  <span>Continue</span><rp-icon name="arrowr" [size]="15" />
                </button>
              </form>
            }
            @case ('code') {
              <div class="cp-af-h">
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  style="margin: 0 0 10px -10px"
                  (click)="back()"
                >
                  <rp-icon name="arrowl" [size]="15" /><span>Use a different account</span>
                </button>
                <h1>Verify it's you</h1>
                <p>
                  We sent a {{ digits }}-digit code
                  {{ challenge()?.channel === 'EMAIL' ? 'by e-mail to' : 'by SMS to' }}
                  <b>{{ challenge()?.sentTo }}</b
                  >. It's valid for {{ validMinutes() }} minutes.
                </p>
                @if (challenge()?.testCode; as testOtp) {
                  <div class="cp-test-code-card" (click)="fillOtp(testOtp)">
                    <rp-icon name="checkc" [size]="16" />
                    <div>
                      <span>Verification Code: <b>{{ testOtp }}</b></span>
                      <small>Click to auto-fill & verify</small>
                    </div>
                  </div>
                }
              </div>
              <div class="stack g8">
                <div
                  class="otp cp-otp"
                  role="group"
                  aria-label="One-time code"
                  [class.bad]="codeError()"
                  [class.shake]="shake()"
                >
                  @for (i of digitSlots; track i) {
                    <input
                      #digit
                      type="text"
                      inputmode="numeric"
                      maxlength="1"
                      [attr.autocomplete]="i === 0 ? 'one-time-code' : 'off'"
                      [attr.aria-label]="'Digit ' + (i + 1)"
                      [class.fill]="code()[i]"
                      [value]="code()[i] ?? ''"
                      (input)="typed(i, $event)"
                      (keydown)="key(i, $event)"
                      (paste)="pasted($event)"
                    />
                  }
                </div>
                <div
                  class="fld-e cp-otp-e"
                  role="alert"
                  [style.display]="codeError() ? 'flex' : null"
                >
                  <rp-icon name="alertc" [size]="14" /><span>{{ codeError() }}</span>
                </div>
              </div>
              <button
                type="button"
                class="btn btn-pri btn-lg btn-block"
                id="cp-au-verify"
                [class.is-busy]="busy()"
                (click)="verify()"
              >
                <span>Verify and sign in</span>
              </button>
              <div class="cp-resend">
                @if (resent()) {
                  <span class="t-sm t-muted"
                    ><rp-icon name="check" [size]="14" /> New code sent. You can resend once per
                    sign-in attempt.</span
                  >
                } @else {
                  <rp-countdown
                    [total]="challenge()?.resendAfterSeconds ?? 60"
                    [left]="resendLeft()"
                    [size]="44"
                    [stroke]="3"
                  />
                  <div class="grow">
                    <b class="t-sm" style="display: block">Didn't get it?</b>
                    <span class="t-xs t-muted">{{
                      resendLeft() > 0
                        ? 'You can resend in ' + resendLeft() + ' s'
                        : 'You can resend the code now'
                    }}</span>
                  </div>
                  <button
                    type="button"
                    class="btn btn-sec btn-sm"
                    [disabled]="resendLeft() > 0"
                    (click)="resend()"
                  >
                    <span>Resend code</span>
                  </button>
                }
              </div>
              @if (challenge()?.channel === 'EMAIL') {
                <span class="t-xs t-muted"
                  ><rp-icon name="mail" [size]="13" /> Sent by e-mail because you asked for the
                  fallback.</span
                >
              } @else if (challenge()?.emailFallback; as mail) {
                <button type="button" class="linkbtn cp-lk" (click)="byEmail()">
                  <rp-icon name="mail" [size]="14" /> Send the code to my e-mail ({{ mail }})
                  instead
                </button>
              }
              @if (challenge()?.testCode; as test) {
                <div class="demo-hint">
                  <rp-icon name="sparkles" [size]="14" /><span>Test code</span> <b>{{ test }}</b>
                </div>
              }
            }
            @case ('pick') {
              <!-- Someone at several institutions chooses one (client 2026-10-27). -->
              <div class="cp-af-h">
                <h1>Choose institution</h1>
                <p>
                  Your account belongs to more than one institution. Which one do you want to open?
                </p>
              </div>
              @if (flash(); as f) {
                <div class="note" [class]="'tone-' + f.tone" role="alert">
                  <rp-icon name="alert" [size]="17" />
                  <div class="grow">{{ f.text }}</div>
                </div>
              }
              <rp-inst-list
                [institutions]="institutions()"
                [busy]="opening()"
                (picked)="open($event)"
              />
              <span class="t-xs t-muted">You can switch later from the menu.</span>
            }
            @case ('reset') {
              <div class="cp-af-h">
                <h1>New password</h1>
                <p>You'll be signed out of other devices.</p>
              </div>
              @if (flash(); as f) {
                <div class="note" [class]="'tone-' + f.tone" role="alert">
                  <rp-icon name="alert" [size]="17" />
                  <div class="grow">{{ f.text }}</div>
                </div>
              }
              <form class="stack g16" novalidate (submit)="$event.preventDefault(); savePassword()">
                <input
                  type="email"
                  name="username"
                  autocomplete="username"
                  hidden
                  aria-hidden="true"
                  tabindex="-1"
                />
                <div class="fld" [class.invalid]="newPasswordError()">
                  <label class="fld-l" for="cp-rp-p1">New password<span class="req">*</span></label>
                  <div class="fld-in">
                    <input
                      id="cp-rp-p1"
                      name="new-password"
                      [type]="showPassword() ? 'text' : 'password'"
                      autocomplete="new-password"
                      aria-describedby="cp-rp-p1-h cp-rp-p1-e"
                      [value]="newPassword()"
                      (input)="newPassword.set(asValue($event)); newPasswordError.set('')"
                    />
                    <span class="suf plain">
                      <button
                        type="button"
                        class="cp-eye"
                        [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                        (click)="showPassword.set(!showPassword())"
                      >
                        <rp-icon [name]="showPassword() ? 'eyeoff' : 'eye'" [size]="16" />
                      </button>
                    </span>
                  </div>
                  <div class="fld-h" id="cp-rp-p1-h">{{ passwordHint() }}</div>
                  <div class="fld-e" id="cp-rp-p1-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ newPasswordError() }}</span>
                  </div>
                </div>
                <div class="fld" [class.invalid]="confirmError()">
                  <label class="fld-l" for="cp-rp-p2"
                    >Confirm new password<span class="req">*</span></label
                  >
                  <div class="fld-in">
                    <input
                      id="cp-rp-p2"
                      name="confirm-password"
                      [type]="showPassword() ? 'text' : 'password'"
                      autocomplete="new-password"
                      aria-describedby="cp-rp-p2-e"
                      [value]="confirmPassword()"
                      (input)="confirmPassword.set(asValue($event)); confirmError.set('')"
                    />
                  </div>
                  <div class="fld-e" id="cp-rp-p2-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ confirmError() }}</span>
                  </div>
                </div>
                <button
                  type="submit"
                  class="btn btn-pri btn-lg btn-block"
                  id="cp-rp-save"
                  [class.is-busy]="busy()"
                >
                  <span>Save new password</span>
                </button>
              </form>
            }
            @case ('reset-done') {
              <div class="cp-af-h cp-lock">
                <span class="confirm-ic"><rp-icon name="checkc" [size]="24" /></span>
                <h1>Password changed</h1>
                <p>Use your new password next time you sign in. Other devices were signed out.</p>
              </div>
              <button type="button" class="btn btn-pri btn-lg btn-block" (click)="toSignIn()">
                <span>Sign in</span><rp-icon name="arrowr" [size]="15" />
              </button>
            }
            @case ('reset-bad') {
              <div class="cp-af-h cp-lock">
                <span class="confirm-ic bad"><rp-icon name="alert" [size]="24" /></span>
                <h1>Reset password</h1>
                <p>{{ resetBadText() }}</p>
              </div>
              <button type="button" class="btn btn-sec btn-block" (click)="toSignIn()">
                <span>Back to sign-in</span>
              </button>
            }
            @case ('locked') {
              <div class="cp-af-h cp-lock">
                <span class="confirm-ic bad"><rp-icon name="lock" [size]="24" /></span>
                <h1>Account locked</h1>
                <p>{{ lockText() }}</p>
              </div>
              @if (lockTotal() > 0) {
                <div class="row g12 cp-lockrow">
                  <rp-countdown
                    [total]="lockTotal()"
                    [left]="lockLeft()"
                    [size]="64"
                    caption="left"
                  />
                  <div class="grow t-sm t-muted" style="line-height: 1.5">
                    Nothing else is affected: members can still pay and your data is unchanged. If
                    you didn't try to sign in, tell your platform administrator.
                  </div>
                </div>
              }
              <button type="button" class="btn btn-sec btn-block" (click)="other()">
                <span>Try a different account</span>
              </button>
            }
          }
        </div>
      </main>
    </div>
    <rp-overlays />
  `,
})
export class StaffSignin implements OnInit {
  private readonly sessions = inject(SessionContext);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);
  readonly surface = input.required<StaffSurface>();
  /** 'reset' opens the page of the e-mailed link (IDN-083). */
  readonly mode = input<'signin' | 'reset'>('signin');
  protected readonly isOps = computed(() => this.surface() === 'ops');
  /** The school last signed in on this browser (console only). */
  protected readonly school = signal(rememberedSchool());
  protected readonly digits = DIGITS;
  protected readonly digitSlots = Array.from({ length: DIGITS }, (_, i) => i);
  private readonly digitInputs = viewChildren<ElementRef<HTMLInputElement>>('digit');

  protected readonly step = signal<Step>('cred');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly emailError = signal('');
  protected readonly passwordError = signal('');
  protected readonly flash = signal<{ text: string; tone: 'bad' | 'warn' | 'ok' | 'info' } | null>(
    null,
  );
  protected readonly busy = signal(false);

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

  protected readonly challenge = signal<StaffChallenge | null>(null);
  protected readonly code = signal<string[]>([]);
  protected readonly codeError = signal('');
  protected readonly shake = signal(false);
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

  /** The person's institutions when there are several (client 2026-10-27); the session is at the first. */
  protected readonly institutions = signal<readonly InstitutionChoice[]>([]);
  /** The institution being opened. */
  protected readonly opening = signal<string | null>(null);

  protected readonly lockText = signal('');
  protected readonly lockTotal = signal(0);
  private readonly lockUntil = signal(0);
  protected readonly lockLeft = computed(() =>
    Math.max(0, Math.round((this.lockUntil() - this.now()) / 1000)),
  );

  constructor() {
    // Sent here because the session ended while the area was in use, with the server's reason
    // when it gave one (signed in on another device or browser).
    const state = this.router.currentNavigation()?.extras.state;
    if (state?.['sessionEnded']) {
      const reason = typeof state['reason'] === 'string' ? state['reason'] : '';
      this.flash.set({
        text: translate(reason.startsWith('AUTH.') ? reason : 'AUTH.UNAUTHENTICATED'),
        tone: 'warn',
      });
    }
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  ngOnInit() {
    if (this.mode() !== 'reset') return;
    // The token arrives in the fragment (never sent to a server log); drop it from the address bar.
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
    void this.sessions.passwordPolicy().then((p) => this.policy.set(p));
  }

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
      await this.sessions.resetPassword(this.resetToken, p1);
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
    this.step.set('cred');
    this.flash.set(null);
    void this.router.navigateByUrl(this.isOps() ? '/backoffice/signin' : '/console/signin');
  }

  protected asValue(e: Event) {
    return (e.target as HTMLInputElement).value;
  }

  /** Prototype cp.au.forgot: the link goes to the e-mail typed above (IDN-034 / IDN-082). */
  protected async forgot() {
    if (this.busy()) return;
    const email = this.email().trim().toLowerCase();
    this.emailError.set(
      !email
        ? translate('VALIDATION.REQUIRED')
        : PATTERNS.email.test(email)
          ? ''
          : translate('VALIDATION.EMAIL'),
    );
    if (this.emailError()) return;
    this.busy.set(true);
    this.flash.set(null);
    try {
      await this.sessions.forgotPassword(this.surface(), email);
      this.overlays.toast('Password reset link sent', {
        sub: `If ${email} has a ${this.isOps() ? 'back-office' : 'console'} account, a reset link is on its way.`,
        tone: 'ok',
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

  protected async signIn() {
    if (this.busy()) return;
    const email = this.email().trim().toLowerCase();
    this.emailError.set(
      !email
        ? translate('VALIDATION.REQUIRED')
        : PATTERNS.email.test(email)
          ? ''
          : translate('VALIDATION.EMAIL'),
    );
    this.passwordError.set(this.password() ? '' : translate('VALIDATION.REQUIRED'));
    if (this.emailError() || this.passwordError()) return;
    this.busy.set(true);
    this.flash.set(null);
    try {
      this.started(await this.sessions.signIn(this.surface(), email, this.password()));
      this.password.set('');
    } catch (e) {
      this.refused(e);
    } finally {
      this.busy.set(false);
    }
  }

  private started(c: StaffChallenge) {
    this.challenge.set(c);
    this.sentAt.set(Date.now());
    this.now.set(Date.now());
    this.code.set([]);
    this.codeError.set('');
    this.step.set('code');
    setTimeout(() => this.digitInputs()[0]?.nativeElement.focus(), 0);
  }

  private refused(e: unknown) {
    if (e instanceof ApiProblem && (e.status === 423 || e.status === 429)) {
      this.lockText.set(e.detail);
      const minutes = Number(e.params['minutes'] ?? 0);
      this.lockTotal.set(minutes * 60);
      this.lockUntil.set(Date.now() + minutes * 60_000);
      this.step.set('locked');
      return;
    }
    const text = e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
    this.flash.set({ text, tone: e instanceof ApiProblem && e.status === 401 ? 'bad' : 'warn' });
    this.step.set('cred');
  }

  protected typed(i: number, e: Event) {
    const el = e.target as HTMLInputElement;
    const digit = el.value.replace(/\D/g, '').slice(-1);
    el.value = digit;
    const next = [...this.code()];
    next[i] = digit;
    this.code.set(next);
    this.codeError.set('');
    if (digit) this.digitInputs()[i + 1]?.nativeElement.focus();
    if (this.code().filter(Boolean).length === DIGITS) void this.verify();
  }

  protected key(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !this.code()[i]) this.digitInputs()[i - 1]?.nativeElement.focus();
  }

  protected pasted(e: ClipboardEvent) {
    const digits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, DIGITS);
    if (!digits) return;
    e.preventDefault();
    this.code.set(digits.split(''));
    if (digits.length === DIGITS) void this.verify();
  }

  private codeFailed(text: string) {
    this.codeError.set(text);
    this.code.set([]);
    this.shake.set(false);
    setTimeout(() => this.shake.set(true), 0);
    setTimeout(() => this.digitInputs()[0]?.nativeElement.focus(), 0);
  }

  protected async verify() {
    const c = this.challenge();
    if (!c || this.busy()) return;
    const otp = this.code().join('');
    if (otp.length < DIGITS) {
      this.codeFailed(`Enter all ${DIGITS} digits of the code.`);
      return;
    }
    this.busy.set(true);
    try {
      const r = await this.sessions.verify(this.surface(), c.challengeId, otp);
      if (r.resetToken) {
        // A temporary password: choose one before the first session (OI-IDN-20).
        this.resetToken = r.resetToken;
        this.flash.set({
          text: 'Choose your own password to finish signing in. The temporary password stops working.',
          tone: 'info',
        });
        void this.sessions.passwordPolicy().then((p) => this.policy.set(p));
        this.step.set('reset');
        return;
      }
      // Several institutions: which one to open, before the console (client 2026-10-27).
      if (!this.isOps() && (r.institutions?.length ?? 0) > 1) {
        this.institutions.set(r.institutions!);
        this.flash.set(null);
        this.step.set('pick');
        return;
      }
      await this.router.navigateByUrl(this.isOps() ? '/backoffice' : '/console');
    } catch (e) {
      if (
        e instanceof ApiProblem &&
        e.code === 'AUTH.OTP_INVALID' &&
        e.params['triesLeft'] != null
      ) {
        const left = Number(e.params['triesLeft']);
        this.codeFailed(
          `${e.detail} ${left} ${left === 1 ? 'try' : 'tries'} left before this attempt ends.`,
        );
      } else if (e instanceof ApiProblem && (e.status === 423 || e.status === 429)) {
        this.refused(e);
      } else if (e instanceof ApiProblem && e.code === 'IDN.SIGNIN_ATTEMPT_ENDED') {
        this.flash.set({ text: e.detail, tone: 'warn' });
        this.step.set('cred');
      } else if (e instanceof ApiProblem) {
        this.codeFailed(e.detail);
      } else {
        this.codeFailed(translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Opens the institution chosen: the session starts at the first, so another one is moved to (the
   * tokens renewed for it) before the console opens.
   */
  protected async open(i: InstitutionChoice) {
    if (this.opening()) return;
    this.opening.set(i.id);
    this.flash.set(null);
    try {
      if (i.id !== this.institutions()[0]?.id) await this.sessions.chooseInstitution(i.id);
      await this.router.navigateByUrl('/console');
    } catch (e) {
      this.flash.set({
        text: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'warn',
      });
    } finally {
      this.opening.set(null);
    }
  }

  protected async resend() {
    const c = this.challenge();
    if (!c) return;
    try {
      const next = await this.sessions.resend(this.surface(), c.challengeId);
      this.challenge.set({ ...next, emailFallback: next.emailFallback ?? c.emailFallback });
      this.resent.set(true);
    } catch (e) {
      this.codeFailed(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected async byEmail() {
    const c = this.challenge();
    if (!c) return;
    try {
      this.started(await this.sessions.resend(this.surface(), c.challengeId, 'EMAIL'));
    } catch (e) {
      this.codeFailed(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected back() {
    this.flash.set(null);
    this.resent.set(false);
    this.step.set('cred');
  }

  protected other() {
    this.email.set('');
    this.password.set('');
    this.back();
  }

  protected fillDemo(who: 'admin' | 'accounts') {
    if (who === 'admin') {
      this.email.set('prakash.shetty@tvps.example.in');
      this.password.set('Tvps@2026');
    }
    this.emailError.set('');
    this.passwordError.set('');
  }

  protected fillOtp(otp: string) {
    const cleaned = otp.trim().slice(0, DIGITS);
    const chars = cleaned.split('');
    while (chars.length < DIGITS) chars.push('');
    this.code.set(chars);
    this.codeError.set('');
    if (cleaned.length === DIGITS) {
      setTimeout(() => void this.verify(), 80);
    }
  }
}
