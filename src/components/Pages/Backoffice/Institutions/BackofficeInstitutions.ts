import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { AdminPasswordPanel, type ShownAdminPassword } from './AdminPasswordPanel';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import {
  formatDate,
  formatDateTime,
  formatInr,
  formatMobile,
  istBusinessDate,
  titleCase,
} from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { parseAmount } from '../../../Utils/money';
import { PATTERNS } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { cleanTyped, onlyDigits } from '../../../Utils/typing';
import {
  InstitutionsApi,
  type InstitutionDetail,
  type InstitutionRow,
  type LifecycleAction,
  type Plan,
  type PlanRequest,
} from './institutions.api';
import { copyText } from '../../../Utils/clipboard';
import { CorporateCodesPanel } from '../../Console/CorporateCodes/CorporateCodesPanel';
import { opsCodes } from '../../Console/CorporateCodes/corporate-codes.api';

type Shown = 'Active' | 'Trial' | 'Pending activation' | 'Suspended' | 'Cancelled';
const STATUS_ORDER: readonly Shown[] = [
  'Active',
  'Trial',
  'Pending activation',
  'Suspended',
  'Cancelled',
];
const TONE: Record<Shown, string> = {
  Active: 'ok',
  Trial: 'info',
  'Pending activation': 'warn',
  Suspended: 'bad',
  Cancelled: 'neutral',
};
const LABEL: Record<string, Shown> = {
  ACTIVE: 'Active',
  PENDING_ACTIVATION: 'Pending activation',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
};
const BOARDS = ['CBSE', 'ICSE', 'State', 'State PU', 'IB', 'Other'];

const EVENT: Record<string, { title: string; icon: IconName; state: string }> = {
  REGISTERED: { title: 'Registered', icon: 'check', state: 'done' },
  ACTIVATED: { title: 'Activated', icon: 'check', state: 'done' },
  SUSPENDED: { title: 'Suspended', icon: 'pause', state: 'bad' },
  REACTIVATED: { title: 'Reactivated', icon: 'check', state: 'done' },
  CANCELLED: { title: 'Cancelled', icon: 'x', state: 'bad' },
  PLAN_CHANGE: { title: 'Plan change', icon: 'layers', state: 'done' },
  PLAN_CHANGE_SCHEDULED: { title: 'Plan change at renewal', icon: 'layers', state: 'now' },
  PLAN_CHANGE_CANCELLED: { title: 'Scheduled plan change cancelled', icon: 'x', state: 'done' },
  TRIAL_STARTED: { title: 'Trial started', icon: 'hourglass', state: 'done' },
  GRACE_STARTED: { title: 'Grace period started', icon: 'hourglass', state: 'now' },
  GRACE_ENDED: { title: 'Grace period ended unpaid', icon: 'alert', state: 'bad' },
  STEP_COMPLETED: { title: 'Onboarding step completed', icon: 'check', state: 'done' },
};

const ACTION_UI: Record<LifecycleAction, { icon: IconName; kind: string }> = {
  START_TRIAL: { icon: 'hourglass', kind: 'btn-pri' },
  ACTIVATE: { icon: 'power', kind: 'btn-pri' },
  SUSPEND: { icon: 'pause', kind: 'btn-sec' },
  REACTIVATE: { icon: 'play', kind: 'btn-pri' },
  CANCEL: { icon: 'xc', kind: 'btn-danger-o' },
};

const ACTION_TEXT: Record<
  LifecycleAction,
  (name: string, plan: string, trialDays: number) => string
> = {
  START_TRIAL: (_n, plan, days) =>
    `A ${days}-day trial on ${plan} starts today. Members can use every entitled feature.`,
  ACTIVATE: (n) =>
    `Members can sign in, pay and be paid; tonight's scheduled processing includes ${n}. The first cycle is billed now as a Due invoice.`,
  SUSPEND: () =>
    "All member sign-ins and money movement stop immediately. Data is kept, scheduled processing pauses, and money arriving for the institution's wallets is held.",
  REACTIVATE: (n) => `Sign-ins, payments and scheduled processing resume for ${n}.`,
  CANCEL: () =>
    "Everything is blocked, balances are frozen and the data-retention clock starts. Cancellation can't be undone.",
};

const shownStatus = (status: string, subscription: string | null): Shown =>
  status === 'ACTIVE' && subscription === 'TRIAL' ? 'Trial' : (LABEL[status] ?? 'Active');

export interface InstTypeOption {
  readonly key: 'SCHOOL' | 'COLLEGE' | 'PU_COLLEGE' | 'INSTITUTE';
  readonly label: string;
  readonly sub: string;
  readonly icon: IconName;
}

export const INST_TYPES: readonly InstTypeOption[] = [
  { key: 'SCHOOL', label: 'School', sub: 'Pre-Primary, Primary & High School', icon: 'school' },
  { key: 'COLLEGE', label: 'Degree College / University', sub: 'B.Tech, B.Com, Science, MBA', icon: 'grad' },
  { key: 'PU_COLLEGE', label: 'Junior / PU College', sub: '11th & 12th / Intermediate', icon: 'building' },
  { key: 'INSTITUTE', label: 'Coaching / Academy', sub: 'Competitive Exams & Training', icon: 'bookopen' },
];

export const AFFILIATION_CONFIG: Record<string, { label: string; placeholder: string; options: readonly string[] }> = {
  SCHOOL: {
    label: 'School Board',
    placeholder: 'Select School Board',
    options: ['State Board', 'CBSE', 'ICSE', 'IB', 'Cambridge', 'Other'],
  },
  COLLEGE: {
    label: 'University / Affiliation',
    placeholder: 'Select University Affiliation',
    options: ['State University', 'Central University', 'Autonomous', 'Deemed University', 'Technical Board / DTE', 'Private University', 'Other'],
  },
  PU_COLLEGE: {
    label: 'State PU / Intermediate Board',
    placeholder: 'Select PU Board',
    options: ['State PU Board', 'State Board (HSC)', 'CBSE (XI-XII)', 'ISC (XI-XII)', 'Other'],
  },
  INSTITUTE: {
    label: 'Accreditation / Type',
    placeholder: 'Select Institute Type',
    options: ['Private / Autonomous', 'Govt. Recognized', 'Certification Partner', 'Other'],
  },
};

interface RegisterForm {
  name: string;
  address: string;
  city: string;
  institutionType: 'SCHOOL' | 'COLLEGE' | 'PU_COLLEGE' | 'INSTITUTE';
  board: string;
  pn: string;
  pe: string;
  pp: string;
  sn: string;
  se: string;
  sp: string;
  adm: string;
  /** The new administrator's name and mobile when the e-mail has no account (client 2026-10-07). */
  admn: string;
  admm: string;
  plan: string;
}
/** The form's mobile numbers: the contacts' and the administrator's. */
const MOBILES: ReadonlySet<keyof RegisterForm> = new Set(['pp', 'sp', 'admm']);
const EMPTY_FORM: RegisterForm = {
  name: '',
  address: '',
  city: '',
  institutionType: 'SCHOOL',
  board: 'State Board',
  pn: '',
  pe: '',
  pp: '',
  sn: '',
  se: '',
  sp: '',
  adm: '',
  admn: '',
  admm: '',
  plan: '',
};

/**
 * o.institutions — every tenant on the platform (SRS 7.4; FR-INS-01/02/05, FR-SAS-10/11; INS-001…006,
 * INS-036; prototype o.institutions): filters and status pills, the table, and a drawer with the
 * lifecycle actions, onboarding checklist, plan, contacts and history. Registration, the bank
 * arrangement and the plan before activation open as dialogs; every lifecycle change asks for a
 * recorded reason.
 */
