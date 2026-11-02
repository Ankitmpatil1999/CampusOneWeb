import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { amountPaise } from '../../Shared/Amount';
import { Icon } from '../../Shared/Icon';
import { Mark } from '../../Shared/Mark';
import { formatDate, formatDateTime, formatInr, titleCase } from '../../Utils/format';
import { ApiProblem } from '../../Utils/problem';
import { openCheckout } from '../../Utils/razorpay-checkout';
import { translate } from '../../Utils/translate';
import { crest } from '../Admissions/admissions.store';
import { PaSkeleton, ResultMark } from '../Admissions/Shared/AdmissionsUi';
import { FeePayApi, type FeePayOrder, type FeePayPage, type Money } from './fee-pay.api';

/**
 * The payment page of an instalment (FEE-049…051, FEE-055; client 2026-10-19, 2026-10-22), opened
 * from the payment link the school sent or the QR code it showed — laid out as the admission fee's
 * payment page: the checkout (the amount, the instalment and year, "Pay", which takes it through the
 * school's gateway, or a test checkout while no gateway is connected) beside the order summary (the
 * student with the admission number and class, the year, the instalment and its due date, the
 * order once made, the total). Paid, it shows the receipt, to download as a PDF.
 */
@Component({
  selector: 'rp-fee-pay',
  imports: [Icon, Mark, PaSkeleton, ResultMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block; min-height: 100%' },
  // Not encapsulated, as the admission pages' frame: the mark's image is inside rp-mark.
  encapsulation: ViewEncapsulation.None,
  styles: `
    .fp-pub {
      min-height: 100vh;
    }
    .fp-pub .pub-top .mk {
      border-radius: 12px;
      flex: none;
    }
  `,
  template: `
    <div class="pub fp-pub">
      <header class="pub-top">
        @if (page(); as p) {
          <span class="crest" aria-hidden="true">{{ crestOf(p.school.name) }}</span>
          <div class="grow">
            <b>{{ p.school.name }}</b
            ><small>School fee payment</small>
          </div>
        } @else {
          <rp-mark [size]="42" />
          <div class="grow"><b>School fees</b><small>School fee payment on CampusOne</small></div>
        }
        <span class="t-xs t-muted row g6"
          ><rp-icon name="lock" [size]="13" /> Secure payment · powered by CampusOne</span
        >
      </header>
      <main class="pub-main">
        @if (error()) {
          <div class="pa-narrow">
            <div class="card" id="fp-error">
              <div class="empty error-state">
                <div class="empty-ic"><rp-icon name="receipt" [size]="26" /></div>
                <h4>This payment link can't be used</h4>
                <p>{{ error() }}</p>
              </div>
            </div>
          </div>
        } @else if (!page()) {
          <div class="pa-narrow"><rp-pa-skel /></div>
        } @else {
          @let p = page()!;
          @switch (p.status) {
            @case ('PAID') {
              @let r = p.receipt;
              <div class="pa-done">
                <div class="card pa-done-c" id="fp-paid">
                  <rp-pa-res kind="ok" />
                  <h1>Fee paid</h1>
                  <p>
                    Thank you. {{ p.school.name }} has received {{ p.instalment.label }} for
                    {{ p.student.name }}.
                  </p>
                  @if (r?.receiptNo ?? p.receiptNo; as no) {
                    <div class="pa-appno">
                      <span>Receipt number</span><b class="t-mono" id="fp-rcpt-no">{{ no }}</b>
                    </div>
                  }
                  <dl class="kv" id="fp-receipt">
                    @if (r) {
                      <dt>Paid on</dt>
                      <dd>{{ when(r.paidAt) }}</dd>
                      <dt>Mode</dt>
                      <dd>{{ r.mode === 'CASH' ? 'Cash' : 'Online' }}</dd>
                    }
                    @if (r?.transactionId ?? p.transactionId; as t) {
                      <!-- The payment gateway's own ID (client 2026-10-16). -->
                      <dt>Transaction ID</dt>
                      <dd>
                        <span class="t-mono" id="fp-txn">{{ t }}</span>
                      </dd>
                    }
                    @if (r?.paidBy; as by) {
                      <dt>Received from</dt>
                      <dd>{{ person(by) }}</dd>
                    }
                    <dt>Student</dt>
                    <dd>{{ p.student.name }}</dd>
                    <dt>Admission number</dt>
                    <dd>
                      <span class="t-mono">{{ p.student.admissionNo ?? '—' }}</span>
                    </dd>
                    <dt>Class</dt>
                    <dd>{{ p.student.classSection ?? '—' }}</dd>
                    <dt>Academic year</dt>
                    <dd>{{ r?.year ?? p.year?.label ?? '—' }}</dd>
                    <dt>Instalment</dt>
                    <dd>{{ p.instalment.label }}</dd>
                    <dt>Due date</dt>
                    <dd>{{ date(p.instalment.dueDate) }}</dd>
                    @if (r) {
                      <dt>Fee</dt>
                      <dd>{{ inr(r.amount) }}</dd>
                      <dt>Late fine</dt>
                      <dd>{{ inr(r.fine) }}</dd>
                      <dt>Total paid</dt>
                      <dd>
                        <b id="fp-total">{{ inr(r.total) }}</b>
                      </dd>
                    } @else {
                      <dt>Amount paid</dt>
                      <dd>
                        <b id="fp-total">{{ inr(p.amount) }}</b>
                      </dd>
                    }
                  </dl>
                  @if (dlError(); as e) {
                    <div class="note tone-bad" id="fp-dl-error" role="alert">
                      <rp-icon name="alertc" [size]="17" />
                      <div class="grow">{{ e }}</div>
                    </div>
                  }
                  <div class="pa-done-a">
                    <button
                      type="button"
                      class="btn btn-pri"
                      id="fp-receipt-pdf"
                      [class.is-busy]="downloading()"
                      [disabled]="downloading()"
                      (click)="download(r?.receiptNo ?? p.receiptNo)"
                    >
                      <rp-icon name="download" [size]="17" /><span>Download receipt</span>
                    </button>
                  </div>
                </div>
              </div>
            }
            @case ('CLOSED') {
              <div class="pa-narrow">
                <div class="card" id="fp-closed">
                  <div class="empty">
                    <div class="empty-ic"><rp-icon name="info" [size]="26" /></div>
                    <h4>Nothing to pay on this link</h4>
                    <p>
                      {{ p.instalment.label }} for {{ p.student.name }}
                      {{ p.student.admissionNo ? '(' + p.student.admissionNo + ')' : '' }} is
                      already paid, or the link was withdrawn. For any question, please contact the
                      school office.
                    </p>
                  </div>
                </div>
              </div>
            }
            @default {
              <div class="pa-pay" id="fp-card">
                <div class="card pa-gw">
                  <div class="pa-gw-h">
                    <rp-mark [size]="26" />
                    <div class="grow">
                      <b>CampusOne Pay</b
                      ><small>Secure checkout{{ test() ? ' · test mode' : '' }}</small>
                    </div>
                    @if (order(); as o) {
                      <span class="pa-gw-lock" id="fp-order"
                        ><rp-icon name="lock" [size]="13" /> {{ o.gatewayOrder.orderId }}</span
                      >
                    }
                  </div>
                  <div class="pa-gw-b">
                    <div class="pa-gw-amt" id="fp-amt">
                      <span>Paying {{ p.school.name }}</span
                      ><b>{{ amountText() }}</b
                      ><small
                        >{{ p.instalment.label }}{{ p.year ? ' · ' + p.year.label : '' }}</small
                      >
                    </div>
                    @if (payError(); as e) {
                      <div class="note tone-bad" id="fp-pay-error" role="alert">
                        <rp-icon name="alertc" [size]="17" />
                        <div class="grow">{{ e }}</div>
                      </div>
                    }
                    @if (testOrder(); as o) {
                      <div class="note tone-warn" id="fp-test">
                        <rp-icon name="sparkles" [size]="17" />
                        <div class="grow">
                          <b>Test checkout.</b> The school's payment gateway isn't connected yet, so
                          no money moves.
                        </div>
                      </div>
                      <button
                        type="button"
                        class="btn btn-pri btn-lg btn-block"
                        id="fp-test-pay"
                        [class.is-busy]="busy()"
                        [disabled]="busy()"
                        (click)="completeTest(o)"
                      >
                        <rp-icon name="lock" [size]="17" /><span>Complete the test payment</span>
                      </button>
                    } @else {
                      <div class="note tone-info">
                        <rp-icon name="lock" [size]="17" />
                        <div class="grow">
                          Choose <b>Pay {{ amountText() }}</b> to open the secure payment window,
                          then pay by UPI, card, net banking or wallet there.
                        </div>
                      </div>
                      <button
                        type="button"
                        class="btn btn-pri btn-lg btn-block"
                        id="fp-pay"
                        [class.is-busy]="busy()"
                        [disabled]="busy()"
                        (click)="pay()"
                      >
                        <rp-icon name="lock" [size]="17" /><span>Pay {{ amountText() }}</span>
                      </button>
                    }
                    <p class="pa-fine t-center">
                      <rp-icon name="shieldck" [size]="13" /> Secured by the payment gateway. The
                      school never sees your card or bank details.
                    </p>
                  </div>
                </div>
                <aside class="card pa-psum" id="fp-sum">
                  <div class="eyebrow">Order summary</div>
                  <h3>{{ p.school.name }}</h3>
                  <dl class="kv" id="fp-what">
                    <dt>Student</dt>
                    <dd>{{ p.student.name }}</dd>
                    <!-- The admission number on the page the link opens (client 2026-10-22). -->
                    <dt>Admission number</dt>
                    <dd>
                      <span class="t-mono" id="fp-adm">{{ p.student.admissionNo ?? '—' }}</span>
                    </dd>
                    <dt>Class</dt>
                    <dd>{{ p.student.classSection ?? '—' }}</dd>
                    <dt>Academic year</dt>
                    <dd>{{ p.year?.label ?? '—' }}</dd>
                    <dt>Instalment</dt>
                    <dd>{{ p.instalment.label }}</dd>
                    <dt>Due date</dt>
                    <dd>{{ date(p.instalment.dueDate) }}</dd>
                    @if (order(); as o) {
                      <dt>Order</dt>
                      <dd>
                        <span class="t-mono">{{ o.gatewayOrder.orderId }}</span>
                      </dd>
                    }
                  </dl>
                  <div class="pa-psum-t">
                    <span>Total</span><b>{{ amountText() }}</b>
                  </div>
                </aside>
              </div>
            }
          }
        }
      </main>
      <footer class="pub-foot">
        <rp-mark [size]="16" /> Payments go to {{ page()?.school.name ?? 'the school' }} through its
        payment gateway.
      </footer>
    </div>
  `,
})
export class FeePay {
  private readonly api = inject(FeePayApi);
  private readonly route = inject(ActivatedRoute);

  private readonly requestId = this.route.snapshot.paramMap.get('requestId') ?? '';
  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';
  protected readonly page = signal<FeePayPage | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  /** The gateway's order, once Pay made one (FEE-050). */
  protected readonly order = signal<FeePayOrder | null>(null);
  /** Test mode: the order whose test answer completes it. */
  protected readonly testOrder = signal<FeePayOrder | null>(null);
  /** The payment didn't go through: why, beside Pay to try again. */
  protected readonly payError = signal('');
  protected readonly downloading = signal(false);
  protected readonly dlError = signal('');
  protected readonly test = computed(() => {
    const o = this.order();
    return !!o && !o.gatewayOrder.checkout;
  });
  protected readonly amountText = computed(() => {
    const a = this.page()?.amount;
    return a ? this.inr(a) : '';
  });

  constructor() {
    void this.load();
  }

  private problem(e: unknown) {
    return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
  }

  private async load() {
    if (!this.token) {
      this.error.set(translate('FEE.PAY_LINK_INVALID'));
      return;
    }
    try {
      this.page.set(await this.api.page(this.requestId, this.token));
    } catch (e) {
      this.error.set(this.problem(e));
    }
  }

  protected async pay() {
    const p = this.page();
    if (!p || this.busy()) return;
    this.busy.set(true);
    this.payError.set('');
    try {
      const o = await this.api.order(this.requestId, this.token);
      this.order.set(o);
      const c = o.gatewayOrder.checkout;
      if (!c) {
        // No gateway connected: the test checkout.
        this.testOrder.set(o);
        return;
      }
      const answer = await openCheckout({
        keyId: c.keyId,
        orderId: o.gatewayOrder.orderId,
        name: c.name,
        description: `${p.instalment.label} · ${p.student.name}`,
      });
      if (!answer) return;
      this.page.set(
        await this.api.verify(this.requestId, this.token, {
          gatewayPaymentId: answer.razorpay_payment_id,
          signature: answer.razorpay_signature,
        }),
      );
    } catch (e) {
      this.payError.set(
        e instanceof ApiProblem || !(e instanceof Error) ? this.problem(e) : e.message,
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async completeTest(o: FeePayOrder) {
    const t = o.gatewayOrder.test;
    if (!t || this.busy()) return;
    this.busy.set(true);
    this.payError.set('');
    try {
      this.page.set(
        await this.api.verify(this.requestId, this.token, {
          gatewayPaymentId: t.paymentId,
          signature: t.signature,
        }),
      );
      this.testOrder.set(null);
    } catch (e) {
      this.payError.set(this.problem(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** FEE-055: the receipt as a PDF file. */
  protected async download(receiptNo: string | null) {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.dlError.set('');
    try {
      await this.api.receipt(this.requestId, this.token, receiptNo);
    } catch (e) {
      this.dlError.set(`Couldn't download the receipt. ${this.problem(e)}`);
    } finally {
      this.downloading.set(false);
    }
  }

  protected inr(m: Money) {
    return formatInr(amountPaise(m));
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected when(d: string) {
    return formatDateTime(d);
  }
  protected person(n: string) {
    return titleCase(n);
  }
  protected crestOf(name: string) {
    return crest(name);
  }
}
