import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Card, Empty, PageHead } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, formatInr, istBusinessDate } from '../../../Utils/format';
import { parseAmount } from '../../../Utils/money';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { Money, PlanRequest } from '../../Backoffice/Institutions/institutions.api';
import { INVOICE_STATUS, INVOICE_TRIGGER, type Invoice } from '../../Backoffice/Plans/plans.api';
import { SubscriptionApi, type ConsoleSubscriptionView } from './subscription.api';

const SUB_STATUS: Record<string, { label: string; tone: string }> = {
  TRIAL: { label: 'Trial', tone: 'info' },
  ACTIVE: { label: 'Active', tone: 'ok' },
  GRACE: { label: 'Grace', tone: 'warn' },
  SUSPENDED: { label: 'Suspended', tone: 'bad' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

const REQUEST_STATUS: Record<PlanRequest['status'], { label: string; tone: string }> = {
  PENDING: { label: 'Pending', tone: 'warn' },
  APPLIED: { label: 'Applied', tone: 'ok' },
  DECLINED: { label: 'Declined', tone: 'bad' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
};

/** The prototype's "If an invoice isn't paid" steps (FR-INS-05, FR-SAS-08). */
const LIFE = (graceDays: number) =>
  [
    ['Active', 'ok', 'Everything works as normal'],
    [
      `Grace · ${graceDays} days`,
      'warn',
      'Starts the day after the due date. Reminders go to the primary contact',
    ],
    [
      'Suspended',
      'bad',
      "Members can't sign in, pay or be paid and jobs stop. Data is kept; paying restores access",
    ],
    ['Closed', 'neutral', 'Only on cancellation, after settlements and balances are cleared'],
  ] as const;

const WHEN = [
  { v: 'RENEWAL', l: 'At the next renewal' },
  { v: 'NOW', l: 'Straight away (prorated)' },
] as const;

const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * c.subscription — Plan & billing (SRS 7.2, 7.3; FR-SAS-05…08; SAS-026, SAS-037…039; prototype
 * c.subscription): the plan in force with its modules and renewal, usage against the allowances,
 * invoices, the platform fee, what happens when an invoice isn't paid, and plan change requests.
 * Online payment arrives with the payment gateway (Q17); until then the institution reports a bank
 * transfer and CampusOne confirms it.
 */
@Component({
  selector: 'rp-console-subscription',
  imports: [Card, Dropdown, Empty, Icon, Modal, NgTemplateOutlet, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Plan & billing"
        sub="Your CampusOne subscription, usage against the plan's allowances, and invoices."
      >
        @if (readOnly() || !canRequest()) {
          <span class="cp-why" [attr.title]="readOnly() || requestLock()"
            ><button type="button" class="btn btn-sec" disabled>
              <rp-icon name="layers" [size]="17" /><span>Request a plan change</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-sec" (click)="openRequest()">
            <rp-icon name="layers" [size]="17" /><span>Request a plan change</span>
          </button>
        }
      </rp-page-head>
      @if (loading()) {
        <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
      } @else if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load Plan & billing" [text]="error()" />
        </div>
      } @else if (data(); as s) {
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        <div class="c-grid s21">
          <div class="card cp-plan">
            <div class="cp-plan-h">
              <div>
                <span class="eyebrow" style="color: inherit; opacity: 0.75">Current plan</span>
                <h2>{{ s.plan?.name ?? 'No plan yet' }}</h2>
                @if (s.plan; as p) {
                  <p>
                    {{ p.cycle === 'MONTHLY' ? 'Monthly' : 'Annual' }} · {{ inr0(p.price) }} a
                    {{ p.cycle === 'MONTHLY' ? 'month' : 'year' }} + GST
                    @if (s.subscription?.since) {
                      · customer since {{ date(s.subscription!.since!) }}
                    }
                  </p>
                }
              </div>
              @if (subStatus(); as st) {
                <span class="chip dot" [class]="'chip dot tone-' + st.tone">{{ st.label }}</span>
              }
            </div>
            <div class="cp-plan-b">
              @if (s.subscription?.status === 'TRIAL' && s.subscription.trialEndsOn) {
                <div class="cp-renew">
                  <ng-container
                    *ngTemplateOutlet="ring; context: { $implicit: trialLeft(), pct: trialPct() }"
                  />
                  <div>
                    <b>Trial ends {{ date(s.subscription!.trialEndsOn!) }}</b>
                    <div class="t-sm t-muted">
                      CampusOne activates the plan when the trial converts; the first cycle is billed
                      then.
                    </div>
                  </div>
                </div>
              } @else if (s.subscription?.renewsOn) {
                <div class="cp-renew">
                  <ng-container
                    *ngTemplateOutlet="ring; context: { $implicit: renewLeft(), pct: renewPct() }"
                  />
                  <div>
                    <b>Renews {{ date(s.subscription!.renewsOn!) }}</b>
                    <div class="t-sm t-muted">
                      The renewal invoice is issued {{ s.billing.renewalBillDaysBefore }} days
                      before. Plan changes are prorated.
                    </div>
                  </div>
                </div>
              }
              @if (s.scheduledChange; as sc) {
                <div class="note tone-info">
                  <rp-icon name="layers" [size]="17" />
                  <div class="grow">
                    <b>Moves to {{ sc.plan }} on {{ date(sc.on) }}.</b> The renewal invoice uses its
                    price; features it doesn't include switch off then.
                  </div>
                </div>
              }
              <div>
                <span class="eyebrow">Modules</span>
                <div class="cp-mods">
                  @for (m of s.modules; track m.module) {
                    @if (m.included) {
                      <span class="cp-mod"><rp-icon name="check" [size]="13" />{{ m.module }}</span>
                    } @else {
                      <span
                        class="cp-mod off"
                        [attr.title]="'Not in ' + (s.plan?.name ?? 'the plan')"
                        ><rp-icon name="lock" [size]="12" />{{ m.module }}</span
                      >
                    }
                  }
                </div>
              </div>
            </div>
          </div>
          <rp-card title="Usage this cycle" icon="gauge">
            <div class="stack g16">
              @for (u of usage(); track u.label) {
                <div class="cp-use">
                  <div class="row between t-sm">
                    <b>{{ u.label }}</b
                    ><span class="t-num"
                      ><b>{{ u.used }}</b
                      >{{ ' ' }}<span class="t-muted">/ {{ u.max }}</span></span
                    >
                  </div>
                  <div [class]="'bar ' + u.tone">
                    <i [style.width.%]="u.pct"></i>
                  </div>
                  <span class="t-xs t-muted">{{ u.note }}</span>
                </div>
              }
            </div>
          </rp-card>
        </div>

        @if (due().length; as n) {
          <div class="note tone-warn">
            <rp-icon name="receipt" [size]="17" />
            <div class="grow">
              <b
                >{{
                  n === 1
                    ? 'Invoice ' + due()[0]!.invoiceNo + ' is due ' + date(due()[0]!.dueOn)
                    : n + ' invoices are due'
                }}.</b
              >
              {{ inr(dueTotal()) }} including GST.
            </div>
            <button
              type="button"
              class="btn btn-pri btn-sm"
              [disabled]="!!readOnly()"
              [attr.title]="readOnly() || null"
              (click)="openPay(due()[0]!)"
            >
              <span>Pay now</span>
            </button>
          </div>
        }

        <section class="stack g8">
          <div class="sec-h"><h3>Invoices</h3></div>
          @if (s.invoices.length) {
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>For</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th class="r">Amount incl. GST</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (v of s.invoices; track v.id) {
                    <tr
                      tabindex="0"
                      (click)="openInvoice.set(v)"
                      (keydown.enter)="openInvoice.set(v)"
                    >
                      <td>
                        <span class="t-mono cp-nw">{{ v.invoiceNo }}</span>
                      </td>
                      <td>
                        {{ v.lines[0]?.description ?? trigger(v) }}
                        <span class="t-xs t-muted" style="display: block">{{ v.period }}</span>
                      </td>
                      <td>
                        <span class="cp-nw">{{ date(v.issuedOn) }}</span>
                      </td>
                      <td>
                        <span class="cp-nw">{{ date(v.dueOn) }}</span>
                      </td>
                      <td class="r">
                        <span class="amt"
                          ><span class="cur">₹</span><span class="w">{{ whole(v.total) }}</span
                          ><span class="dec">{{ dec(v.total) }}</span></span
                        >
                      </td>
                      <td>
                        <span class="chip dot" [class]="'chip dot tone-' + status(v).tone">{{
                          status(v).label
                        }}</span>
                        @if (v.payment; as p) {
                          <div class="t-xs t-muted">
                            {{ date(p.paidOn) }} · {{ p.reference ?? 'Payment gateway' }}
                          </div>
                        } @else if (v.transfer; as t) {
                          <div class="t-xs t-muted">
                            Transfer reported · {{ t.utr }} · CampusOne confirms
                          </div>
                        }
                      </td>
                      <td>
                        <div class="row-acts">
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            (click)="$event.stopPropagation(); download(v)"
                          >
                            <rp-icon name="download" [size]="15" /><span>Download</span>
                          </button>
                          @if (payable(v) && !readOnly()) {
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              (click)="$event.stopPropagation(); openPay(v)"
                            >
                              <span>Pay</span>
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="card pad">
              <rp-empty
                icon="receipt"
                title="No invoices yet"
                text="The first cycle is billed when CampusOne activates your plan."
              />
            </div>
          }
        </section>

        <div class="c-grid k2">
          <rp-card title="Platform fees on merchant payments" icon="percent">
            <div class="stack g8">
              <p class="t-sm">
                {{ feeText() }}. Fees apply to successful payments only and are deducted in each
                settlement.
              </p>
              <dl class="kv">
                <dt>This month so far</dt>
                <dd><span class="t-faint">No settlements yet</span></dd>
                <dt>Charged in</dt>
                <dd>Daily settlements</dd>
              </dl>
            </div>
          </rp-card>
          <rp-card title="If an invoice isn't paid" icon="history">
            <div class="cp-life">
              @for (l of life(); track l[0]; let i = $index) {
                <div class="cp-ls">
                  <span class="cp-ld" [class]="'cp-ld ' + l[1]">{{ i + 1 }}</span>
                  <div>
                    <b class="t-sm">{{ l[0] }}</b>
                    <div class="t-xs t-muted">{{ l[2] }}</div>
                  </div>
                </div>
              }
            </div>
            <p class="t-xs t-muted mt8">
              FR-INS-05, FR-SAS-08. Lifecycle changes are recorded with who, when and why, and
              e-mailed to your contacts.
            </p>
          </rp-card>
        </div>

        @if (s.requests.length) {
          <section class="stack g8">
            <div class="sec-h"><h3>Plan change requests</h3></div>
            <div class="list">
              @for (r of s.requests; track r.id) {
                <div class="li">
                  <span class="li-ic"><rp-icon name="layers" [size]="18" /></span>
                  <span class="li-main"
                    ><span class="li-t">{{ r.plan.name }}</span
                    ><span class="li-s"
                      >{{
                        r.timing === 'NOW' ? 'Straight away (prorated)' : 'At the next renewal'
                      }}
                      · requested by {{ r.requestedBy ?? 'you' }} {{ ago(r.requestedAt)
                      }}{{ r.note ? ' · ' + r.note : ''
                      }}{{
                        r.resolution && r.status === 'DECLINED' ? ' · ' + r.resolution : ''
                      }}</span
                    ></span
                  >
                  <span class="li-r">
                    @if (r.status === 'PENDING' && !readOnly()) {
                      <button type="button" class="btn btn-ghost btn-xs" (click)="withdraw(r)">
                        <span>Withdraw</span>
                      </button>
                    }
                    <span class="chip dot" [class]="'chip dot tone-' + requestStatus(r).tone">{{
                      requestStatus(r).label
                    }}</span>
                  </span>
                </div>
              }
            </div>
          </section>
        }
      }
    </div>

    <ng-template #ring let-left let-pct="pct">
      <div class="ring" style="width: 74px; height: 74px">
        <svg width="74" height="74">
          <circle class="trk" cx="37" cy="37" r="34" stroke-width="6" />
          <circle
            class="val"
            cx="37"
            cy="37"
            r="34"
            stroke-width="6"
            [attr.stroke-dasharray]="circ"
            [attr.stroke-dashoffset]="circ * (1 - pct / 100)"
          />
        </svg>
        <div class="ring-c">
          <div>
            <b class="t-num" style="font-size: 17px; display: block">{{ left }}</b
            ><small class="t-xs t-muted">days</small>
          </div>
        </div>
      </div>
    </ng-template>

    @if (requesting() && data(); as s) {
      <rp-modal
        title="Request a plan change"
        sub="A CampusOne platform administrator confirms the prorated amount before anything changes."
        [wide]="true"
        (closed)="requesting.set(false)"
      >
        <div class="stack g16">
          <div class="cp-plans">
            @for (p of s.plans; track p.id) {
              <div
                class="choice"
                [class.on]="choice() === p.id"
                tabindex="0"
                role="radio"
                [attr.aria-checked]="choice() === p.id"
                (click)="choice.set(p.id)"
                (keydown.enter)="choice.set(p.id)"
              >
                <span class="li-ic sm"><rp-icon name="layers" [size]="17" /></span>
                <span class="grow"
                  ><span class="t-h4" style="display: block"
                    >{{ p.name }}{{ p.id === s.plan?.id ? ' · current' : '' }}</span
                  ><span class="t-sm t-muted" style="display: block; margin-top: 1px"
                    >{{ inr0(p.price) }} a {{ p.cycle === 'MONTHLY' ? 'month' : 'year' }} ·
                    {{ num(p.allowances.members) }} members · {{ num(p.allowances.sms) }} SMS
                    @if (p.description) {
                      <br />{{ p.description }}
                    }
                  </span></span
                ><span class="radio"></span>
              </div>
            }
          </div>
          <div class="c-form">
            <div class="fld">
              <label class="fld-l" for="cp-pl-when-b">When<span class="req">*</span></label>
              <rp-dd
                inputId="cp-pl-when"
                [options]="whenOptions"
                [value]="when()"
                (changed)="when.set($any($event))"
              />
            </div>
            <div class="fld" [class.invalid]="noteError()">
              <label class="fld-l" for="cp-pl-note"
                >Note for CampusOne<span class="opt">(optional)</span></label
              >
              <div class="fld-in">
                <input
                  id="cp-pl-note"
                  maxlength="300"
                  placeholder="Anything we should know"
                  [value]="note()"
                  (input)="note.set(value($event)); noteError.set('')"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ noteError() }}</span>
              </div>
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="requesting.set(false)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="send()">
            <rp-icon name="send" [size]="17" /><span>Send request</span>
          </button>
        </ng-container>
      </rp-modal>
    }

    @if (payFor(); as v) {
      <rp-modal
        [title]="'Pay ' + inr(amountOf(v.total)) + '?'"
        [sub]="v.invoiceNo + ' · ' + trigger(v)"
        (closed)="payFor.set(null)"
      >
        <div class="stack g12">
          <div class="note tone-info">
            <rp-icon name="bank" [size]="17" />
            <div class="grow">
              Online payment arrives with the payment gateway. Until then, pay
              <b>{{ inr(amountOf(v.total)) }}</b> by bank transfer quoting
              <b class="t-mono">{{ v.invoiceNo }}</b
              >, then enter the bank reference here. CampusOne confirms it and marks the invoice paid.
            </div>
          </div>
          @if (data()?.payee; as pe) {
            <div class="sp-bankbox">
              <dl class="kv">
                <dt>Account name</dt>
                <dd>{{ pe.name }}</dd>
                <dt>Bank</dt>
                <dd>{{ pe.bank }}</dd>
                <dt>Account number</dt>
                <dd>
                  <span class="t-mono">{{ pe.accountNo }}</span>
                </dd>
                <dt>IFSC</dt>
                <dd>
                  <span class="t-mono">{{ pe.ifsc }}</span>
                </dd>
                <dt>Reference</dt>
                <dd>
                  <span class="t-mono">{{ v.invoiceNo }}</span>
                </dd>
              </dl>
              @if (pe.example) {
                <p class="t-xs t-muted mt8">
                  Example account — CampusOne's real bank details will appear here.
                </p>
              }
            </div>
          }
          <div class="fld" [class.invalid]="payError('utr')">
            <label class="fld-l" for="cp-pay-utr"
              >Bank reference (UTR)<span class="req">*</span></label
            >
            <div class="fld-in">
              <input
                id="cp-pay-utr"
                maxlength="22"
                autocomplete="off"
                placeholder="e.g. UTR261001445512"
                [value]="payUtr()"
                (input)="payUtr.set(value($event).toUpperCase()); payErrors.set({})"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ payError('utr') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="payError('paidOn')">
            <label class="fld-l" for="cp-pay-on">Paid on<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="cp-pay-on"
                type="date"
                [max]="today"
                [min]="v.issuedOn"
                [value]="payOn()"
                (input)="payOn.set(value($event)); payErrors.set({})"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ payError('paidOn') }}</span>
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="payFor.set(null)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="report(v)">
            <rp-icon name="send" [size]="17" /><span>Report the transfer</span>
          </button>
        </ng-container>
      </rp-modal>
    }

    @if (openInvoice(); as v) {
      <rp-modal
        [title]="v.invoiceNo"
        [sub]="trigger(v) + ' · ' + v.period"
        [drawer]="true"
        (closed)="openInvoice.set(null)"
      >
        <div class="stack g16">
          <div class="row wrap g8">
            <span class="chip dot" [class]="'chip dot tone-' + status(v).tone">{{
              status(v).label
            }}</span>
          </div>
          <div class="fs">
            <h4><rp-icon name="receipt" [size]="15" /> Lines</h4>
            <div class="fs-b">
              <dl class="kv">
                @for (l of v.lines; track $index) {
                  <dt>{{ l.description }}</dt>
                  <dd class="t-num">{{ inr(amountOf(l.amount)) }}</dd>
                }
                <dt>GST {{ pctText(v.taxPercent) }}%</dt>
                <dd class="t-num">{{ inr(amountOf(v.tax)) }}</dd>
                <dt><b>Total</b></dt>
                <dd class="t-num">
                  <b>{{ inr(amountOf(v.total)) }}</b>
                </dd>
              </dl>
            </div>
          </div>
          <div class="fs">
            <h4><rp-icon name="calendar" [size]="15" /> Dates</h4>
            <div class="fs-b">
              <dl class="kv">
                <dt>Issued</dt>
                <dd>{{ date(v.issuedOn) }}</dd>
                <dt>Due</dt>
                <dd>{{ date(v.dueOn) }}</dd>
                <dt>Grace until</dt>
                <dd>{{ date(v.graceUntilOn) }}</dd>
                @if (v.payment; as p) {
                  <dt>Paid</dt>
                  <dd>{{ date(p.paidOn) }} · {{ p.reference ?? 'Payment gateway' }}</dd>
                } @else if (v.transfer; as t) {
                  <dt>Transfer reported</dt>
                  <dd>{{ date(t.paidOn) }} · {{ t.utr }} · {{ dt(t.reportedAt) }}</dd>
                }
              </dl>
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="openInvoice.set(null)">
            <span>Close</span>
          </button>
          <button type="button" class="btn btn-ghost" (click)="download(v)">
            <rp-icon name="download" [size]="17" /><span>Download</span>
          </button>
          @if (payable(v) && !readOnly()) {
            <button type="button" class="btn btn-pri" (click)="openPay(v)">
              <span>Pay</span>
            </button>
          }
        </ng-container>
      </rp-modal>
    }
  `,
})
export class ConsoleSubscription {
  private readonly api = inject(SubscriptionApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly circ = 2 * Math.PI * 34;
  protected readonly today = istBusinessDate();
  protected readonly whenOptions = WHEN.map((w) => ({ v: w.v, l: w.l }));
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly data = signal<ConsoleSubscriptionView | null>(null);
  protected readonly busy = signal(false);
  protected readonly requesting = signal(false);
  protected readonly choice = signal('');
  protected readonly when = signal<'NOW' | 'RENEWAL'>('RENEWAL');
  protected readonly note = signal('');
  protected readonly noteError = signal('');
  protected readonly payFor = signal<Invoice | null>(null);
  protected readonly payUtr = signal('');
  protected readonly payOn = signal('');
  protected readonly payErrors = signal<Record<string, string>>({});
  protected readonly openInvoice = signal<Invoice | null>(null);

  protected readonly readOnly = computed(() => {
    const s = this.session();
    if (!s) return '';
    if (s.roles.some((r) => r.readOnly)) {
      return 'Management has read-only access. The administrator makes changes here.';
    }
    return s.subTasks.includes('config.edit') ? '' : "Your role doesn't include this task.";
  });
  protected readonly canRequest = computed(() =>
    ['TRIAL', 'ACTIVE', 'GRACE'].includes(this.data()?.subscription?.status ?? ''),
  );
  protected readonly requestLock = computed(() =>
    this.data()?.requests.some((r) => r.status === 'PENDING')
      ? 'A request is already with CampusOne'
      : 'Plan changes start once CampusOne activates your plan',
  );
  protected readonly subStatus = computed(() => {
    const st = this.data()?.subscription?.status;
    return st ? (SUB_STATUS[st] ?? null) : null;
  });
  protected readonly renewLeft = computed(() => {
    const r = this.data()?.subscription?.renewsOn;
    return r ? Math.max(0, days(this.today, r)) : 0;
  });
  protected readonly renewPct = computed(() => {
    const s = this.data()?.subscription;
    if (!s?.renewsOn || !s.periodStart) return 0;
    const total = Math.max(1, days(s.periodStart, s.renewsOn));
    return Math.max(0, Math.min(100, 100 - (this.renewLeft() * 100) / total));
  });
  protected readonly trialLeft = computed(() => {
    const t = this.data()?.subscription?.trialEndsOn;
    return t ? Math.max(0, days(this.today, t)) : 0;
  });
  protected readonly trialPct = computed(() => {
    const s = this.data()?.subscription;
    if (!s?.trialEndsOn || !s.periodStart) return 0;
    const total = Math.max(1, days(s.periodStart, s.trialEndsOn));
    return Math.max(0, Math.min(100, 100 - (this.trialLeft() * 100) / total));
  });
  protected readonly due = computed(() =>
    (this.data()?.invoices ?? []).filter((v) => this.payable(v)),
  );
  protected readonly dueTotal = computed(() =>
    this.due().reduce((sum, v) => sum + this.amountOf(v.total), 0),
  );
  protected readonly life = computed(() => LIFE(this.data()?.billing.graceDays ?? 14));
  protected readonly usage = computed(() => {
    const s = this.data();
    if (!s) return [];
    const a = s.plan?.allowances;
    const bar = (used: number | null, max: number) => {
      const pct = max && used !== null ? (used * 100) / max : 0;
      return { pct: Math.min(100, pct), tone: pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : '' };
    };
    const n = (v: number) => v.toLocaleString('en-IN');
    const gb = s.usage.storageBytes / 1024 ** 3;
    const members = a?.members ?? 0;
    const sms = a?.sms ?? 0;
    const wa = a?.whatsapp ?? 0;
    const storage = a?.storageGb ?? 0;
    return [
      {
        label: 'Active members',
        used: n(s.usage.members),
        max: members ? n(members) : 'not included',
        ...bar(s.usage.members, members),
        note: members
          ? `${n(Math.max(0, members - s.usage.members))} more before the next tier`
          : '',
      },
      {
        label: 'SMS',
        used: s.usage.sms === null ? '—' : n(s.usage.sms),
        max: sms ? n(sms) : 'not included',
        ...bar(s.usage.sms, sms),
        note: `SMS beyond the allowance is billed at ${this.inr(this.amountOf(s.billing.smsOverage))} each at the end of the cycle · counted once messaging arrives`,
      },
      {
        label: 'WhatsApp messages',
        used: s.usage.whatsapp === null ? '—' : n(s.usage.whatsapp),
        max: wa ? n(wa) : 'not included',
        ...bar(s.usage.whatsapp, wa),
        note: wa
          ? `Beyond the allowance, ${this.inr(this.amountOf(s.billing.whatsappOverage))} each at the end of the cycle`
          : 'Available on plans that include WhatsApp messages',
      },
      {
        label: 'Storage',
        used: gb.toFixed(1),
        max: storage ? `${storage} GB` : 'not included',
        ...bar(gb, storage),
        note: 'Documents, photos and uploads (2 MB per file, CR-07)',
      },
    ];
  });

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.data.set(await this.api.summary());
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.loading.set(false);
    }
  }

  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected date(v: string) {
    return v ? formatDate(v) : '—';
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected amountOf(m: Money) {
    return parseAmount(m.amount);
  }
  protected inr(paise: number) {
    return formatInr(paise);
  }
  /** The prototype amount (ui.amt): rupees in Indian grouping, paise smaller. */
  protected whole(m: Money) {
    return new Intl.NumberFormat('en-IN').format(Math.floor(Number(this.amountOf(m)) / 100));
  }
  protected dec(m: Money) {
    return '.' + (m.amount.split('.')[1] ?? '00').padEnd(2, '0');
  }
  protected inr0(m: Money) {
    return formatInr(parseAmount(m.amount)).replace(/\.00$/, '');
  }
  protected num(v: number) {
    return v.toLocaleString('en-IN');
  }
  protected pctText(v: string) {
    return String(Number(v));
  }
  protected ago(iso: string) {
    const d = days(istBusinessDate(iso), this.today);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  }
  protected trigger(v: Invoice) {
    return INVOICE_TRIGGER[v.trigger];
  }
  protected status(v: Invoice) {
    return INVOICE_STATUS[v.status];
  }
  protected requestStatus(r: PlanRequest) {
    return REQUEST_STATUS[r.status];
  }
  protected payable(v: Invoice) {
    return v.status === 'DUE' || v.status === 'GRACE' || v.status === 'OVERDUE';
  }
  protected payError(k: string) {
    return this.payErrors()[k] ?? '';
  }
  protected feeText() {
    const f = this.data()?.plan?.platformFee;
    if (!f) return 'Platform fees follow your plan';
    const flat = this.inr(this.amountOf(f.flat));
    const upTo = this.inr0(f.upTo);
    return `${flat} per merchant transaction up to ${upTo}, otherwise ${Number(f.percent)}%`;
  }

  protected async download(v: Invoice) {
    try {
      await this.api.pdf(v);
      this.overlays.toast('Invoice downloaded', { sub: `${v.invoiceNo}.pdf · GST invoice` });
    } catch (e) {
      this.overlays.toast('Not downloaded', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  // --- request a plan change (SAS-037) ---------------------------------------------------------------
  protected openRequest() {
    const s = this.data();
    if (!s || this.readOnly() || !this.canRequest()) return;
    this.choice.set(s.plan?.id ?? s.plans[0]?.id ?? '');
    this.when.set('RENEWAL');
    this.note.set('');
    this.noteError.set('');
    this.requesting.set(true);
  }

  protected async send() {
    const s = this.data();
    if (!s || this.busy()) return;
    if (this.choice() === s.plan?.id) {
      this.overlays.toast('Nothing to change', { sub: 'Choose another plan.', tone: 'info' });
      return;
    }
    this.busy.set(true);
    try {
      await this.api.request({
        planId: this.choice(),
        timing: this.when(),
        note: this.note().trim() || null,
      });
      this.requesting.set(false);
      this.overlays.toast('Request sent to CampusOne', {
        sub: 'A platform administrator will confirm the prorated amount by e-mail',
      });
      await this.load();
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.some((x) => x.field === 'note')) {
        this.noteError.set(e.errors.find((x) => x.field === 'note')!.message);
      } else {
        this.overlays.toast('Not sent', {
          sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async withdraw(r: PlanRequest) {
    const ok = await this.overlays.confirm({
      title: `Withdraw the request for ${r.plan.name}?`,
      text: 'CampusOne stops working on it. You can send a new request at any time.',
      ok: 'Withdraw',
      tone: 'warn',
    });
    if (!ok) return;
    try {
      await this.api.withdraw(r.id);
      this.overlays.toast('Request withdrawn');
      await this.load();
    } catch (e) {
      this.overlays.toast('Not withdrawn', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  // --- report a bank transfer (SAS-039) --------------------------------------------------------------
  protected openPay(v: Invoice) {
    if (this.readOnly()) return;
    this.openInvoice.set(null);
    this.payUtr.set(v.transfer?.utr ?? '');
    this.payOn.set(v.transfer?.paidOn ?? this.today);
    this.payErrors.set({});
    this.payFor.set(v);
  }

  protected async report(v: Invoice) {
    const utr = this.payUtr().trim();
    const errors: Record<string, string> = {};
    if (!utr) errors['utr'] = translate('VALIDATION.REQUIRED');
    else if (!/^[A-Z0-9]{10,22}$/.test(utr)) errors['utr'] = translate('SAS.UTR_FORMAT');
    if (!this.payOn()) errors['paidOn'] = translate('VALIDATION.REQUIRED');
    else if (this.payOn() > this.today) errors['paidOn'] = translate('SAS.PAID_ON_FUTURE');
    else if (this.payOn() < v.issuedOn) errors['paidOn'] = translate('SAS.PAID_ON_BEFORE_ISSUE');
    if (Object.keys(errors).length) {
      this.payErrors.set(errors);
      return;
    }
    this.busy.set(true);
    try {
      await this.api.reportTransfer(v.id, { utr, paidOn: this.payOn() });
      this.payFor.set(null);
      this.overlays.toast('Transfer reported', {
        sub: `${v.invoiceNo} · CampusOne confirms it against the bank statement`,
      });
      await this.load();
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.length) {
        this.payErrors.set(Object.fromEntries(e.errors.map((x) => [x.field, x.message])));
      } else if (e instanceof ApiProblem && e.code === 'SAS.UTR_TAKEN') {
        this.payErrors.set({ utr: e.detail });
      } else {
        this.overlays.toast('Not reported', {
          sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
      }
    } finally {
      this.busy.set(false);
    }
  }
}