@Component({
  selector: 'rp-backoffice-institutions',
  imports: [AdminPasswordPanel, Avatar, CorporateCodesPanel, Empty, Icon, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Institutions"
        sub="Every tenant on the platform — plan, onboarding progress and lifecycle state."
      >
        <button
          type="button"
          class="btn btn-pri"
          [disabled]="!can('inst.register')"
          (click)="openRegister()"
        >
          <rp-icon name="plus" [size]="17" /><span>Register institution</span>
        </button>
      </rp-page-head>
      @if (loading()) {
        <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
      } @else if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the institutions" [text]="error()" />
        </div>
      } @else {
        <div class="c-filters">
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              id="ob-iq"
              placeholder="Name, identifier or city"
              autocomplete="off"
              [value]="q()"
              (input)="q.set(value($event)); page.set(1)"
          /></label>
          <div class="fld">
            <div class="fld-in">
              <select
                id="ob-ipl"
                aria-label="Plan"
                (change)="planFilter.set(value($event)); page.set(1)"
              >
                <option value="">All plans</option>
                @for (p of plans(); track p.id) {
                  <option [value]="p.code" [selected]="planFilter() === p.code">
                    {{ p.name }}
                  </option>
                }
              </select>
            </div>
          </div>
          <span class="fsum">{{ plural(rows().length, 'institution') }}</span>
        </div>
        <div class="pills">
          <button
            type="button"
            class="pill"
            [class.on]="statusFilter() === 'All'"
            (click)="statusFilter.set('All'); page.set(1)"
          >
            All<span class="n">{{ all().length }}</span>
          </button>
          @for (s of statusOrder; track s) {
            <button
              type="button"
              class="pill"
              [class.on]="statusFilter() === s"
              (click)="statusFilter.set(s); page.set(1)"
            >
              {{ s }}<span class="n">{{ countOf(s) }}</span>
            </button>
          }
        </div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                @for (c of cols; track c.k) {
                  <th
                    class="sort"
                    [class.r]="c.r"
                    [class.asc]="sort().k === c.k && sort().dir === 'asc'"
                    [class.desc]="sort().k === c.k && sort().dir === 'desc'"
                    (click)="sortBy(c.k)"
                  >
                    {{ c.l
                    }}<span class="sa">{{
                      sort().k === c.k && sort().dir === 'desc' ? '↓' : '↑'
                    }}</span>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (i of shown(); track i.id) {
                <tr tabindex="0" (click)="openInst(i.id)" (keydown.enter)="openInst(i.id)">
                  <td>
                    <div class="cell-main">
                      <rp-av [name]="i.name" size="sm" [sq]="true" />
                      <div class="stack" style="gap: 1px; min-width: 0">
                        <div class="row g6" style="align-items: center">
                          <span class="cell-t t-clip">{{ i.name }}</span>
                          <span class="chip dot tone-info" style="font-size: 10.5px; padding: 1px 7px">{{ typeLabel(i.institutionType) }}</span>
                        </div>
                        <span class="cell-s t-mono">{{ i.identifier }}</span>
                      </div>
                    </div>
                  </td>
                  <td>{{ i.city }}</td>
                  <td>
                    @if (i.plan; as p) {
                      <div class="stack g4" style="gap: 1px">
                        <span class="cell-t">{{ p.name }}</span
                        ><span class="cell-s">{{ cycle(p.cycle) }}</span>
                      </div>
                    } @else {
                      <span class="t-muted">Not chosen</span>
                    }
                  </td>
                  <td>
                    <div class="stack" style="gap: 3px; align-items: flex-start">
                      <span class="chip dot" [class]="'tone-' + tone(rowStatus(i))">{{
                        rowStatus(i)
                      }}</span>
                      <span class="cell-s">{{ statusSub(i) }}</span>
                    </div>
                  </td>
                  <td class="r">{{ num(i.members) }}</td>
                  <td>
                    <div class="stack g4" style="min-width: 110px">
                      <span class="t-xs t-muted t-num"
                        >{{ i.checklist.done }} of {{ i.checklist.total }}</span
                      >
                      <div
                        class="bar"
                        [class.ok]="i.checklist.done === i.checklist.total"
                        [class.warn]="i.checklist.done !== i.checklist.total"
                      >
                        <i [style.width.%]="(100 * i.checklist.done) / i.checklist.total"></i>
                      </div>
                    </div>
                  </td>
                  <td>{{ date(i.registeredAt) }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7">
                    <rp-empty
                      icon="building"
                      title="No institutions match"
                      text="Clear the filters, or register a new institution."
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (rows().length > pageSize) {
          <div class="pager">
            <span
              >Showing
              <b class="t-num"
                >{{ (page() - 1) * pageSize + 1 }}–{{ min(page() * pageSize, rows().length) }}</b
              >
              of <b class="t-num">{{ rows().length }}</b></span
            >
            <div class="pg">
              <button
                type="button"
                [disabled]="page() <= 1"
                aria-label="Previous"
                (click)="page.set(page() - 1)"
              >
                <rp-icon name="left" [size]="14" />
              </button>
              @for (n of pages(); track n) {
                <button type="button" [class.on]="n === page()" (click)="page.set(n)">
                  {{ n }}
                </button>
              }
              <button
                type="button"
                [disabled]="page() >= pages().length"
                aria-label="Next"
                (click)="page.set(page() + 1)"
              >
                <rp-icon name="right" [size]="14" />
              </button>
            </div>
          </div>
        } @else if (rows().length) {
          <div class="pager">
            <span>{{ plural(rows().length, 'institution') }}</span>
          </div>
        }
        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            Only <b>Active</b> and <b>Trial</b> institutions accept member sign-ins, payments and
            scheduled processing. <b>Suspended</b> blocks sign-ins and money movement but keeps
            data; <b>Cancelled</b> freezes balances and starts the data-retention clock
            <span class="srs" title="SRS reference">FR-INS-05</span>
          </div>
        </div>
      }
    </div>

    @if (detail(); as d) {
      <rp-modal
        [title]="d.name"
        [sub]="d.identifier + ' · ' + d.city + ' · registered ' + date(d.registeredAt)"
        [drawer]="true"
        (closed)="detail.set(null)"
      >
        <div class="stack g16">
          <div class="row wrap g8">
            <span class="chip dot" [class]="'tone-' + tone(detailStatus(d))">{{
              detailStatus(d)
            }}</span>
            <span class="chip tone-accent">{{ typeLabel(d.institutionType) }}</span>
            @if (d.affiliation || d.board) {
              <span class="tag"><rp-icon name="award" [size]="12" />{{ d.affiliation ?? d.board }}</span>
            }
            <span class="tag"
              ><rp-icon name="layers" [size]="12" />{{ d.plan?.name ?? 'No plan yet' }}</span
            >
            <span class="tag"
              ><rp-icon name="bank" [size]="12" />{{
                d.corporateCode ? 'Corporate code ' + d.corporateCode : 'No corporate code yet'
              }}</span
            >
            <button
              type="button"
              class="btn btn-sec btn-sm"
              id="inst-codes"
              (click)="codesFor.set(d)"
            >
              <rp-icon name="bank" [size]="14" /><span>Codes &amp; classes</span>
            </button>
            <span class="grow"></span>
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-icon"
              title="Copy identifier"
              aria-label="Copy identifier"
              (click)="copy(d.identifier)"
            >
              <rp-icon name="copy" [size]="15" />
            </button>
          </div>
          @switch (d.status) {
            @case ('SUSPENDED') {
              <div class="note tone-bad">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">
                  Suspended {{ dt(d.suspendedAt) }}. Member sign-ins and money movement are blocked;
                  data is kept.
                </div>
              </div>
            }
            @case ('CANCELLED') {
              <div class="note tone-neutral">
                <rp-icon name="lock" [size]="17" />
                <div class="grow">
                  Cancelled {{ dt(d.cancelledAt) }}. Everything is blocked and balances are frozen.
                  The data-retention clock started on that date; the retention period is still to be
                  set <span class="srs" title="SRS reference">OQ-30</span>. Cancellation is final.
                </div>
              </div>
            }
            @case ('PENDING_ACTIVATION') {
              <div class="note" [class]="d.missing.length ? 'tone-warn' : 'tone-ok'">
                <rp-icon [name]="d.missing.length ? 'alert' : 'checkc'" [size]="17" />
                <div class="grow">{{ pendingNote(d) }}</div>
              </div>
            }
            @default {
              @if (detailStatus(d) === 'Trial') {
                <div class="note tone-info">
                  <rp-icon name="info" [size]="17" />
                  <div class="grow">
                    Trial on {{ d.plan?.name }} until {{ date(d.subscription?.trialEndsOn ?? '') }}.
                    Activate once the first invoice is paid.
                  </div>
                </div>
              }
            }
          }
          @if (d.actions.length) {
            <div class="fs">
              <h4>
                <rp-icon name="power" [size]="15" /> Lifecycle
                <span class="srs" title="SRS reference">FR-INS-05</span>
              </h4>
              <div class="fs-b">
                <div class="row wrap g8">
                  @for (a of d.actions; track a.action) {
                    <button
                      type="button"
                      class="btn btn-sm"
                      [class]="'btn btn-sm ' + actionUi[a.action].kind"
                      [disabled]="!can('inst.lifecycle') || a.blocked"
                      [attr.title]="
                        !can('inst.lifecycle')
                          ? noTask
                          : a.blocked
                            ? 'Complete the required onboarding steps first'
                            : null
                      "
                      (click)="lifecycle(d, a.action, a.label)"
                    >
                      <rp-icon [name]="actionUi[a.action].icon" [size]="15" /><span>{{
                        a.label
                      }}</span>
                    </button>
                  }
                </div>
                <p class="t-xs t-muted mt8">
                  Every change asks for a reason, is recorded with you as the actor, and is e-mailed
                  to the institution's contacts.
                  <span class="srs" title="SRS reference">FR-SAS-11</span>
                </p>
              </div>
            </div>
          }
          <div class="c-grid k2">
            <div class="fs">
              <h4>
                <rp-icon name="clipcheck" [size]="15" /> Onboarding checklist
                <span class="grow"></span
                ><span class="t-xs t-muted t-num"
                  >{{ doneCount(d) }} of {{ d.checklist.length }}</span
                >
              </h4>
              <div class="fs-b" style="padding-top: 4px">
                <div
                  class="bar"
                  [class.ok]="doneCount(d) === d.checklist.length"
                  [class.warn]="doneCount(d) !== d.checklist.length"
                >
                  <i [style.width.%]="(100 * doneCount(d)) / d.checklist.length"></i>
                </div>
                @for (c of d.checklist; track c.key) {
                  <div class="ob-check" [class.done]="c.done">
                    <span class="ob-cbox"
                      ><rp-icon [name]="c.done ? 'check' : 'circle'" [size]="13"
                    /></span>
                    <span class="grow"
                      ><b>{{ c.label }}</b
                      >{{ c.required ? '' : ' ' }}
                      @if (!c.required) {
                        <span class="t-faint">(optional)</span>
                      }
                      <span class="t-xs t-muted" style="display: block"
                        >{{ c.owner }} · {{ c.ref }}</span
                      ></span
                    >
                    @if (!c.done && d.status !== 'CANCELLED') {
                      <button
                        type="button"
                        class="btn btn-soft btn-xs"
                        [disabled]="!can('inst.register')"
                        (click)="
                          c.key === 'bank'
                            ? openBank(d)
                            : c.key === 'plan'
                              ? openPlan(d)
                              : markDone(d, c.key, c.label, c.owner)
                        "
                      >
                        <span>{{
                          c.key === 'bank' || c.key === 'plan' ? 'Set up' : 'Mark done'
                        }}</span>
                      </button>
                    }
                  </div>
                }
              </div>
            </div>
            <div class="stack g16">
              <div class="fs">
                <h4><rp-icon name="layers" [size]="15" /> Plan</h4>
                <div class="fs-b">
                  <dl class="kv">
                    <dt>Plan</dt>
                    <dd>{{ d.plan?.name ?? '—' }}</dd>
                    <dt>Billing cycle</dt>
                    <dd>{{ d.plan ? cycle(d.plan.cycle) : '—' }}</dd>
                    <dt>Price</dt>
                    <dd>{{ d.plan ? price(d.plan) : '—' }}</dd>
                    <dt>Renewal</dt>
                    <dd>{{ d.subscription?.renewsOn ? date(d.subscription!.renewsOn!) : '—' }}</dd>
                    @if (d.subscription?.trialEndsOn) {
                      <dt>Trial ends</dt>
                      <dd>{{ date(d.subscription!.trialEndsOn!) }}</dd>
                    }
                    @if (d.subscription?.scheduledChange; as sc) {
                      <dt>At renewal</dt>
                      <dd>
                        Moves to <b>{{ sc.plan }}</b> on {{ date(sc.on) }}
                        @if (can('inst.lifecycle')) {
                          ·
                          <button type="button" class="linkbtn" (click)="cancelScheduled(d)">
                            Cancel
                          </button>
                        }
                      </dd>
                    }
                    <dt>Platform fee</dt>
                    <dd>{{ feeText(d.plan) }}</dd>
                  </dl>
                  @for (r of pendingRequests(d); track r.id) {
                    <div class="note tone-info mt12">
                      <rp-icon name="layers" [size]="17" />
                      <div class="grow">
                        <b>Plan change requested: {{ r.plan.name }}</b> ·
                        {{
                          r.timing === 'NOW' ? 'straight away (prorated)' : 'at the next renewal'
                        }}
                        <span class="t-xs t-muted" style="display: block"
                          >{{ r.requestedBy ?? 'Institution' }} · {{ dt(r.requestedAt)
                          }}{{ r.note ? ' · ' + r.note : '' }}</span
                        >
                      </div>
                      @if (can('inst.lifecycle')) {
                        <button
                          type="button"
                          class="btn btn-soft btn-sm"
                          (click)="applyRequest(d, r)"
                        >
                          <span>Apply</span>
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost btn-sm"
                          (click)="declineRequest(d, r)"
                        >
                          <span>Decline</span>
                        </button>
                      }
                    </div>
                  }
                  <div class="mt12">
                    <button
                      type="button"
                      class="btn btn-sec btn-sm"
                      [disabled]="!canChoosePlan(d)"
                      [attr.title]="canChoosePlan(d) ? null : planLockText(d)"
                      (click)="openPlan(d)"
                    >
                      <rp-icon name="layers" [size]="15" /><span>Change plan</span>
                    </button>
                    {{ ' ' }}
                    <button type="button" class="btn btn-ghost btn-sm" (click)="toFeatures(d.id)">
                      <rp-icon name="toggle" [size]="15" /><span>Feature permissions</span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="fs">
                <h4><rp-icon name="users" [size]="15" /> Contacts</h4>
                <div class="fs-b">
                  <dl class="kv">
                    <dt>Primary</dt>
                    <dd>
                      @if (d.contacts.primary; as c) {
                        <b>{{ c.name }}</b
                        ><span class="t-xs t-muted" style="display: block"
                          >{{ c.email }} · {{ mobile(c.mobile) }}</span
                        >
                      } @else {
                        <span class="t-muted">Not given</span>
                      }
                    </dd>
                    <dt>Secondary</dt>
                    <dd>
                      @if (d.contacts.secondary; as c) {
                        <b>{{ c.name }}</b
                        ><span class="t-xs t-muted" style="display: block"
                          >{{ c.email }} · {{ mobile(c.mobile) }}</span
                        >
                      } @else {
                        <span class="t-muted">Not given</span>
                      }
                    </dd>
                    <dt>Administrator</dt>
                    <dd>
                      @if (d.administrator?.email) {
                        <span class="t-mono">{{ d.administrator!.email }}</span>
                        @if (d.administrator!.pending) {
                          <span class="t-xs t-muted" style="display: block"
                            >Waiting for the administrator's CampusOne account — they create it on the
                            customer site with this e-mail</span
                          >
                        }
                      } @else {
                        <span class="t-faint">—</span>
                      }
                    </dd>
                    <dt>Address</dt>
                    <dd>{{ d.address }}</dd>
                    <dt>Members</dt>
                    <dd>{{ num(d.members) }}</dd>
                    <dt>Pool account</dt>
                    <dd>
                      @if (d.poolAccountRef) {
                        <span class="t-mono">{{ d.poolAccountRef }}</span>
                      } @else {
                        <span class="t-muted">Not set</span>
                      }
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          <div class="fs">
            <h4>
              <rp-icon name="history" [size]="15" /> Lifecycle history
              <span class="srs" title="SRS reference">FR-SAS-11</span>
            </h4>
            <div class="fs-b">
              <div class="tl">
                @for (h of d.history; track $index) {
                  <div class="tl-i" [class]="'tl-i ' + event(h.action).state">
                    <span class="tl-dot"
                      ><rp-icon [name]="event(h.action).icon" [size]="13"
                    /></span>
                    <div class="tl-c">
                      <div class="tl-t">{{ historyTitle(h) }}</div>
                      <div class="tl-s">
                        {{ dt(h.at) }} · {{ name(h.by) }}{{ h.reason ? ' — ' + h.reason : '' }}
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </rp-modal>
    }

    @if (adminPassword(); as pw) {
      <rp-admin-password-panel [shown]="pw" (closed)="adminPassword.set(null)" />
    }
    @if (registering()) {
      <rp-modal
        title="Register an institution"
        sub="Name and address together must be unique. The administrator needs an existing CampusOne account that isn't in any institution."
        [narrow]="false"
        (closed)="registering.set(false)"
      >
        <div class="stack g16">
          <div class="c-form">
            <div class="fld full">
              <label class="fld-l">Institution type<span class="req">*</span></label>
              <div class="inst-type-grid">
                @for (it of instTypes; track it.key) {
                  <button
                    type="button"
                    class="inst-type-card"
                    [class.on]="form().institutionType === it.key"
                    (click)="setType(it.key)"
                  >
                    <span class="it-ic"><rp-icon [name]="it.icon" [size]="20" /></span>
                    <div style="min-width: 0">
                      <div class="it-title">{{ it.label }}</div>
                      <div class="it-sub">{{ it.sub }}</div>
                    </div>
                  </button>
                }
              </div>
            </div>
            <div class="fld full" [class.invalid]="err('name')">
              <label class="fld-l" for="ob-n-name"
                >{{ form().institutionType === 'COLLEGE' ? 'College / University name' : form().institutionType === 'PU_COLLEGE' ? 'Junior College name' : form().institutionType === 'INSTITUTE' ? 'Institute / Academy name' : 'School name' }}<span class="req">*</span></label
              >
              <div class="fld-in">
                <input
                  id="ob-n-name"
                  maxlength="80"
                  [placeholder]="namePlaceholder()"
                  [value]="form().name"
                  (input)="set('name', $event)"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
              </div>
            </div>
            <div class="fld full" [class.invalid]="err('address')">
              <label class="fld-l" for="ob-n-addr">Address<span class="req">*</span></label>
              <div class="fld-in">
                <textarea
                  id="ob-n-addr"
                  rows="2"
                  placeholder="Street, locality, town, PIN code"
                  [value]="form().address"
                  (input)="set('address', $event)"
                ></textarea>
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('address') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('city')">
              <label class="fld-l" for="ob-n-city">City or town<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="ob-n-city"
                  placeholder="e.g. Nagpur"
                  [value]="form().city"
                  (input)="set('city', $event)"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('city') }}</span>
              </div>
            </div>
            <div class="fld">
              <label class="fld-l" for="ob-n-board">{{ currentAffiliationConfig().label }}</label>
              <div class="fld-in">
                <select id="ob-n-board" (change)="set('board', $event)">
                  @for (b of currentAffiliationConfig().options; track b) {
                    <option [value]="b" [selected]="form().board === b">{{ b }}</option>
                  }
                </select>
              </div>
            </div>
          </div>
          @for (who of contactKinds; track who.k) {
            <div class="fs">
              <h4>
                <rp-icon name="user" [size]="15" /> {{ who.title }}
                @if (!who.req) {
                  <span class="t-faint" style="font-weight: 500">(optional)</span>
                }
              </h4>
              <div class="fs-b c-form c3">
                @for (f of who.fields; track f.k) {
                  <div class="fld" [class.invalid]="err(f.k)">
                    <label class="fld-l" [for]="'ob-n-' + f.k"
                      >{{ f.l }}
                      @if (who.req) {
                        <span class="req">*</span>
                      }
                    </label>
                    <div class="fld-in">
                      <input
                        [id]="'ob-n-' + f.k"
                        [type]="f.type"
                        [attr.inputmode]="f.k.endsWith('p') ? 'numeric' : null"
                        [attr.maxlength]="f.k.endsWith('p') ? 10 : null"
                        [value]="form()[f.k]"
                        (input)="set(f.k, $event)"
                      />
                    </div>
                    <div class="fld-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err(f.k) }}</span>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
          <div class="c-form">
            <div class="fld" [class.invalid]="err('adm')">
              <label class="fld-l" for="ob-n-adm"
                >Administrator's e-mail<span class="req">*</span></label
              >
              <div class="fld-in">
                <input
                  id="ob-n-adm"
                  type="email"
                  [value]="form().adm"
                  (input)="set('adm', $event)"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('adm') }}</span>
              </div>
              <div class="fld-h">
                An existing CampusOne account that isn't in any institution, or a new e-mail. For a new
                e-mail CampusOne creates the account and shows its temporary password once.
              </div>
            </div>
            <div class="fld" [class.invalid]="err('admn')">
              <label class="fld-l" for="ob-n-admn">Administrator's name</label>
              <div class="fld-in">
                <input
                  id="ob-n-admn"
                  maxlength="60"
                  [value]="form().admn"
                  (input)="set('admn', $event)"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('admn') }}</span>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('admm')">
              <label class="fld-l" for="ob-n-admm">Administrator's mobile</label>
              <div class="fld-in">
                <input
                  id="ob-n-admm"
                  inputmode="numeric"
                  maxlength="10"
                  [value]="form().admm"
                  (input)="set('admm', $event)"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('admm') }}</span>
              </div>
              <div class="fld-h">
                Only for a new e-mail. Leave both empty when the administrator is the primary
                contact.
              </div>
            </div>
            <div class="fld">
              <label class="fld-l" for="ob-n-plan">Plan (can be chosen later)</label>
              <div class="fld-in">
                <select id="ob-n-plan" (change)="set('plan', $event)">
                  <option value="">Choose later</option>
                  @for (p of plans(); track p.id) {
                    <option [value]="p.id" [selected]="form().plan === p.id">
                      {{ p.name }} · {{ inr0(p) }} / {{ per(p) }}
                    </option>
                  }
                </select>
              </div>
            </div>
          </div>
          @if (formError()) {
            <div class="note tone-bad">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ formError() }}</div>
            </div>
          }
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="registering.set(false)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="register()">
            <rp-icon name="check" [size]="17" /><span>Register institution</span>
          </button>
        </ng-container>
      </rp-modal>
    }

    @if (codesFor(); as d) {
      <rp-modal
        title="Corporate codes and classes"
        [sub]="d.name + ' · each class can collect into its own bank account'"
        icon="bank"
        [drawer]="true"
        [wide]="true"
        [foot]="false"
        (closed)="codesFor.set(null)"
      >
        <div class="stack g12" id="inst-codes-panel">
          <rp-corporate-codes [base]="codesBase(d.id)" />
        </div>
      </rp-modal>
    }

    @if (bankFor(); as d) {
      <rp-modal
        title="Bank corporate code and pool account"
        [sub]="
          d.name +
          ' · the school’s default corporate code: it starts the VANs of everyone a class code doesn’t cover'
        "
        (closed)="bankFor.set(null)"
      >
        <div class="stack g12">
          <div class="fld" [class.invalid]="err('cc')">
            <label class="fld-l" for="ob-cc">Corporate code<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ob-cc"
                maxlength="10"
                placeholder="e.g. RPHH"
                [value]="bank().cc"
                (input)="bank.set({ cc: value($event).toUpperCase(), pool: bank().pool })"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('cc') }}</span>
            </div>
            <div class="fld-h">
              Up to 10 capital letters or digits, unique across institutions. More codes, and the
              classes each serves: Codes &amp; classes.
            </div>
          </div>
          <div class="fld" [class.invalid]="err('pool')">
            <label class="fld-l" for="ob-pool"
              >Pool account reference<span class="req">*</span></label
            >
            <div class="fld-in">
              <input
                id="ob-pool"
                placeholder="e.g. POOLHHS0134"
                [value]="bank().pool"
                (input)="bank.set({ cc: bank().cc, pool: value($event) })"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('pool') }}</span>
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="bankFor.set(null)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="saveBank(d)">
            <span>Save and mark done</span>
          </button>
        </ng-container>
      </rp-modal>
    }

    @if (planFor(); as d) {
      <rp-modal title="Change plan" [sub]="planSub(d)" (closed)="planFor.set(null)">
        <div class="stack g8">
          @for (p of plans(); track p.id) {
            <div
              class="choice"
              [class.on]="planChoice() === p.id"
              tabindex="0"
              role="radio"
              [attr.aria-checked]="planChoice() === p.id"
              (click)="planChoice.set(p.id)"
              (keydown.enter)="planChoice.set(p.id)"
            >
              <span class="grow"
                ><span class="t-h4" style="display: block">{{ p.name }}</span
                ><span class="t-sm t-muted" style="display: block; margin-top: 1px"
                  >{{ price(p) }} · {{ p.modules.length }} modules</span
                ></span
              ><span class="radio"></span>
            </div>
          }
          <div class="fld" [class.invalid]="err('pr')">
            <label class="fld-l" for="ob-pr">Reason<span class="req">*</span></label>
            <div class="fld-in">
              <textarea
                id="ob-pr"
                rows="2"
                placeholder="e.g. Transport module needed for the new buses"
                [value]="planReason()"
                (input)="planReason.set(value($event))"
              ></textarea>
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('pr') }}</span>
            </div>
          </div>
          @if (running(d)) {
            @if (d.subscription?.status === 'TRIAL') {
              <p class="t-xs t-muted">
                During the trial the plan changes at once and nothing is billed.
              </p>
            } @else {
              <div class="fld">
                <span class="fld-l">When<span class="req">*</span></span>
                <div class="seg" role="radiogroup" aria-label="When">
                  <span
                    class="seg-ind"
                    [style.width]="'calc((100% - 8px) / 2)'"
                    [style.left]="
                      'calc(3px + ' +
                      (planTiming() === 'RENEWAL' || !upgrade(d) ? 1 : 0) +
                      ' * ((100% - 8px) / 2 + 2px))'
                    "
                  ></span>
                  <button
                    type="button"
                    role="radio"
                    [class.on]="planTiming() === 'NOW'"
                    [attr.aria-checked]="planTiming() === 'NOW'"
                    [disabled]="!upgrade(d)"
                    (click)="planTiming.set('NOW')"
                  >
                    Straight away (prorated)
                  </button>
                  <button
                    type="button"
                    role="radio"
                    [class.on]="planTiming() === 'RENEWAL' || !upgrade(d)"
                    [attr.aria-checked]="planTiming() === 'RENEWAL' || !upgrade(d)"
                    (click)="planTiming.set('RENEWAL')"
                  >
                    At the next renewal
                  </button>
                </div>
              </div>
              <div class="note tone-info">
                <rp-icon name="receipt" [size]="17" />
                <div class="grow">{{ planPreview(d) }}</div>
              </div>
            }
            <p class="t-xs t-muted">
              An upgrade is billed now, prorated for the rest of the cycle; a downgrade takes effect
              at renewal and switches off features the new plan doesn't include (FR-SAS-07).
            </p>
          } @else {
            <p class="t-xs t-muted">
              Before activation the plan changes without billing; features the new plan doesn't
              include are switched off (FR-SAS-07).
            </p>
          }
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="planFor.set(null)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="savePlan(d)">
            <span>Change plan</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  `,
})
export class BackofficeInstitutions {
  private readonly api = inject(InstitutionsApi);
  private readonly overlays = inject(Overlays);
  private readonly router = inject(Router);
  private readonly session = inject(SessionContext).ops;

  protected readonly statusOrder = STATUS_ORDER;
  protected readonly boards = BOARDS;
  protected readonly instTypes = INST_TYPES;
  protected readonly affiliationConfig = AFFILIATION_CONFIG;

  protected setType(type: 'SCHOOL' | 'COLLEGE' | 'PU_COLLEGE' | 'INSTITUTE') {
    const config = AFFILIATION_CONFIG[type] ?? AFFILIATION_CONFIG['SCHOOL']!;
    const defaultBoard = config.options[0] ?? 'State Board';
    this.form.set({ ...this.form(), institutionType: type, board: defaultBoard });
  }

  protected currentAffiliationConfig() {
    return AFFILIATION_CONFIG[this.form().institutionType] ?? AFFILIATION_CONFIG['SCHOOL']!;
  }

  protected namePlaceholder() {
    const t = this.form().institutionType;
    if (t === 'COLLEGE') return 'e.g. St. Xavier’s College of Engineering & Technology';
    if (t === 'PU_COLLEGE') return 'e.g. Sunrise Junior College of Science & Commerce';
    if (t === 'INSTITUTE') return 'e.g. Apex Academy for Competitive Exams';
    return 'e.g. Hosanagara Public School';
  }

  protected typeLabel(t?: string) {
    if (t === 'COLLEGE') return 'College / University';
    if (t === 'PU_COLLEGE') return 'Junior / PU College';
    if (t === 'INSTITUTE') return 'Institute';
    return 'School';
  }
  protected readonly actionUi = ACTION_UI;
  protected readonly noTask =
    'Your role doesn’t hold this sub-task. Ask a Platform Administrator in Roles & tasks.';
  protected readonly pageSize = 12;
  protected readonly cols = [
    { k: 'name', l: 'Institution', r: false },
    { k: 'city', l: 'City', r: false },
    { k: 'plan', l: 'Plan', r: false },
    { k: 'status', l: 'Status', r: false },
    { k: 'members', l: 'Members', r: true },
    { k: 'onb', l: 'Onboarding', r: false },
    { k: 'since', l: 'Registered', r: false },
  ] as const;
  protected readonly contactKinds = [
    {
      k: 'p',
      title: 'Primary contact',
      req: true,
      fields: [
        { k: 'pn', l: 'Name', type: 'text' },
        { k: 'pe', l: 'E-mail', type: 'email' },
        { k: 'pp', l: 'Mobile', type: 'text' },
      ],
    },
    {
      k: 's',
      title: 'Secondary contact',
      req: false,
      fields: [
        { k: 'sn', l: 'Name', type: 'text' },
        { k: 'se', l: 'E-mail', type: 'email' },
        { k: 'sp', l: 'Mobile', type: 'text' },
      ],
    },
  ] as const;

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly all = signal<readonly InstitutionRow[]>([]);
  protected readonly plans = signal<readonly Plan[]>([]);
  protected readonly q = signal('');
  protected readonly planFilter = signal('');
  protected readonly statusFilter = signal<'All' | Shown>('All');
  protected readonly sort = signal<{ k: string; dir: 'asc' | 'desc' }>({ k: '', dir: 'asc' });
  protected readonly page = signal(1);

  protected readonly detail = signal<InstitutionDetail | null>(null);
  protected readonly registering = signal(false);
  /** The new administrator's temporary password, until the operator confirms it is noted. */
  protected readonly adminPassword = signal<ShownAdminPassword | null>(null);
  protected readonly form = signal<RegisterForm>({ ...EMPTY_FORM });
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly bankFor = signal<InstitutionDetail | null>(null);
  /** The school whose corporate codes are open (client 2026-10-14). */
  protected readonly codesFor = signal<InstitutionDetail | null>(null);
  protected codesBase(id: string) {
    return opsCodes(id);
  }
  protected readonly bank = signal({ cc: '', pool: '' });
  protected readonly planFor = signal<InstitutionDetail | null>(null);
  protected readonly planTiming = signal<'NOW' | 'RENEWAL'>('NOW');
  protected readonly planChoice = signal('');
  protected readonly planReason = signal('');

  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const f = this.statusFilter();
    const rows = this.all().filter(
      (i) =>
        (f === 'All' || this.rowStatus(i) === f) &&
        (!this.planFilter() || i.plan?.code === this.planFilter()) &&
        (!q ||
          [i.name, i.identifier, i.city, i.shortName].some((x) => x.toLowerCase().includes(q))),
    );
    const s = this.sort();
    if (!s.k) return rows;
    const val = (i: InstitutionRow): string | number =>
      s.k === 'name'
        ? i.name
        : s.k === 'city'
          ? i.city
          : s.k === 'plan'
            ? (i.plan?.name ?? '')
            : s.k === 'status'
              ? this.rowStatus(i)
              : s.k === 'members'
                ? i.members
                : s.k === 'onb'
                  ? i.checklist.done
                  : +new Date(i.registeredAt);
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const r =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -r : r;
    });
  });
  protected readonly pages = computed(() =>
    Array.from(
      { length: Math.max(1, Math.ceil(this.rows().length / this.pageSize)) },
      (_, i) => i + 1,
    ),
  );
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize),
  );

  constructor() {
    void this.load();
    const open = inject(ActivatedRoute).snapshot.queryParamMap.get('open');
    if (open) void this.openInst(open);
  }

  protected can(subTask: string) {
    return this.session()?.subTasks.includes(subTask) ?? false;
  }

  private async load() {
    try {
      const [list, plans] = await Promise.all([this.api.list(), this.api.plans()]);
      // Registration order, as the prototype lists its tenants.
      this.all.set([...list.items].reverse());
      this.plans.set(plans.items);
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.loading.set(false);
    }
  }

  // --- formatting ----------------------------------------------------------------------------------
  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected date(v: string) {
    return v ? formatDate(v) : '—';
  }
  protected dt(v: string | null) {
    return v ? formatDateTime(v) : '';
  }
  protected num(n: number) {
    return new Intl.NumberFormat('en-IN').format(n);
  }
  protected min(a: number, b: number) {
    return Math.min(a, b);
  }
  protected name(n: string) {
    return titleCase(n);
  }
  protected mobile(m: string | null) {
    return m ? formatMobile(m) : '';
  }
  protected plural(n: number, noun: string) {
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
  }
  protected cycle(c: 'MONTHLY' | 'ANNUAL') {
    return c === 'MONTHLY' ? 'Monthly' : 'Annual';
  }
  protected per(p: Plan) {
    return p.cycle === 'MONTHLY' ? 'month' : 'year';
  }
  protected price(p: Plan) {
    return `${formatInr(parseAmount(p.price.amount))} / ${this.per(p)}`;
  }
  protected inr0(p: Plan) {
    return formatInr(parseAmount(p.price.amount)).replace(/\.00$/, '');
  }
  protected tone(s: Shown) {
    return TONE[s];
  }
  protected rowStatus(i: InstitutionRow): Shown {
    return shownStatus(i.status, i.subscriptionStatus);
  }
  protected detailStatus(d: InstitutionDetail): Shown {
    return shownStatus(d.status, d.subscription?.status ?? null);
  }
  protected countOf(s: Shown) {
    return this.all().filter((i) => this.rowStatus(i) === s).length;
  }
  protected statusSub(i: InstitutionRow) {
    const s = this.rowStatus(i);
    if (s === 'Trial' && i.trialEndsOn) return `ends ${formatDate(i.trialEndsOn)}`;
    if ((s === 'Suspended' || s === 'Cancelled') && i.statusSince) {
      return s === 'Suspended' ? `since ${formatDate(i.statusSince)}` : formatDate(i.statusSince);
    }
    return '';
  }
  protected sortBy(k: string) {
    const s = this.sort();
    this.sort.set({ k, dir: s.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected doneCount(d: InstitutionDetail) {
    return d.checklist.filter((c) => c.done).length;
  }
  protected pendingNote(d: InstitutionDetail) {
    const n = d.missing.length;
    return n
      ? `Activation needs ${n} more required step${n > 1 ? 's' : ''}: ${d.missing.map((m) => m.toLowerCase()).join(', ')}.`
      : 'Every required onboarding step is complete — the institution can be activated or start a trial.';
  }
  protected event(action: string) {
    return EVENT[action] ?? { title: action, icon: 'check' as IconName, state: 'done' };
  }
  protected historyTitle(h: InstitutionDetail['history'][number]) {
    if (h.action === 'STEP_COMPLETED') return `Onboarding step completed: ${h.step ?? ''}`;
    const t = this.event(h.action).title;
    const label = (x: string | null) => (x ? (LABEL[x] ?? x) : x);
    return h.to && h.from && h.from !== h.to ? `${t} · ${label(h.from)} → ${label(h.to)}` : t;
  }
  /** The subscription period has started and the institution is Active (SAS-034). */
  protected running(d: InstitutionDetail) {
    return (
      d.status === 'ACTIVE' && ['TRIAL', 'ACTIVE', 'GRACE'].includes(d.subscription?.status ?? '')
    );
  }
  protected canChoosePlan(d: InstitutionDetail) {
    if (d.status === 'PENDING_ACTIVATION' && !d.subscription?.status) {
      return this.can('inst.register');
    }
    return this.running(d) && this.can('inst.lifecycle');
  }
  protected planLockText(d: InstitutionDetail) {
    if (d.status === 'SUSPENDED') return 'A suspended institution keeps its plan until reactivated';
    if (d.status === 'CANCELLED') return 'A cancelled institution keeps its last plan';
    return this.noTask;
  }
  protected feeText(p: Plan | null) {
    const f = p?.platformFee;
    if (!f) return '—';
    const pct = Number(f.percent).toString();
    return `${formatInr(parseAmount(f.flat.amount))} up to ${formatInr(parseAmount(f.upTo.amount)).replace(/\.00$/, '')}, else ${pct}%`;
  }
  protected pendingRequests(d: InstitutionDetail) {
    return d.planRequests.filter((r) => r.status === 'PENDING');
  }
  private annual(p: Plan) {
    const paise = Number(parseAmount(p.price.amount));
    return p.cycle === 'MONTHLY' ? paise * 12 : paise;
  }
  protected upgrade(d: InstitutionDetail) {
    const to = this.plans().find((p) => p.id === this.planChoice());
    return Boolean(to && d.plan && this.annual(to) > this.annual(d.plan));
  }
  /** What the change costs, as the server bills it (prorated by day to the renewal date). */
  protected planPreview(d: InstitutionDetail) {
    const to = this.plans().find((p) => p.id === this.planChoice());
    const renews = d.subscription?.renewsOn;
    if (!to || !d.plan || to.id === d.plan.id) return 'Choose another plan.';
    if (!this.upgrade(d) || this.planTiming() === 'RENEWAL' || !renews) {
      return `${to.name} applies from the renewal on ${this.date(renews ?? '')}; the renewal invoice uses its price.`;
    }
    const left = Math.max(
      0,
      Math.round((Date.parse(renews) - Date.parse(istBusinessDate())) / 86_400_000),
    );
    const paise = Math.round(((this.annual(to) - this.annual(d.plan)) * left) / 365);
    return `Billed now: ${formatInr(paise)} + GST for the ${left} days until renewal on ${this.date(renews)}.`;
  }
  protected planSub(d: InstitutionDetail) {
    return d.plan ? `${d.name} is on ${d.plan.name}` : `${d.name} has no plan yet`;
  }
  protected err(k: string) {
    return this.errors()[k] ?? '';
  }

  // --- drawer --------------------------------------------------------------------------------------
  protected async openInst(id: string) {
    try {
      this.detail.set(await this.api.detail(id));
    } catch (e) {
      this.fail(e);
    }
  }

  private async refresh(id: string) {
    await this.load();
    if (this.detail()?.id === id) await this.openInst(id);
  }

  protected copy(text: string) {
    void copyText(text).catch(() => undefined);
    this.overlays.toast('Copied', { sub: text, tone: 'info' });
  }

  protected toFeatures(id: string) {
    this.detail.set(null);
    void this.router.navigate(['/backoffice/features'], { queryParams: { inst: id } });
  }

  private fail(e: unknown, title = 'Not saved') {
    this.overlays.toast(title, {
      sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
      tone: 'bad',
    });
  }

  protected async lifecycle(d: InstitutionDetail, action: LifecycleAction, label: string) {
    const bad = action === 'CANCEL' || action === 'SUSPEND';
    const ok = await this.overlays.confirm({
      title: `${label} ${d.name}?`,
      text: `${ACTION_TEXT[action](d.name, d.plan?.name ?? '', d.plan?.trialDays ?? 30)} The primary and secondary contacts are e-mailed.`,
      ok: `${label} institution`,
      tone: bad ? 'bad' : 'brand',
      reason: {
        label: 'Reason (recorded in the lifecycle history)',
        placeholder:
          action === 'SUSPEND'
            ? 'e.g. Invoice unpaid after the grace period'
            : 'e.g. Onboarding complete; first invoice paid',
        min: 8,
      },
    });
    if (!ok) return;
    try {
      const r = await this.api.lifecycle(d.id, action, ok.reason ?? '');
      const bill = r.invoice
        ? ` · invoice ${r.invoice.invoiceNo} for ${formatInr(parseAmount(r.invoice.total.amount))} due ${formatDate(r.invoice.dueOn)}`
        : '';
      const who = r.notified.length
        ? `${r.notified.join(' and ')} notified by e-mail`
        : 'no contact to e-mail';
      this.overlays.toast(`${d.name} · ${LABEL[r.status] ?? r.status}`, {
        sub: `Recorded in the lifecycle history · ${who}${bill}`,
        tone: bad ? 'warn' : 'ok',
      });
      await this.refresh(d.id);
    } catch (e) {
      this.fail(e);
    }
  }

  protected async markDone(
    d: InstitutionDetail,
    key: string,
    label: string,
    owner: 'Operator' | 'Institution',
  ) {
    const ok = await this.overlays.confirm({
      title: `Mark “${label}” as done?`,
      text:
        owner === 'Institution'
          ? `This step is completed by the institution. Mark it done only after confirming with ${d.contacts.primary?.name ?? 'the institution'}.`
          : 'The step will show as complete on the onboarding checklist.',
      ok: 'Mark done',
    });
    if (!ok) return;
    try {
      const r = await this.api.markStep(d.id, key);
      this.overlays.toast('Checklist updated', { sub: `${r.done} of ${r.total} steps complete` });
      await this.refresh(d.id);
    } catch (e) {
      this.fail(e);
    }
  }

  protected openBank(d: InstitutionDetail) {
    this.errors.set({});
    this.bank.set({ cc: '', pool: '' });
    this.bankFor.set(d);
  }

  protected async saveBank(d: InstitutionDetail) {
    const { cc, pool } = this.bank();
    const errors: Record<string, string> = {};
    if (!cc) errors['cc'] = translate('VALIDATION.REQUIRED');
    else if (!/^[A-Z0-9]{1,10}$/.test(cc))
      errors['cc'] = translate('INS.CORPORATE_CODE_FORMAT', { max: 10 });
    if (!pool.trim()) errors['pool'] = translate('VALIDATION.REQUIRED');
    else if (!PATTERNS.alphanumeric.test(pool.trim())) {
      errors['pool'] = translate('INS.POOL_ACCOUNT_FORMAT');
    }
    this.errors.set(errors);
    if (Object.keys(errors).length || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.bank(d.id, d.version, { corporateCode: cc, poolAccountRef: pool.trim() });
      this.bankFor.set(null);
      this.overlays.toast('Corporate code saved', {
        sub: `${cc} · virtual accounts are ${cc} + wallet number`,
      });
      await this.refresh(d.id);
    } catch (e) {
      if (e instanceof ApiProblem && e.code === 'INS.CORPORATE_CODE_TAKEN') {
        this.errors.set({ cc: e.detail });
      } else {
        this.fail(e);
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected openPlan(d: InstitutionDetail, request?: PlanRequest) {
    this.errors.set({});
    this.planChoice.set(request?.plan.id ?? d.plan?.id ?? this.plans()[0]?.id ?? '');
    this.planTiming.set(request?.timing ?? 'NOW');
    this.planReason.set(request ? 'Requested by the institution' : '');
    this.planFor.set(d);
  }

  protected applyRequest(d: InstitutionDetail, r: PlanRequest) {
    this.openPlan(d, r);
  }

  protected async declineRequest(d: InstitutionDetail, r: PlanRequest) {
    const ok = await this.overlays.confirm({
      title: `Decline the request for ${r.plan.name}?`,
      text: `${d.name}'s primary contact is e-mailed the reason.`,
      ok: 'Decline',
      tone: 'bad',
      reason: { label: 'Reason (sent to the institution)', min: 8 },
    });
    if (!ok) return;
    try {
      await this.api.declineRequest(r.id, ok.reason ?? '');
      this.overlays.toast('Request declined', { sub: 'The primary contact is e-mailed' });
      await this.refresh(d.id);
    } catch (e) {
      this.fail(e);
    }
  }

  protected async cancelScheduled(d: InstitutionDetail) {
    const sc = d.subscription?.scheduledChange;
    if (!sc) return;
    const ok = await this.overlays.confirm({
      title: `Keep ${d.plan?.name ?? 'the current plan'} at renewal?`,
      text: `The move to ${sc.plan} on ${this.date(sc.on)} is cancelled.`,
      ok: 'Cancel the change',
      tone: 'warn',
      reason: { label: 'Reason (recorded in the lifecycle history)', min: 8 },
    });
    if (!ok) return;
    try {
      await this.api.cancelScheduled(d.id, ok.reason ?? '');
      this.overlays.toast('Scheduled change cancelled', {
        sub: 'Recorded in the lifecycle history',
      });
      await this.refresh(d.id);
    } catch (e) {
      this.fail(e);
    }
  }

  protected async savePlan(d: InstitutionDetail) {
    const reason = this.planReason().trim();
    if (reason.length < 5) {
      this.errors.set({ pr: translate(reason ? 'VALIDATION.FORMAT' : 'VALIDATION.REQUIRED') });
      return;
    }
    const to = this.plans().find((p) => p.id === this.planChoice());
    if (!to || to.id === d.plan?.id) {
      this.overlays.toast("That's already the current plan", { tone: 'info' });
      return;
    }
    const lost = (await this.api.features(d.id)).features.filter(
      (f) => f.enabled && f.module && !to.modules.includes(f.module),
    );
    const later =
      this.running(d) &&
      d.subscription?.status !== 'TRIAL' &&
      (!this.upgrade(d) || this.planTiming() === 'RENEWAL');
    const ok = await this.overlays.confirm({
      title: later ? `Move ${d.name} to ${to.name} at renewal?` : `Move ${d.name} to ${to.name}?`,
      text: lost.length
        ? `These features aren't in ${to.name} and will be switched off: ${lost.map((f) => f.label).join(', ')}.`
        : 'Every feature in use stays available.',
      ok: 'Change plan',
      tone: lost.length ? 'warn' : 'brand',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      if (this.running(d)) {
        const r = await this.api.changePlan(d.id, {
          planId: to.id,
          timing: later ? 'RENEWAL' : 'NOW',
          reason,
        });
        this.planFor.set(null);
        const bill = r.invoice
          ? ` · prorated invoice ${r.invoice.invoiceNo} for ${formatInr(parseAmount(r.invoice.total.amount))}`
          : '';
        this.overlays.toast(
          r.effective === 'NOW'
            ? `${d.name} moved to ${to.name}`
            : `${d.name} moves to ${to.name} on ${this.date(r.effectiveOn)}`,
          { sub: `Contacts notified${bill}` },
        );
      } else {
        await this.api.edit(d.id, d.version, { planId: to.id, reason });
        this.planFor.set(null);
        this.overlays.toast(`${d.name} moved to ${to.name}`, {
          sub: 'Recorded in the lifecycle history',
        });
      }
      await this.refresh(d.id);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  // --- registration (FR-INS-01/02) -------------------------------------------------------------------
  protected openRegister() {
    this.form.set({ ...EMPTY_FORM });
    this.errors.set({});
    this.formError.set('');
    this.registering.set(true);
  }

  protected set(k: keyof RegisterForm, e: Event) {
    // The contacts' and the administrator's mobiles take digits only (client 2026-10-14).
    const v = MOBILES.has(k) ? cleanTyped(e.target as HTMLInputElement, onlyDigits) : this.value(e);
    this.form.set({ ...this.form(), [k]: v });
    if (this.errors()[k]) {
      const next = { ...this.errors() };
      delete next[k];
      this.errors.set(next);
    }
  }

  private validate(f: RegisterForm) {
    const e: Record<string, string> = {};
    const req = (k: keyof RegisterForm) =>
      !f[k].trim() && (e[k] = translate('VALIDATION.REQUIRED'));
    const text = PATTERNS.institutionText;
    const email = (v: string) => PATTERNS.email.test(v.trim().toLowerCase());
    if (
      !req('name') &&
      (!PATTERNS.institutionName.test(f.name.trim()) || f.name.trim().length < 3)
    ) {
      e['name'] = translate('INS.NAME_FORMAT');
    }
    if (!req('address') && !PATTERNS.institutionName.test(f.address.trim()))
      e['address'] = translate('INS.ADDRESS_FORMAT');
    if (!req('city') && !/^[A-Za-z][A-Za-z .'-]*$/.test(f.city.trim())) {
      e['city'] = translate('VALIDATION.FORMAT');
    }
    if (!req('pn') && !text.test(f.pn.trim())) e['pn'] = translate('INS.PRIMARY_NAME_FORMAT');
    if (!req('pe') && !email(f.pe)) e['pe'] = translate('INS.PRIMARY_EMAIL_FORMAT');
    if (!req('pp') && !PATTERNS.mobile.test(f.pp.trim())) {
      e['pp'] = translate('INS.PRIMARY_PHONE_FORMAT');
    }
    const anySecondary = Boolean(f.sn.trim() || f.se.trim() || f.sp.trim());
    if (anySecondary) {
      if (!f.sn.trim()) e['sn'] = translate('VALIDATION.REQUIRED');
      else if (!text.test(f.sn.trim())) e['sn'] = translate('INS.SECONDARY_NAME_FORMAT');
      if (!email(f.se)) e['se'] = translate('INS.SECONDARY_EMAIL_FORMAT');
      if (!PATTERNS.mobile.test(f.sp.trim())) e['sp'] = translate('INS.SECONDARY_PHONE_FORMAT');
    }
    if (!req('adm') && !email(f.adm)) e['adm'] = translate('INS.ADMIN_EMAIL_FORMAT');
    if (f.admn.trim() && !/^[A-Za-z][A-Za-z .'-]*$/.test(f.admn.trim())) {
      e['admn'] = translate('IDN.NAME_LETTERS_ONLY');
    }
    if (f.admm.trim() && !PATTERNS.mobile.test(f.admm.trim())) {
      e['admm'] = translate('VALIDATION.MOBILE');
    }
    return e;
  }

  protected async register() {
    if (this.busy()) return;
    const f = this.form();
    const errors = this.validate(f);
    this.errors.set(errors);
    this.formError.set('');
    if (Object.keys(errors).length) return;
    const secondary = f.sn.trim()
      ? { secondaryContact: { name: f.sn.trim(), email: f.se.trim(), mobile: f.sp.trim() } }
      : {};
    this.busy.set(true);
    try {
      const r = await this.api.register({
        name: f.name.trim(),
        address: f.address.trim(),
        city: f.city.trim(),
        institutionType: f.institutionType,
        board: f.board,
        affiliation: f.board,
        primaryContact: { name: f.pn.trim(), email: f.pe.trim(), mobile: f.pp.trim() },
        ...secondary,
        adminEmail: f.adm.trim(),
        ...(f.admn.trim() ? { adminName: f.admn.trim() } : {}),
        ...(f.admm.trim() ? { adminMobile: f.admm.trim() } : {}),
        ...(f.plan ? { planId: f.plan } : {}),
      });
      this.registering.set(false);
      // Shown once (client 2026-10-07): e-mail isn't integrated, so the operator passes it on.
      if (r.administrator?.temporaryPassword) {
        this.adminPassword.set({
          institution: f.name.trim(),
          identifier: r.identifier,
          email: r.administrator.email,
          password: r.administrator.temporaryPassword,
        });
      }
      this.overlays.toast('Institution registered', {
        sub: r.administrator?.pending
          ? `${r.identifier} · Pending activation · the administrator creates their account on the customer site`
          : `${r.identifier} · Pending activation`,
      });
      await this.load();
      await this.openInst(r.id);
    } catch (e) {
      if (e instanceof ApiProblem) {
        const map: Record<string, string> = {
          name: 'name',
          address: 'address',
          city: 'city',
          'primaryContact.name': 'pn',
          'primaryContact.email': 'pe',
          'primaryContact.mobile': 'pp',
          'secondaryContact.name': 'sn',
          'secondaryContact.email': 'se',
          'secondaryContact.mobile': 'sp',
          adminEmail: 'adm',
          adminName: 'admn',
          adminMobile: 'admm',
        };
        const fieldErrors: Record<string, string> = {};
        for (const fe of e.errors) {
          const k = map[fe.field];
          if (k) fieldErrors[k] = fe.message;
        }
        if (e.code === 'INS.NAME_ADDRESS_TAKEN') fieldErrors['address'] = e.detail;
        if (e.code === 'INS.ADMIN_MOBILE_TAKEN') fieldErrors['admm'] = e.detail;
        else if (e.code.startsWith('INS.ADMIN_')) fieldErrors['adm'] = e.detail;
        this.errors.set(fieldErrors);
        if (!Object.keys(fieldErrors).length) this.formError.set(e.detail);
      } else {
        this.formError.set(translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
