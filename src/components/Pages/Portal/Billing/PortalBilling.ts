import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Card, Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, istBusinessDate } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { INVOICE_STATUS, INVOICE_TRIGGER } from '../../Backoffice/Plans/plans.api';
import { PortalApi, type Invoice } from '../portal.api';
import { PortalStore, payable } from '../portal.store';
import { InvoiceDrawer, PaySheet } from '../Shared/PortalPay';
import { PageHead, gstOn, inr, inr0, paiseOf, toneOf } from '../Shared/PortalUi';

type Filter = 'All' | 'Unpaid' | 'Paid';
const PAGE = 8;

const plural = (n: number, noun: string) =>
  `${n.toLocaleString('en-IN')} ${noun}${n === 1 ? '' : 's'}`;

/**
 * s.billing — invoices and payment (FR-SAS-07…09; SAS-014…017; prototype s.billing): what is owed and
 * why, every invoice with its status, the invoice drawer and its PDF, the ways to pay and what
 * happens when an invoice isn't paid. A bank transfer is reported for CampusOne to confirm; online
 * payment arrives with the payment gateway (Q17).
 */
@Component({
  selector: 'rp-portal-billing',
  imports: [Card, Empty, Icon, InvoiceDrawer, PageHead, PaySheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-sp-head title="Billing" [sub]="sub()" />
    @if (error()) {
      <div class="card pad">
        <rp-empty icon="wifioff" title="Couldn't load your invoices" [text]="error()" />
      </div>
    } @else if (items(); as inv) {
      @for (v of alerts(); track v.id) {
        <div class="note" [class]="'note tone-' + (suspended() ? 'bad' : 'warn')">
          <rp-icon [name]="suspended() ? 'alertc' : 'alert'" [size]="17" />
          <div class="grow">
            <b>{{ v.invoiceNo }}</b> · {{ money(v.total) }} ·
            {{
              v.status === 'OVERDUE' || suspended()
                ? 'overdue since ' +
                  date(v.dueOn) +
                  (suspended() ? ' — paying it restores ' + instName() : '')
                : 'in the grace period until ' + date(v.graceUntilOn)
            }}{{ v.transfer ? ' · bank transfer reported ' + date(v.transfer.paidOn) : '' }}
          </div>
          <button type="button" class="btn btn-accent btn-sm" (click)="payFor.set(v)">
            <span>Pay now</span>
          </button>
        </div>
      }
      <div class="c-grid k3">
        <div class="kpi">
          <span
            class="k-ic"
            [style.background]="oweTone() ? 'var(--' + oweTone() + '-soft)' : null"
            [style.color]="oweTone() ? 'var(--' + oweTone() + ')' : null"
            ><rp-icon name="hourglass" [size]="17"
          /></span>
          <span class="k-l">Outstanding</span>
          <span class="k-v">{{ sum(unpaid()) }}</span>
          <span class="k-d">{{ plural(unpaid().length, 'invoice') }}</span>
        </div>
        <div class="kpi">
          <span class="k-ic"><rp-icon name="checkc" [size]="17" /></span>
          <span class="k-l">Paid in {{ year }}</span>
          <span class="k-v">{{ sum(paidThisYear()) }}</span>
          <span class="k-d">{{ plural(paidThisYear().length, 'invoice') }}</span>
        </div>
        <div class="kpi">
          <span class="k-ic"><rp-icon name="calendar" [size]="17" /></span>
          <span class="k-l">{{ third().label }}</span>
          <span class="k-v">{{ third().value }}</span>
          @if (third().delta) {
            <span class="k-d">{{ third().delta }}</span>
          }
        </div>
      </div>
      <section class="stack g8">
        <div class="row between wrap g8">
          <div class="sec-h"><h3>Invoices</h3></div>
          <div class="pills">
            @for (f of filters(); track f.v) {
              <button
                type="button"
                class="pill"
                [class.on]="filter() === f.v"
                (click)="setFilter(f.v)"
              >
                {{ f.v }}<span class="n">{{ f.n }}</span>
              </button>
            }
          </div>
        </div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Period</th>
                <th>Issued</th>
                <th class="r">Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (v of shownRows(); track v.id) {
                <tr tabindex="0" (click)="drawer.set(v)" (keydown.enter)="drawer.set(v)">
                  <td>
                    <div class="stack" style="gap: 1px">
                      <span class="t-mono cell-t">{{ v.invoiceNo }}</span
                      ><span class="cell-s">{{ trigger(v) }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="t-sm">{{ v.period }}</span>
                  </td>
                  <td>{{ date(v.issuedOn) }}</td>
                  <td class="r">
                    <b class="t-num">{{ money(v.total) }}</b>
                  </td>
                  <td>
                    <div class="stack" style="gap: 2px; align-items: flex-start">
                      <span [class]="'chip dot tone-' + tone(status(v))">{{ status(v) }}</span
                      ><span class="cell-s">{{ statusLine(v) }}</span>
                    </div>
                  </td>
                  <td>
                    <div class="row-acts">
                      @if (canPay(v)) {
                        <button
                          type="button"
                          class="btn btn-pri btn-xs"
                          (click)="$event.stopPropagation(); payFor.set(v)"
                        >
                          <span>Pay</span>
                        </button>
                      }
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs btn-icon"
                        [attr.aria-label]="'Download ' + v.invoiceNo"
                        [attr.title]="'Download ' + v.invoiceNo"
                        (click)="$event.stopPropagation(); download(v)"
                      >
                        <rp-icon name="download" [size]="15" />
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6">
                    <rp-empty
                      icon="receipt"
                      [title]="filter() === 'Unpaid' ? 'Nothing to pay' : 'No invoices yet'"
                      [text]="
                        filter() === 'Unpaid'
                          ? 'Every invoice is paid.'
                          : 'Your first invoice is raised when you go live.'
                      "
                    />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (rows().length > page) {
          <div class="pager">
            <span
              >Showing <b class="t-num">{{ (pageNo() - 1) * page + 1 }}–{{ lastShown() }}</b> of
              <b class="t-num">{{ rows().length }}</b></span
            >
            <div class="pg">
              <button
                type="button"
                [disabled]="pageNo() <= 1"
                aria-label="Previous"
                (click)="pageNo.set(pageNo() - 1)"
              >
                <rp-icon name="left" [size]="14" />
              </button>
              @for (n of pages(); track n) {
                <button type="button" [class.on]="n === pageNo()" (click)="pageNo.set(n)">
                  {{ n }}
                </button>
              }
              <button
                type="button"
                [disabled]="pageNo() >= pages().length"
                aria-label="Next"
                (click)="pageNo.set(pageNo() + 1)"
              >
                <rp-icon name="right" [size]="14" />
              </button>
            </div>
          </div>
        } @else if (rows().length) {
          <div class="pager">
            <span>{{ plural(rows().length, 'invoice') }}</span>
          </div>
        }
      </section>
      <div class="c-grid k2" style="align-items: start">
        <rp-card title="Ways to pay" icon="wallet" [plainIcon]="true">
          <div class="stack g12 t-sm">
            <div class="row g10" style="align-items: flex-start">
              <span class="li-ic sm"><rp-icon name="card" [size]="16" /></span>
              <div>
                <b>Online — UPI, card or net banking</b>
                <p class="t-muted mt4" style="line-height: 1.5">
                  Marked paid as soon as the payment gateway confirms. A suspended institution is
                  restored straight away.
                </p>
                <p class="t-xs mt4" style="color: var(--info)">{{ gatewayText }}</p>
              </div>
            </div>
            <div class="row g10" style="align-items: flex-start">
              <span class="li-ic sm"><rp-icon name="send" [size]="16" /></span>
              <div>
                <b>Bank transfer</b>
                @if (payee(); as pe) {
                  <p class="t-muted mt4" style="line-height: 1.5">
                    To {{ pe.name }}, A/c <span class="t-mono">{{ pe.accountNo }}</span
                    >, IFSC <span class="t-mono">{{ pe.ifsc }}</span
                    >, with the invoice number as reference. CampusOne marks it paid when it arrives.
                  </p>
                }
              </div>
            </div>
          </div>
        </rp-card>
        <rp-card title="If an invoice isn't paid" icon="hourglass" [plainIcon]="true">
          <span class="srs" title="SRS reference" card-right>FR-SAS-08</span>
          <div class="tl">
            @for (r of lifecycle(); track r.t) {
              <div class="tl-i" [class]="'tl-i ' + r.state">
                <span class="tl-dot"><rp-icon [name]="r.icon" [size]="13" [stroke]="2.6" /></span>
                <div class="tl-c">
                  <div class="tl-t">{{ r.t }}</div>
                  <div class="tl-s">{{ r.s }}</div>
                </div>
              </div>
            }
          </div>
        </rp-card>
      </div>
    } @else {
      <div class="stack g16">
        <div class="c-grid k3">
          @for (i of [1, 2, 3]; track i) {
            <div class="sk" style="height: 92px; border-radius: 16px"></div>
          }
        </div>
        <div class="sk" style="height: 260px; border-radius: 16px"></div>
      </div>
    }
    @if (drawer(); as v) {
      <rp-sp-invoice
        [invoice]="v"
        [suspended]="suspended()"
        (closed)="drawer.set(null)"
        (pay)="drawer.set(null); payFor.set($event)"
      />
    }
    @if (payFor(); as v) {
      <rp-sp-pay [invoice]="v" [payee]="payee()" (closed)="payFor.set(null)" (paid)="paid()" />
    }
  `,
})
export class PortalBilling {
  private readonly api = inject(PortalApi);
  private readonly overlays = inject(Overlays);
  private readonly store = inject(PortalStore);
  protected readonly page = PAGE;
  protected readonly year = istBusinessDate().slice(0, 4);
  protected readonly gatewayText = translate('SAS.GATEWAY_UNAVAILABLE');
  protected readonly plural = plural;

  protected readonly items = signal<readonly Invoice[] | null>(null);
  protected readonly error = signal('');
  protected readonly filter = signal<Filter>('All');
  protected readonly pageNo = signal(1);
  protected readonly drawer = signal<Invoice | null>(null);
  protected readonly payFor = signal<Invoice | null>(null);

  private readonly billing = computed(() => this.store.account()?.billing ?? null);
  protected readonly payee = computed(() => this.billing()?.payee ?? null);
  protected readonly suspended = computed(() => this.store.shown() === 'Suspended');
  protected readonly instName = computed(() => this.store.account()?.institution.name ?? '');
  protected readonly sub = computed(() => {
    const b = this.billing()?.billing;
    return `Invoices, payments and how to pay. Invoices carry ${Number(b?.gstPercent ?? 18)}% GST and are due ${b?.dueDays ?? 15} days after issue.`;
  });
  protected readonly unpaid = computed(() => (this.items() ?? []).filter(payable));
  protected readonly alerts = computed(() =>
    this.unpaid().filter((v) => v.status !== 'DUE' || this.suspended()),
  );
  protected readonly paidThisYear = computed(() =>
    (this.items() ?? []).filter(
      (v) => v.status === 'PAID' && (v.payment?.paidOn ?? v.paidAt ?? '').startsWith(this.year),
    ),
  );
  protected readonly oweTone = computed(() => {
    const u = this.unpaid();
    return u.length ? (u.some((v) => v.status !== 'DUE') ? 'bad' : 'warn') : null;
  });
  protected readonly third = computed(() => {
    const s = this.store.shown();
    const b = this.billing();
    const sub = b?.subscription;
    if (s === 'Trial') {
      return { label: 'Trial ends', value: this.date(sub?.trialEndsOn), delta: '' };
    }
    if (s === 'Suspended') {
      const at = this.store.account()?.notices.find((n) => n.action === 'SUSPENDED')?.at;
      return { label: 'Suspended since', value: this.date(at), delta: '' };
    }
    const p = b?.plan;
    const renews = s === 'Active' ? sub?.renewsOn : null;
    const price = p ? paiseOf(p.price) : 0;
    return {
      label: 'Next renewal',
      value: this.date(renews),
      delta:
        renews && p ? `${inr(price + gstOn(price, b?.billing.gstPercent ?? 18))} incl. GST` : '',
    };
  });
  protected readonly filters = computed(() => {
    const all = this.items() ?? [];
    const u = this.unpaid().length;
    return [
      { v: 'All' as const, n: all.length },
      { v: 'Unpaid' as const, n: u },
      { v: 'Paid' as const, n: all.filter((v) => v.status === 'PAID').length },
    ];
  });
  protected readonly rows = computed(() => {
    const all = this.items() ?? [];
    const f = this.filter();
    return f === 'All'
      ? all
      : f === 'Unpaid'
        ? all.filter(payable)
        : all.filter((v) => v.status === 'PAID');
  });
  protected readonly pages = computed(() =>
    Array.from({ length: Math.max(1, Math.ceil(this.rows().length / PAGE)) }, (_, i) => i + 1),
  );
  protected readonly shownRows = computed(() =>
    this.rows().slice((this.pageNo() - 1) * PAGE, this.pageNo() * PAGE),
  );
  protected readonly lastShown = computed(() => Math.min(this.pageNo() * PAGE, this.rows().length));
  protected readonly lifecycle = computed(() => {
    const b = this.billing()?.billing;
    return [
      {
        t: 'Due',
        s: `${b?.dueDays ?? 15} days after the invoice date.`,
        state: 'done',
        icon: 'check' as IconName,
      },
      {
        t: `Grace · ${b?.graceDays ?? 14} days`,
        s: 'Everything keeps working; your contacts get reminders.',
        state: 'now',
        icon: 'alert' as IconName,
      },
      {
        t: 'Suspended',
        s: "Members can't sign in, pay or be paid; jobs pause; nothing is deleted.",
        state: 'bad',
        icon: 'pause' as IconName,
      },
      {
        t: 'Restored',
        s: 'As soon as the invoice is paid.',
        state: 'done',
        icon: 'play' as IconName,
      },
    ];
  });

  constructor() {
    void this.load();
    void this.store.refresh();
  }

  private async load() {
    try {
      this.items.set((await this.api.invoices()).items);
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected date(v: string | null | undefined) {
    return v ? formatDate(v) : '—';
  }
  protected money(m: Invoice['total']) {
    return inr(paiseOf(m));
  }
  protected sum(list: readonly Invoice[]) {
    return inr0(list.reduce((s, v) => s + paiseOf(v.total), 0));
  }
  protected trigger(v: Invoice) {
    return INVOICE_TRIGGER[v.trigger];
  }
  protected status(v: Invoice) {
    return INVOICE_STATUS[v.status]?.label ?? v.status;
  }
  protected tone(s: string) {
    return toneOf(s);
  }
  protected canPay(v: Invoice) {
    return payable(v);
  }
  protected statusLine(v: Invoice) {
    if (v.payment) {
      return `${this.date(v.payment.paidOn)} · ${v.payment.method === 'GATEWAY' ? 'Payment gateway' : 'Bank transfer'}`;
    }
    if (v.transfer) return 'Transfer reported';
    if (v.status === 'GRACE') return `until ${this.date(v.graceUntilOn)}`;
    return `due ${this.date(v.dueOn)}`;
  }
  protected setFilter(f: Filter) {
    this.filter.set(f);
    this.pageNo.set(1);
  }

  protected async download(v: Invoice) {
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

  protected paid() {
    this.payFor.set(null);
    void this.load();
    void this.store.refresh();
  }
}
