import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PortalContext } from '../../../../Context/PortalContext';
import { Avatar } from '../../../Shared/Avatar';
import { Countdown } from '../../../Shared/Countdown';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { OverlayHost, Overlays } from '../../../Shared/Overlays';
import { formatMobile } from '../../../Utils/format';
import { PATTERNS } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PortalFlow } from '../Layout/PortalFlow';
import {
  PortalApi,
  type PortalPlan,
  type PortalPlans,
  type SignupChallenge,
  type SignupInput,
  type SignupVerified,
} from '../portal.api';
import {
  BOARDS,
  CodeBoxes,
  Field,
  MODULES,
  ProcessOverlay,
  type ProcessState,
  Rocket,
  Terms,
  annual,
  choiceKeys,
  feeText,
  planLine,
  runProcess,
} from '../Shared/PortalUi';

const STEPS = [
  ['Your CampusOne account', "Verify the administrator's account"],
  ['Your institution', 'Name, address and contacts'],
  ['Plan', 'Choose a plan and how to start'],
  ['Review and agree', 'Check everything and create'],
] as const;

interface Form {
  name: string;
  address: string;
  city: string;
  pin: string;
  board: string;
  students: string;
  pn: string;
  pe: string;
  pp: string;
  sn: string;
  se: string;
  sp: string;
}
const EMPTY: Form = {
  name: '',
  address: '',
  city: '',
  pin: '',
  board: 'CBSE',
  students: '',
  pn: '',
  pe: '',
  pp: '',
  sn: '',
  se: '',
  sp: '',
};

/** Server field paths of SAS-004 → the form's fields. */
const FIELD: Readonly<Record<string, keyof Form>> = {
  'institution.name': 'name',
  'institution.address': 'address',
  'institution.city': 'city',
  'institution.pinCode': 'pin',
  'institution.board': 'board',
  'institution.students': 'students',
  'primaryContact.name': 'pn',
  'primaryContact.email': 'pe',
  'primaryContact.mobile': 'pp',
  'secondaryContact.name': 'sn',
  'secondaryContact.email': 'se',
  'secondaryContact.mobile': 'sp',
};

