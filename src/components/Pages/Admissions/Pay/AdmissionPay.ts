import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Mark } from '../../../Shared/Mark';
import { Overlays } from '../../../Shared/Overlays';
import { formatInr, formatTime, titleCase } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { type ProcessState, ProcessOverlay, runProcess } from '../../Portal/Shared/PortalUi';
import {
  AdmissionsApi,
  type Application,
  type FeeType,
  type PaySummary,
  type PaymentOrder,
} from '../admissions.api';
import {
  AdmissionsContext,
  asProblem,
  paise,
  problemText,
  tokenFor,
  yearLabel,
} from '../admissions.store';
import { STEPS } from '../Form/form.state';
import { openCheckout, type CheckoutAnswer } from '../../../Utils/razorpay-checkout';
import { scrollTop } from '../Layout/AdmissionsFrame';
import {
  PaField,
  PaQr,
  PaSeg,
  PaSkeleton,
  ResultMark,
  type SegOption,
} from '../Shared/AdmissionsUi';

type Method = 'UPI' | 'Card' | 'Net banking';
type Outcome = 'Success' | 'Failed' | 'Pending';

interface Attempt {
  readonly at: string;
  /** Online: the gateway's own window (live). */
  readonly method: Method | 'Online';
  readonly outcome: Outcome;
  readonly ref: string;
}

const METHODS: readonly SegOption[] = [
  { v: 'UPI', l: 'UPI', icon: 'zap' },
  { v: 'Card', l: 'Card', icon: 'card' },
  { v: 'Net banking', l: 'Net banking', icon: 'bank' },
];
const OUTCOMES: readonly SegOption[] = [
  { v: 'Success', l: 'Success' },
  { v: 'Failed', l: 'Failed' },
  { v: 'Pending', l: 'Pending' },
];
const BANKS = [
  'State Bank of India',
  'Canara Bank',
  'Karnataka Bank',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
];
/** The pending outcome of the test checkout: nothing is sent, the bank "hasn't answered". */
class StillPending extends Error {}

/**
 * p.pay — the fee checkout (ADM-010/011; FR-ADM-08, FR-FEE-12, BR-36). The application fee after
 * the declaration, or the admission fee from the school's payment link (`/admissions/pay/<id>`).
 *
 * The payment gateway is not chosen yet (Q17), so the server runs it in test mode: the order carries
 * the payment id and signature a successful checkout would return. The test switch sends them for
 * "Success", a wrong signature for "Failed" (the server refuses it), and nothing for "Pending". The
 * method fields are the prototype's; nothing typed in them is sent or kept.
 */
