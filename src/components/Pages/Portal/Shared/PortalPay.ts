/**
 * The invoice drawer (SP.invView) and the payment sheet (SP.paySheet) of the customer portal
 * (SAS-015…017; FR-SAS-07/08). Online payment arrives with the payment gateway (Q17): its choices
 * are shown as the prototype draws them, the server answers SAS.GATEWAY_UNAVAILABLE, and a bank
 * transfer is reported with its reference and date for CampusOne to confirm.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, istBusinessDate } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { INVOICE_STATUS, INVOICE_TRIGGER } from '../../Backoffice/Plans/plans.api';
import { PortalApi, type Invoice, type PortalSubscription } from '../portal.api';
import { payable } from '../portal.store';
import { choiceKeys, inr, paiseOf, toneOf } from './PortalUi';
import { Field } from './PortalUi';

type Method = 'UPI' | 'CARD' | 'NETBANKING' | 'BANK';

const METHODS: readonly { v: Method; t: string; s: string; icon: IconName }[] = [
  { v: 'UPI', t: 'UPI', s: 'Any UPI app', icon: 'qr' },
  { v: 'CARD', t: 'Card', s: 'Debit or credit card', icon: 'card' },
  { v: 'NETBANKING', t: 'Net banking', s: 'All major banks', icon: 'bank' },
  {
    v: 'BANK',
    t: 'Bank transfer',
    s: 'CampusOne marks it paid when the money arrives — usually within one working day',
    icon: 'send',
  },
];

const label = (v: Invoice) => INVOICE_STATUS[v.status]?.label ?? v.status;

@Component({
  selector: 'rp-sp-invoice',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<rp-modal
    [title]="'Invoice ' + invoice().invoiceNo"
    [sub]="trigger() + ' · ' + invoice().period"
    icon="receipt"
    [drawer]="true"
    [slim]="true"
    (closed)="closed.emit()"
  >
    @let v = invoice();
    <div class="stack g16">
      <div class="row wrap g8">
        <span [class]="'chip dot tone-' + tone(status())">{{ status() }}</span>
        @if (v.transfer && v.status !== 'PAID') {
          <span class="chip dot tone-info">Transfer reported</span>
        }
      </div>
      <div class="fs">
        <h4>Lines</h4>
        <div class="fs-b">
          <dl class="kv">
            @for (l of v.lines; track $index) {
              <dt>{{ l.description }}</dt>
              <dd class="t-num">{{ money(l.amount) }}</dd>
            }
            <dt>GST {{ pct(v.taxPercent) }}%</dt>
            <dd class="t-num">{{ money(v.tax) }}</dd>
          </dl>
          <div class="sp-inv-tot mt8">
            <span>Total</span><b class="t-num">{{ money(v.total) }}</b>
          </div>
        </div>
      </div>
      <div class="fs">
        <h4>Dates and payment</h4>
        <div class="fs-b">
          <dl class="kv">
            <dt>Billed to</dt>
            <dd>{{ v.institution.name }}</dd>
            <dt>Issued</dt>
            <dd>{{ date(v.issuedOn) }}</dd>
            <dt>Due</dt>
            <dd>{{ date(v.dueOn) }}</dd>
            @if (v.status === 'GRACE' || v.status === 'OVERDUE') {
              <dt>Grace period ends</dt>
              <dd>{{ date(v.graceUntilOn) }}</dd>
            }
            <dt>Paid</dt>
            <dd>{{ v.paidAt ? dt(v.paidAt) : 'Not yet' }}</dd>
            <dt>Payment</dt>
            <dd>
              @if (v.payment; as p) {
                {{ p.method === 'GATEWAY' ? 'Payment gateway' : 'Bank transfer' }}
              } @else if (v.transfer; as t) {
                Bank transfer reported · {{ date(t.paidOn) }}
              } @else {
                <span class="t-faint">—</span>
              }
            </dd>
            <dt>Reference</dt>
            <dd>
              @if (v.payment?.reference ?? v.transfer?.utr; as ref) {
                <span class="t-mono">{{ ref }}</span>
              } @else {
                <span class="t-faint">—</span>
              }
            </dd>
          </dl>
        </div>
      </div>
      @if (canPay() && suspended()) {
        <div class="note tone-warn">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">
            {{ v.institution.name }} is suspended. Paying this invoice restores it straight away.
          </div>
        </div>
      }
    </div>
    <ng-container modal-foot>
      <button type="button" class="btn btn-sec" (click)="download()">
        <rp-icon name="download" [size]="17" /><span>Download PDF</span>
      </button>
      @if (canPay()) {
        <button type="button" class="btn btn-accent" (click)="pay.emit(v)">
          <span>Pay {{ money(v.total) }}</span>
        </button>
      }
    </ng-container>
  </rp-modal>`,
})
export class InvoiceDrawer {
  private readonly api = inject(PortalApi);
  private readonly overlays = inject(Overlays);
  readonly invoice = input.required<Invoice>();
  readonly suspended = input(false);
  readonly closed = output<void>();
  readonly pay = output<Invoice>();
  protected readonly status = computed(() => label(this.invoice()));
  protected readonly trigger = computed(() => INVOICE_TRIGGER[this.invoice().trigger]);
  protected readonly canPay = computed(() => payable(this.invoice()));

  protected tone(s: string) {
    return toneOf(s);
  }
  protected money(m: Invoice['total']) {
    return inr(paiseOf(m));
  }
  protected pct(v: string) {
    return String(Number(v));
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }

  protected async download() {
    const v = this.invoice();
    try {
      await this.api.pdf(v);
      this.overlays.toast('Invoice downloaded', { sub: `${v.invoiceNo}.pdf · GST tax invoice` });
    } catch (e) {
      this.overlays.toast('Not downloaded', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }
}

@Component({
  selector: 'rp-sp-pay',
  imports: [Field, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<rp-modal
    [title]="'Pay ' + money(invoice().total)"
    [sub]="invoice().invoiceNo + ' · ' + trigger() + ' · ' + invoice().period"
    icon="card"
    (closed)="closed.emit()"
  >
    @let v = invoice();
    <div class="stack g14">
      <dl class="kv">
        @for (l of v.lines; track $index) {
          <dt>{{ l.description }}</dt>
          <dd class="t-num">{{ money(l.amount) }}</dd>
        }
        <dt>GST {{ pct(v.taxPercent) }}%</dt>
        <dd class="t-num">{{ money(v.tax) }}</dd>
      </dl>
      <div class="sp-inv-tot">
        <span>Total</span><b class="t-num">{{ money(v.total) }}</b>
      </div>
      @if (v.transfer; as t) {
        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            You reported a bank transfer on {{ date(t.paidOn) }} (reference
            <span class="t-mono">{{ t.utr }}</span
            >). CampusOne marks the invoice paid when it arrives.
          </div>
        </div>
      }
      <div class="fld">
        <span class="fld-l">How would you like to pay?</span>
        <div class="sp-pm" role="radiogroup" aria-label="How would you like to pay?">
          @for (m of methods; track m.v) {
            <div
              class="choice"
              [class.on]="method() === m.v"
              tabindex="0"
              role="radio"
              [attr.aria-checked]="method() === m.v"
              (click)="pick(m.v)"
              (keydown)="keys($event, m.v)"
            >
              <span class="li-ic sm"><rp-icon [name]="m.icon" [size]="17" /></span>
              <span class="grow"
                ><span class="t-h4" style="display: block">{{ m.t }}</span
                ><span class="t-sm t-muted" style="display: block; margin-top: 1px">{{
                  m.s
                }}</span></span
              ><span class="radio"></span>
            </div>
          }
        </div>
      </div>
      @if (method() === 'BANK') {
        <div class="sp-bankbox">
          @if (payee(); as pe) {
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
          }
          <div class="c-form mt12">
            <rp-sp-fld
              fid="sp-pm-utr"
              label="Bank reference (UTR)"
              [req]="true"
              [error]="errors()['utr']"
              hint="Helps us match your transfer faster"
            >
              <input
                id="sp-pm-utr"
                maxlength="22"
                autocomplete="off"
                placeholder="e.g. UTR261001445512"
                aria-describedby="sp-pm-utr-e"
                [value]="utr()"
                (input)="utr.set(value($event).toUpperCase()); errors.set({})"
              />
            </rp-sp-fld>
            <rp-sp-fld fid="sp-pm-on" label="Paid on" [req]="true" [error]="errors()['paidOn']">
              <input
                id="sp-pm-on"
                type="date"
                aria-describedby="sp-pm-on-e"
                [max]="today"
                [min]="v.issuedOn"
                [value]="paidOn()"
                (input)="paidOn.set(value($event)); errors.set({})"
              />
            </rp-sp-fld>
          </div>
        </div>
      } @else {
        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">{{ gatewayText }}</div>
        </div>
      }
    </div>
    <ng-container modal-foot>
      <button type="button" class="btn btn-sec" (click)="closed.emit()">
        <span>Cancel</span>
      </button>
      <button
        type="button"
        class="btn btn-accent"
        id="sp-pm-go"
        [class.is-busy]="busy()"
        (click)="go()"
      >
        <rp-icon name="lock" [size]="17" /><span>{{
          method() === 'BANK' ? "I've made the transfer" : 'Pay ' + money(v.total)
        }}</span>
      </button>
    </ng-container>
  </rp-modal>`,
})
export class PaySheet {
  private readonly api = inject(PortalApi);
  private readonly overlays = inject(Overlays);
  readonly invoice = input.required<Invoice>();
  readonly payee = input<PortalSubscription['payee'] | null>(null);
  readonly closed = output<void>();
  /** The transfer was reported: the invoice as the server now has it. */
  readonly paid = output<Invoice>();

  protected readonly methods = METHODS;
  protected readonly today = istBusinessDate();
  protected readonly gatewayText = translate('SAS.GATEWAY_UNAVAILABLE');
  protected readonly method = signal<Method>('BANK');
  protected readonly utr = signal('');
  protected readonly paidOn = signal(istBusinessDate());
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly trigger = computed(() => INVOICE_TRIGGER[this.invoice().trigger]);

  protected money(m: Invoice['total']) {
    return inr(paiseOf(m));
  }
  protected pct(v: string) {
    return String(Number(v));
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected pick(m: Method) {
    this.method.set(m);
    this.errors.set({});
  }
  protected keys(e: KeyboardEvent, m: Method) {
    choiceKeys(e, () => this.pick(m));
  }

  protected async go() {
    if (this.busy()) return;
    const v = this.invoice();
    if (this.method() !== 'BANK') {
      // Online payment arrives with the gateway (Q17): the server says so.
      this.busy.set(true);
      try {
        await this.api.pay(v.id, { method: 'GATEWAY' });
      } catch (e) {
        this.overlays.toast('Not paid online', {
          sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
          tone: 'info',
        });
      } finally {
        this.busy.set(false);
      }
      return;
    }
    const utr = this.utr().trim();
    const on = this.paidOn();
    const errors: Record<string, string> = {};
    if (!utr) errors['utr'] = translate('VALIDATION.REQUIRED');
    else if (!/^[A-Z0-9]{10,22}$/.test(utr)) errors['utr'] = translate('SAS.UTR_FORMAT');
    if (!on) errors['paidOn'] = translate('VALIDATION.REQUIRED');
    else if (on > this.today) errors['paidOn'] = translate('SAS.PAID_ON_FUTURE');
    else if (on < v.issuedOn) errors['paidOn'] = translate('SAS.PAID_ON_BEFORE_ISSUE');
    if (Object.keys(errors).length) {
      this.errors.set(errors);
      return;
    }
    this.busy.set(true);
    try {
      const out = await this.api.pay(v.id, { method: 'BANK_TRANSFER', utr, paidOn: on });
      this.overlays.toast("Thanks — we'll confirm it", {
        sub: `CampusOne marks ${v.invoiceNo} paid when the transfer arrives`,
        tone: 'info',
      });
      this.paid.emit(out);
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.length) {
        this.errors.set(Object.fromEntries(e.errors.map((x) => [x.field, x.message])));
      } else if (e instanceof ApiProblem && e.code === 'SAS.UTR_TAKEN') {
        this.errors.set({ utr: e.detail });
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