const PERSON = /^[A-Za-z][A-Za-z .'-]*$/;
const INSTITUTION_NAME = /^[A-Za-z0-9 .,'&()-]+$/;

/**
 * s.signup — "Start your free trial" (FR-INS-01/02, FR-SAS-06, UC 4.10, BR-01; SAS-002…004;
 * prototype s.signup): the administrator's own CampusOne account verified by a code to its mobile,
 * the institution and its contacts, the plan and how to start, then review, the three agreements
 * and "Create my institution". The account must not belong to an institution yet; the page is
 * public, so a refusal never names the other institution.
 */
/** SAS-051: the administrator's new CampusOne account. */
interface NewAccount {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly password: string;
}
const NO_ACCOUNT: NewAccount = { firstName: '', lastName: '', email: '', password: '' };

@Component({
  selector: 'rp-portal-signup',
  imports: [
    Avatar,
    CodeBoxes,
    Countdown,
    Dropdown,
    Field,
    Icon,
    OverlayHost,
    PortalFlow,
    ProcessOverlay,
    Rocket,
    Terms,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block; height: 100%' },
  template: `
    <rp-sp-flow>
      <ng-container flow-side>
        <div class="fs-hide">
          <h2>Set up CampusOne for your institution</h2>
          <p class="mt8">
            Four short steps. Nothing is charged today — you choose how to start on step 3.
          </p>
        </div>
        <div class="sp-rail">
          @for (s of steps; track $index; let k = $index) {
            <div class="r" [class.d]="k < step()" [class.on]="k === step()">
              <span class="n">
                @if (k < step()) {
                  <rp-icon name="check" [size]="14" [stroke]="3" />
                } @else {
                  {{ k + 1 }}
                }
              </span>
              <span
                ><b>{{ s[0] }}</b
                ><small>{{ s[1] }}</small></span
              >
            </div>
          }
        </div>
        @if (account() || savedName()) {
          <div class="sp-sum">
            @if (account(); as a) {
              <span class="k">Administrator</span><b>{{ a.name }}</b>
            }
            @if (savedName()) {
              <span class="k" style="margin-top: 6px">Institution</span><b>{{ savedName() }}</b
              ><span style="color: rgba(255, 255, 255, 0.7)">{{ form().city }}</span>
            }
            @if (step() >= 3 && chosen(); as p) {
              <span class="k" style="margin-top: 6px">Plan</span
              ><b
                >{{ p.name }} ·
                {{ start() === 'PAY' ? 'pay when live' : p.trialDays + '-day trial' }}</b
              >
            }
          </div>
        }
      </ng-container>
      <ng-container flow-top>
        <span>Already a customer?</span>
        <button type="button" class="btn btn-sec btn-sm" (click)="go('/portal/signin')">
          <span>Sign in</span>
        </button>
      </ng-container>

      <div>
        <span
          class="t-xs t-muted"
          style="font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase"
          >Step {{ step() + 1 }} of 4</span
        >
        <h1 style="margin-top: 4px">{{ heading() }}</h1>
        <p class="sub">
          @switch (step()) {
            @case (0) {
              @if (joined()) {
                Your e-mail is confirmed and the institution CampusOne registered for you is linked to
                your account.
              } @else if (verified()?.invited) {
                CampusOne has registered an institution for this e-mail address. Confirm the e-mail to
                become its administrator.
              } @else if (verified()) {
                This account will be the institution's first administrator. Its existing roles are
                kept; the administrator role is added.
              } @else if (newToken()) {
                Your mobile number is confirmed. Create your CampusOne account — the same account works
                in the CampusOne app.
              } @else if (challenge(); as c) {
                We sent a 4-digit code by SMS to <b>{{ c.sentTo }}</b
                >.
                <button type="button" class="linkbtn" (click)="changeNumber()">
                  Change number
                </button>
              } @else {
                The administrator's mobile number. If it has a CampusOne account (the one used in the
                CampusOne app) we use it, even when it already belongs to another institution; if not,
                you create the account here.
              }
            }
            @case (1) {
              Name and address together must be unique on CampusOne — they also form part of your
              institution's identifier.
            }
            @case (2) {
              With about <b>{{ num(students()) }}</b> students, expect roughly
              <b>{{ num(estimate()) }}</b> active members — students, a parent each and staff. We
              suggest <b>{{ suggested()?.name }}</b
              >.
            }
            @default {
              Check the details below. You can change contacts and the plan later from your account.
            }
          }
        </p>
      </div>
      <div class="steps">
        @for (s of steps; track $index; let k = $index) {
          <span class="st" [class.done]="k < step()" [class.on]="k === step()"></span>
        }
      </div>

      @switch (step()) {
        @case (0) {
          @if (joined(); as j) {
            <div class="note tone-ok">
              <rp-icon name="checkc" [size]="17" />
              <div class="grow">
                <span
                  >You are now the administrator of {{ j.institution }}. Sign in with your e-mail
                  and password to finish setting it up.</span
                >
                <small class="t-xs t-muted" style="display: block; margin-top: 4px"
                  >Organization ID
                  <span class="t-mono" translate="no">{{ j.identifier }}</span></small
                >
              </div>
            </div>
            <div class="sp-fnav">
              <span class="grow"></span>
              <button type="button" class="btn btn-pri btn-lg" (click)="go('/portal/signin')">
                <span>Sign in</span><rp-icon name="arrowr" [size]="15" />
              </button>
            </div>
          } @else if (account(); as a) {
            <div class="sp-acct">
              <rp-av [name]="a.name" size="lg" />
              <div>
                <b>{{ a.name }}</b>
                <small>{{ a.email ?? 'No e-mail on the account' }} · {{ a.mobile }}</small>
                <small>Not linked to any institution</small>
              </div>
              <span style="color: var(--ok); margin-left: auto; display: flex"
                ><rp-icon name="checkc" [size]="22"
              /></span>
            </div>
            @if (verified()?.invited) {
              <div class="stack g12">
                <div class="note tone-info">
                  <rp-icon name="info" [size]="17" />
                  <div class="grow">
                    CampusOne has registered an institution with {{ a.email }} as its administrator.
                    Confirm this e-mail and the institution is linked to your account — you don't
                    need to sign up a new one.
                  </div>
                </div>
                @if (mailChallenge(); as mc) {
                  <rp-sp-otp
                    [digits]="4"
                    [error]="mailError()"
                    (typing)="mailError.set('')"
                    (entered)="confirmMail($event)"
                  />
                  <p class="t-xs t-muted">We sent a 4-digit code to {{ mc.sentTo }}.</p>
                  @if (mc.testCode; as test) {
                    <div class="demo-hint">
                      <rp-icon name="sparkles" [size]="14" /><span>Test code</span>
                      <b>{{ test }}</b>
                    </div>
                  }
                } @else {
                  @if (mailError()) {
                    <div class="note tone-bad">
                      <rp-icon name="alertc" [size]="17" />
                      <div class="grow">{{ mailError() }}</div>
                    </div>
                  }
                  <div>
                    <button
                      type="button"
                      class="btn btn-pri"
                      id="sp-su-mail"
                      [class.is-busy]="busy()"
                      (click)="sendMail()"
                    >
                      <rp-icon name="mail" [size]="15" /><span>Send a code to my e-mail</span>
                    </button>
                  </div>
                }
              </div>
            }
            <div class="sp-fnav">
              <button type="button" class="btn btn-ghost" (click)="changeNumber()">
                <span>Use a different account</span>
              </button>
              <span class="grow"></span>
              @if (verified()?.invited) {
                <button type="button" class="btn btn-sec btn-lg" (click)="next()">
                  <span>Sign up a different institution</span><rp-icon name="arrowr" [size]="15" />
                </button>
              } @else {
                <button type="button" class="btn btn-pri btn-lg" (click)="next()">
                  <span>Continue</span><rp-icon name="arrowr" [size]="15" />
                </button>
              }
            </div>
          } @else if (newToken()) {
            <form class="c-form" novalidate (submit)="$event.preventDefault(); createAccount()">
              <rp-sp-fld
                fid="sp-su-fn"
                label="First name"
                [req]="true"
                [error]="newErr('firstName')"
              >
                <input
                  id="sp-su-fn"
                  maxlength="60"
                  autocomplete="given-name"
                  aria-describedby="sp-su-fn-e"
                  [value]="newAcct().firstName"
                  (input)="setNew('firstName', $event)"
                />
              </rp-sp-fld>
              <rp-sp-fld fid="sp-su-ln" label="Last name" [error]="newErr('lastName')">
                <input
                  id="sp-su-ln"
                  maxlength="60"
                  autocomplete="family-name"
                  aria-describedby="sp-su-ln-e"
                  [value]="newAcct().lastName"
                  (input)="setNew('lastName', $event)"
                />
              </rp-sp-fld>
              <rp-sp-fld
                fid="sp-su-em"
                label="E-mail"
                [req]="true"
                [full]="true"
                [error]="newErr('email')"
                hint="If CampusOne registered your institution, use the e-mail it was registered with"
              >
                <input
                  id="sp-su-em"
                  type="email"
                  maxlength="254"
                  autocomplete="email"
                  aria-describedby="sp-su-em-e"
                  [value]="newAcct().email"
                  (input)="setNew('email', $event)"
                />
              </rp-sp-fld>
              <rp-sp-fld
                fid="sp-su-pw"
                label="Password"
                [req]="true"
                [full]="true"
                [error]="newErr('password')"
                hint="You sign in to CampusOne on the web and in the app with this password"
              >
                <input
                  id="sp-su-pw"
                  type="password"
                  maxlength="128"
                  autocomplete="new-password"
                  aria-describedby="sp-su-pw-e"
                  [value]="newAcct().password"
                  (input)="setNew('password', $event)"
                />
              </rp-sp-fld>
            </form>
            <div class="sp-fnav">
              <button type="button" class="btn btn-ghost" (click)="changeNumber()">
                <rp-icon name="arrowl" [size]="17" /><span>Back</span>
              </button>
              <span class="grow"></span>
              <button
                type="button"
                class="btn btn-pri btn-lg"
                id="sp-su-acct"
                [class.is-busy]="busy()"
                (click)="createAccount()"
              >
                <span>Create my account</span><rp-icon name="arrowr" [size]="15" />
              </button>
            </div>
          } @else if (challenge(); as c) {
            <div class="stack g12">
              <rp-sp-otp
                [digits]="4"
                [error]="codeError()"
                (typing)="codeError.set('')"
                (entered)="verify($event)"
              />
              <div class="row g8 t-sm t-muted">
                @if (resendLeft() > 0) {
                  <rp-countdown
                    [total]="c.resendAfterSeconds || 30"
                    [left]="resendLeft()"
                    [size]="36"
                    [stroke]="3"
                  />
                  <span>You can ask for a new code in {{ resendLeft() }} s</span>
                } @else {
                  <span>Didn't get it?</span>
                  <button type="button" class="linkbtn" (click)="resend()">Send a new code</button>
                }
              </div>
              @if (c.testCode; as test) {
                <div class="demo-hint">
                  <rp-icon name="sparkles" [size]="14" /><span>Test code</span> <b>{{ test }}</b>
                </div>
              }
              <p class="t-xs t-muted">
                The code is valid for {{ validMinutes() }} minutes. A new code isn't sent while the
                current one is still valid.
              </p>
            </div>
            <div class="sp-fnav">
              <button type="button" class="btn btn-ghost" (click)="changeNumber()">
                <rp-icon name="arrowl" [size]="17" /><span>Back</span>
              </button>
              <span class="grow"></span>
              <button
                type="button"
                class="btn btn-pri btn-lg"
                id="sp-su-vb"
                [class.is-busy]="busy()"
                (click)="verify()"
              >
                <span>Verify</span>
              </button>
            </div>
          } @else {
            <form class="stack g14" novalidate (submit)="$event.preventDefault(); send()">
              <rp-sp-fld
                fid="sp-su-m"
                label="Mobile number of the administrator's CampusOne account"
                [req]="true"
                [error]="mobileError()"
                hint="We'll send a 4-digit code by SMS to confirm it's yours"
              >
                <span class="pre">+91</span>
                <input
                  id="sp-su-m"
                  inputmode="numeric"
                  maxlength="10"
                  autocomplete="tel-national"
                  aria-describedby="sp-su-m-e"
                  [value]="mobile()"
                  (input)="mobile.set(digits($event)); mobileError.set('')"
                />
              </rp-sp-fld>
              @if (refusal(); as text) {
                <div class="note tone-bad">
                  <rp-icon name="alertc" [size]="17" />
                  <div class="grow">{{ text }}</div>
                </div>
              }
            </form>
            <div class="sp-fnav">
              <span class="grow"></span>
              <button
                type="button"
                class="btn btn-pri btn-lg"
                [class.is-busy]="busy()"
                (click)="send()"
              >
                <span>Send code</span><rp-icon name="arrowr" [size]="15" />
              </button>
            </div>
          }
        }
        @case (1) {
          @let f = form();
          <div class="c-form">
            <rp-sp-fld
              fid="sp-su-name"
              label="Institution name"
              [req]="true"
              [full]="true"
              [error]="err('name')"
            >
              <input
                id="sp-su-name"
                maxlength="80"
                placeholder="e.g. Sharavathi Vidyalaya"
                aria-describedby="sp-su-name-e"
                [value]="f.name"
                (input)="set('name', $event)"
              />
            </rp-sp-fld>
            <rp-sp-fld
              fid="sp-su-addr"
              label="Address"
              [req]="true"
              [full]="true"
              [error]="err('address')"
            >
              <textarea
                id="sp-su-addr"
                rows="2"
                maxlength="200"
                placeholder="Street, locality, town"
                aria-describedby="sp-su-addr-e"
                [value]="f.address"
                (input)="set('address', $event)"
              ></textarea>
            </rp-sp-fld>
            <rp-sp-fld fid="sp-su-city" label="City or town" [req]="true" [error]="err('city')">
              <input
                id="sp-su-city"
                maxlength="60"
                placeholder="e.g. Shivamogga"
                aria-describedby="sp-su-city-e"
                [value]="f.city"
                (input)="set('city', $event)"
              />
            </rp-sp-fld>
            <rp-sp-fld fid="sp-su-pin" label="PIN code" [req]="true" [error]="err('pin')">
              <input
                id="sp-su-pin"
                inputmode="numeric"
                maxlength="6"
                aria-describedby="sp-su-pin-e"
                [value]="f.pin"
                (input)="set('pin', $event, true)"
              />
            </rp-sp-fld>
            <div class="fld" [class.invalid]="!!err('board')">
              <label class="fld-l" for="sp-su-board-b">Board<span class="req">*</span></label>
              <rp-dd
                inputId="sp-su-board"
                [options]="boards"
                [value]="f.board"
                (changed)="setValue('board', $event)"
              />
              <div class="fld-e" id="sp-su-board-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('board') }}</span>
              </div>
            </div>
            <rp-sp-fld
              fid="sp-su-size"
              label="About how many students?"
              [req]="true"
              [error]="err('students')"
              hint="Helps us suggest a plan"
            >
              <input
                id="sp-su-size"
                inputmode="numeric"
                maxlength="5"
                aria-describedby="sp-su-size-e"
                [value]="f.students"
                (input)="set('students', $event, true)"
              />
            </rp-sp-fld>
          </div>
          <div class="fs">
            <h4>
              <rp-icon name="user" [size]="15" /> Primary contact <span class="grow"></span>
              <label class="chk"
                ><input
                  type="checkbox"
                  id="sp-su-me"
                  [checked]="me()"
                  (change)="thatsMe($event)"
                /><span>That's me</span></label
              >
            </h4>
            <div class="fs-b c-form c3">
              <rp-sp-fld fid="sp-su-pn" label="Name" [req]="true" [error]="err('pn')">
                <input
                  id="sp-su-pn"
                  maxlength="60"
                  aria-describedby="sp-su-pn-e"
                  [value]="f.pn"
                  (input)="set('pn', $event)"
                />
              </rp-sp-fld>
              <rp-sp-fld fid="sp-su-pe" label="E-mail" [req]="true" [error]="err('pe')">
                <input
                  id="sp-su-pe"
                  type="email"
                  maxlength="254"
                  aria-describedby="sp-su-pe-e"
                  [value]="f.pe"
                  (input)="set('pe', $event)"
                />
              </rp-sp-fld>
              <rp-sp-fld fid="sp-su-pp" label="Mobile" [req]="true" [error]="err('pp')">
                <input
                  id="sp-su-pp"
                  inputmode="numeric"
                  maxlength="10"
                  aria-describedby="sp-su-pp-e"
                  [value]="f.pp"
                  (input)="set('pp', $event, true)"
                />
              </rp-sp-fld>
            </div>
          </div>
          <div class="fs">
            <h4>
              <rp-icon name="user" [size]="15" /> Secondary contact
              <span class="t-faint" style="font-weight: 500">(optional)</span>
            </h4>
            <div class="fs-b c-form c3">
              <rp-sp-fld fid="sp-su-sn" label="Name" [error]="err('sn')">
                <input
                  id="sp-su-sn"
                  maxlength="60"
                  aria-describedby="sp-su-sn-e"
                  [value]="f.sn"
                  (input)="set('sn', $event)"
                />
              </rp-sp-fld>
              <rp-sp-fld fid="sp-su-se" label="E-mail" [error]="err('se')">
                <input
                  id="sp-su-se"
                  type="email"
                  maxlength="254"
                  aria-describedby="sp-su-se-e"
                  [value]="f.se"
                  (input)="set('se', $event)"
                />
              </rp-sp-fld>
              <rp-sp-fld fid="sp-su-sp" label="Mobile" [error]="err('sp')">
                <input
                  id="sp-su-sp"
                  inputmode="numeric"
                  maxlength="10"
                  aria-describedby="sp-su-sp-e"
                  [value]="f.sp"
                  (input)="set('sp', $event, true)"
                />
              </rp-sp-fld>
            </div>
          </div>
          <p class="t-xs t-muted">
            Lifecycle notices — activation, plan changes, invoices, suspension — are e-mailed to
            both contacts <span class="srs" title="SRS reference">FR-SAS-11</span>.
          </p>
          <div class="sp-fnav">
            <button type="button" class="btn btn-ghost" (click)="prev()">
              <rp-icon name="arrowl" [size]="17" /><span>Back</span>
            </button>
            <span class="grow"></span>
            <button type="button" class="btn btn-pri btn-lg" (click)="next()">
              <span>Continue</span><rp-icon name="arrowr" [size]="15" />
            </button>
          </div>
        }
        @case (2) {
          @if (plans(); as ps) {
            <div class="stack g8" role="radiogroup" aria-label="Plan">
              @for (p of ps.items; track p.id) {
                <div
                  class="choice"
                  [class.on]="planId() === p.id"
                  tabindex="0"
                  role="radio"
                  [attr.aria-checked]="planId() === p.id"
                  (click)="planId.set(p.id)"
                  (keydown)="keys($event, p.id)"
                >
                  <span class="li-ic sm"><rp-icon name="layers" [size]="17" /></span>
                  <span class="grow"
                    ><span class="t-h4" style="display: block"
                      >{{ p.name }}
                      @if (p.id === suggested()?.id) {
                        <span class="chip tone-accent" style="margin-left: 6px">Suggested</span>
                      }
                    </span>
                    <span class="t-sm t-muted" style="display: block; margin-top: 1px"
                      >{{ line(p) }} · {{ p.modules.length }} of {{ moduleCount }} modules · up to
                      {{ num(p.allowances.members) }} active members
                      @if (p.allowances.members < estimate()) {
                        · <span style="color: var(--warn)">below your estimate</span>
                      }
                    </span></span
                  >
                  <span class="radio"></span>
                </div>
              }
            </div>
            <div class="fld">
              <span class="fld-l">How would you like to start?</span>
              <div class="sp-start" role="radiogroup" aria-label="How would you like to start?">
                <div
                  class="choice"
                  [class.on]="start() === 'TRIAL'"
                  tabindex="0"
                  role="radio"
                  [attr.aria-checked]="start() === 'TRIAL'"
                  (click)="start.set('TRIAL')"
                  (keydown)="startKeys($event, 'TRIAL')"
                >
                  <span class="li-ic sm"><rp-icon name="hourglass" [size]="17" /></span>
                  <span class="grow"
                    ><span class="t-h4" style="display: block"
                      >{{ chosen()?.trialDays ?? 30 }}-day free trial</span
                    ><span class="t-sm t-muted" style="display: block; margin-top: 1px"
                      >Every feature of the plan. Nothing to pay until the trial converts.</span
                    ></span
                  ><span class="radio"></span>
                </div>
                <div
                  class="choice"
                  [class.on]="start() === 'PAY'"
                  tabindex="0"
                  role="radio"
                  [attr.aria-checked]="start() === 'PAY'"
                  (click)="start.set('PAY')"
                  (keydown)="startKeys($event, 'PAY')"
                >
                  <span class="li-ic sm"><rp-icon name="card" [size]="17" /></span>
                  <span class="grow"
                    ><span class="t-h4" style="display: block">Pay when you go live</span
                    ><span class="t-sm t-muted" style="display: block; margin-top: 1px"
                      >The first invoice is raised when onboarding is finished.</span
                    ></span
                  ><span class="radio"></span>
                </div>
              </div>
            </div>
            <p class="t-xs t-muted">
              Merchant payments carry a platform fee of {{ fee() }}, deducted in each settlement
              <span class="srs" title="SRS reference">OQ-06</span>. You can change plan at any time.
            </p>
          } @else if (plansError()) {
            <div class="note tone-bad">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ plansError() }}</div>
            </div>
          } @else {
            <div class="stack g8">
              <div class="sk" style="height: 64px; border-radius: 12px"></div>
              <div class="sk" style="height: 64px; border-radius: 12px"></div>
            </div>
          }
          <div class="sp-fnav">
            <button type="button" class="btn btn-ghost" (click)="prev()">
              <rp-icon name="arrowl" [size]="17" /><span>Back</span>
            </button>
            <span class="grow"></span>
            <button
              type="button"
              class="btn btn-pri btn-lg"
              [disabled]="!chosen()"
              (click)="next()"
            >
              <span>Continue</span><rp-icon name="arrowr" [size]="15" />
            </button>
          </div>
        }
        @default {
          @let f = form();
          <div class="fs">
            <h4>
              <rp-icon name="building" [size]="15" /> Institution <span class="grow"></span
              ><button type="button" class="linkbtn" (click)="to(1)">Edit</button>
            </h4>
            <div class="fs-b">
              <dl class="kv">
                <dt>Name</dt>
                <dd>{{ f.name }}</dd>
                <dt>Address</dt>
                <dd>{{ f.address }}, {{ f.city }} {{ f.pin }}</dd>
                <dt>Board</dt>
                <dd>{{ f.board }}</dd>
                <dt>Primary contact</dt>
                <dd>{{ f.pn }} · {{ f.pe }} · {{ phone(f.pp) }}</dd>
                <dt>Secondary contact</dt>
                <dd>
                  @if (f.sn) {
                    {{ f.sn }} · {{ f.se }} · {{ phone(f.sp) }}
                  } @else {
                    <span class="t-faint">—</span>
                  }
                </dd>
                <dt>Administrator</dt>
                <dd>
                  {{ account()?.name }}
                  @if (account()?.email; as email) {
                    · {{ email }}
                  }
                </dd>
              </dl>
            </div>
          </div>
          <div class="fs">
            <h4>
              <rp-icon name="layers" [size]="15" /> Plan <span class="grow"></span
              ><button type="button" class="linkbtn" (click)="to(2)">Edit</button>
            </h4>
            <div class="fs-b">
              <dl class="kv">
                <dt>Plan</dt>
                <dd>{{ chosen()?.name }} · {{ chosen() ? line(chosen()!) : '' }}</dd>
                <dt>Start</dt>
                <dd>
                  {{
                    start() === 'PAY'
                      ? 'Pay the first invoice when you go live'
                      : (chosen()?.trialDays ?? 30) + '-day free trial, starting when you go live'
                  }}
                </dd>
                <dt>Due today</dt>
                <dd><b>Nothing</b></dd>
              </dl>
            </div>
          </div>
          <div class="stack g8">
            <label class="chk"
              ><input
                type="checkbox"
                id="sp-su-t1"
                [checked]="accept()[0]"
                (change)="agree(0, $event)"
              /><span
                >I accept the CampusOne
                <button type="button" class="linkbtn" (click)="openTerms($event, 'sub')">
                  subscription terms</button
                >, including the {{ graceDays() }}-day grace period and suspension for
                non-payment.</span
              ></label
            >
            <label class="chk"
              ><input
                type="checkbox"
                id="sp-su-t2"
                [checked]="accept()[1]"
                (change)="agree(1, $event)"
              /><span
                >I accept the
                <button type="button" class="linkbtn" (click)="openTerms($event, 'dp')">
                  data-processing terms</button
                >.</span
              ></label
            >
            <label class="chk"
              ><input
                type="checkbox"
                id="sp-su-t3"
                [checked]="accept()[2]"
                (change)="agree(2, $event)"
              /><span>I'm authorised to register {{ f.name }} on CampusOne.</span></label
            >
            <div class="fld" [class.invalid]="!!termsError()">
              <div class="fld-e" id="sp-su-t-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ termsError() }}</span>
              </div>
            </div>
          </div>
          <div class="sp-fnav">
            <button type="button" class="btn btn-ghost" (click)="prev()">
              <rp-icon name="arrowl" [size]="17" /><span>Back</span>
            </button>
            <span class="grow"></span>
            <button
              type="button"
              class="btn btn-accent btn-lg"
              id="sp-su-create"
              [class.is-busy]="busy()"
              (click)="create()"
            >
              <rp-sp-rocket /><span>Create my institution</span>
            </button>
          </div>
        }
      }
    </rp-sp-flow>
    @if (terms(); as k) {
      <rp-sp-terms [kind]="k" [graceDays]="graceDays()" (closed)="terms.set(null)" />
    }
    <rp-sp-process [state]="process()" />
    <rp-overlays [fixed]="true" />
  `,
})
export class PortalSignup {
  private readonly api = inject(PortalApi);
  private readonly ctx = inject(PortalContext);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);
  private readonly wantedPlan: string | null =
    inject(ActivatedRoute).snapshot.queryParamMap.get('plan');
  private readonly code = viewChild(CodeBoxes);

  protected readonly steps = STEPS;
  protected readonly boards = BOARDS.map((b) => ({ v: b, l: b }));
  protected readonly moduleCount = MODULES.length;
  protected readonly step = signal(0);
  protected readonly busy = signal(false);
  protected readonly process = signal<ProcessState | null>(null);
  protected readonly terms = signal<'sub' | 'dp' | null>(null);

  // step 1 — the account
  protected readonly mobile = signal('');
  protected readonly mobileError = signal('');
  protected readonly refusal = signal<string | null>(null);
  protected readonly challenge = signal<SignupChallenge | null>(null);
  protected readonly verified = signal<SignupVerified | null>(null);
  protected readonly account = computed(() => this.verified()?.account ?? null);
  // A number without a CampusOne account: the account is made here (SAS-051, client 2026-10-06).
  protected readonly newToken = signal<string | null>(null);
  protected readonly newAcct = signal<NewAccount>(NO_ACCOUNT);
  protected readonly newErrors = signal<Partial<Record<keyof NewAccount, string>>>({});
  // An institution the back office registered for the e-mail (SAS-052/053).
  protected readonly mailChallenge = signal<SignupChallenge | null>(null);
  protected readonly mailError = signal('');
  protected readonly joined = signal<{ institution: string; identifier: string } | null>(null);
  protected readonly codeError = signal('');
  private readonly now = signal(Date.now());
  private readonly sentAt = signal(Date.now());
  protected readonly resendLeft = computed(() =>
    Math.max(
      0,
      Math.ceil(
        ((this.challenge()?.resendAfterSeconds || 30) * 1000 - (this.now() - this.sentAt())) / 1000,
      ),
    ),
  );
  protected readonly validMinutes = computed(() => {
    const c = this.challenge();
    return c
      ? Math.max(1, Math.round((new Date(c.expiresAt).getTime() - this.sentAt()) / 60_000))
      : 5;
  });

  // step 2 — the institution
  protected readonly form = signal<Form>(EMPTY);
  protected readonly errors = signal<Partial<Record<keyof Form, string>>>({});
  protected readonly me = signal(false);
  protected readonly savedName = signal('');

  // step 3 — the plan
  protected readonly plans = signal<PortalPlans | null>(null);
  protected readonly plansError = signal('');
  protected readonly planId = signal('');
  protected readonly start = signal<'TRIAL' | 'PAY'>('TRIAL');
  protected readonly students = computed(() => Number(this.form().students) || 0);
  protected readonly estimate = computed(() => Math.round(this.students() * 2.1));
  /** SP.recommend: the cheapest plan whose members allowance covers the estimate. */
  protected readonly suggested = computed<PortalPlan | null>(() => {
    const ps = [...(this.plans()?.items ?? [])].sort((a, b) => annual(a) - annual(b));
    return ps.find((p) => p.allowances.members >= this.estimate()) ?? ps[ps.length - 1] ?? null;
  });
  protected readonly chosen = computed(
    () => this.plans()?.items.find((p) => p.id === this.planId()) ?? null,
  );
  protected readonly graceDays = computed(() => this.plans()?.graceDays ?? 14);
  protected readonly fee = computed(() => feeText(this.chosen()));

  // step 4 — agree
  protected readonly accept = signal<[boolean, boolean, boolean]>([false, false, false]);
  protected readonly termsError = signal('');

  protected readonly heading = computed(() => {
    switch (this.step()) {
      case 0:
        if (this.joined()) return 'Institution linked';
        if (this.verified()) return 'Account verified';
        if (this.newToken()) return 'Create your CampusOne account';
        return this.challenge() ? 'Enter the code' : 'Your CampusOne account';
      case 1:
        return 'Your institution';
      case 2:
        return 'Choose a plan';
      default:
        return 'Review and agree';
    }
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    void this.loadPlans();
    // Already signed in (prototype guard): the account instead of a second sign-up.
    void this.ctx.loadQuietly().then((on) => {
      if (on) void this.router.navigateByUrl(this.accountHome());
    });
  }

  private accountHome() {
    return this.ctx.session()?.institution.status === 'PENDING_ACTIVATION'
      ? '/portal/onboard'
      : '/portal/account';
  }

  private async loadPlans() {
    try {
      this.plans.set(await this.api.plans());
    } catch (e) {
      this.plansError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  // --- helpers ------------------------------------------------------------------------------------
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
  protected num(v: number) {
    return v.toLocaleString('en-IN');
  }
  protected line(p: PortalPlan) {
    return planLine(p);
  }
  protected phone(v: string) {
    return formatMobile(v);
  }
  protected digits(e: Event) {
    const el = e.target as HTMLInputElement;
    el.value = el.value.replace(/\D/g, '');
    return el.value;
  }
  protected err(k: keyof Form) {
    return this.errors()[k] ?? '';
  }
  protected set(k: keyof Form, e: Event, numeric = false) {
    this.setValue(k, numeric ? this.digits(e) : (e.target as HTMLInputElement).value);
  }
  protected setValue(k: keyof Form, v: string) {
    this.form.update((f) => ({ ...f, [k]: v }));
    if (this.errors()[k]) {
      const next = { ...this.errors() };
      delete next[k];
      this.errors.set(next);
    }
  }
  protected keys(e: KeyboardEvent, id: string) {
    choiceKeys(e, () => this.planId.set(id));
  }
  protected startKeys(e: KeyboardEvent, v: 'TRIAL' | 'PAY') {
    choiceKeys(e, () => this.start.set(v));
  }
  private top() {
    const page = globalThis.document?.scrollingElement ?? globalThis.document?.documentElement;
    if (page) page.scrollTop = 0;
  }

  // --- step 1: the administrator's account (SAS-002/003) ---------------------------------------------
  protected async send() {
    if (this.busy()) return;
    const m = this.mobile().trim();
    this.mobileError.set(
      !m
        ? translate('VALIDATION.REQUIRED')
        : PATTERNS.mobile.test(m)
          ? ''
          : translate('VALIDATION.MOBILE'),
    );
    if (this.mobileError()) return;
    this.busy.set(true);
    this.refusal.set(null);
    try {
      const c = await this.api.signupOtp(m);
      this.challenge.set(c);
      this.sentAt.set(Date.now());
      this.now.set(Date.now());
      this.codeError.set('');
      this.overlays.toast('Code sent', { sub: `SMS to ${c.sentTo}`, tone: 'info' });
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.length) {
        this.mobileError.set(e.errors[0]!.message);
      } else {
        this.refusal.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend() {
    try {
      const c = await this.api.signupOtp(this.mobile());
      this.challenge.set(c);
      this.sentAt.set(Date.now());
      this.now.set(Date.now());
      if (c.alreadySent) {
        this.overlays.toast(translate('AUTH.OTP_ALREADY_SENT'), {
          sub: "A new code isn't sent while the current one is still valid.",
          tone: 'info',
        });
      } else {
        this.overlays.toast('New code sent', { sub: `SMS to ${c.sentTo}`, tone: 'info' });
      }
    } catch (e) {
      this.codeError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected async verify(entered?: string) {
    const c = this.challenge();
    if (!c || this.busy()) return;
    const otp = entered ?? this.code()?.value() ?? '';
    if (otp.length < 4) {
      this.codeError.set(translate('VALIDATION.OTP'));
      this.code()?.reset();
      return;
    }
    this.busy.set(true);
    try {
      const v = await this.api.signupVerify(c.challengeId, otp, this.mobile());
      this.challenge.set(null);
      if (v.newAccount) this.newToken.set(v.signupToken);
      else this.verified.set(v);
    } catch (e) {
      const code = e instanceof ApiProblem ? e.code : '';
      const text = e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
      if (
        code === 'AUTH.OTP_ATTEMPTS_EXCEEDED' ||
        code === 'AUTH.OTP_EXPIRED' ||
        code === 'AUTH.OTP_ALREADY_USED' ||
        code === 'SAS.SIGNUP_ACCOUNT_IN_USE' ||
        code === 'SAS.SIGNUP_NO_ACCOUNT' ||
        code === 'SAS.SIGNUP_EXPIRED'
      ) {
        // The attempt is over: start again from the mobile number.
        this.challenge.set(null);
        this.refusal.set(text);
      } else {
        this.codeError.set(text);
        this.code()?.reset();
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected changeNumber() {
    this.challenge.set(null);
    this.verified.set(null);
    this.newToken.set(null);
    this.newErrors.set({});
    this.mailChallenge.set(null);
    this.mailError.set('');
    this.codeError.set('');
    this.refusal.set(null);
  }

  // --- SAS-051: the CampusOne account made here -------------------------------------------------------
  protected newErr(k: keyof NewAccount) {
    return this.newErrors()[k] ?? '';
  }

  protected setNew(k: keyof NewAccount, e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.newAcct.update((a) => ({ ...a, [k]: v }));
    if (this.newErrors()[k]) {
      const next = { ...this.newErrors() };
      delete next[k];
      this.newErrors.set(next);
    }
  }

  protected async createAccount() {
    const token = this.newToken();
    if (!token || this.busy()) return;
    const a = this.newAcct();
    const mail = a.email.trim().toLowerCase();
    const errors: Partial<Record<keyof NewAccount, string>> = {};
    if (!a.firstName.trim()) errors.firstName = translate('VALIDATION.REQUIRED');
    if (!mail) errors.email = translate('VALIDATION.REQUIRED');
    else if (!PATTERNS.email.test(mail)) errors.email = translate('VALIDATION.EMAIL');
    if (!a.password) errors.password = translate('VALIDATION.REQUIRED');
    this.newErrors.set(errors);
    if (Object.keys(errors).length) return;
    this.busy.set(true);
    try {
      const v = await this.api.signupAccount({
        signupToken: token,
        firstName: a.firstName.trim(),
        lastName: a.lastName.trim() || null,
        email: mail,
        password: a.password,
      });
      this.newToken.set(null);
      this.newAcct.set(NO_ACCOUNT);
      this.verified.set(v);
      this.overlays.toast('Account created', { sub: 'Your CampusOne account is ready', tone: 'ok' });
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.length) {
        const next: Partial<Record<keyof NewAccount, string>> = {};
        for (const x of e.errors) {
          if (x.field in NO_ACCOUNT) next[x.field as keyof NewAccount] ??= x.message;
        }
        this.newErrors.set(next);
      } else if (e instanceof ApiProblem && e.status === 401) {
        // The confirmed number has expired: start again from the mobile number.
        this.changeNumber();
        this.refusal.set(e.detail);
      } else {
        this.newErrors.set({
          email: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        });
      }
    } finally {
      this.busy.set(false);
    }
  }

  // --- SAS-052/053: the e-mail confirmed for an institution the back office registered ------------
  protected async sendMail() {
    const v = this.verified();
    if (!v || this.busy()) return;
    this.busy.set(true);
    this.mailError.set('');
    try {
      const c = await this.api.signupEmailCode(v.signupToken);
      this.mailChallenge.set(c);
      this.overlays.toast('Code sent', { sub: `E-mail to ${c.sentTo}`, tone: 'info' });
    } catch (e) {
      this.mailError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmMail(otp: string) {
    const v = this.verified();
    const c = this.mailChallenge();
    if (!v || !c || this.busy()) return;
    this.busy.set(true);
    try {
      const r = await this.api.signupEmailVerify(v.signupToken, c.challengeId, otp);
      this.mailChallenge.set(null);
      if (r.joined) this.joined.set(r.joined);
      else this.verified.set({ ...v, invited: false });
    } catch (e) {
      const code = e instanceof ApiProblem ? e.code : '';
      if (
        code === 'AUTH.OTP_ATTEMPTS_EXCEEDED' ||
        code === 'AUTH.OTP_EXPIRED' ||
        code === 'AUTH.OTP_ALREADY_USED'
      ) {
        this.mailChallenge.set(null);
      }
      this.mailError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  /** sp.su.me: the verified account is the primary contact. */
  protected thatsMe(e: Event) {
    const on = (e.target as HTMLInputElement).checked;
    this.me.set(on);
    const a = this.verified()?.account;
    if (!on || !a) return;
    this.form.update((f) => ({
      ...f,
      pn: a.name,
      pe: a.email ?? f.pe,
      pp: this.mobile(),
    }));
    const next = { ...this.errors() };
    delete next.pn;
    delete next.pe;
    delete next.pp;
    this.errors.set(next);
  }

  // --- moving between steps ----------------------------------------------------------------------
  protected prev() {
    this.step.set(Math.max(0, this.step() - 1));
    this.top();
  }

  protected to(n: number) {
    this.step.set(n);
    this.top();
  }

  protected next() {
    const s = this.step();
    if (s === 0) {
      if (!this.verified()) return;
      this.step.set(1);
    } else if (s === 1) {
      if (!this.validInstitution()) return;
      this.savedName.set(this.form().name.trim());
      if (!this.planId()) {
        const wanted = this.plans()?.items.find((p) => p.id === this.wantedPlan);
        this.planId.set(wanted?.id ?? this.suggested()?.id ?? '');
      }
      this.step.set(2);
    } else if (s === 2) {
      if (!this.chosen()) return;
      this.step.set(3);
    }
    this.top();
  }

  /** The prototype's checks of step 2, with the register's wording. */
  private validInstitution(): boolean {
    const f = this.form();
    const e: Partial<Record<keyof Form, string>> = {};
    const req = translate('VALIDATION.REQUIRED');
    const name = f.name.trim();
    if (!name) e.name = req;
    else if (name.length < 3) e.name = translate('VALIDATION.FORMAT');
    else if (!INSTITUTION_NAME.test(name)) e.name = translate('INS.NAME_FORMAT');
    const address = f.address.trim();
    if (!address) e.address = req;
    else if (address.length < 10) e.address = translate('VALIDATION.FORMAT');
    const city = f.city.trim();
    if (!city) e.city = req;
    else if (!PERSON.test(city)) e.city = translate('VALIDATION.FORMAT');
    if (!f.pin) e.pin = req;
    else if (!/^[1-9]\d{5}$/.test(f.pin)) e.pin = translate('VALIDATION.PIN_CODE');
    if (!f.board) e.board = req;
    const n = Number(f.students);
    if (!f.students) e.students = req;
    else if (!Number.isInteger(n) || n < 10 || n > 20000) {
      e.students = translate('VALIDATION.RANGE', { min: 10, max: '20,000' });
    }
    const person = (k: 'pn' | 'sn', v: string) => {
      if (!v.trim()) e[k] = req;
      else if (!PERSON.test(v.trim())) e[k] = translate('IDN.NAME_LETTERS_ONLY');
    };
    const email = (k: 'pe' | 'se', v: string) => {
      if (!v.trim()) e[k] = req;
      else if (!PATTERNS.email.test(v.trim().toLowerCase())) e[k] = translate('VALIDATION.EMAIL');
    };
    const mobile = (k: 'pp' | 'sp', v: string) => {
      if (!v) e[k] = req;
      else if (!PATTERNS.mobile.test(v)) e[k] = translate('VALIDATION.MOBILE');
    };
    person('pn', f.pn);
    email('pe', f.pe);
    mobile('pp', f.pp);
    if (f.sn.trim() || f.se.trim() || f.sp) {
      person('sn', f.sn);
      email('se', f.se);
      mobile('sp', f.sp);
    }
    this.errors.set(e);
    if (Object.keys(e).length) {
      setTimeout(() => document.querySelector<HTMLElement>('.fld.invalid input')?.focus(), 0);
      return false;
    }
    return true;
  }

  // --- step 4: agree and create (SAS-004) ----------------------------------------------------------
  protected agree(i: 0 | 1 | 2, e: Event) {
    const next = [...this.accept()] as [boolean, boolean, boolean];
    next[i] = (e.target as HTMLInputElement).checked;
    this.accept.set(next);
    this.termsError.set('');
  }

  protected openTerms(e: Event, kind: 'sub' | 'dp') {
    e.preventDefault();
    e.stopPropagation();
    this.terms.set(kind);
  }

  private body(): SignupInput {
    const f = this.form();
    const contact = (name: string, email: string, mobile: string) => ({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      mobile,
    });
    const [subscription, dataProcessing, authorised] = this.accept();
    return {
      signupToken: this.verified()!.signupToken,
      institution: {
        name: f.name.trim(),
        address: f.address.trim(),
        city: f.city.trim(),
        pinCode: f.pin,
        board: f.board,
        students: Number(f.students),
      },
      primaryContact: contact(f.pn, f.pe, f.pp),
      ...(f.sn.trim() ? { secondaryContact: contact(f.sn, f.se, f.sp) } : {}),
      planId: this.planId(),
      start: this.start(),
      accept: { subscription, dataProcessing, authorised },
    };
  }

  protected async create() {
    if (this.busy()) return;
    if (this.accept().some((a) => !a)) {
      this.termsError.set(translate('SAS.TERMS_REQUIRED'));
      return;
    }
    const a = this.account();
    if (!a) return;
    const f = this.form();
    this.busy.set(true);
    try {
      const out = await runProcess(
        this.process,
        {
          title: 'Creating your institution',
          sub: 'All of these happen together — or none of them do',
          icon: 'building',
          steps: [
            'Name and address are unique together',
            `${a.name}'s account verified and not in any institution`,
            'Identifier assigned',
            '“Staff” user type with an “Administration” department',
            `Administrator profile for ${a.name} with campus and allowance wallets`,
            "Feature record from the plan's modules",
            'Administrator role added — existing roles kept',
            `Welcome e-mail to ${f.pe.trim().toLowerCase()}`,
          ],
        },
        () => this.api.signup(this.body()),
        (e) => (e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE')),
      );
      await this.ctx.signedUp();
      await this.router.navigate(['/portal/onboard'], { queryParams: { welcome: 1 } });
      this.overlays.toast(`${f.name.trim()} is registered`, {
        sub: `${out.identifier} · your onboarding checklist is ready`,
      });
    } catch (e) {
      this.refused(e);
    } finally {
      this.busy.set(false);
    }
  }

  private refused(e: unknown) {
    if (!(e instanceof ApiProblem)) {
      this.overlays.toast('Not created', { sub: translate('GEN.UNAVAILABLE'), tone: 'bad' });
      return;
    }
    if (e.code === 'SAS.SIGNUP_EXPIRED') {
      // The 30-minute sign-up token ran out: verify the mobile number again.
      this.changeNumber();
      this.refusal.set(e.detail);
      this.to(0);
      return;
    }
    if (e.code === 'INS.NAME_ADDRESS_TAKEN') {
      this.errors.set({ address: e.detail });
      this.to(1);
      return;
    }
    if (e.code === 'SAS.TERMS_REQUIRED' || e.errors.some((x) => x.field === 'accept')) {
      this.termsError.set(translate('SAS.TERMS_REQUIRED'));
      return;
    }
    const fields = e.errors.filter((x) => FIELD[x.field]);
    if (fields.length) {
      this.errors.set(Object.fromEntries(fields.map((x) => [FIELD[x.field]!, x.message])));
      this.to(1);
      return;
    }
    this.overlays.toast('Not created', { sub: e.detail, tone: 'bad' });
  }
}
