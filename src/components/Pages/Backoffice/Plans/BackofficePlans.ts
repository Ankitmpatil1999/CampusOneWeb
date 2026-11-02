import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Card, Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, formatInr, istBusinessDate } from '../../../Utils/format';
import { AMOUNT_PATTERN, parseAmount } from '../../../Utils/money';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { InstitutionsApi, type InstitutionRow } from '../Institutions/institutions.api';
import {
  type BillingProfile,
  INVOICE_STATUS,
  INVOICE_TRIGGER,
  BILLING_DEFAULTS,
  PlansApi,
  type BillingSettings,
  type Invoice,
  type InvoiceStatus,
  type InvoiceTrigger,
  type PlanInput,
  type PlanView,
} from './plans.api';

type Tab = 'plans' | 'invoices' | 'rules';

interface Form {
  name: string;
  cycle: 'MONTHLY' | 'ANNUAL';
  price: string;
  trial: string;
  desc: string;
  modules: readonly string[];
  members: string;
  sms: string;
  whatsapp: string;
  storage: string;
  flat: string;
  upTo: string;
  pct: string;
}
/** The plan's amounts in rupees, and the percentage: numbers only while typing (2026-10-14). */
const NUMERIC: ReadonlySet<keyof Form> = new Set(['price', 'flat', 'upTo', 'pct']);

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type ProfileKey =
  'legalName' | 'gstin' | 'address' | 'sacCode' | 'payeeName' | 'payeeBank' | 'accountNo' | 'ifsc';

const STATUS = INVOICE_STATUS;
const TRIGGER = INVOICE_TRIGGER;
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

const rupees = (m: { amount: string }) => m.amount.replace(/\.00$/, '');
const inr0 = (m: { amount: string }) => formatInr(parseAmount(m.amount)).replace(/\.00$/, '');

/**
 * o.plans — Plans & billing (SRS 25; FR-SAS-05…09; SAS-027…029; prototype o.plans; client 2026-10-03
 * "give a provision to change and add the plans"): plan cards with modules, allowances and the
 * platform fee; a plan is added or changed in one dialog, and changed terms apply to each institution
 * from its next renewal. Invoices and the billing rules sit in the other tabs.
 */