@Component({
  selector: 'rp-admission-pay',
  imports: [
    Dropdown,
    Icon,
    Mark,
    NgTemplateOutlet,
    PaField,
    PaQr,
    PaSeg,
    PaSkeleton,
    ProcessOverlay,
    ResultMark,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (problem(); as p) {
      <div class="pa-narrow">
        <div class="card">
          <div class="empty error-state">
            <div class="empty-ic"><rp-icon name="receipt" [size]="26" /></div>
            <h4>Nothing to pay for</h4>
            <p>{{ p }}</p>
            @if (link) {
              <button type="button" class="btn btn-sec" (click)="admissions()">
                <span>Back to admissions</span>
              </button>
            }
          </div>
        </div>
      </div>
    } @else if (loading()) {
      <rp-pa-skel />
    } @else if (paidReceipt(); as r) {
      <div class="pa-done">
        <div class="card pa-done-c">
          <rp-pa-res kind="ok" />
          <h1>Admission fee paid</h1>
          <p>Thank you. The school has received the admission fee for this application.</p>
          <div class="pa-appno">
            <span>Application number</span><b class="t-mono">{{ appNo() }}</b>
          </div>
          <dl class="kv">
            <dt>Student</dt>
            <dd>{{ applicant() }}</dd>
            <dt>Class sought</dt>
            <dd>{{ className() || '—' }}</dd>
            <dt>Academic year</dt>
            <dd>{{ year() }}</dd>
            <dt>Admission fee</dt>
            <dd>
              {{ amount() }} paid
              @if (r !== true) {
                · <span class="t-mono">{{ r }}</span>
              }
            </dd>
            <!-- The payment gateway's transaction ID (client 2026-10-16). -->
            @if (paidTxn(); as t) {
              <dt>Transaction ID</dt>
              <dd>
                <span class="t-mono" id="pa-paid-txn">{{ t }}</span>
              </dd>
            }
          </dl>
        </div>
      </div>
    } @else {
      <div class="pa-pay">
        @if (!ready()) {
          <div class="card pa-gw">
            <div class="empty">
              <div class="empty-ic"><rp-icon name="filetext" [size]="26" /></div>
              <h4>Finish the application first</h4>
              <p>
                This draft stopped at step {{ stoppedAt() + 1 }} ({{ steps[stoppedAt()]!.t }}). The
                fee is paid after the review step.
              </p>
              <button type="button" class="btn btn-pri" (click)="toForm()">
                <span>Continue the application</span><rp-icon name="arrowr" [size]="15" />
              </button>
            </div>
          </div>
        } @else if (result(); as res) {
          @let bad = res === 'failed';
          @let last = attempts().at(-1);
          <div class="card pa-gw pa-gwres">
            <ng-container *ngTemplateOutlet="head" />
            <div class="pa-gwres-b">
              <rp-pa-res [kind]="bad ? 'bad' : 'warn'" />
              <h2>{{ bad ? 'Payment failed' : 'Payment pending' }}</h2>
              @if (bad) {
                <p>{{ failure() }} You can try again with the same or another method.</p>
              } @else {
                <p>
                  We're waiting for your bank to confirm. This usually takes a few minutes — please
                  don't pay again.
                </p>
              }
              <dl class="kv">
                <dt>Order</dt>
                <dd>
                  <span class="t-mono">{{ order()?.gatewayOrder?.orderId ?? '—' }}</span>
                </dd>
                <dt>Amount</dt>
                <dd>{{ amount() }}</dd>
                <dt>Method</dt>
                <dd>{{ last?.method ?? method() }}</dd>
                <dt>Reference</dt>
                <dd>
                  <span class="t-mono">{{ last?.ref || '—' }}</span>
                </dd>
              </dl>
              <div class="pa-gwres-a">
                @if (bad) {
                  <button
                    type="button"
                    class="btn btn-pri btn-lg"
                    [class.is-busy]="busy()"
                    (click)="retry()"
                  >
                    <rp-icon name="refresh" [size]="17" /><span>Try again</span>
                  </button>
                  @if (!payLink) {
                    <button type="button" class="btn btn-ghost btn-lg" (click)="back()">
                      <span>Back to the application</span>
                    </button>
                  }
                } @else {
                  <button
                    type="button"
                    class="btn btn-pri btn-lg"
                    [class.is-busy]="busy()"
                    (click)="checkStatus()"
                  >
                    <rp-icon name="refresh" [size]="17" /><span>Check payment status</span>
                  </button>
                  @if (link) {
                    <button type="button" class="btn btn-ghost btn-lg" (click)="admissions()">
                      <span>Back to admissions</span>
                    </button>
                  }
                }
              </div>
              @if (!bad && !payLink && !admissionMode) {
                <p class="pa-fine">
                  <rp-icon name="info" [size]="13" /> Your application is saved as {{ appNo() }}. It
                  is submitted automatically once the bank confirms.
                </p>
              }
            </div>
          </div>
        } @else {
          <div class="card pa-gw">
            <ng-container *ngTemplateOutlet="head" />
            <div class="pa-gw-b">
              <div class="pa-gw-amt">
                <span>Paying {{ payee() }}</span
                ><b>{{ amount() }}</b
                ><small
                  >{{ feeName() }} · {{ year()
                  }}{{ attempts().length ? ' · attempt ' + (attempts().length + 1) : '' }}</small
                >
              </div>
              @if (gatewayDown(); as g) {
                <div class="note tone-warn">
                  <rp-icon name="alert" [size]="17" />
                  <div class="grow">{{ g }}</div>
                </div>
              } @else if (live()) {
                <div class="note tone-info">
                  <rp-icon name="lock" [size]="17" />
                  <div class="grow">
                    Choose <b>Pay {{ amount() }}</b> to open the secure payment window, then pay by
                    UPI, card, net banking or wallet there.
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-pri btn-lg btn-block"
                  id="pa-live"
                  [class.is-busy]="busy()"
                  [disabled]="!order() || busy()"
                  (click)="payLive()"
                >
                  <rp-icon name="lock" [size]="17" /><span>Pay {{ amount() }}</span>
                </button>
              } @else {
                @if (test()) {
                  <div class="note tone-warn">
                    <rp-icon name="sparkles" [size]="17" />
                    <div class="grow">
                      <b>Test checkout.</b> The payment gateway isn't connected yet, so no money
                      moves. Nothing you type below is sent — don't enter real card details.
                    </div>
                  </div>
                }
                <rp-pa-seg
                  cls="pa-seg"
                  aria="Payment method"
                  [options]="methods"
                  [value]="method()"
                  (changed)="pickMethod($event)"
                />
                <div class="pa-gw-f">
                  @switch (method()) {
                    @case ('UPI') {
                      <div class="pa-upi">
                        <rp-pa-fld
                          fid="pa-upi"
                          label="UPI ID"
                          [error]="errors()['pa-upi']"
                          hint="You'll get a request in your UPI app to approve."
                        >
                          <input
                            id="pa-upi"
                            type="text"
                            autocomplete="off"
                            placeholder="name@bank"
                            aria-describedby="pa-upi-e"
                            [value]="typed()['pa-upi'] ?? ''"
                            (input)="type('pa-upi', $event)"
                          />
                        </rp-pa-fld>
                        <div class="pa-upi-qr">
                          <rp-pa-qr [seed]="'upi:' + (order()?.gatewayOrder?.orderId ?? '')" />
                          <small>or scan with any UPI app</small>
                        </div>
                      </div>
                    }
                    @case ('Card') {
                      <div class="stack g16">
                        <rp-pa-fld fid="pa-cno" label="Card number" [error]="errors()['pa-cno']">
                          <input
                            id="pa-cno"
                            type="text"
                            inputmode="numeric"
                            maxlength="19"
                            autocomplete="off"
                            placeholder="1234 5678 9012 3456"
                            aria-describedby="pa-cno-e"
                            [value]="typed()['pa-cno'] ?? ''"
                            (input)="type('pa-cno', $event)"
                          />
                        </rp-pa-fld>
                        <div class="pa-g3">
                          <rp-pa-fld fid="pa-cexp" label="Expiry" [error]="errors()['pa-cexp']">
                            <input
                              id="pa-cexp"
                              type="text"
                              inputmode="numeric"
                              maxlength="5"
                              autocomplete="off"
                              placeholder="MM/YY"
                              aria-describedby="pa-cexp-e"
                              [value]="typed()['pa-cexp'] ?? ''"
                              (input)="type('pa-cexp', $event)"
                            />
                          </rp-pa-fld>
                          <rp-pa-fld fid="pa-ccvv" label="CVV" [error]="errors()['pa-ccvv']">
                            <input
                              #cvv
                              id="pa-ccvv"
                              type="password"
                              inputmode="numeric"
                              maxlength="3"
                              autocomplete="off"
                              placeholder="3 digits"
                              aria-describedby="pa-ccvv-e"
                              (input)="clear('pa-ccvv')"
                            />
                          </rp-pa-fld>
                          <div></div>
                        </div>
                        <rp-pa-fld
                          fid="pa-cname"
                          label="Name on the card"
                          [error]="errors()['pa-cname']"
                        >
                          <input
                            id="pa-cname"
                            type="text"
                            autocomplete="off"
                            placeholder="As printed on the card"
                            aria-describedby="pa-cname-e"
                            [value]="typed()['pa-cname'] ?? ''"
                            (input)="type('pa-cname', $event)"
                          />
                        </rp-pa-fld>
                      </div>
                    }
                    @default {
                      <div class="stack g12">
                        <rp-pa-fld
                          fid="pa-bank"
                          label="Your bank"
                          labelFor="pa-bank-b"
                          [bare]="true"
                          [error]="errors()['pa-bank']"
                        >
                          <rp-dd
                            inputId="pa-bank"
                            [options]="banks"
                            [value]="typed()['pa-bank'] ?? ''"
                            placeholder="Choose your bank"
                            (changed)="setTyped('pa-bank', $event)"
                          />
                        </rp-pa-fld>
                        <p class="pa-fine">
                          <rp-icon name="external" [size]="13" /> You'll sign in on your bank's page
                          to approve the payment.
                        </p>
                      </div>
                    }
                  }
                </div>
                @if (test()) {
                  <div class="pa-demo">
                    <span
                      ><rp-icon name="sparkles" [size]="14" /> Test checkout — how should the bank
                      respond?</span
                    >
                    <rp-pa-seg
                      cls="pa-seg sm"
                      aria="Test outcome"
                      [options]="outcomes"
                      [value]="outcome()"
                      (changed)="outcome.set(asOutcome($event))"
                    />
                  </div>
                }
                <button
                  type="button"
                  class="btn btn-pri btn-lg btn-block"
                  [class.is-busy]="busy()"
                  [disabled]="!order()"
                  (click)="pay()"
                >
                  <rp-icon name="lock" [size]="17" /><span>Pay {{ amount() }}</span>
                </button>
              }
              <p class="pa-fine t-center">
                <rp-icon name="shieldck" [size]="13" /> Secured by the payment gateway. The school
                never sees your card or bank details.
              </p>
            </div>
          </div>
        }
        <aside class="card pa-psum">
          <div class="eyebrow">Order summary</div>
          <h3>{{ payee() }}</h3>
          <dl class="kv">
            <dt>Applicant</dt>
            <dd>{{ applicant() || '—' }}</dd>
            <dt>Class sought</dt>
            <dd>{{ className() || '—' }}</dd>
            <dt>Academic year</dt>
            <dd>{{ year() }}</dd>
            <dt>Fee</dt>
            <dd>{{ feeName() }}{{ midTerm() ? ' · mid-term' : '' }}</dd>
            @if (parts(); as p) {
              <dt>Includes</dt>
              <dd id="pa-fee-parts">
                Application fee {{ p.application }}<br />Admission fee {{ p.admission }}
              </dd>
            }
            @if (order(); as o) {
              <dt>Order</dt>
              <dd>
                <span class="t-mono">{{ o.gatewayOrder.orderId }}</span>
              </dd>
            }
          </dl>
          <div class="pa-psum-t">
            <span>Total</span><b>{{ amount() }}</b>
          </div>
          @if (attempts().length) {
            <div class="pa-attempts">
              <div class="eyebrow">Attempts on this order</div>
              @for (a of attempts(); track $index) {
                <div>
                  <span>{{ time(a.at) }} · {{ a.method }}</span
                  ><span
                    class="chip dot"
                    [class]="
                      a.outcome === 'Success'
                        ? 'tone-ok'
                        : a.outcome === 'Pending'
                          ? 'tone-warn'
                          : 'tone-bad'
                    "
                    >{{ a.outcome }}</span
                  >
                </div>
              }
            </div>
          }
        </aside>
      </div>
    }
    <ng-template #head>
      <div class="pa-gw-h">
        <rp-mark [size]="26" />
        <div class="grow">
          <b>CampusOne Pay</b><small>Secure checkout{{ test() ? ' · test mode' : '' }}</small>
        </div>
        @if (order(); as o) {
          <span class="pa-gw-lock"
            ><rp-icon name="lock" [size]="13" /> {{ o.gatewayOrder.orderId }}</span
          >
        }
      </div>
    </ng-template>
    <rp-sp-process [state]="process()" />
  `,
})
export class AdmissionPay {
  private readonly api = inject(AdmissionsApi);
  private readonly ctx = inject(AdmissionsContext);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);

  protected readonly steps = STEPS;
  protected readonly methods = METHODS;
  protected readonly outcomes = OUTCOMES;
  protected readonly banks: DropdownOption[] = BANKS.map((b) => ({ v: b, l: b }));

  /** The admission link (application fee), or null on the school's payment link. */
  protected readonly link = this.route.snapshot.paramMap.get('linkToken');
  protected readonly payLink = !this.link;
  private readonly appId =
    this.route.snapshot.paramMap.get('applicationId') ??
    this.route.snapshot.queryParamMap.get('app') ??
    '';
  /** The admission fee alone on the admission link, after submission (optional). */
  protected readonly admissionMode =
    !this.payLink && this.route.snapshot.queryParamMap.get('fee') === 'ADMISSION';
  /**
   * The family chose on the form to pay the admission fee now: one payment with the application fee
   * (client 2026-10-09).
   */
  protected readonly withAdmission =
    !this.payLink && this.route.snapshot.queryParamMap.get('with') === 'ADMISSION';
  /** The payment link's token stays in memory only. */
  private readonly token = this.payLink
    ? this.route.snapshot.queryParamMap.get('token')
    : tokenFor(this.appId);

  protected readonly loading = signal(true);
  protected readonly problem = signal<string | null>(null);
  private readonly app = signal<Application | null>(null);
  private readonly summary = signal<PaySummary | null>(null);
  protected readonly order = signal<PaymentOrder | null>(null);
  protected readonly gatewayDown = signal<string | null>(null);
  protected readonly method = signal<Method>('UPI');
  protected readonly outcome = signal<Outcome>('Success');
  protected readonly typed = signal<Record<string, string>>({});
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly result = signal<'failed' | 'pending' | null>(null);
  protected readonly failure = signal('');
  protected readonly attempts = signal<readonly Attempt[]>([]);
  protected readonly busy = signal(false);
  protected readonly process = signal<ProcessState | null>(null);
  /** The admission fee is paid (payment link): its receipt number, or true without one. */
  protected readonly paidReceipt = signal<string | true | null>(null);
  /** The payment gateway's transaction ID of the payment (client 2026-10-16). */
  protected readonly paidTxn = signal<string | null>(null);

  protected readonly feeType = computed<FeeType>(
    () =>
      this.order()?.feeType ?? (this.payLink || this.admissionMode ? 'ADMISSION' : 'APPLICATION'),
  );
  /** This payment covers the application and admission fees together. */
  protected readonly combined = computed(() => {
    const inc = this.order()?.includes;
    return inc ? inc.length > 1 : this.withAdmission && this.feeType() === 'APPLICATION';
  });
  protected readonly feeName = computed(() =>
    this.combined()
      ? 'Application fee + admission fee'
      : this.feeType() === 'ADMISSION'
        ? 'Admission fee'
        : 'Application fee',
  );
  protected readonly test = computed(() => this.order()?.gatewayOrder.mode !== 'live');
  /** Live (Razorpay): the gateway's checkout opens instead of the test forms. */
  protected readonly live = computed(() => !!this.order()?.gatewayOrder.checkout);
  protected readonly ready = computed(() => this.payLink || !!this.app()?.declaration);
  protected readonly stoppedAt = computed(() => Math.min(7, this.app()?.step ?? 0));
  protected readonly appNo = computed(
    () => this.app()?.applicationNo ?? this.summary()?.applicationNo ?? '',
  );
  protected readonly payee = computed(
    () =>
      this.ctx.landing()?.institution.name ??
      (this.appNo() ? `Application ${this.appNo()}` : 'the school'),
  );
  protected readonly applicant = computed(() => {
    const a = this.app();
    if (a)
      return [a.student.firstName, a.student.lastName]
        .filter(Boolean)
        .map((x) => titleCase(x ?? ''))
        .join(' ');
    return this.summary()?.student.name ?? '';
  });
  protected readonly className = computed(
    () => this.app()?.class?.name ?? this.summary()?.class?.name ?? '',
  );
  protected readonly year = computed(() =>
    yearLabel(this.app()?.year.label ?? this.summary()?.year.label ?? ''),
  );
  protected readonly midTerm = computed(() => !!this.app()?.midTerm);
  private readonly yearFees = computed(
    () => this.ctx.landing()?.years.find((x) => x.id === this.app()?.year.id)?.fees ?? null,
  );
  private readonly appPaise = computed(() => {
    const row = this.app()?.fees.find((f) => f.feeType === 'APPLICATION');
    return row ? paise(row.amount) : paise(this.yearFees()?.applicationFee);
  });
  private readonly admPaise = computed(() => {
    const due = this.app()?.admissionFeeDue;
    return due ? paise(due) : paise(this.yearFees()?.admissionFee);
  });
  /** The two fees of a combined payment, for the order summary. */
  protected readonly parts = computed(() =>
    this.combined()
      ? { application: formatInr(this.appPaise()), admission: formatInr(this.admPaise()) }
      : null,
  );
  protected readonly amount = computed(() => {
    const o = this.order();
    if (o) return formatInr(paise(o.amount));
    if (this.combined()) return formatInr(this.appPaise() + this.admPaise());
    const fees = this.app()?.fees ?? this.summary()?.fees ?? [];
    const row = fees.find((f) => f.feeType === this.feeType());
    if (row) return formatInr(paise(row.amount));
    const due = this.app()?.admissionFeeDue;
    if (this.feeType() === 'ADMISSION' && due) return formatInr(paise(due));
    const y = this.ctx.landing()?.years.find((x) => x.id === this.app()?.year.id);
    return formatInr(
      paise(this.feeType() === 'ADMISSION' ? y?.fees?.admissionFee : y?.fees?.applicationFee),
    );
  });

  constructor() {
    void this.init();
  }

  private async init() {
    if (this.link) await this.ctx.load(this.link);
    else this.ctx.clear();
    if (!this.appId || !this.token) {
      this.problem.set(translate('ADM.NOT_FOUND'));
      this.loading.set(false);
      return;
    }
    try {
      if (this.payLink) {
        const s = await this.api.read<PaySummary>(this.appId, this.token);
        this.summary.set(s);
        const fee = s.fees.find((f) => f.feeType === 'ADMISSION');
        if (fee?.status === 'PAID') {
          this.paidTxn.set(fee.transactionId ?? null);
          this.paidReceipt.set(fee.receiptNo ?? true);
          return;
        }
      } else {
        const a = await this.api.read(this.appId, this.token);
        this.app.set(a);
        if (this.admissionMode) {
          // Paid already, or nothing to pay: back to the confirmation.
          const adm = a.fees.find((f) => f.feeType === 'ADMISSION');
          if (adm?.status === 'PAID' || a.status === 'DRAFT' || a.status === 'REJECTED') {
            await this.done();
            return;
          }
        } else {
          const fee = a.fees.find((f) => f.feeType === 'APPLICATION');
          if (fee?.status === 'PAID' || a.status !== 'DRAFT') {
            await this.done();
            return;
          }
          if (!a.declaration) return;
        }
      }
      await this.newOrder();
    } catch (e) {
      this.problem.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** ADM-010: an order for the fee (the same fee row; a new gateway order each try). */
  private async newOrder() {
    try {
      const o = await this.api.startPayment(
        this.appId,
        this.token!,
        this.admissionMode ? 'ADMISSION' : undefined,
        this.withAdmission && !this.admissionMode,
      );
      this.order.set(o);
      // Live: the gateway's checkout (Razorpay); test: the test answer completes it.
      this.gatewayDown.set(
        o.gatewayOrder.mode === 'live' && !o.gatewayOrder.test && !o.gatewayOrder.checkout
          ? translate('ADM.GATEWAY_NOT_CONFIGURED')
          : null,
      );
    } catch (e) {
      const p = asProblem(e);
      if (p.code === 'ADM.FEE_ALREADY_PAID') return this.done();
      if (p.code === 'ADM.GATEWAY_NOT_CONFIGURED' || p.status === 503) {
        this.gatewayDown.set(problemText(p));
        return;
      }
      throw e;
    }
  }

  protected time(v: string) {
    return formatTime(v);
  }
  protected asOutcome(v: string) {
    return v as Outcome;
  }
  protected pickMethod(v: string) {
    this.method.set(v as Method);
    this.errors.set({});
  }
  protected type(id: string, e: Event) {
    this.setTyped(id, (e.target as HTMLInputElement).value);
  }
  protected setTyped(id: string, v: string) {
    this.typed.update((t) => ({ ...t, [id]: v }));
    this.clear(id);
  }
  protected clear(id: string) {
    if (this.errors()[id]) this.errors.update((e) => ({ ...e, [id]: '' }));
  }

  /** The prototype's checks of what was typed (kept on this page only; never sent). */
  private check(): boolean {
    const t = this.typed();
    const e: Record<string, string> = {};
    const required = translate('VALIDATION.REQUIRED');
    const m = this.method();
    if (m === 'UPI') {
      const v = (t['pa-upi'] ?? '').trim();
      if (!v) e['pa-upi'] = required;
      else if (!/^[\w.-]{2,}@[A-Za-z]{2,}$/.test(v)) e['pa-upi'] = 'Enter a UPI ID like name@bank';
    } else if (m === 'Card') {
      const no = (t['pa-cno'] ?? '').replace(/\s/g, '');
      if (!no) e['pa-cno'] = required;
      else if (!/^\d{16}$/.test(no)) e['pa-cno'] = 'Enter the 16-digit card number';
      const exp = (t['pa-cexp'] ?? '').trim();
      const mm = /^(\d{2})\/(\d{2})$/.exec(exp);
      if (!exp) e['pa-cexp'] = required;
      else if (!mm || +mm[1]! < 1 || +mm[1]! > 12) e['pa-cexp'] = 'Use MM/YY';
      else if (new Date(2000 + +mm[2]!, +mm[1]!, 0) < new Date())
        e['pa-cexp'] = 'This card has expired';
      const cvv = (document.getElementById('pa-ccvv') as HTMLInputElement | null)?.value ?? '';
      if (!cvv) e['pa-ccvv'] = required;
      else if (!/^\d{3}$/.test(cvv)) e['pa-ccvv'] = 'The CVV has 3 digits';
      const name = (t['pa-cname'] ?? '').trim();
      if (!name) e['pa-cname'] = required;
      else if (!/^[A-Za-z .'-]+$/.test(name)) e['pa-cname'] = translate('VALIDATION.FORMAT');
    } else if (!t['pa-bank']) e['pa-bank'] = required;
    this.errors.set(e);
    return !Object.keys(e).length;
  }

  /** Pay: the test outcome decides what reaches ADM-011. */
  protected async pay() {
    const o = this.order();
    if (!o || this.busy() || !this.check()) return;
    const m = this.method();
    const out = this.outcome();
    const ref = o.gatewayOrder.test?.paymentId ?? '';
    this.busy.set(true);
    try {
      const v = await runProcess(
        this.process,
        {
          title: `Paying ${this.amount()}`,
          sub: "Don't close or refresh this page",
          icon: 'lock',
          steps: [
            m === 'Net banking'
              ? `Connecting to ${this.typed()['pa-bank']}`
              : 'Contacting your bank',
            'Waiting for your approval',
            "Verifying the gateway's signed response",
            'Recording the payment',
          ],
        },
        async () => {
          if (out === 'Pending') throw new StillPending();
          const t = o.gatewayOrder.test;
          if (!t) throw asProblem(new Error('no test answer'));
          return this.api.verifyPayment(this.appId, this.token!, o.paymentId, {
            gatewayPaymentId: t.paymentId,
            signature: out === 'Success' ? t.signature : `${t.signature.slice(0, 16)}-declined`,
          });
        },
        (e) => (e instanceof StillPending ? "Your bank hasn't confirmed yet" : problemText(e)),
      );
      this.attempts.update((a) => [
        ...a,
        { at: new Date().toISOString(), method: m, outcome: 'Success', ref },
      ]);
      // One receipt per fee: two when the admission fee was paid with the application fee.
      const receipts = (v.receipts?.map((r) => r.receiptNo) ?? [v.receiptNo]).filter(Boolean);
      this.overlays.toast('Payment received', {
        sub: `${this.amount()}${receipts.length ? ' · ' + receipts.join(', ') : ''}${v.transactionId ? ' · transaction ID ' + v.transactionId : ''}`,
      });
      await this.done(v.receiptNo, v.transactionId);
    } catch (e) {
      const pending = e instanceof StillPending;
      this.attempts.update((a) => [
        ...a,
        { at: new Date().toISOString(), method: m, outcome: pending ? 'Pending' : 'Failed', ref },
      ]);
      if (!pending) this.failure.set(problemText(e));
      this.result.set(pending ? 'pending' : 'failed');
      scrollTop();
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Live (Razorpay, client 2026-10-09): the gateway's own payment window. Its signed answer goes to
   * ADM-011, where the server verifies it and checks the payment with the gateway before the fee is
   * paid. Closing the window leaves the order as it was, to pay again.
   */
  protected async payLive() {
    const o = this.order();
    const c = o?.gatewayOrder.checkout;
    if (!o || !c || this.busy()) return;
    this.busy.set(true);
    let answer: CheckoutAnswer | null;
    try {
      answer = await openCheckout({
        keyId: c.keyId,
        orderId: o.gatewayOrder.orderId,
        name: c.name,
        description: `${this.feeName()} · ${this.year()}`,
        onFailed: (reason) =>
          this.attempts.update((a) => [
            ...a,
            { at: new Date().toISOString(), method: 'Online', outcome: 'Failed', ref: reason },
          ]),
      });
    } catch (e) {
      this.overlays.toast(e instanceof Error ? e.message : problemText(e), { tone: 'bad' });
      this.busy.set(false);
      return;
    }
    if (!answer) {
      this.busy.set(false);
      return;
    }
    const paid = answer;
    try {
      const v = await runProcess(
        this.process,
        {
          title: `Paying ${this.amount()}`,
          sub: "Don't close or refresh this page",
          icon: 'lock',
          steps: ["Verifying the gateway's signed response", 'Recording the payment'],
        },
        () =>
          this.api.verifyPayment(this.appId, this.token!, o.paymentId, {
            gatewayPaymentId: paid.razorpay_payment_id,
            signature: paid.razorpay_signature,
          }),
        (e) => problemText(e),
      );
      this.attempts.update((a) => [
        ...a,
        {
          at: new Date().toISOString(),
          method: 'Online',
          outcome: 'Success',
          ref: paid.razorpay_payment_id,
        },
      ]);
      this.overlays.toast('Payment received', {
        sub: `${this.amount()}${v.receiptNo ? ' · ' + v.receiptNo : ''}${v.transactionId ? ' · transaction ID ' + v.transactionId : ''}`,
      });
      await this.done(v.receiptNo, v.transactionId);
    } catch (e) {
      // Paid at the gateway but not confirmed here yet: the webhook can still record it.
      this.failure.set(problemText(e));
      this.result.set('failed');
      scrollTop();
    } finally {
      this.busy.set(false);
    }
  }

  /** Try again: a new order for the same fee. */
  protected async retry() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.newOrder();
      this.result.set(null);
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    } finally {
      this.busy.set(false);
    }
  }

  /** Pending: reads the application again to see whether the fee was confirmed. */
  protected async checkStatus() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const fees = this.payLink
        ? (await this.api.read<PaySummary>(this.appId, this.token!)).fees
        : (await this.api.read(this.appId, this.token!)).fees;
      const fee = fees.find((f) => f.feeType === this.feeType());
      if (fee?.status === 'PAID') {
        this.overlays.toast('Payment confirmed by your bank', {
          sub: `${this.amount()}${fee.receiptNo ? ' · ' + fee.receiptNo : ''}${fee.transactionId ? ' · transaction ID ' + fee.transactionId : ''}`,
        });
        await this.done(fee.receiptNo, fee.transactionId);
      } else {
        this.overlays.toast("Your bank hasn't confirmed yet", { tone: 'info' });
      }
    } catch (e) {
      this.overlays.toast(problemText(e), { tone: 'bad' });
    } finally {
      this.busy.set(false);
    }
  }

  private async done(receipt?: string | null, transactionId?: string | null): Promise<void> {
    if (this.payLink) {
      this.paidTxn.set(transactionId ?? null);
      this.paidReceipt.set(receipt ?? true);
      return;
    }
    await this.router.navigate(['/admissions', this.link, 'done'], {
      queryParams: { app: this.appId },
      replaceUrl: true,
    });
  }

  /** Back: the form while it is a draft; the confirmation once submitted (admission fee). */
  protected back() {
    if (this.admissionMode) void this.done();
    else this.toForm();
  }

  protected toForm() {
    void this.router.navigate(['/admissions', this.link, 'apply'], {
      queryParams: { app: this.appId },
    });
  }

  protected admissions() {
    void this.router.navigate(['/admissions', this.link]);
  }
}
