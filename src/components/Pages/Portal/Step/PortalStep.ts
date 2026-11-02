import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { PortalContext } from '../../../../Context/PortalContext';
import { Card, Empty } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, formatMobile, istBusinessDate } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { PATTERNS } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { FeatureRow } from '../../Backoffice/Institutions/institutions.api';
import {
  PortalApi,
  type InstitutionDetails,
  type Onboarding,
  type PortalContact,
  type PortalUserTypeCategory,
  type StepBody,
  type StepKey,
} from '../portal.api';
import { PortalStore } from '../portal.store';
import {
  CHECKLIST,
  Field,
  MOD_INFO,
  PageHead,
  PlanCard,
  STEP,
  addDays,
  feeText,
  gstOn,
  inr,
  nextStep,
  paiseOf,
  toneOf,
} from '../Shared/PortalUi';

interface TypeDraft {
  readonly name: string;
  readonly category: PortalUserTypeCategory;
  readonly depts: readonly string[];
  /** Student, Teacher and Staff: other parts of CampusOne rely on them. */
  readonly core?: boolean;
  /** Created at registration (Staff with Administration): its departments change in the console. */
  readonly fixed?: boolean;
}

/** SP.baseTypes, as the portal can create them (categories of SAS-009). */
const BASE_TYPES: readonly TypeDraft[] = [
  {
    name: 'Student',
    category: 'STUDENT',
    core: true,
    depts: ['Primary', 'Middle school', 'High school'],
  },
  {
    name: 'Teacher',
    category: 'TEACHER',
    core: true,
    depts: ['Primary', 'Middle school', 'High school'],
  },
  { name: 'Staff', category: 'STAFF', core: true, fixed: true, depts: ['Administration'] },
  { name: 'Parent', category: 'PARENT', depts: ['Parents and guardians'] },
  { name: 'Principal', category: 'MANAGEMENT', depts: ['Leadership'] },
];

const guessCategory = (name: string): PortalUserTypeCategory => {
  const n = name.toLowerCase();
  if (/student|pupil/.test(n)) return 'STUDENT';
  if (/parent|guardian/.test(n)) return 'PARENT';
  if (/teacher|faculty|lecturer/.test(n)) return 'TEACHER';
  if (/principal|head|management|trustee|chair/.test(n)) return 'MANAGEMENT';
  if (/crew|driver|attendant/.test(n)) return 'CREW';
  return 'STAFF';
};

const BANKS = [
  'State Bank of India',
  'Canara Bank',
  'Karnataka Bank',
  'Bank of Baroda',
  'HDFC Bank',
  'ICICI Bank',
  'Union Bank of India',
];

/** The console's order of the features (tuition before the fee consent that needs it). */
const FEATURE_ORDER = [
  'tuition',
  'feeConsent',
  'coupons',
  'allowances',
  'nfc',
  'transfers',
  'events',
  'attendance',
  'transport',
  'quiz',
];

const MAX_LOGO = 2 * 1024 * 1024;
const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const labelOf = (start: string, end: string) => {
  const a = Number(start.slice(0, 4));
  const b = Number(end.slice(0, 4));
  return !a || !b || b < a ? '' : a === b ? String(a) : `${a}–${String(b).slice(2)}`;
};

/** A June-to-March year around today (the prototype's 2026–27 shape). */
function defaultYear() {
  const today = istBusinessDate();
  const y = Number(today.slice(0, 4));
  const from = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
  const start = `${from}-06-01`;
  const end = `${from + 1}-03-31`;
  return { start, end, label: labelOf(start, end) };
}

/**
 * s.step — one onboarding step (FR-SAS-10, FR-INS-03/04/06, FR-ACA-01; SAS-009; prototype s.step):
 * the checklist rail, who does the step, and its form — features within the plan, user types and
 * departments, the academic year, the fee account, the logo, the first users. Details, plan and the
 * bank collection account are shown here and done elsewhere (sign-up, Plan & usage, CampusOne).
 */
