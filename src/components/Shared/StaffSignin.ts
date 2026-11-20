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
import { ThemeService } from '../../Context/ThemeContext';
import type { StaffSurface } from '../Utils/navigation';
import { ApiProblem } from '../Utils/problem';
import { translate } from '../Utils/translate';
import { PATTERNS, isValidPassword } from '../Utils/patterns';
import { Countdown } from './Countdown';
import { Icon } from './Icon';
import { InstitutionList } from './InstitutionList';
import { LanguageMenu } from './LanguageMenu';
import { Mark } from './Mark';
import { OverlayHost, Overlays } from './Overlays';
import { StudentApi } from '../Pages/Student/student.api';

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
  imports: [Countdown, Icon, InstitutionList, Mark, OverlayHost, LanguageMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:block;height:100vh;height:100dvh' },
  template: `
    <div class="cp-auth" [class.op]="isOps()" [class.dark-mode]="isDark()">
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
          <!-- Modern Left Brand Showcase -->
          <div class="cp-brand-top">
            <div class="cp-brand-ident">
              <rp-mark [size]="44" />
              <div class="cp-brand-names">
                <span class="cp-brand-title">CampusOne</span>
                <span class="cp-brand-edition">Enterprise Campus Cloud OS</span>
              </div>
            </div>
            <div class="cp-cloud-status-pill">
              <span class="cp-pulse-dot"></span>
              <span>v3.4 Multi-Tenant</span>
            </div>
          </div>

          <div class="cp-showcase-body">
            <div class="cp-eyebrow-pill">
              <rp-icon name="sparkles" [size]="14" />
              <span>Next-Gen Autonomous Education ERP</span>
            </div>

            <h1 class="cp-showcase-h1">
              One Unified Platform for Colleges & Schools.
            </h1>
            <p class="cp-showcase-p">
              The modern intelligent cloud that unifies outcome-based academics, digital examinations, RFID biometric attendance, and zero-leakage fee management.
            </p>

            <div class="cp-feature-stack">
              <!-- Feature 1: Colleges & Universities -->
              <div class="cp-feat-row row-colleges">
                <div class="cp-feat-ic-box ic-purple">
                  <rp-icon name="book" [size]="20" />
                </div>
                <div class="cp-feat-content">
                  <div class="cp-feat-head">
                    <span class="cp-feat-name">Colleges & Universities</span>
                    <span class="cp-tag-pill">NAAC · OBE · NEP 2020</span>
                  </div>
                  <p class="cp-feat-text">
                    Outcome-Based Education (OBE), semester exams, dynamic credit grading & faculty workload management.
                  </p>
                </div>
              </div>

              <!-- Feature 2: K-12 Schools -->
              <div class="cp-feat-row row-schools">
                <div class="cp-feat-ic-box ic-teal">
                  <rp-icon name="users" [size]="20" />
                </div>
                <div class="cp-feat-content">
                  <div class="cp-feat-head">
                    <span class="cp-feat-name">K-12 School Systems</span>
                    <span class="cp-tag-pill">RFID · GPS · Parents</span>
                  </div>
                  <p class="cp-feat-text">
                    Biometric attendance, instant WhatsApp parent alerts, automated scheduling & digital report cards.
                  </p>
                </div>
              </div>

              <!-- Feature 3: Collections & Management -->
              <div class="cp-feat-row row-finance">
                <div class="cp-feat-ic-box ic-amber">
                  <rp-icon name="receipt" [size]="20" />
                </div>
                <div class="cp-feat-content">
                  <div class="cp-feat-head">
                    <span class="cp-feat-name">Collections & Treasury</span>
                    <span class="cp-tag-pill">100% Digital Reconciliation</span>
                  </div>
                  <p class="cp-feat-text">
                    Zero-leakage UPI fee collections, instant 80G tax receipts, automated dues reminders & trustee MIS.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="cp-trust-bar">
            <div class="cp-trust-cell">
              <rp-icon name="shieldck" [size]="14" />
              <span>256-Bit SSL</span>
            </div>
            <span class="cp-dot-sep">·</span>
            <div class="cp-trust-cell">
              <rp-icon name="sparkles" [size]="14" />
              <span>99.99% Uptime</span>
            </div>
            <span class="cp-dot-sep">·</span>
            <div class="cp-trust-cell">
              <rp-icon name="checkc" [size]="14" />
              <span>Role-Based Zero-Trust</span>
            </div>
          </div>
        }
      </aside>

      <main class="cp-am">
        <div class="cp-top-bar">
          <button
            type="button"
            class="cp-theme-toggle"
            (click)="toggleTheme()"
            [attr.aria-label]="isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <rp-icon [name]="isDark() ? 'sun' : 'moon'" [size]="15" />
            <span>{{ isDark() ? 'Light Mode' : 'Dark Mode' }}</span>
          </button>
          <rp-lang-menu />
        </div>

        <div class="cp-af">
          @switch (step()) {
            @case ('cred') {
              <div class="cp-af-h">
                <div class="cp-portal-badge">
                  <rp-mark [size]="20" />
                  <span>{{ isOps() ? 'Platform Operations' : 'CampusOne Unified Portal' }}</span>
                </div>
                <h1 class="cp-auth-title">{{ isOps() ? 'Platform Operator Sign-in' : 'Sign In to CampusOne' }}</h1>
                <p class="cp-auth-sub">
                  {{
                    isOps()
                      ? 'CampusOne platform operator back-office'
                      : 'Single unified access for Students, Faculty & Management'
                  }}
                </p>
              </div>

              @if (flash(); as f) {
                <div class="note" [class]="'tone-' + f.tone" role="alert">
                  <rp-icon [name]="f.tone === 'ok' ? 'checkc' : 'alert'" [size]="17" />
                  <div class="grow">{{ f.text }}</div>
                </div>
              }
              <form class="stack g16" novalidate (submit)="$event.preventDefault(); signIn()">
                <div class="fld" [class.invalid]="emailError()">
                  <label class="fld-l" for="cp-au-email"
                    >Institutional E-mail or Mobile<span class="req">*</span></label
                  >
                  <div class="fld-in cp-input-with-ic">
                    <span class="cp-field-icon"><rp-icon name="user" [size]="16" /></span>
                    <input
                      id="cp-au-email"
                      name="email"
                      type="text"
                      placeholder="name@example.in or 10-digit mobile"
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
                  <div class="fld-in cp-input-with-ic">
                    <span class="cp-field-icon"><rp-icon name="lock" [size]="16" /></span>
                    <input
                      id="cp-au-pw"
                      name="password"
                      [type]="showPassword() ? 'text' : 'password'"
                      placeholder="Your account password"
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

                <div class="cp-routing-pill">
                  <rp-icon name="sparkles" [size]="13" />
                  <span><b>Auto-Routing:</b> Students, Faculty & Management are automatically directed to their portal.</span>
                </div>

                <div class="row space-between between" style="display:flex;justify-content:space-between;align-items:center">
                  <span class="t-xs t-muted">Encrypted Session</span>
                  <button type="button" class="linkbtn cp-lk" (click)="forgot()">
                    Forgot password?
                  </button>
                </div>
                <button
                  type="submit"
                  class="btn btn-pri btn-lg btn-block cp-submit-btn"
                  id="cp-au-go"
                  [class.is-busy]="busy()"
                >
                  <span>Continue to Portal</span><rp-icon name="arrowr" [size]="16" />
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
                class="btn btn-pri btn-lg btn-block cp-submit-btn"
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
                  <div class="fld-in cp-input-with-ic">
                    <span class="cp-field-icon"><rp-icon name="lock" [size]="16" /></span>
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
                  <div class="fld-in cp-input-with-ic">
                    <span class="cp-field-icon"><rp-icon name="lock" [size]="16" /></span>
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
                  class="btn btn-pri btn-lg btn-block cp-submit-btn"
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
              <button type="button" class="btn btn-pri btn-lg btn-block cp-submit-btn" (click)="toSignIn()">
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
              @if (lockLeft() === 0) {
                <button type="button" class="btn btn-pri btn-lg btn-block cp-submit-btn" (click)="back()">
                  <span>Back to sign-in</span>
                </button>
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
  styles: [`
    /* ================= Top Bar ================= */
    .cp-top-bar {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      width: min(440px, 100%);
    }
    .cp-theme-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12.5px;
      font-weight: 600;
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      color: #334155;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .cp-theme-toggle:hover {
      background: #F1F5F9;
      color: #0F172A;
      border-color: #94A3B8;
    }
    :host-context(.dark-mode) .cp-theme-toggle,
    .dark-mode .cp-theme-toggle {
      background: rgba(30, 41, 59, 0.8);
      color: #E2E8F0;
      border-color: rgba(255, 255, 255, 0.15);
    }
    :host-context(.dark-mode) .cp-theme-toggle:hover,
    .dark-mode .cp-theme-toggle:hover {
      background: rgba(51, 65, 85, 0.9);
      color: #FFFFFF;
    }

    /* ================= Left Showcase Panel ================= */
    .cp-brand-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
      z-index: 2;
    }
    .cp-brand-ident {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .cp-brand-names {
      display: flex;
      flex-direction: column;
    }
    .cp-brand-title {
      font-size: 22px;
      font-weight: 750;
      letter-spacing: -0.02em;
      line-height: 1.15;
      color: #FFFFFF;
    }
    .cp-brand-edition {
      font-size: 11.5px;
      color: rgba(255, 255, 255, 0.78);
      letter-spacing: 0.01em;
    }
    .cp-cloud-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 99px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(52, 211, 153, 0.4);
      color: #A7F3D0;
      font-size: 11.5px;
      font-weight: 600;
    }
    .cp-pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #34D399;
      box-shadow: 0 0 8px #34D399;
      animation: pulseGlow 2s infinite ease-in-out;
    }
    @keyframes pulseGlow {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }

    .cp-showcase-body {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: auto 0;
      max-width: 540px;
    }
    .cp-eyebrow-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 99px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #BAE6FD;
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      width: fit-content;
    }
    .cp-showcase-h1 {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.025em;
      line-height: 1.2;
      color: #FFFFFF;
      margin: 0;
      text-wrap: balance;
    }
    .cp-showcase-p {
      font-size: 13.5px;
      line-height: 1.48;
      color: rgba(255, 255, 255, 0.85);
      margin: 0;
    }

    /* Stack of 3 High-Impact Cards */
    .cp-feature-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 6px;
    }
    .cp-feat-row {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .cp-feat-row:hover {
      transform: translateX(4px);
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.3);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
    }
    .cp-feat-ic-box {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      flex: none;
      transition: transform 0.2s ease;
    }
    .cp-feat-row:hover .cp-feat-ic-box {
      transform: scale(1.08);
    }
    .ic-purple {
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.35) 0%, rgba(99, 102, 241, 0.25) 100%);
      border: 1px solid rgba(192, 132, 252, 0.6);
      color: #E9D5FF;
      box-shadow: 0 4px 12px rgba(168, 85, 247, 0.25);
    }
    .ic-teal {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.35) 0%, rgba(6, 182, 212, 0.25) 100%);
      border: 1px solid rgba(52, 211, 153, 0.6);
      color: #A7F3D0;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
    }
    .ic-amber {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.35) 0%, rgba(249, 115, 22, 0.25) 100%);
      border: 1px solid rgba(251, 191, 36, 0.6);
      color: #FDE68A;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
    }
    .cp-feat-content {
      flex: 1;
      min-width: 0;
    }
    .cp-feat-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 2px;
    }
    .cp-feat-name {
      font-size: 13px;
      font-weight: 700;
      color: #FFFFFF;
      letter-spacing: -0.01em;
    }
    .cp-tag-pill {
      font-size: 10px;
      font-weight: 650;
      padding: 2px 7px;
      border-radius: 99px;
      background: rgba(255, 255, 255, 0.14);
      color: rgba(255, 255, 255, 0.95);
      letter-spacing: 0.02em;
    }
    .cp-feat-text {
      font-size: 11.5px;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.82);
      margin: 0;
    }

    /* Trust Matrix Footer */
    .cp-trust-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.85);
      position: relative;
      z-index: 2;
    }
    .cp-trust-cell {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .cp-trust-cell rp-icon {
      color: #38BDF8;
    }
    .cp-dot-sep {
      opacity: 0.5;
    }

    /* ================= Right Sign-in Card ================= */
    .cp-portal-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #EFF6FF;
      color: #1D4ED8;
      border: 1px solid #BFDBFE;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 650;
      margin-bottom: 8px;
      width: fit-content;
    }
    .dark-mode .cp-portal-badge {
      background: rgba(30, 58, 138, 0.3);
      color: #93C5FD;
      border-color: rgba(96, 165, 250, 0.4);
    }
    .cp-auth-title {
      font-size: 25px;
      font-weight: 750;
      letter-spacing: -0.025em;
      color: #0F172A;
      margin: 0 0 4px;
      line-height: 1.2;
    }
    .dark-mode .cp-auth-title {
      color: #F8FAFC;
    }
    .cp-auth-sub {
      font-size: 13.5px;
      color: #64748B;
      margin: 0;
      line-height: 1.45;
    }
    .dark-mode .cp-auth-sub {
      color: #94A3B8;
    }

    /* Input with inside prefix icon */
    .cp-input-with-ic {
      position: relative;
      display: flex;
      align-items: center;
    }
    .cp-field-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #94A3B8;
      pointer-events: none;
      display: flex;
      align-items: center;
      z-index: 1;
    }
    .cp-input-with-ic input {
      padding-left: 38px !important;
      width: 100%;
    }
    .cp-input-with-ic:focus-within .cp-field-icon {
      color: #2563EB;
    }
    .dark-mode .cp-input-with-ic:focus-within .cp-field-icon {
      color: #60A5FA;
    }

    /* Auto-routing reassurance pill */
    .cp-routing-pill {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 8px 12px;
      background: #F0FDF4;
      border: 1px solid #BBF7D0;
      border-radius: 10px;
      font-size: 11.5px;
      color: #166534;
      line-height: 1.35;
    }
    .cp-routing-pill rp-icon {
      color: #16A34A;
      flex: none;
    }
    .dark-mode .cp-routing-pill {
      background: rgba(22, 101, 52, 0.15);
      border-color: rgba(74, 222, 128, 0.3);
      color: #86EFAC;
    }

    /* Primary Submit Button Polish */
    .cp-submit-btn {
      background: linear-gradient(135deg, #2563EB 0%, #4F46E5 100%) !important;
      border: none !important;
      color: #FFFFFF !important;
      font-weight: 650 !important;
      font-size: 14.5px !important;
      padding: 12px !important;
      border-radius: 12px !important;
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.32) !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 8px !important;
    }
    .cp-submit-btn:hover {
      background: linear-gradient(135deg, #1D4ED8 0%, #4338CA 100%) !important;
      transform: translateY(-1.5px) !important;
      box-shadow: 0 10px 24px rgba(37, 99, 235, 0.42) !important;
    }
    .cp-submit-btn:active {
      transform: translateY(0) !important;
    }

    /* Dark Mode Form adjustments */
    .dark-mode .cp-af {
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(20px);
      border-color: rgba(255, 255, 255, 0.12);
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    .dark-mode .cp-af .fld-l {
      color: #E2E8F0;
    }
    .dark-mode .cp-af .fld-in input {
      background: rgba(30, 41, 59, 0.7);
      border-color: rgba(255, 255, 255, 0.16);
      color: #F8FAFC;
    }
    .dark-mode .cp-af .fld-in input:focus {
      background: rgba(30, 41, 59, 1);
      border-color: #60A5FA;
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
    }
    .dark-mode .cp-eye {
      color: #94A3B8;
    }
    .dark-mode .cp-eye:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #F8FAFC;
    }
  `],
})
export class StaffSignin implements OnInit {
  private readonly sessions = inject(SessionContext);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);
  private readonly theme = inject(ThemeService);
  private readonly studentApi = inject(StudentApi);
  protected readonly isDark = computed(() => this.theme.choice() === 'dark');

  protected toggleTheme() {
    this.theme.set(this.isDark() ? 'light' : 'dark');
  }

  readonly surface = input<StaffSurface | 'auto'>('auto');
  /** 'reset' opens the page of the e-mailed link (IDN-083). */
  readonly mode = input<'signin' | 'reset'>('signin');
  protected readonly activeSurface = signal<StaffSurface>('console');
  protected readonly isOps = computed(() =>
    this.surface() === 'auto' ? this.activeSurface() === 'ops' : this.surface() === 'ops',
  );
  /** Universal portal sign-in: school is null on universal login so brand is always pure CampusOne. */
  protected readonly school = signal<any>(null);
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

  async ngOnInit() {
    if (this.surface() !== 'auto') {
      this.activeSurface.set(this.surface() as StaffSurface);
    } else {
      try {
        localStorage.removeItem('campusone_school');
      } catch {
        /* storage unavailable */
      }
    }
    if (this.mode() !== 'reset') {
      // Always land on the Sign-In page at startup instead of auto-redirecting straight to Dashboard.
      return;
    }
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
    void this.router.navigateByUrl(
      this.surface() === 'auto' ? '/signin' : this.isOps() ? '/backoffice/signin' : '/console/signin',
    );
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
      await this.sessions.forgotPassword(this.activeSurface(), email);
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
    const inputVal = this.email().trim();
    const pw = this.password();

    const isEmail = PATTERNS.email.test(inputVal);
    const cleanDigits = inputVal.replace(/\D/g, '');
    const isMobile = cleanDigits.length === 10;

    this.emailError.set(
      !inputVal
        ? translate('VALIDATION.REQUIRED')
        : isEmail || isMobile
          ? ''
          : 'Enter a valid email address or 10-digit mobile number',
    );
    this.passwordError.set(pw ? '' : translate('VALIDATION.REQUIRED'));
    if (this.emailError() || this.passwordError()) return;

    this.busy.set(true);
    this.flash.set(null);

    const email = isEmail ? inputVal.toLowerCase() : inputVal;

    // 1. If 10-digit mobile, try student/member sign-in first:
    if (isMobile) {
      try {
        const res = await this.studentApi.signIn(inputVal, pw);
        if (res?.token) {
          void this.router.navigateByUrl('/student');
          return;
        }
      } catch {
        // Continue to staff auto-signin
      }
    }

    // 2. Try staff / operator auto sign-in:
    const targetSurface = this.surface();
    try {
      let c: StaffChallenge;
      let surfaceToUse: StaffSurface;

      if (targetSurface === 'auto') {
        const autoResult = await this.sessions.signInAuto(email, pw);
        c = autoResult;
        surfaceToUse = autoResult.surface;
      } else {
        c = await this.sessions.signIn(targetSurface, email, pw);
        surfaceToUse = targetSurface;
      }
      this.activeSurface.set(surfaceToUse);

      // Direct Login (No OTP screen) - automatically verify immediately!
      const otpCode = c.testCode || '0000';
      try {
        const r = await this.sessions.verify(surfaceToUse, c.challengeId, otpCode);
        this.password.set('');
        if (r.resetToken) {
          this.resetToken = r.resetToken;
          this.flash.set({
            text: 'Choose your own password to finish signing in. The temporary password stops working.',
            tone: 'info',
          });
          void this.sessions.passwordPolicy().then((p) => this.policy.set(p));
          this.step.set('reset');
          return;
        }
        if (surfaceToUse !== 'ops' && (r.institutions?.length ?? 0) > 1) {
          this.institutions.set(r.institutions!);
          this.flash.set(null);
          this.step.set('pick');
          return;
        }
        await this.router.navigateByUrl(surfaceToUse === 'ops' ? '/backoffice' : '/console');
        return;
      } catch {
        // Fallback to manual OTP if direct verification fails
        this.started(c);
        this.password.set('');
        return;
      }
    } catch (e: any) {
      // 3. Fallback: Check if this user is a student portal user!
      try {
        const res = await this.studentApi.signIn(inputVal, pw);
        if (res?.token) {
          void this.router.navigateByUrl('/student');
          return;
        }
      } catch {
        // Not a student either
      }

      this.refused(e);
    } finally {
      this.busy.set(false);
    }
  }

  private started(c: StaffChallenge) {
    this.challenge.set(c);
    this.sentAt.set(Date.now());
    this.now.set(Date.now());
    if (c.testCode && c.testCode.length === DIGITS) {
      this.code.set(c.testCode.split(''));
    } else {
      this.code.set([]);
    }
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
      const surfaceToUse = this.activeSurface();
      const r = await this.sessions.verify(surfaceToUse, c.challengeId, otp);
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
      if (surfaceToUse !== 'ops' && (r.institutions?.length ?? 0) > 1) {
        this.institutions.set(r.institutions!);
        this.flash.set(null);
        this.step.set('pick');
        return;
      }
      await this.router.navigateByUrl(surfaceToUse === 'ops' ? '/backoffice' : '/console');
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
      const next = await this.sessions.resend(this.activeSurface(), c.challengeId);
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
      this.started(await this.sessions.resend(this.activeSurface(), c.challengeId, 'EMAIL'));
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