@Component({
  selector: 'rp-backoffice-plans',
  imports: [Card, Empty, Icon, Kpi, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Plans & billing"
        sub="Subscription plans, institution invoices and the rules that raise them."
      >
        <button
          type="button"
          class="btn btn-sec"
          [disabled]="!can('plans.edit')"
          [attr.title]="can('plans.edit') ? null : noTask"
          (click)="edit(null)"
        >
          <rp-icon name="plus" [size]="17" /><span>New plan</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          [disabled]="!can('billing.invoice')"
          [attr.title]="can('billing.invoice') ? null : noInvoiceTask"
          (click)="openGenerate()"
        >
          <rp-icon name="receipt" [size]="17" /><span>Generate invoice</span>
        </button>
      </rp-page-head>
      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the plans" [text]="error()" />
        </div>
      } @else if (loading()) {
        <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
      } @else {
        <div class="c-grid k4">
          <rp-kpi
            [label]="'Invoiced in ' + month"
            [value]="inrK(invoicedPaise())"
            icon="receipt"
            [delta]="plural(invoicedCount(), 'invoice')"
          />
          <rp-kpi
            label="Outstanding"
            [value]="inrK(outstandingPaise())"
            icon="hourglass"
            [tone]="unpaid().length ? 'warn' : null"
            [delta]="countStatus('OVERDUE') + ' overdue · ' + countStatus('GRACE') + ' in grace'"
          />
          <rp-kpi label="Institutions on trial" [value]="trials()" icon="hourglass" />
          <rp-kpi
            [label]="'Platform fees in ' + month"
            value="—"
            icon="percent"
            delta="From settlements (FR-SAS-09)"
          />
        </div>
        <div class="tabs">
          @for (t of tabs(); track t.v) {
            <button type="button" class="tab" [class.on]="tab() === t.v" (click)="tab.set(t.v)">
              {{ t.l }}
              @if (t.n !== null) {
                <span class="n">{{ t.n }}</span>
              }
            </button>
          }
        </div>
        @switch (tab()) {
          @case ('plans') {
            <div class="c-grid k3">
              @for (p of plans(); track p.id) {
                <div class="card pad ob-plan">
                  <div class="row between top">
                    <div class="grow">
                      <h3 class="t-h3">{{ p.name }}</h3>
                      <p class="t-sm t-muted mt4">{{ p.description ?? '' }}</p>
                    </div>
                    <span
                      class="chip"
                      [class]="'chip ' + (p.institutions ? 'tone-brand' : 'tone-neutral')"
                      >{{ plural(p.institutions ?? 0, 'institution') }}</span
                    >
                  </div>
                  <div class="ob-price">
                    <span class="t-num">{{ inr0(p.price) }}</span
                    ><small
                      >/ {{ per(p) }} ·
                      {{ p.cycle === 'MONTHLY' ? 'monthly' : 'annual' }} billing</small
                    >
                  </div>
                  <div class="eyebrow">
                    Modules · {{ p.modules.length }} of {{ modules().length }}
                  </div>
                  <div class="row wrap g4">
                    @for (m of modules(); track m) {
                      <span class="tag" [class.ob-off]="!p.modules.includes(m)"
                        ><rp-icon [name]="p.modules.includes(m) ? 'check' : 'x'" [size]="11" />{{
                          m
                        }}</span
                      >
                    }
                  </div>
                  <div class="eyebrow">Usage allowances</div>
                  <dl class="kv">
                    <dt>Active members</dt>
                    <dd>{{ num(p.allowances.members) }}</dd>
                    <dt>SMS per month</dt>
                    <dd>{{ num(p.allowances.sms) }}</dd>
                    <dt>WhatsApp per month</dt>
                    <dd>
                      @if (p.allowances.whatsapp) {
                        {{ num(p.allowances.whatsapp) }}
                      } @else {
                        <span class="t-muted">Not included</span>
                      }
                    </dd>
                    <dt>Storage</dt>
                    <dd>{{ p.allowances.storageGb }} GB</dd>
                    <dt>Free trial</dt>
                    <dd>{{ p.trialDays ? plural(p.trialDays, 'day') : 'None' }}</dd>
                  </dl>
                  <div class="eyebrow">
                    Platform fee on merchant transactions
                    <span class="srs" title="SRS reference">BR-17</span>
                  </div>
                  <p class="t-sm">{{ feeText(p) }} · successful transactions only</p>
                  <div class="row g8 mt4">
                    <button
                      type="button"
                      class="btn btn-sec btn-sm"
                      [disabled]="!can('plans.edit')"
                      (click)="edit(p)"
                    >
                      <rp-icon name="edit" [size]="15" /><span>Edit plan</span>
                    </button>
                    <span class="t-xs t-muted">Version {{ p.version }}</span>
                  </div>
                </div>
              }
            </div>
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                Feature toggles are constrained by the plan: a feature whose module isn't in the
                institution's plan is locked on Feature permissions. Plan edits apply to each
                institution from its next renewal; the platform fee is configurable per plan, but
                whether it should differ by plan is still open
                <span class="srs" title="SRS reference">OQ-06</span>
              </div>
            </div>
          }
          @case ('invoices') {
            <div class="c-filters">
              <label class="search"
                ><rp-icon name="search" [size]="16" /><input
                  type="search"
                  id="ob-invq"
                  placeholder="Invoice number or institution"
                  autocomplete="off"
                  [value]="iq()"
                  (input)="iq.set(value($event))"
              /></label>
              <div class="fld">
                <div class="fld-in">
                  <select id="ob-invi" aria-label="Institution" (change)="iinst.set(value($event))">
                    <option value="">All institutions</option>
                    @for (i of institutions(); track i.id) {
                      <option [value]="i.id" [selected]="iinst() === i.id">{{ i.name }}</option>
                    }
                  </select>
                </div>
              </div>
            </div>
            <div class="pills">
              @for (s of invoicePills; track s.v) {
                <button
                  type="button"
                  class="pill"
                  [class.on]="ist() === s.v"
                  (click)="ist.set(s.v)"
                >
                  {{ s.l
                  }}<span class="n">{{
                    s.v === 'ALL' ? invoices().length : countStatus(s.v)
                  }}</span>
                </button>
              }
            </div>
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Institution</th>
                    <th>Period</th>
                    <th class="r">Total (incl. GST)</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (v of invoiceRows(); track v.id) {
                    <tr
                      tabindex="0"
                      (click)="openInvoice.set(v)"
                      (keydown.enter)="openInvoice.set(v)"
                    >
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t"
                            ><span class="t-mono">{{ v.invoiceNo }}</span></span
                          ><span class="cell-s">{{ triggerLabel(v.trigger) }}</span>
                        </div>
                      </td>
                      <td>{{ v.institution.name }}</td>
                      <td>
                        <span class="t-sm">{{ v.period }}</span>
                      </td>
                      <td class="r">
                        <b class="t-num">{{ inr(v.total) }}</b>
                      </td>
                      <td>{{ date(v.dueOn) }}</td>
                      <td>
                        <div class="stack" style="gap: 2px; align-items: flex-start">
                          <span
                            class="chip dot"
                            [class]="'chip dot tone-' + statusTone(v.status)"
                            >{{ statusLabel(v.status) }}</span
                          >
                          @if (v.payment) {
                            <span class="cell-s"
                              >{{ date(v.payment.paidOn) }} ·
                              {{ methodLabel(v.payment.method) }}</span
                            >
                          } @else if (v.transfer) {
                            <span class="cell-s">transfer reported · {{ v.transfer.utr }}</span>
                          } @else if (v.status === 'GRACE') {
                            <span class="cell-s">grace until {{ date(v.graceUntilOn) }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        @if (payable(v)) {
                          <div class="row-acts">
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              [disabled]="!can('billing.paid')"
                              (click)="$event.stopPropagation(); openPay(v)"
                            >
                              <rp-icon name="check" [size]="15" /><span>Mark as paid</span>
                            </button>
                          </div>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="7">
                        <rp-empty
                          icon="receipt"
                          title="No invoices match"
                          text="Invoices are raised when an institution is activated, renews or changes plan, and can be generated here."
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (invoiceRows().length) {
              <div class="pager">
                <span>{{ plural(invoiceRows().length, 'invoice') }}</span>
              </div>
            }
          }
          @case ('rules') {
            <div class="c-grid k2">
              <rp-card title="When an invoice is raised" icon="receipt" [plainIcon]="true">
                <span card-right class="srs" title="SRS reference">FR-SAS-07</span>
                <div class="tl">
                  @for (r of raised; track r.t) {
                    <div class="tl-i done">
                      <span class="tl-dot"><rp-icon [name]="r.icon" [size]="13" /></span>
                      <div class="tl-c">
                        <div class="tl-t">{{ r.t }}</div>
                        <div class="tl-s">{{ r.s }}</div>
                      </div>
                    </div>
                  }
                </div>
              </rp-card>
              <rp-card title="When an invoice isn't paid" icon="hourglass" [plainIcon]="true">
                <span card-right class="srs" title="SRS reference">FR-SAS-08</span>
                <div class="tl">
                  @for (r of dunning; track r.t) {
                    <div class="tl-i" [class]="'tl-i ' + r.state">
                      <span class="tl-dot"
                        ><rp-icon
                          [name]="r.state === 'bad' ? 'x' : r.state === 'done' ? 'check' : 'dot'"
                          [size]="13"
                      /></span>
                      <div class="tl-c">
                        <div class="tl-t">{{ r.t }}</div>
                        <div class="tl-s">{{ r.s }}</div>
                      </div>
                    </div>
                  }
                </div>
              </rp-card>
            </div>
            <rp-card title="Invoice and bank details" icon="building" [plainIcon]="true">
              <span card-right class="srs" title="SRS reference">FR-SAS-07</span>
              @if (profile(); as pr) {
                <div class="stack g12">
                  @if (pr.example) {
                    <div class="note tone-warn">
                      <rp-icon name="alert" [size]="17" />
                      <div class="grow">
                        <b>Example details.</b> Invoices print "SAMPLE" until CampusOne's own legal
                        name, GSTIN and bank account are entered here.
                      </div>
                    </div>
                  }
                  <div class="c-grid k2">
                    <dl class="kv">
                      <dt>Legal name</dt>
                      <dd>{{ pr.legalName }}</dd>
                      <dt>GSTIN</dt>
                      <dd class="t-mono">{{ pr.gstin }}</dd>
                      <dt>State</dt>
                      <dd>{{ pr.stateName ?? '—' }} ({{ pr.stateCode }})</dd>
                      <dt>SAC code</dt>
                      <dd class="t-mono">{{ pr.sacCode }}</dd>
                      <dt>Address</dt>
                      <dd>{{ pr.address }}</dd>
                    </dl>
                    <dl class="kv">
                      <dt>Account name</dt>
                      <dd>{{ pr.payee.name }}</dd>
                      <dt>Bank</dt>
                      <dd>{{ pr.payee.bank }}</dd>
                      <dt>Account number</dt>
                      <dd class="t-mono">{{ pr.payee.accountNo }}</dd>
                      <dt>IFSC</dt>
                      <dd class="t-mono">{{ pr.payee.ifsc }}</dd>
                    </dl>
                  </div>
                  <div>
                    <button
                      type="button"
                      class="btn btn-sec btn-sm"
                      [disabled]="!can('plans.edit')"
                      [attr.title]="can('plans.edit') ? null : noTask"
                      (click)="openProfile(pr)"
                    >
                      <rp-icon name="edit" [size]="15" /><span>Change details</span>
                    </button>
                  </div>
                </div>
              } @else {
                <rp-empty icon="building" title="Not available" />
              }
            </rp-card>
            <rp-card
              [title]="'Platform fees by institution · ' + month + ' ' + year"
              icon="percent"
              [plainIcon]="true"
            >
              <span card-right class="srs" title="SRS reference">FR-SAS-09</span>
              <rp-empty
                icon="percent"
                title="No settlements yet"
                text="Platform fees are taken from settlements, which arrive in Phase 6."
              />
            </rp-card>
          }
        }
      }
    </div>

    @if (openInvoice(); as v) {
      <rp-modal
        [title]="'Invoice ' + v.invoiceNo"
        [sub]="v.institution.name + ' · ' + v.period"
        [drawer]="true"
        (closed)="openInvoice.set(null)"
      >
        <div class="stack g16">
          <div class="row wrap g8">
            <span class="chip dot" [class]="'chip dot tone-' + statusTone(v.status)">{{
              statusLabel(v.status)
            }}</span>
            <span class="tag"
              ><rp-icon name="receipt" [size]="12" />{{ triggerLabel(v.trigger) }}</span
            >
          </div>
          <div class="fs">
            <h4>Lines</h4>
            <div class="fs-b">
              <dl class="kv">
                @for (l of v.lines; track $index) {
                  <dt>{{ l.description }}</dt>
                  <dd>{{ inr(l.amount) }}</dd>
                }
                <dt>GST {{ pct(v.taxPercent) }}%</dt>
                <dd>{{ inr(v.tax) }}</dd>
                <dt>Total</dt>
                <dd>
                  <b class="t-num">{{ inr(v.total) }}</b>
                </dd>
              </dl>
            </div>
          </div>
          <div class="fs">
            <h4>Dates and payment</h4>
            <div class="fs-b">
              <dl class="kv">
                <dt>Institution</dt>
                <dd>{{ v.institution.name }}</dd>
                <dt>Period</dt>
                <dd>{{ v.period }}</dd>
                <dt>Issued</dt>
                <dd>{{ date(v.issuedOn) }}</dd>
                <dt>Due</dt>
                <dd>{{ date(v.dueOn) }}</dd>
                <dt>Paid</dt>
                <dd>
                  @if (v.paidAt) {
                    {{ dt(v.paidAt) }}
                  } @else {
                    <span class="t-muted">Not paid</span>
                  }
                </dd>
                <dt>Payment reference</dt>
                <dd>
                  @if (v.payment?.reference) {
                    <span class="t-mono">{{ v.payment!.reference }}</span>
                  } @else {
                    —
                  }
                </dd>
                <dt>Mode</dt>
                <dd>{{ v.payment ? methodLabel(v.payment.method) : '—' }}</dd>
              </dl>
            </div>
          </div>
          @if (payable(v) && instStatus(v.institution.id) === 'SUSPENDED') {
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">
                {{ v.institution.name }} is suspended. Marking this invoice paid reactivates it
                immediately (FR-SAS-08).
              </div>
            </div>
          }
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Invoices and payment history are also visible to the institution administrator under
              Plan & billing (FR-SAS-08).
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-ghost" (click)="download(v)">
            <rp-icon name="download" [size]="17" /><span>Download PDF</span>
          </button>
          @if (payable(v)) {
            <button
              type="button"
              class="btn btn-pri"
              [disabled]="!can('billing.paid')"
              (click)="openPay(v)"
            >
              <rp-icon name="check" [size]="17" /><span>Mark as paid</span>
            </button>
          } @else {
            <button type="button" class="btn btn-sec" (click)="openInvoice.set(null)">
              <span>Close</span>
            </button>
          }
        </ng-container>
      </rp-modal>
    }

    @if (profileForm(); as f) {
      <rp-modal
        title="Invoice and bank details"
        sub="Printed on every GST invoice and shown to schools that pay by bank transfer."
        [wide]="true"
        (closed)="profileForm.set(null)"
      >
        <div class="c-form">
          @for (fl of profileFields; track fl.k) {
            <div class="fld" [class.full]="fl.full" [class.invalid]="err(fl.k)">
              <label class="fld-l" [for]="'ob-bp-' + fl.k"
                >{{ fl.l }}<span class="req">*</span></label
              >
              <div class="fld-in">
                <input
                  [id]="'ob-bp-' + fl.k"
                  autocomplete="off"
                  [attr.maxlength]="fl.max"
                  [class.t-mono]="fl.mono"
                  [value]="f[fl.k]"
                  (input)="setProfile(fl.k, $event)"
                />
              </div>
              @if (fl.hint) {
                <div class="fld-h">{{ fl.hint }}</div>
              }
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err(fl.k) }}</span>
              </div>
            </div>
          }
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="profileForm.set(null)">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            [class.is-busy]="busy()"
            (click)="saveProfile()"
          >
            <rp-icon name="check" [size]="17" /><span>Save details</span>
          </button>
        </ng-container>
      </rp-modal>
    }

    @if (payFor(); as v) {
      <rp-modal
        title="Mark invoice as paid"
        [sub]="v.invoiceNo + ' · ' + v.institution.name + ' · ' + inr(v.total)"
        (closed)="payFor.set(null)"
      >
        <div class="stack g12">
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Use this for payments received by <b>bank transfer</b>. Gateway payments are marked
              paid automatically once the signed confirmation is verified.
            </div>
          </div>
          <div class="fld" [class.invalid]="err('utr')">
            <label class="fld-l" for="ob-ip-ref"
              >Bank reference (UTR)<span class="req">*</span></label
            >
            <div class="fld-in">
              <input
                id="ob-ip-ref"
                maxlength="22"
                placeholder="e.g. UTR260930118822"
                [value]="payForm().utr"
                (input)="setPay('utr', $event)"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('utr') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('paidOn')">
            <label class="fld-l" for="ob-ip-d">Received on<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ob-ip-d"
                type="date"
                [max]="today"
                [value]="payForm().paidOn"
                (input)="setPay('paidOn', $event)"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('paidOn') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('amount')">
            <label class="fld-l" for="ob-ip-a">Amount received<span class="req">*</span></label>
            <div class="fld-in">
              <span class="pre">₹</span
              ><input
                id="ob-ip-a"
                inputmode="decimal"
                [value]="payForm().amount"
                (input)="setPay('amount', $event)"
              />
            </div>
            <div class="fld-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('amount') }}</span>
            </div>
            <div class="fld-h">Must equal the invoice total of {{ inr(v.total) }}</div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="payFor.set(null)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="pay(v)">
            <rp-icon name="check" [size]="17" /><span>Mark as paid</span>
          </button>
        </ng-container>
      </rp-modal>
    }

    @if (generating()) {
      <rp-modal
        title="Generate an invoice"
        [sub]="
          'Invoices carry GST at ' +
          pct(gstPercent()) +
          '% and are due ' +
          settings().dueDays +
          ' days after issue.'
        "
        (closed)="generating.set(false)"
      >
        <div class="stack g12">
          <div class="fld">
            <label class="fld-l" for="ob-gi-i">Institution</label>
            <div class="fld-in">
              <select id="ob-gi-i" (change)="setGen('institutionId', $event)">
                @for (i of billable(); track i.id) {
                  <option [value]="i.id" [selected]="gen().institutionId === i.id">
                    {{ i.name }} · {{ i.plan?.name }}
                  </option>
                }
              </select>
            </div>
          </div>
          <div class="fld">
            <label class="fld-l" for="ob-gi-t">Billing trigger</label>
            <div class="fld-in">
              <select id="ob-gi-t" (change)="setGen('trigger', $event)">
                @for (t of genTriggers; track t.v) {
                  <option [value]="t.v" [selected]="gen().trigger === t.v">{{ t.l }}</option>
                }
              </select>
            </div>
          </div>
          @if (gen().trigger === 'USAGE_OVERAGE') {
            <div class="c-form" id="ob-gi-over">
              <div class="fld" [class.invalid]="err('smsOver')">
                <label class="fld-l" for="ob-gi-sms">SMS above allowance</label>
                <div class="fld-in">
                  <input
                    id="ob-gi-sms"
                    inputmode="numeric"
                    [value]="gen().sms"
                    (input)="setGen('sms', $event)"
                  />
                </div>
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('smsOver') }}</span>
                </div>
                <div class="fld-h">Billed at {{ inrPaise(settings().smsPaise) }} each</div>
              </div>
              <div class="fld">
                <label class="fld-l" for="ob-gi-wa">WhatsApp above allowance</label>
                <div class="fld-in">
                  <input
                    id="ob-gi-wa"
                    inputmode="numeric"
                    [value]="gen().whatsapp"
                    (input)="setGen('whatsapp', $event)"
                  />
                </div>
                <div class="fld-h">Billed at {{ inrPaise(settings().whatsappPaise) }} each</div>
              </div>
            </div>
          }
          <div class="card flat pad">
            <dl class="kv">
              @for (l of preview().lines; track l.l) {
                <dt>{{ l.l }}</dt>
                <dd>{{ inrPaise(l.paise) }}</dd>
              }
              <dt>GST {{ pct(gstPercent()) }}%</dt>
              <dd>{{ inrPaise(preview().tax) }}</dd>
              <dt>Total</dt>
              <dd>
                <b class="t-num">{{ inrPaise(preview().total) }}</b>
              </dd>
              <dt>Due</dt>
              <dd>{{ date(preview().due) }}</dd>
            </dl>
          </div>
          @if (instStatus(gen().institutionId) === 'SUSPENDED') {
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">
                This institution is suspended; the invoice is issued but the institution stays
                suspended until its overdue invoices are paid.
              </div>
            </div>
          }
          @if (genError()) {
            <div class="note tone-bad">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ genError() }}</div>
            </div>
          }
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="generating.set(false)">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            [class.is-busy]="busy()"
            [disabled]="!billable().length"
            (click)="issue()"
          >
            <rp-icon name="send" [size]="17" /><span>Issue invoice</span>
          </button>
        </ng-container>
      </rp-modal>
    }

    @if (form(); as f) {
      <rp-modal
        [title]="editing() ? 'Edit ' + editing()!.name : 'New plan'"
        [sub]="
          editing()
            ? 'Changes apply to each institution on this plan from its next renewal.'
            : 'A plan bundles modules, usage allowances and platform-fee terms.'
        "
        [narrow]="false"
        (closed)="form.set(null)"
      >
        <div class="stack g16">
          <div class="c-form c3">
            <div class="fld" [class.invalid]="err('name')">
              <label class="fld-l" for="ob-pl-n">Plan name<span class="req">*</span></label>
              <div class="fld-in">
                <input id="ob-pl-n" maxlength="40" [value]="f.name" (input)="set('name', $event)" />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
              </div>
            </div>
            <div class="fld">
              <label class="fld-l" for="ob-pl-c">Billing cycle</label>
              <div class="fld-in">
                <select id="ob-pl-c" (change)="set('cycle', $event)">
                  <option value="MONTHLY" [selected]="f.cycle === 'MONTHLY'">Monthly</option>
                  <option value="ANNUAL" [selected]="f.cycle === 'ANNUAL'">Annual</option>
                </select>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('price')">
              <label class="fld-l" for="ob-pl-p">Price<span class="req">*</span></label>
              <div class="fld-in">
                <span class="pre">₹</span
                ><input
                  id="ob-pl-p"
                  inputmode="decimal"
                  [value]="f.price"
                  (input)="set('price', $event)"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('price') }}</span>
              </div>
              <div class="fld-h">Before GST</div>
            </div>
            <div class="fld" [class.invalid]="err('trial')">
              <label class="fld-l" for="ob-pl-t">Free trial<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="ob-pl-t"
                  inputmode="numeric"
                  maxlength="3"
                  [value]="f.trial"
                  (input)="set('trial', $event)"
                /><span class="suf">days</span>
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('trial') }}</span>
              </div>
            </div>
            <div class="fld full">
              <label class="fld-l" for="ob-pl-d"
                >Description<span class="opt">(optional)</span></label
              >
              <div class="fld-in">
                <input
                  id="ob-pl-d"
                  maxlength="140"
                  [value]="f.desc"
                  (input)="set('desc', $event)"
                />
              </div>
            </div>
          </div>
          <div class="fs">
            <h4>Modules <span class="srs" title="SRS reference">FR-SAS-05</span></h4>
            <div class="fs-b">
              <div class="ob-cgrid">
                @for (m of modules(); track m; let k = $index) {
                  <label class="chk"
                    ><input
                      type="checkbox"
                      [id]="'ob-pl-m' + k"
                      [checked]="f.modules.includes(m)"
                      (change)="toggleModule(m)"
                    /><span>{{ m }}</span></label
                  >
                }
              </div>
              <div class="fld" [class.invalid]="err('modules')">
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('modules') }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="fs">
            <h4>Usage allowances</h4>
            <div class="fs-b c-form ob-c4">
              @for (a of allowanceFields; track a.k) {
                <div class="fld" [class.invalid]="err(a.k)">
                  <label class="fld-l" [for]="'ob-pl-' + a.k"
                    >{{ a.l }}<span class="req">*</span></label
                  >
                  <div class="fld-in">
                    <input
                      [id]="'ob-pl-' + a.k"
                      inputmode="numeric"
                      [value]="f[a.k]"
                      (input)="set(a.k, $event)"
                    />
                  </div>
                  <div class="fld-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ err(a.k) }}</span>
                  </div>
                </div>
              }
            </div>
          </div>
          <div class="fs">
            <h4>
              Platform fee on merchant transactions
              <span class="srs" title="SRS reference">OQ-06</span>
            </h4>
            <div class="fs-b c-form c3">
              @for (x of feeFields; track x.k) {
                <div class="fld" [class.invalid]="err(x.k)">
                  <label class="fld-l" [for]="'ob-pl-' + x.k"
                    >{{ x.l }}<span class="req">*</span></label
                  >
                  <div class="fld-in">
                    @if (x.k !== 'pct') {
                      <span class="pre">₹</span>
                    }
                    <input
                      [id]="'ob-pl-' + x.k"
                      inputmode="decimal"
                      [value]="f[x.k]"
                      (input)="set(x.k, $event)"
                    />
                    @if (x.k === 'pct') {
                      <span class="suf">%</span>
                    }
                  </div>
                  <div class="fld-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ err(x.k) }}</span>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-sec" (click)="form.set(null)">
            <span>Cancel</span>
          </button>
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="save()">
            <span>{{ editing() ? 'Save plan' : 'Create plan' }}</span>
          </button>
        </ng-container>
      </rp-modal>
    }
  `,
})
export class BackofficePlans {
  private readonly api = inject(PlansApi);
  private readonly institutionsApi = inject(InstitutionsApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).ops;
  private readonly route = inject(ActivatedRoute);

  protected readonly noInvoiceTask =
    'Your role doesn’t hold “Generate invoices”. Ask a Platform Administrator in Roles & tasks.';
  protected readonly invoicePills = [
    { v: 'ALL', l: 'All' },
    { v: 'DUE', l: 'Due' },
    { v: 'OVERDUE', l: 'Overdue' },
    { v: 'GRACE', l: 'Grace' },
    { v: 'PAID', l: 'Paid' },
  ] as const;
  protected readonly genTriggers = [
    { v: 'RENEWAL', l: 'Renewal' },
    { v: 'PLAN_ACTIVATION', l: 'Plan activation' },
    { v: 'USAGE_OVERAGE', l: 'Usage overage' },
  ] as const;
  protected readonly today = istBusinessDate();
  protected readonly noTask =
    'Your role doesn’t hold “Create and edit plans”. Ask a Platform Administrator in Roles & tasks.';
  protected readonly month = MONTHS[new Date().getMonth()] ?? '';
  protected readonly year = new Date().getFullYear();
  protected readonly allowanceFields = [
    { k: 'members', l: 'Active members' },
    { k: 'sms', l: 'SMS / month' },
    { k: 'whatsapp', l: 'WhatsApp / month' },
    { k: 'storage', l: 'Storage (GB)' },
  ] as const;
  protected readonly feeFields = [
    { k: 'flat', l: 'Flat fee' },
    { k: 'upTo', l: '…for amounts up to' },
    { k: 'pct', l: 'Percentage above that' },
  ] as const;
  protected readonly raised = [
    {
      t: 'Plan activation',
      s: 'The first cycle is billed when an institution is activated or a trial converts.',
      icon: 'power' as const,
    },
    {
      t: 'Renewal date',
      s: 'The next cycle is billed 15 days before the renewal date.',
      icon: 'calendar' as const,
    },
    {
      t: 'Plan change',
      s: 'An upgrade is billed immediately, prorated to the renewal date; a downgrade applies at renewal.',
      icon: 'layers' as const,
    },
    {
      t: 'Usage overage',
      s: 'SMS and WhatsApp above the plan allowance are billed at the end of the month.',
      icon: 'chart' as const,
    },
  ];
  protected readonly dunning = [
    {
      t: 'Due',
      s: 'Payable through the payment gateway, or by bank transfer marked paid here.',
      state: 'done',
    },
    { t: 'Overdue', s: 'The due date passes without payment.', state: 'now' },
    {
      t: 'Grace · 14 days',
      s: 'Contacts are reminded; the institution keeps working.',
      state: 'now',
    },
    {
      t: 'Suspended',
      s: 'Sign-ins and money movement stop (FR-INS-05). Data is kept.',
      state: 'bad',
    },
    {
      t: 'Paid → Active',
      s: 'Marking the invoice paid restores the institution immediately.',
      state: 'done',
    },
  ];

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly plans = signal<readonly PlanView[]>([]);
  protected readonly modules = signal<readonly string[]>([]);
  protected readonly institutions = signal<readonly InstitutionRow[]>([]);
  protected readonly tab = signal<Tab>('plans');
  protected readonly form = signal<Form | null>(null);
  protected readonly editing = signal<PlanView | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly invoices = signal<readonly Invoice[]>([]);
  protected readonly settings = signal<BillingSettings>(BILLING_DEFAULTS);
  protected readonly profile = signal<BillingProfile | null>(null);
  protected readonly profileForm = signal<Record<ProfileKey, string> | null>(null);
  protected readonly profileFields: readonly {
    k: ProfileKey;
    l: string;
    max: number;
    full?: boolean;
    mono?: boolean;
    hint?: string;
  }[] = [
    { k: 'legalName', l: 'Legal name', max: 120, full: true },
    {
      k: 'gstin',
      l: 'GSTIN',
      max: 15,
      mono: true,
      hint: 'The first two digits are the state code',
    },
    { k: 'sacCode', l: 'SAC code', max: 8, mono: true, hint: '998314 — IT services' },
    { k: 'address', l: 'Registered address', max: 300, full: true },
    { k: 'payeeName', l: 'Account name', max: 120 },
    { k: 'payeeBank', l: 'Bank', max: 80 },
    { k: 'accountNo', l: 'Account number', max: 20, mono: true },
    { k: 'ifsc', l: 'IFSC', max: 11, mono: true },
  ];
  protected readonly iq = signal('');
  protected readonly iinst = signal('');
  protected readonly ist = signal<'ALL' | InvoiceStatus>('ALL');
  protected readonly openInvoice = signal<Invoice | null>(null);
  protected readonly payFor = signal<Invoice | null>(null);
  protected readonly payForm = signal({ utr: '', paidOn: '', amount: '' });
  protected readonly generating = signal(false);
  protected readonly gen = signal({
    institutionId: '',
    trigger: 'RENEWAL' as 'RENEWAL' | 'PLAN_ACTIVATION' | 'USAGE_OVERAGE',
    sms: '0',
    whatsapp: '0',
  });
  protected readonly genError = signal('');
  protected readonly invoiceRows = computed(() => {
    const q = this.iq().trim().toLowerCase();
    return this.invoices().filter(
      (v) =>
        (this.ist() === 'ALL' || v.status === this.ist()) &&
        (!this.iinst() || v.institution.id === this.iinst()) &&
        (!q ||
          [v.invoiceNo, v.institution.name, TRIGGER[v.trigger]].some((x) =>
            x.toLowerCase().includes(q),
          )),
    );
  });
  protected readonly unpaid = computed(() => this.invoices().filter((v) => this.payable(v)));
  protected readonly invoicedThisMonth = computed(() =>
    this.invoices().filter(
      (v) => v.issuedOn.slice(0, 7) === this.today.slice(0, 7) && v.status !== 'VOID',
    ),
  );
  protected readonly invoicedPaise = computed(() =>
    this.invoicedThisMonth().reduce((n, v) => n + parseAmount(v.total.amount), 0),
  );
  protected readonly invoicedCount = computed(() => this.invoicedThisMonth().length);
  protected readonly outstandingPaise = computed(() =>
    this.unpaid().reduce((n, v) => n + parseAmount(v.total.amount), 0),
  );
  protected readonly gstPercent = computed(() => (this.settings().gstBp / 100).toFixed(2));
  /** Institutions that can be invoiced: live or suspended, with a plan (prototype ob.inv.new). */
  protected readonly billable = computed(() =>
    // Registration order, as the prototype lists them (the API sends newest first).
    [...this.institutions()]
      .reverse()
      .filter((i) => (i.status === 'ACTIVE' || i.status === 'SUSPENDED') && i.plan),
  );
  protected readonly preview = computed(() => {
    const g = this.gen();
    const s = this.settings();
    const inst = this.institutions().find((i) => i.id === g.institutionId);
    const plan = this.plans().find((p) => p.id === inst?.plan?.id);
    let lines: { l: string; paise: number }[] = [];
    if (g.trigger === 'USAGE_OVERAGE') {
      const sms = Math.max(0, parseInt(g.sms || '0', 10) || 0);
      const wa = Math.max(0, parseInt(g.whatsapp || '0', 10) || 0);
      lines = [
        ...(sms
          ? [
              {
                l: `${this.num(sms)} SMS above allowance × ${this.inrPaise(s.smsPaise)}`,
                paise: sms * s.smsPaise,
              },
            ]
          : []),
        ...(wa
          ? [
              {
                l: `${this.num(wa)} WhatsApp above allowance × ${this.inrPaise(s.whatsappPaise)}`,
                paise: wa * s.whatsappPaise,
              },
            ]
          : []),
      ];
    } else if (plan) {
      const kind = g.trigger === 'RENEWAL' ? 'renewal' : 'plan activation';
      lines = [
        {
          l: `${plan.name} · ${plan.cycle === 'MONTHLY' ? 'monthly' : 'annual'} · ${kind}`,
          paise: parseAmount(plan.price.amount),
        },
      ];
    }
    const amount = lines.reduce((n, l) => n + l.paise, 0);
    const tax = Math.floor((amount * s.gstBp + 5000) / 10000);
    return { lines, tax, total: amount + tax, due: addDays(this.today, s.dueDays) };
  });
  protected readonly trials = computed(() =>
    String(this.institutions().filter((i) => i.subscriptionStatus === 'TRIAL').length),
  );
  protected readonly tabs = computed(() => [
    { v: 'plans' as Tab, l: 'Plans', n: this.plans().length as number | null },
    { v: 'invoices' as Tab, l: 'Invoices', n: this.invoices().length as number | null },
    { v: 'rules' as Tab, l: 'Billing rules', n: null },
  ]);

  constructor() {
    void this.load();
  }

  protected can(subTask: string) {
    return this.session()?.subTasks.includes(subTask) ?? false;
  }

  private async load() {
    try {
      const [plans, institutions, invoices, settings] = await Promise.all([
        this.api.list(),
        this.institutionsApi.list(),
        this.api.invoices(),
        this.api.billingSettings(),
      ]);
      this.plans.set(plans.items);
      this.modules.set(plans.modules);
      this.institutions.set(institutions.items);
      this.invoices.set(invoices.items);
      this.settings.set(settings);
      // Links from the home page and search: ?tab=invoices, ?invoice=<id> opens that invoice.
      const q = this.route.snapshot.queryParamMap;
      const want = q.get('invoice');
      if (q.get('tab') === 'invoices' || want) this.tab.set('invoices');
      const found = want ? invoices.items.find((v) => v.id === want) : undefined;
      if (found) this.openInvoice.set(found);
      // The invoice and bank details load alongside; the page does not wait for them.
      this.api
        .profile()
        .then((p) => this.profile.set(p))
        .catch(() => this.profile.set(null));
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

  protected async download(v: Invoice) {
    try {
      await this.api.pdf(v);
    } catch (e) {
      this.overlays.toast('Not downloaded', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  // --- invoice and bank details (SAS-040/041) --------------------------------------------------------
  protected openProfile(p: BillingProfile) {
    this.errors.set({});
    this.profileForm.set({
      legalName: p.example ? '' : p.legalName,
      gstin: p.example ? '' : p.gstin,
      address: p.example ? '' : p.address,
      sacCode: p.sacCode,
      payeeName: p.example ? '' : p.payee.name,
      payeeBank: p.example ? '' : p.payee.bank,
      accountNo: p.example ? '' : p.payee.accountNo,
      ifsc: p.example ? '' : p.payee.ifsc,
    });
  }

  protected setProfile(k: ProfileKey, e: Event) {
    const f = this.profileForm();
    if (!f) return;
    const v = this.value(e);
    this.profileForm.set({ ...f, [k]: k === 'gstin' || k === 'ifsc' ? v.toUpperCase() : v });
    if (this.errors()[k]) this.errors.set({ ...this.errors(), [k]: '' });
  }

  protected async saveProfile() {
    const f = this.profileForm();
    const p = this.profile();
    if (!f || !p || this.busy()) return;
    const missing = (Object.keys(f) as ProfileKey[]).filter((k) => !f[k].trim());
    if (missing.length) {
      this.errors.set(
        Object.fromEntries(missing.map((k) => [k, translate('VALIDATION.REQUIRED')])),
      );
      return;
    }
    this.busy.set(true);
    try {
      const saved = await this.api.updateProfile(p.etag, {
        legalName: f.legalName,
        gstin: f.gstin,
        address: f.address,
        sacCode: f.sacCode,
        payee: { name: f.payeeName, bank: f.payeeBank, accountNo: f.accountNo, ifsc: f.ifsc },
      });
      this.profile.set(saved);
      this.profileForm.set(null);
      this.overlays.toast('Invoice details saved', {
        sub: 'New invoices and downloads use them; the example marker is gone',
      });
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.length) {
        const key: Record<string, ProfileKey> = {
          'payee.ifsc': 'ifsc',
          'payee.accountNo': 'accountNo',
          'payee.name': 'payeeName',
          'payee.bank': 'payeeBank',
        };
        this.errors.set(
          Object.fromEntries(e.errors.map((x) => [key[x.field] ?? x.field, x.message])),
        );
      } else {
        this.overlays.toast('Not saved', {
          sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
      }
    } finally {
      this.busy.set(false);
    }
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected inr(m: { amount: string }) {
    return formatInr(parseAmount(m.amount));
  }
  protected inrPaise(p: number) {
    return formatInr(p);
  }
  /** Compact rupees for the key figures (prototype fmt.inrK): ₹26.2k, ₹2.31 L, ₹1.20 Cr. */
  protected inrK(paise: number) {
    const r = paise / 100;
    if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
    if (r >= 1e5) return `₹${(r / 1e5).toFixed(2)} L`;
    if (r >= 1e3) return `₹${(r / 1e3).toFixed(1)}k`;
    return `₹${Math.round(r)}`;
  }
  protected pct(v: string) {
    return String(Number(v));
  }
  protected statusTone(s: InvoiceStatus) {
    return STATUS[s].tone;
  }
  protected statusLabel(s: InvoiceStatus) {
    return STATUS[s].label;
  }
  protected triggerLabel(t: InvoiceTrigger) {
    return TRIGGER[t];
  }
  protected methodLabel(m: 'BANK_TRANSFER' | 'GATEWAY') {
    return m === 'BANK_TRANSFER' ? 'Bank transfer (marked by operator)' : 'Payment gateway';
  }
  protected payable(v: Invoice) {
    return v.status === 'DUE' || v.status === 'GRACE' || v.status === 'OVERDUE';
  }
  protected countStatus(s: InvoiceStatus) {
    return this.invoices().filter((v) => v.status === s).length;
  }
  protected instStatus(id: string) {
    return this.institutions().find((i) => i.id === id)?.status ?? null;
  }

  // --- generate an invoice (SAS-031) -----------------------------------------------------------------
  protected openGenerate() {
    const first = this.billable()[0];
    this.gen.set({ institutionId: first?.id ?? '', trigger: 'RENEWAL', sms: '0', whatsapp: '0' });
    this.errors.set({});
    this.genError.set('');
    this.generating.set(true);
  }

  protected setGen(k: 'institutionId' | 'trigger' | 'sms' | 'whatsapp', e: Event) {
    this.gen.set({ ...this.gen(), [k]: this.value(e) });
    this.errors.set({});
    this.genError.set('');
  }

  protected async issue() {
    const g = this.gen();
    if (this.busy() || !g.institutionId) return;
    if (g.trigger === 'USAGE_OVERAGE' && this.preview().total <= 0) {
      this.errors.set({ smsOver: translate('SAS.NOTHING_TO_BILL') });
      return;
    }
    this.busy.set(true);
    try {
      const v = await this.api.generate({
        institutionId: g.institutionId,
        trigger: g.trigger,
        ...(g.trigger === 'USAGE_OVERAGE'
          ? {
              smsOver: Math.max(0, parseInt(g.sms || '0', 10) || 0),
              whatsappOver: Math.max(0, parseInt(g.whatsapp || '0', 10) || 0),
            }
          : {}),
      });
      this.generating.set(false);
      this.overlays.toast(`${v.invoiceNo} issued`, {
        sub: `${this.inr(v.total)} · e-mailed to the primary contact · due ${formatDate(v.dueOn)}`,
      });
      this.tab.set('invoices');
      await this.load();
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.length)
        this.errors.set({ smsOver: e.errors[0]!.message });
      else this.genError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.busy.set(false);
    }
  }

  // --- record a bank transfer (SAS-032) --------------------------------------------------------------
  protected openPay(v: Invoice) {
    this.openInvoice.set(null);
    this.errors.set({});
    // A transfer the institution reported (SAS-039) is confirmed against the bank statement.
    this.payForm.set({
      utr: v.transfer?.utr ?? '',
      paidOn: v.transfer?.paidOn ?? this.today,
      amount: v.transfer ? v.total.amount : '',
    });
    this.payFor.set(v);
  }

  protected setPay(k: 'utr' | 'paidOn' | 'amount', e: Event) {
    // An amount takes numbers only (client 2026-10-14).
    const v = k === 'amount' ? cleanTyped(e.target as HTMLInputElement, amountText) : this.value(e);
    this.payForm.set({ ...this.payForm(), [k]: v });
    const next = { ...this.errors() };
    delete next[k];
    this.errors.set(next);
  }

  protected async pay(v: Invoice) {
    if (this.busy()) return;
    const f = this.payForm();
    const e: Record<string, string> = {};
    const utr = f.utr.trim().toUpperCase();
    if (!utr) e['utr'] = translate('VALIDATION.REQUIRED');
    else if (!/^[A-Z0-9]{10,22}$/.test(utr)) e['utr'] = translate('SAS.UTR_FORMAT');
    if (!f.paidOn) e['paidOn'] = translate('VALIDATION.REQUIRED');
    else if (f.paidOn > this.today) e['paidOn'] = translate('SAS.PAID_ON_FUTURE');
    else if (f.paidOn < v.issuedOn) e['paidOn'] = translate('SAS.PAID_ON_BEFORE_ISSUE');
    const amount = f.amount.trim();
    if (!amount) e['amount'] = translate('VALIDATION.REQUIRED');
    else if (!AMOUNT_PATTERN.test(amount)) e['amount'] = translate('VALIDATION.AMOUNT');
    else if (parseAmount(amount) !== parseAmount(v.total.amount)) {
      e['amount'] = translate('SAS.AMOUNT_MISMATCH', { total: this.inr(v.total) });
    }
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const restore = this.instStatus(v.institution.id) === 'SUSPENDED';
    const ok = await this.overlays.confirm({
      title: `Mark ${v.invoiceNo} as paid?`,
      text: `${this.inr(v.total)} received by bank transfer, reference ${utr}.${restore ? ` ${v.institution.name} will be reactivated if nothing else is overdue.` : ''}`,
      ok: 'Mark as paid',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const r = await this.api.pay(v.id, {
        utr,
        amount: { amount: (parseAmount(amount) / 100).toFixed(2), currency: 'INR' },
        paidOn: f.paidOn,
      });
      this.payFor.set(null);
      this.overlays.toast(`${v.invoiceNo} marked as paid`, {
        sub: r.institutionRestored
          ? `${v.institution.name} is active again · recorded in its history`
          : `Reference ${utr} recorded`,
      });
      await this.load();
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.length) {
        const fe: Record<string, string> = {};
        for (const er of x.errors)
          fe[er.field === 'amount.amount' ? 'amount' : er.field] = er.message;
        this.errors.set(fe);
      } else if (x instanceof ApiProblem && x.code === 'SAS.UTR_TAKEN') {
        this.errors.set({ utr: x.detail });
      } else {
        this.overlays.toast('Not recorded', {
          sub: x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected num(n: number) {
    return new Intl.NumberFormat('en-IN').format(n);
  }
  protected plural(n: number, noun: string) {
    return `${this.num(n)} ${noun}${n === 1 ? '' : 's'}`;
  }
  protected per(p: PlanView) {
    return p.cycle === 'MONTHLY' ? 'month' : 'year';
  }
  protected inr0(m: { amount: string }) {
    return inr0(m);
  }
  protected feeText(p: PlanView) {
    const f = p.platformFee;
    return `${formatInr(parseAmount(f.flat.amount))} per transaction up to ${inr0(f.upTo)}; ${Number(f.percent)}% above`;
  }
  protected err(k: string) {
    return this.errors()[k] ?? '';
  }

  protected edit(p: PlanView | null) {
    this.errors.set({});
    this.editing.set(p);
    this.form.set(
      p
        ? {
            name: p.name,
            cycle: p.cycle,
            price: rupees(p.price),
            trial: String(p.trialDays),
            desc: p.description ?? '',
            modules: [...p.modules],
            members: String(p.allowances.members),
            sms: String(p.allowances.sms),
            whatsapp: String(p.allowances.whatsapp),
            storage: String(p.allowances.storageGb),
            flat: rupees(p.platformFee.flat),
            upTo: rupees(p.platformFee.upTo),
            pct: String(Number(p.platformFee.percent)),
          }
        : {
            name: '',
            cycle: 'ANNUAL',
            price: '',
            trial: '30',
            desc: '',
            modules: ['Academics', 'Attendance', 'Communication', 'Fees', 'Wallet and payments'],
            members: '1000',
            sms: '5000',
            whatsapp: '0',
            storage: '50',
            flat: '1',
            upTo: '100',
            pct: '0.5',
          },
    );
  }

  protected set(k: keyof Form, e: Event) {
    const f = this.form();
    if (!f) return;
    // The price, the fee amounts and the percentage take numbers only (client 2026-10-14).
    const el = e.target as HTMLInputElement;
    this.form.set({ ...f, [k]: NUMERIC.has(k) ? cleanTyped(el, amountText) : el.value });
    if (this.errors()[k]) {
      const next = { ...this.errors() };
      delete next[k];
      this.errors.set(next);
    }
  }

  protected toggleModule(m: string) {
    const f = this.form();
    if (!f) return;
    const modules = f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m];
    this.form.set({ ...f, modules });
    const next = { ...this.errors() };
    delete next['modules'];
    this.errors.set(next);
  }

  private validate(f: Form) {
    const e: Record<string, string> = {};
    const req = translate('VALIDATION.REQUIRED');
    const name = f.name.trim();
    const editing = this.editing();
    if (!name) e['name'] = req;
    else if (name.length < 3) e['name'] = translate('VALIDATION.FORMAT');
    else if (
      this.plans().some((p) => p.id !== editing?.id && p.name.toLowerCase() === name.toLowerCase())
    ) {
      e['name'] = translate('SAS.PLAN_NAME_TAKEN');
    }
    const amount = (k: keyof Form, min: number, max: number) => {
      const v = String(f[k]).trim();
      if (!v) return (e[k] = req);
      if (!AMOUNT_PATTERN.test(v) || Number(v) < min || Number(v) > max) {
        e[k] = translate('VALIDATION.AMOUNT');
      }
      return undefined;
    };
    const whole = (k: keyof Form, max: number) => {
      const v = String(f[k]).trim();
      if (!v) return (e[k] = req);
      if (!/^\d+$/.test(v) || Number(v) > max)
        e[k] = translate('VALIDATION.RANGE', { min: 0, max });
      return undefined;
    };
    amount('price', 1, 10_000_000);
    whole('trial', 365);
    whole('members', 10_000_000);
    whole('sms', 10_000_000);
    whole('whatsapp', 10_000_000);
    whole('storage', 100_000);
    amount('flat', 0, 100);
    amount('upTo', 1, 100_000);
    const pct = f.pct.trim();
    if (!pct) e['pct'] = req;
    else if (!/^\d(\.\d{1,2})?$/.test(pct) || Number(pct) > 5) {
      e['pct'] = translate('VALIDATION.RANGE', { min: 0, max: 5 });
    }
    if (!f.modules.length) e['modules'] = translate('SAS.MODULES_REQUIRED');
    return e;
  }

  protected async save() {
    const f = this.form();
    if (!f || this.busy()) return;
    const errors = this.validate(f);
    this.errors.set(errors);
    if (Object.keys(errors).length) return;
    const money = (v: string) => ({
      amount: (Math.round(Number(v) * 100) / 100).toFixed(2),
      currency: 'INR' as const,
    });
    const body: PlanInput = {
      name: f.name.trim(),
      description: f.desc.trim() || null,
      cycle: f.cycle,
      price: money(f.price),
      trialDays: Number(f.trial),
      modules: this.modules().filter((m) => f.modules.includes(m)),
      allowances: {
        members: Number(f.members),
        sms: Number(f.sms),
        whatsapp: Number(f.whatsapp),
        storageGb: Number(f.storage),
      },
      platformFee: {
        flat: money(f.flat),
        upTo: money(f.upTo),
        percent: Number(f.pct).toFixed(2),
      },
    };
    const p = this.editing();
    if (p && (p.institutions ?? 0) > 0) {
      const lost = p.modules.filter((m) => !f.modules.includes(m));
      const n = p.institutions ?? 0;
      const ok = await this.overlays.confirm({
        title: `Save changes to ${p.name}?`,
        text: `${this.plural(n, 'institution')} ${n === 1 ? 'is' : 'are'} on this plan. Changes apply from each one's next renewal.${lost.length ? ` Removing ${lost.join(', ')} switches those features off at renewal.` : ''}`,
        ok: 'Save plan',
        tone: lost.length ? 'warn' : 'brand',
      });
      if (!ok) return;
    }
    this.busy.set(true);
    try {
      if (p) {
        const out = await this.api.change(p.id, p.etag, body);
        this.overlays.toast(`${out.name} saved`, {
          sub: "Applies from each institution's next renewal",
        });
      } else {
        const out = await this.api.create(body);
        this.overlays.toast(`${out.name} created`, {
          sub: `${formatInr(parseAmount(out.price.amount))} / ${this.per(out)} · ${out.modules.length} modules`,
        });
      }
      this.form.set(null);
      await this.load();
    } catch (e) {
      if (e instanceof ApiProblem) {
        if (e.code === 'SAS.PLAN_NAME_TAKEN') this.errors.set({ name: e.detail });
        else if (e.errors.length) {
          const map: Record<string, string> = {
            name: 'name',
            'price.amount': 'price',
            trialDays: 'trial',
            modules: 'modules',
            'allowances.members': 'members',
            'allowances.sms': 'sms',
            'allowances.whatsapp': 'whatsapp',
            'allowances.storageGb': 'storage',
            'platformFee.flat.amount': 'flat',
            'platformFee.upTo.amount': 'upTo',
            'platformFee.percent': 'pct',
          };
          const fe: Record<string, string> = {};
          for (const x of e.errors) fe[map[x.field] ?? 'name'] = x.message;
          this.errors.set(fe);
        } else {
          this.overlays.toast('Not saved', { sub: e.detail, tone: 'bad' });
        }
        if (e.status === 412) await this.load();
      } else {
        this.overlays.toast('Not saved', { sub: translate('GEN.UNAVAILABLE'), tone: 'bad' });
      }
    } finally {
      this.busy.set(false);
    }
  }
}