@Component({
  selector: 'rp-portal-step',
  imports: [Card, Dropdown, Empty, Field, Icon, NgTemplateOutlet, PageHead, PlanCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-sp-head [title]="info().t" [sub]="info().d" />
    <div class="sp-stepw">
      <nav class="sp-mini" aria-label="Checklist">
        @for (c of checklist; track c.k) {
          <button
            type="button"
            [class.on]="c.k === key()"
            [class.d]="isDone(c.k)"
            [class.w]="c.k === 'bank' && !isDone('bank')"
            (click)="open(c.k)"
          >
            <i><rp-icon name="check" [size]="10" [stroke]="3" /></i
            ><span class="t-clip">{{ title(c.k) }}</span>
          </button>
        }
        <button type="button" style="margin-top: 8px" (click)="go('/portal/onboard')">
          <rp-icon name="arrowl" [size]="14" /><span>All steps</span>
        </button>
      </nav>
      <div class="stack g16">
        @if (error()) {
          <div class="card pad">
            <rp-empty icon="wifioff" title="Couldn't load this step" [text]="error()" />
          </div>
        } @else if (data(); as o) {
          @if (isDone(key()) && key() !== 'bank') {
            <div class="note tone-ok">
              <rp-icon name="checkc" [size]="17" />
              <div class="grow">
                Done{{ summary() ? ' — ' + summary() : '' }}. You can change it and save again.
              </div>
            </div>
          }
          <div class="row g8 wrap">
            <span class="sp-who" [class.rp]="key() === 'bank'">{{
              key() === 'bank' ? 'CampusOne' : 'You'
            }}</span>
            <span class="t-xs t-muted">{{ def().req ? 'Required to go live' : 'Optional' }}</span>
            <span class="srs" title="SRS reference">{{ def().ref }}</span>
          </div>
          @switch (key()) {
            @case ('details') {
              <div class="note tone-info">
                <rp-icon name="info" [size]="17" />
                <div class="grow">
                  These came from your sign-up. The name and address are part of your identifier, so
                  changes to them go through CampusOne; contacts you can edit yourself.
                </div>
              </div>
              @if (details(); as d) {
                <div class="fs">
                  <h4><rp-icon name="building" [size]="15" /> Institution</h4>
                  <div class="fs-b">
                    <dl class="kv">
                      <dt>Identifier</dt>
                      <dd>
                        <span class="t-mono">{{ d.identifier }}</span>
                      </dd>
                      <dt>Name</dt>
                      <dd>{{ d.name }}</dd>
                      <dt>Address</dt>
                      <dd>{{ address(d) }}</dd>
                      <dt>Board</dt>
                      <dd>{{ d.board ?? '—' }}</dd>
                      <dt>Registered</dt>
                      <dd>{{ d.registeredAt ? dt(d.registeredAt) : '—' }}</dd>
                    </dl>
                  </div>
                </div>
                <div class="fs">
                  <h4>
                    <rp-icon name="users" [size]="15" /> Contacts and administrator
                    <span class="grow"></span
                    ><button type="button" class="linkbtn" (click)="go('/portal/details')">
                      Edit contacts
                    </button>
                  </h4>
                  <div class="fs-b">
                    <dl class="kv">
                      <dt>Primary contact</dt>
                      <dd>{{ contact(d.contacts.primary) }}</dd>
                      <dt>Secondary contact</dt>
                      <dd>{{ contact(d.contacts.secondary) }}</dd>
                      <dt>Administrator</dt>
                      <dd>
                        <span class="t-mono">{{ d.administrator?.email ?? '—' }}</span>
                      </dd>
                    </dl>
                  </div>
                </div>
              } @else {
                <div class="sk" style="height: 180px; border-radius: 16px"></div>
              }
              <ng-container *ngTemplateOutlet="bar; context: { $implicit: 'Next step' }" />
            }
            @case ('plan') {
              <div class="c-grid k2" style="align-items: start">
                @if (plan(); as p) {
                  <rp-sp-plan [plan]="p">
                    <button
                      type="button"
                      class="btn btn-sec btn-block"
                      (click)="go('/portal/plan')"
                    >
                      <span>Compare and change plan</span>
                    </button>
                  </rp-sp-plan>
                } @else {
                  <div class="sk" style="height: 320px; border-radius: 22px"></div>
                }
                <div class="stack g12">
                  @if (o.status === 'PENDING_ACTIVATION') {
                    <div class="fld">
                      <span class="fld-l">How would you like to start?</span>
                      <div class="stack g8">
                        <div class="choice" [class.on]="o.startPreference !== 'PAY'">
                          <span class="li-ic sm"><rp-icon name="hourglass" [size]="17" /></span>
                          <span class="grow"
                            ><span class="t-h4" style="display: block"
                              >{{ plan()?.trialDays ?? 30 }}-day free trial</span
                            ><span class="t-sm t-muted" style="display: block; margin-top: 1px"
                              >Every feature of your plan; nothing to pay until it converts.</span
                            ></span
                          ><span class="radio"></span>
                        </div>
                        <div class="choice" [class.on]="o.startPreference === 'PAY'">
                          <span class="li-ic sm"><rp-icon name="card" [size]="17" /></span>
                          <span class="grow"
                            ><span class="t-h4" style="display: block">Pay when you go live</span
                            ><span class="t-sm t-muted" style="display: block; margin-top: 1px"
                              >First invoice {{ firstInvoice() }} including GST.</span
                            ></span
                          ><span class="radio"></span>
                        </div>
                      </div>
                      <div class="fld-h">Chosen at sign-up. Go live offers both again.</div>
                    </div>
                  } @else {
                    <div class="note tone-info">
                      <rp-icon name="info" [size]="17" />
                      <div class="grow">
                        {{ session()?.institution?.name }} is {{ statusText() }}. Change plan from
                        Plan &amp; usage.
                      </div>
                    </div>
                  }
                  <div class="note tone-info">
                    <rp-icon name="percent" [size]="17" />
                    <div class="grow">
                      Platform fee on merchant payments: {{ fee() }}
                      <span class="srs" title="SRS reference">OQ-06</span>
                    </div>
                  </div>
                </div>
              </div>
              <ng-container *ngTemplateOutlet="bar; context: { $implicit: 'Next step' }" />
            }
            @case ('bank') {
              @if (details(); as d) {
                @if (!d.bank.corporateCode) {
                  <div class="sp-state st-warn">
                    <span
                      class="li-ic"
                      style="
                        width: 52px;
                        height: 52px;
                        border-radius: 50%;
                        background: var(--warn-soft);
                        color: var(--warn);
                      "
                      ><rp-icon name="hourglass" [size]="24"
                    /></span>
                    <div>
                      <h2>CampusOne is setting this up</h2>
                      <p>
                        Our sponsor bank assigns a corporate code — the four characters at the start
                        of every member's virtual account — and opens a pool account for your
                        collections. You don't need to do anything; we'll e-mail
                        {{ d.contacts.primary?.name ?? 'your primary contact' }} when it's ready.
                      </p>
                    </div>
                    <div class="acts">
                      <a class="btn btn-sec" [href]="nudge()"
                        ><rp-icon name="mail" [size]="17" /><span>Ask for an update</span></a
                      >
                    </div>
                  </div>
                  <rp-card title="Progress" icon="bank" [plainIcon]="true">
                    <div class="tl">
                      <div class="tl-i done">
                        <span class="tl-dot"
                          ><rp-icon name="check" [size]="13" [stroke]="2.6"
                        /></span>
                        <div class="tl-c">
                          <div class="tl-t">Request sent to the sponsor bank</div>
                          <div class="tl-s">{{ requested(d) }}</div>
                        </div>
                      </div>
                      <div class="tl-i now">
                        <span class="tl-dot"
                          ><rp-icon name="hourglass" [size]="13" [stroke]="2.6"
                        /></span>
                        <div class="tl-c">
                          <div class="tl-t">Corporate code assigned</div>
                          <div class="tl-s">Usually within two working days</div>
                        </div>
                      </div>
                      <div class="tl-i">
                        <span class="tl-dot"
                          ><rp-icon name="dot" [size]="13" [stroke]="2.6"
                        /></span>
                        <div class="tl-c">
                          <div class="tl-t">Pool account opened</div>
                          <div class="tl-s">Same day as the code</div>
                        </div>
                      </div>
                    </div>
                  </rp-card>
                  <div class="sp-fnav">
                    <button type="button" class="btn btn-ghost" (click)="go('/portal/onboard')">
                      <rp-icon name="arrowl" [size]="17" /><span>Back to checklist</span>
                    </button>
                    <span class="grow"></span>
                  </div>
                } @else {
                  <div class="sp-state st-ok">
                    <span
                      class="li-ic"
                      style="
                        width: 52px;
                        height: 52px;
                        border-radius: 50%;
                        background: var(--ok-soft);
                        color: var(--ok);
                      "
                      ><rp-icon name="checkc" [size]="24"
                    /></span>
                    <div>
                      <h2>Your collection account is ready</h2>
                      <p>
                        Members' wallets are funded by bank transfer to their own virtual account.
                        Settlements to merchants and your fee account run every night.
                      </p>
                    </div>
                    <div></div>
                  </div>
                  <div class="fs">
                    <h4>
                      <rp-icon name="bank" [size]="15" /> Bank references
                      <span class="srs" title="SRS reference">FR-INS-06</span>
                    </h4>
                    <div class="fs-b">
                      <dl class="kv">
                        <dt>Corporate code</dt>
                        <dd>
                          <span class="t-mono">{{ d.bank.corporateCode }}</span>
                        </dd>
                        <dt>Pool account</dt>
                        <dd>
                          <span class="t-mono">{{ d.bank.poolAccount ?? '—' }}</span>
                        </dd>
                        <dt>A member's virtual account looks like</dt>
                        <dd>
                          <span class="t-mono">{{ d.bank.corporateCode }} 5200 0001 23</span>
                        </dd>
                      </dl>
                    </div>
                  </div>
                  <ng-container *ngTemplateOutlet="bar; context: { $implicit: 'Next step' }" />
                }
              } @else {
                <div class="sk" style="height: 140px; border-radius: 22px"></div>
              }
            }
            @case ('toggles') {
              <div class="note tone-info">
                <rp-icon name="info" [size]="17" />
                <div class="grow">
                  Your plan decides which features you can switch on
                  <span class="srs" title="SRS reference">FR-SAS-05</span>. Switched-off features
                  are hidden from menus and refused by the app
                  <span class="srs" title="SRS reference">FR-INS-04</span>.
                </div>
              </div>
              <div class="c-grid k2" style="align-items: start">
                @for (g of groups; track g) {
                  <div class="card">
                    <div class="card-h">
                      <span class="t-h4">{{ g }}</span>
                    </div>
                    <div class="list plain">
                      @for (f of featuresIn(o, g); track f.key) {
                        <div class="li" style="min-height: 56px">
                          <span class="li-ic sm"
                            ><rp-icon [name]="featureIcon(f)" [size]="16"
                          /></span>
                          <span class="li-main"
                            ><span class="li-t wrap"
                              >{{ f.label }}
                              @if (f.cr) {
                                <span class="srs cr" title="Version 2.1 change request">{{
                                  f.cr
                                }}</span>
                              }
                            </span>
                            <span class="li-s wrap">
                              @if (f.lock?.kind === 'PLAN') {
                                Not in {{ o.plan?.name ?? 'your plan' }} —
                                <button type="button" class="linkbtn" (click)="go('/portal/plan')">
                                  upgrade to use it
                                </button>
                              } @else {
                                {{ f.sub }}
                              }
                            </span></span
                          >
                          <button
                            type="button"
                            class="toggle"
                            role="switch"
                            [attr.aria-checked]="featureOn(f)"
                            [attr.aria-label]="f.label"
                            [attr.title]="featureLock(f)"
                            [disabled]="!!featureLock(f)"
                            (click)="flip(f)"
                          ></button>
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
              <div class="fld" [class.invalid]="!!togglesError()">
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ togglesError() }}</span>
                </div>
              </div>
              <ng-container *ngTemplateOutlet="bar; context: { $implicit: 'Save features' }" />
            }
            @case ('usertypes') {
              <div class="note tone-info">
                <rp-icon name="info" [size]="17" />
                <div class="grow">
                  Every user type needs at least one department
                  <span class="srs" title="SRS reference">FR-INS-03</span>. Student, Teacher and
                  Staff are fixed because other parts of CampusOne rely on them.
                </div>
              </div>
              <div class="stack g8">
                @for (t of types(); track $index; let ti = $index) {
                  <div class="sp-ut" [class.bad]="!!typeErrors()[ti]">
                    <span class="nm"
                      ><rp-icon [name]="t.core ? 'lock' : 'users'" [size]="15" /><span
                        class="t-clip"
                        >{{ t.name }}</span
                      >
                      @if (t.core) {
                        <span class="t-xs t-faint">Required</span>
                      }
                    </span>
                    <div class="sp-deps">
                      @for (d of t.depts; track d; let di = $index) {
                        <span class="sp-dep"
                          >{{ d }}
                          @if (!t.fixed) {
                            <button
                              type="button"
                              [attr.aria-label]="'Remove ' + d"
                              (click)="removeDep(ti, di)"
                            >
                              <rp-icon name="x" [size]="12" [stroke]="2.6" />
                            </button>
                          }
                        </span>
                      }
                      @if (t.fixed) {
                        <span class="t-xs t-faint">More departments in the console</span>
                      } @else {
                        <input
                          type="text"
                          placeholder="Add a department ↵"
                          maxlength="40"
                          [attr.aria-label]="'Add a department to ' + t.name"
                          [value]="depDrafts()[ti] ?? ''"
                          (input)="setDep(ti, $event)"
                          (keydown)="depKey(ti, $event)"
                        />
                      }
                    </div>
                    <span>
                      @if (!t.core) {
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm btn-icon"
                          [attr.aria-label]="'Remove ' + t.name"
                          [attr.title]="'Remove ' + t.name"
                          (click)="removeType(ti)"
                        >
                          <rp-icon name="trash" [size]="15" />
                        </button>
                      }
                    </span>
                    @if (typeErrors()[ti]; as msg) {
                      <span class="t-xs" style="grid-column: 1 / -1; color: var(--bad)">{{
                        msg
                      }}</span>
                    }
                  </div>
                }
              </div>
              <div class="row g8 wrap" style="align-items: flex-end">
                <div style="flex: 1; min-width: 220px">
                  <rp-sp-fld fid="sp-ut-new" label="Add a user type" [error]="newTypeError()">
                    <input
                      id="sp-ut-new"
                      maxlength="30"
                      placeholder="e.g. Counsellor, Nurse, Coordinator"
                      aria-describedby="sp-ut-new-e"
                      [value]="newType()"
                      (input)="newType.set(value($event)); newTypeError.set('')"
                      (keydown.enter)="addType()"
                    />
                  </rp-sp-fld>
                </div>
                <button type="button" class="btn btn-sec" (click)="addType()">
                  <rp-icon name="plus" [size]="17" /><span>Add</span>
                </button>
              </div>
              <ng-container *ngTemplateOutlet="bar; context: { $implicit: 'Save user types' }" />
            }
            @case ('year') {
              <div class="note tone-info">
                <rp-icon name="info" [size]="17" />
                <div class="grow">
                  Every listing, report and record is filed under an academic year, and closed years
                  become read-only
                  <span class="srs cr" title="Version 2.1 change request">CR-13</span>. You can add
                  next year's when admissions open.
                </div>
              </div>
              <div class="c-form c3">
                <rp-sp-fld fid="sp-yr-s" label="Starts" [req]="true" [error]="yearErr('start')">
                  <input
                    id="sp-yr-s"
                    type="date"
                    aria-describedby="sp-yr-s-e"
                    [value]="year().start"
                    (input)="setYear('start', $event)"
                  />
                </rp-sp-fld>
                <rp-sp-fld fid="sp-yr-e" label="Ends" [req]="true" [error]="yearErr('end')">
                  <input
                    id="sp-yr-e"
                    type="date"
                    aria-describedby="sp-yr-e-e"
                    [value]="year().end"
                    (input)="setYear('end', $event)"
                  />
                </rp-sp-fld>
                <rp-sp-fld
                  fid="sp-yr-l"
                  label="Label"
                  [req]="true"
                  [error]="yearErr('label')"
                  hint="Shown on every record"
                >
                  <input
                    id="sp-yr-l"
                    maxlength="12"
                    aria-describedby="sp-yr-l-e"
                    [value]="year().label"
                    (input)="setYear('label', $event)"
                  />
                </rp-sp-fld>
              </div>
              <ng-container *ngTemplateOutlet="bar; context: { $implicit: 'Save academic year' }" />
            }
            @case ('feeacct') {
              <div class="note tone-info">
                <rp-icon name="info" [size]="17" />
                <div class="grow">
                  The fee account is a merchant profile that receives tuition and other
                  institutional fees. Like any merchant, it's settled to the bank account below
                  every night, after the platform fee
                  <span class="srs" title="SRS reference">FR-INS-06</span>
                  <span class="srs" title="SRS reference">FR-SET-01</span>.
                </div>
              </div>
              <div class="c-form">
                <rp-sp-fld
                  fid="sp-fa-n"
                  label="Fee account name"
                  [req]="true"
                  [error]="feeErr('name')"
                  hint="Shown to parents on fee receipts"
                >
                  <input
                    id="sp-fa-n"
                    maxlength="40"
                    aria-describedby="sp-fa-n-e"
                    [value]="feeForm().name"
                    (input)="setFee('name', $event)"
                  />
                </rp-sp-fld>
                <div class="fld" [class.invalid]="!!feeErr('bank')">
                  <label class="fld-l" for="sp-fa-b-b">Bank<span class="req">*</span></label>
                  <rp-dd
                    inputId="sp-fa-b"
                    placeholder="Choose a bank"
                    [options]="banks"
                    [value]="feeForm().bank"
                    (changed)="setFeeValue('bank', $event)"
                  />
                  <div class="fld-e" id="sp-fa-b-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ feeErr('bank') }}</span>
                  </div>
                </div>
                <rp-sp-fld fid="sp-fa-i" label="IFSC" [req]="true" [error]="feeErr('ifsc')">
                  <input
                    id="sp-fa-i"
                    maxlength="11"
                    placeholder="e.g. SBIN0040123"
                    style="text-transform: uppercase"
                    aria-describedby="sp-fa-i-e"
                    [value]="feeForm().ifsc"
                    (input)="setFee('ifsc', $event)"
                  />
                </rp-sp-fld>
                <rp-sp-fld
                  fid="sp-fa-a"
                  label="Account number"
                  [req]="true"
                  [error]="feeErr('acct')"
                >
                  <input
                    id="sp-fa-a"
                    inputmode="numeric"
                    maxlength="18"
                    autocomplete="off"
                    aria-describedby="sp-fa-a-e"
                    [value]="feeForm().acct"
                    (input)="setFee('acct', $event, true)"
                  />
                </rp-sp-fld>
                <rp-sp-fld
                  fid="sp-fa-a2"
                  label="Confirm account number"
                  [req]="true"
                  [error]="feeErr('acct2')"
                >
                  <input
                    id="sp-fa-a2"
                    inputmode="numeric"
                    maxlength="18"
                    autocomplete="off"
                    aria-describedby="sp-fa-a2-e"
                    [value]="feeForm().acct2"
                    (input)="setFee('acct2', $event, true)"
                  />
                </rp-sp-fld>
              </div>
              <ng-container *ngTemplateOutlet="bar; context: { $implicit: 'Save fee account' }" />
            }
            @case ('branding') {
              <div class="sp-prev">
                <div class="sp-phone">
                  <div class="scr" style="--bc: #0c6f7d">
                    <div class="hd">
                      <span class="lg">
                        @if (logoUrl(); as url) {
                          <img
                            [src]="url"
                            alt=""
                            style="width: 100%; height: 100%; object-fit: cover"
                          />
                        } @else if (summary() === 'Logo uploaded') {
                          <rp-icon name="image" [size]="18" />
                        } @else {
                          {{ shortName().slice(0, 3) }}
                        }
                      </span>
                      <b>{{ session()?.institution?.name }}</b
                      ><small>Campus wallet · CampusOne</small>
                    </div>
                    <div class="bd"><i></i><i></i><i></i><i></i></div>
                  </div>
                </div>
                <div class="stack g16">
                  <div class="fld" [class.invalid]="!!logoError()">
                    <span class="fld-l">Logo or crest</span>
                    <label class="upl" [class.done]="!!logo()" for="sp-br-logo"
                      ><span class="upl-ic"
                        ><rp-icon [name]="logo() ? 'checkc' : 'upload'" [size]="20" /></span
                      ><span class="grow" style="min-width: 0"
                        ><span class="t-h4 t-clip" style="display: block">{{
                          logo()?.name ?? 'Choose a file'
                        }}</span
                        ><span class="t-xs t-muted">{{
                          logo()
                            ? size(logo()!.size) + ' · ready to save'
                            : 'PNG or JPG · square works best · up to 2 MB'
                        }}</span></span
                      ><input
                        type="file"
                        id="sp-br-logo"
                        accept="image/png,image/jpeg"
                        (change)="pickLogo($event)"
                    /></label>
                    <div class="fld-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ logoError() }}</span>
                    </div>
                  </div>
                  <div>
                    <span class="srs cr" title="Version 2.1 change request">CR-07</span>
                    <span class="t-xs t-muted">
                      Files over 2 MB are refused everywhere in CampusOne.</span
                    >
                  </div>
                </div>
              </div>
              <ng-container *ngTemplateOutlet="bar; context: { $implicit: 'Save branding' }" />
            }
            @case ('firstusers') {
              <div class="note tone-info">
                <rp-icon name="info" [size]="17" />
                <div class="grow">
                  Import students, parents and staff from a spreadsheet. They can sign in to the
                  CampusOne app as soon as you go live. Merchants are added one at a time from the
                  console, not by upload <span class="srs" title="SRS reference">BR-04</span>.
                </div>
              </div>
              <div class="c-grid k2" style="align-items: start">
                <rp-card title="Upload in the console" icon="sheet" [plainIcon]="true">
                  <div class="stack g10 t-sm">
                    <p style="line-height: 1.5">
                      The member spreadsheet is uploaded in the institution console, under Members ·
                      Onboard members, where every row is checked against your user types and
                      departments before anyone is added.
                    </p>
                    <div class="row g8 wrap">
                      <a
                        class="btn btn-sec btn-sm"
                        href="/console/onboard"
                        target="_blank"
                        rel="noopener"
                        ><rp-icon name="monitor" [size]="15" /><span>Open the console</span></a
                      >
                    </div>
                    @if (summary()) {
                      <p class="t-xs t-muted">{{ summary() }} so far.</p>
                    }
                  </div>
                </rp-card>
                <rp-card title="What the file needs" icon="filetext" [plainIcon]="true">
                  <ul class="sp-ul" style="font-size: 12.5px">
                    @for (t of fileNeeds; track t) {
                      <li>
                        <rp-icon name="check" [size]="13" [stroke]="2.4" /><span>{{ t }}</span>
                      </li>
                    }
                  </ul>
                </rp-card>
              </div>
              <ng-container
                *ngTemplateOutlet="bar; context: { $implicit: 'Confirm first users' }"
              />
            }
          }
        } @else {
          <div class="stack g12">
            <div class="sk" style="height: 52px; border-radius: 12px"></div>
            <div class="sk" style="height: 220px; border-radius: 16px"></div>
          </div>
        }
      </div>
    </div>

    <ng-template #bar let-label>
      <div class="sp-fnav">
        <button type="button" class="btn btn-ghost" (click)="go('/portal/onboard')">
          <rp-icon name="arrowl" [size]="17" /><span>Back to checklist</span>
        </button>
        <span class="grow"></span>
        <button
          type="button"
          class="btn btn-pri"
          id="sp-st-save"
          [class.is-busy]="busy()"
          (click)="save()"
        >
          <span>{{ label }}</span
          ><rp-icon name="arrowr" [size]="15" />
        </button>
      </div>
    </ng-template>
  `,
})
export class PortalStep {
  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);
  private readonly store = inject(PortalStore);
  protected readonly session = inject(PortalContext).session;

  protected readonly checklist = CHECKLIST;
  protected readonly groups = ['Money', 'Campus'] as const;
  protected readonly banks = BANKS.map((b) => ({ v: b, l: b }));
  protected readonly fileNeeds = [
    'Name, mobile, user type and department for everyone',
    'Admission number, class and section for students',
    "A parent's mobile for each student — a child without a phone uses the parent's",
    'User types and departments must already exist',
  ];

  protected readonly key = signal<StepKey>('toggles');
  protected readonly data = signal<Onboarding | null>(null);
  protected readonly details = signal<InstitutionDetails | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly info = computed(() => STEP[this.key()]);
  protected readonly def = computed(() => CHECKLIST.find((c) => c.k === this.key())!);
  protected readonly summary = computed(
    () => this.data()?.steps.find((s) => s.key === this.key())?.summary ?? '',
  );
  protected readonly plan = computed(() => this.store.account()?.billing.plan ?? null);
  protected readonly shortName = computed(() => this.session()?.institution.shortName ?? '');
  protected readonly fee = computed(() => feeText(this.plan()));
  protected readonly firstInvoice = computed(() => {
    const p = this.plan();
    if (!p) return '—';
    const price = paiseOf(p.price);
    return inr(price + gstOn(price, this.store.account()?.billing.billing.gstPercent ?? 18));
  });
  protected readonly statusText = computed(() => (this.store.shown() ?? 'Active').toLowerCase());

  // toggles
  protected readonly features = signal<Record<string, boolean>>({});
  protected readonly togglesError = signal('');
  // user types
  protected readonly types = signal<readonly TypeDraft[]>([]);
  protected readonly typeErrors = signal<Record<number, string>>({});
  protected readonly depDrafts = signal<Record<number, string>>({});
  protected readonly newType = signal('');
  protected readonly newTypeError = signal('');
  // year
  protected readonly year = signal(defaultYear());
  protected readonly yearErrors = signal<Record<string, string>>({});
  // fee account
  protected readonly feeForm = signal({ name: '', bank: '', ifsc: '', acct: '', acct2: '' });
  protected readonly feeErrors = signal<Record<string, string>>({});
  // branding
  protected readonly logo = signal<File | null>(null);
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly logoError = signal('');

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((p) => void this.enter(p.get('key') ?? ''));
    inject(DestroyRef).onDestroy(() => this.dropPreview());
  }

  /** Opening a step: its form starts from what was saved. */
  private async enter(raw: string) {
    const k = (raw in STEP ? raw : 'toggles') as StepKey;
    this.key.set(k);
    this.busy.set(false);
    this.togglesError.set('');
    this.typeErrors.set({});
    this.depDrafts.set({});
    this.newType.set('');
    this.newTypeError.set('');
    this.yearErrors.set({});
    this.feeErrors.set({});
    this.logo.set(null);
    this.logoError.set('');
    this.dropPreview();
    if (!this.store.account()) void this.store.refresh();
    try {
      const o = this.data() ?? (await this.api.onboarding());
      this.data.set(o);
      this.error.set('');
      this.prepare(k, o);
      if ((k === 'details' || k === 'bank') && !this.details()) {
        this.details.set(await this.api.details());
      }
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  private prepare(k: StepKey, o: Onboarding) {
    const summary = o.steps.find((s) => s.key === k)?.summary ?? '';
    if (k === 'toggles') {
      this.features.set(Object.fromEntries(o.features.map((f) => [f.key, f.enabled])));
    } else if (k === 'usertypes') {
      this.types.set(BASE_TYPES.map((t) => ({ ...t, depts: [...t.depts] })));
    } else if (k === 'year') {
      // The saved note reads "2026-27 · 2026-06-01 – 2027-03-31".
      const m = /^(\d{4}-\d{2}) · (\d{4}-\d{2}-\d{2}) – (\d{4}-\d{2}-\d{2})/.exec(summary);
      this.year.set(
        m ? { label: m[1]!.replace('-', '–'), start: m[2]!, end: m[3]! } : defaultYear(),
      );
    } else if (k === 'feeacct') {
      // The saved note reads "TVPS Fee Account · State Bank of India ••4567 · SBIN0040123".
      const m = /^(.*) · (.*) ••\d{4} · ([A-Z0-9]{11})$/.exec(summary);
      this.feeForm.set({
        name: m?.[1] ?? `${this.shortName()} Fee Account`,
        bank: m?.[2] ?? '',
        ifsc: m?.[3] ?? '',
        acct: '',
        acct2: '',
      });
    }
  }

  // --- view helpers -------------------------------------------------------------------------------
  protected isDone(k: StepKey) {
    return !!this.data()?.steps.find((s) => s.key === k)?.done;
  }
  protected title(k: StepKey) {
    return STEP[k].t;
  }
  protected tone(s: string) {
    return toneOf(s);
  }
  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected size(b: number) {
    return fmtSize(b);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected address(d: InstitutionDetails) {
    return [d.address, [d.city, d.pinCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  protected contact(c: PortalContact | null) {
    if (!c) return '—';
    return [c.name, c.email, c.mobile ? formatMobile(c.mobile) : null].filter(Boolean).join(' · ');
  }
  protected requested(d: InstitutionDetails) {
    return d.registeredAt ? formatDate(addDays(d.registeredAt.slice(0, 10), 1)) : '';
  }
  /** sp.ob.nudge: a note to the onboarding team. */
  protected nudge() {
    const id = this.session()?.institution.identifier ?? '';
    return `mailto:onboarding@campusone.example?subject=${encodeURIComponent(`Bank set-up update · ${id}`)}`;
  }
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
  protected open(k: StepKey) {
    void this.router.navigate(['/portal/step', k], { replaceUrl: true });
  }

  // --- toggles ------------------------------------------------------------------------------------
  protected featuresIn(o: Onboarding, g: 'Money' | 'Campus') {
    return o.features.filter((f) => f.group === g);
  }
  protected featureIcon(f: FeatureRow): IconName {
    if (f.lock?.kind === 'PLAN') return 'lock';
    return (f.module ? MOD_INFO[f.module]?.icon : null) ?? 'bulb';
  }
  protected featureOn(f: FeatureRow) {
    return f.lock?.kind === 'PLAN' ? false : (this.features()[f.key] ?? f.enabled);
  }
  protected featureLock(f: FeatureRow) {
    if (f.lock?.kind === 'PLAN') return f.lock.text;
    if (f.key === 'feeConsent' && !this.features()['tuition'])
      return 'Needs tuition-fee collection';
    return null;
  }
  protected flip(f: FeatureRow) {
    const on = !this.featureOn(f);
    const next = { ...this.features(), [f.key]: on };
    // Switching tuition off also switches off the fee consent that needs it.
    if (f.key === 'tuition' && !on) next['feeConsent'] = false;
    this.features.set(next);
    this.togglesError.set('');
  }

  // --- user types ---------------------------------------------------------------------------------
  protected setDep(ti: number, e: Event) {
    this.depDrafts.update((d) => ({ ...d, [ti]: this.value(e) }));
  }
  protected depKey(ti: number, e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const v = (this.depDrafts()[ti] ?? '').trim().replace(/,$/, '');
    if (!v) return;
    const t = this.types()[ti];
    if (!t) return;
    if (v.length < 2 || !PATTERNS.userTypeName.test(v)) {
      this.overlays.toast(translate('INS.DEPARTMENT_NAME_FORMAT', { name: v }), { tone: 'bad' });
      return;
    }
    if (t.depts.some((d) => d.toLowerCase() === v.toLowerCase())) {
      this.overlays.toast(translate('INS.DEPARTMENT_TAKEN', { name: v }), { tone: 'info' });
      return;
    }
    this.types.update((list) =>
      list.map((x, i) => (i === ti ? { ...x, depts: [...x.depts, v] } : x)),
    );
    this.depDrafts.update((d) => ({ ...d, [ti]: '' }));
    this.typeErrors.update((er) => {
      const next = { ...er };
      delete next[ti];
      return next;
    });
  }
  protected removeDep(ti: number, di: number) {
    this.types.update((list) =>
      list.map((x, i) => (i === ti ? { ...x, depts: x.depts.filter((_, j) => j !== di) } : x)),
    );
  }
  protected async removeType(ti: number) {
    const t = this.types()[ti];
    if (!t) return;
    const ok = await this.overlays.confirm({
      title: `Remove ${t.name}?`,
      text: 'Nobody is assigned to it yet, so nothing else changes.',
      ok: 'Remove',
      tone: 'warn',
    });
    if (!ok) return;
    this.types.update((list) => list.filter((_, i) => i !== ti));
    this.typeErrors.set({});
    this.depDrafts.set({});
  }
  protected addType() {
    const v = this.newType().trim();
    const err = !v
      ? translate('VALIDATION.REQUIRED')
      : v.length < 2 || !PATTERNS.userTypeName.test(v)
        ? translate('INS.USER_TYPE_NAME_FORMAT', { name: v })
        : this.types().some((t) => t.name.toLowerCase() === v.toLowerCase())
          ? translate('INS.USER_TYPE_TAKEN', { name: v })
          : '';
    this.newTypeError.set(err);
    if (err) return;
    const name = v.replace(/\b\w/g, (c) => c.toUpperCase());
    this.types.update((list) => [...list, { name, category: guessCategory(name), depts: [] }]);
    this.newType.set('');
    this.overlays.toast(`${name} added`, {
      sub: 'Now give it at least one department',
      tone: 'info',
    });
  }

  // --- year ---------------------------------------------------------------------------------------
  protected yearErr(k: string) {
    return this.yearErrors()[k] ?? '';
  }
  protected setYear(k: 'start' | 'end' | 'label', e: Event) {
    const v = this.value(e);
    this.year.update((y) => {
      const next = { ...y, [k]: v };
      // sp.yr.label: the label follows the dates.
      if (k !== 'label' && next.start && next.end) {
        const l = labelOf(next.start, next.end);
        if (l) next.label = l;
      }
      return next;
    });
    this.yearErrors.set({});
  }

  // --- fee account --------------------------------------------------------------------------------
  protected feeErr(k: string) {
    return this.feeErrors()[k] ?? '';
  }
  protected setFee(k: 'name' | 'ifsc' | 'acct' | 'acct2', e: Event, numeric = false) {
    const el = e.target as HTMLInputElement;
    if (numeric) el.value = el.value.replace(/\D/g, '');
    this.setFeeValue(k, el.value);
  }
  protected setFeeValue(k: 'name' | 'bank' | 'ifsc' | 'acct' | 'acct2', v: string) {
    this.feeForm.update((f) => ({ ...f, [k]: v }));
    const next = { ...this.feeErrors() };
    delete next[k];
    this.feeErrors.set(next);
  }

  // --- branding -----------------------------------------------------------------------------------
  protected pickLogo(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.logoError.set('');
    this.dropPreview();
    if (file && !['image/png', 'image/jpeg'].includes(file.type)) {
      this.logoError.set(translate('FILE.TYPE_NOT_ALLOWED'));
      this.logo.set(null);
    } else if (file && file.size > MAX_LOGO) {
      this.logoError.set(translate('FILE.TOO_LARGE', { limit: '2 MB' }));
      this.logo.set(null);
    } else {
      this.logo.set(file);
      if (file && typeof URL.createObjectURL === 'function') {
        this.logoUrl.set(URL.createObjectURL(file));
      }
    }
  }
  private dropPreview() {
    const url = this.logoUrl();
    if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    this.logoUrl.set(null);
  }

  // --- save (SAS-009) -----------------------------------------------------------------------------
  /** What the step sends, or null when the form has errors. */
  private input(k: StepKey): StepBody | null {
    switch (k) {
      case 'toggles': {
        const o = this.data()!;
        const state = this.features();
        if (state['feeConsent'] && !state['tuition']) {
          const tuition = o.features.find((f) => f.key === 'tuition');
          this.togglesError.set(
            translate('INS.FEATURE_NEEDS', { feature: tuition?.label ?? 'Tuition-fee collection' }),
          );
          return null;
        }
        const rows = [...o.features]
          .filter((f) => f.lock?.kind !== 'PLAN')
          .sort((a, b) => FEATURE_ORDER.indexOf(a.key) - FEATURE_ORDER.indexOf(b.key));
        const features: Record<string, boolean> = {};
        for (const f of rows) features[f.key] = state[f.key] ?? f.enabled;
        return { key: 'toggles', features };
      }
      case 'usertypes': {
        const errors: Record<number, string> = {};
        this.types().forEach((t, i) => {
          if (!t.depts.length) errors[i] = translate('INS.DEPARTMENT_REQUIRED');
        });
        this.typeErrors.set(errors);
        const n = Object.keys(errors).length;
        if (n) {
          this.overlays.toast('Every user type needs a department', {
            sub: `${n} to fix`,
            tone: 'bad',
          });
          return null;
        }
        return {
          key: 'usertypes',
          userTypes: this.types()
            .filter((t) => !t.fixed)
            .map((t) => ({ name: t.name, category: t.category, departments: [...t.depts] })),
        };
      }
      case 'year': {
        const y = this.year();
        const e: Record<string, string> = {};
        const req = translate('VALIDATION.REQUIRED');
        if (!y.start) e['start'] = req;
        if (!y.end) e['end'] = req;
        else if (y.start) {
          const min = addDays(y.start, 182);
          const max = addDays(y.start, 396);
          if (y.end < min || y.end > max) {
            e['end'] = translate('VALIDATION.RANGE', {
              min: formatDate(min),
              max: formatDate(max),
            });
          }
        }
        const label = y.label.trim().replace('–', '-');
        if (!label) e['label'] = req;
        else if (!/^\d{4}-\d{2}$/.test(label)) e['label'] = translate('VALIDATION.FORMAT');
        this.yearErrors.set(e);
        if (Object.keys(e).length) return null;
        return { key: 'year', label, startsOn: y.start, endsOn: y.end };
      }
      case 'feeacct': {
        const f = this.feeForm();
        const e: Record<string, string> = {};
        const req = translate('VALIDATION.REQUIRED');
        const name = f.name.trim();
        if (!name) e['name'] = req;
        else if (name.length < 3) e['name'] = translate('VALIDATION.FORMAT');
        if (!f.bank) e['bank'] = req;
        const ifsc = f.ifsc.trim().toUpperCase();
        if (!ifsc) e['ifsc'] = req;
        else if (!PATTERNS.ifsc.test(ifsc)) e['ifsc'] = translate('IDN.IFSC_INVALID');
        if (!f.acct) e['acct'] = req;
        else if (!/^\d{9,18}$/.test(f.acct)) e['acct'] = translate('VALIDATION.FORMAT');
        if (!f.acct2) e['acct2'] = req;
        else if (f.acct && f.acct2 !== f.acct)
          e['acct2'] = translate('IDN.ACCOUNT_NUMBER_MISMATCH');
        this.feeErrors.set(e);
        if (Object.keys(e).length) return null;
        return { key: 'feeacct', name, bank: f.bank, ifsc, accountNo: f.acct };
      }
      case 'branding': {
        // The logo itself is uploaded when the step is saved.
        return this.logoError() ? null : { key: 'branding' };
      }
      case 'firstusers':
        return { key: 'firstusers' };
      default:
        return null;
    }
  }

  protected async save() {
    if (this.busy()) return;
    const k = this.key();
    const o = this.data();
    if (!o) return;
    if (k === 'details' || k === 'plan' || k === 'bank') {
      // Done at sign-up or by CampusOne: move on.
      const nk = nextStep(o);
      if (nk) this.open(nk);
      else this.go('/portal/onboard');
      return;
    }
    const was = this.isDone(k);
    const body = this.input(k);
    if (!body) return;
    this.busy.set(true);
    try {
      const file = k === 'branding' ? this.logo() : null;
      const next = await this.api.step(
        file ? { key: 'branding', logoFileId: (await this.api.uploadLogo(file)).fileId } : body,
      );
      this.data.set(next);
      void this.store.refresh();
      const live = next.canGoLive && next.status === 'PENDING_ACTIVATION';
      this.overlays.toast(was ? 'Saved' : 'Step complete', {
        sub: `${next.done} of ${next.total} steps done${live ? ' · you can go live' : ''}`,
      });
      const nk = nextStep(next);
      if (nk && !was) this.open(nk);
      else this.go('/portal/onboard');
    } catch (e) {
      this.failed(k, e);
    } finally {
      this.busy.set(false);
    }
  }

  private failed(k: StepKey, e: unknown) {
    if (!(e instanceof ApiProblem)) {
      this.overlays.toast('Not saved', { sub: translate('GEN.UNAVAILABLE'), tone: 'bad' });
      return;
    }
    const byField = Object.fromEntries(e.errors.map((x) => [x.field, x.message]));
    if (k === 'year' && (e.errors.length || e.code.startsWith('ACA.'))) {
      this.yearErrors.set(
        e.errors.length
          ? {
              ...(byField['label'] ? { label: byField['label'] } : {}),
              ...(byField['startsOn'] ? { start: byField['startsOn'] } : {}),
              ...(byField['endsOn'] ? { end: byField['endsOn'] } : {}),
            }
          : { label: e.detail },
      );
      return;
    }
    if (k === 'feeacct' && e.errors.length) {
      this.feeErrors.set({
        ...(byField['name'] ? { name: byField['name'] } : {}),
        ...(byField['bank'] ? { bank: byField['bank'] } : {}),
        ...(byField['ifsc'] ? { ifsc: byField['ifsc'] } : {}),
        ...(byField['accountNo'] ? { acct: byField['accountNo'] } : {}),
      });
      return;
    }
    if (k === 'branding' && e.code.startsWith('FILE.')) {
      this.logoError.set(e.detail);
      return;
    }
    if (k === 'toggles' && e.code.startsWith('INS.')) {
      this.togglesError.set(e.detail);
      return;
    }
    this.overlays.toast('Not saved', { sub: e.detail, tone: 'bad' });
  }
}
