import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Amount, amountPaise } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { maskedAccount } from '../Merchants/merchant-format';
import { MerchantsApi } from '../Merchants/merchants.api';
import {
  PERIOD_LABEL,
  SETTLEMENT_STATUS,
  dt,
  inr,
  periodRange,
  plural,
  toMoney,
  type Period,
} from '../Settlements/settlement-format';
import { ReconApi, type MerchantStatement, type StatementLine } from './recon.api';
import { saveCsv } from './recon-format';
import { TxnDrawer, type TxnView } from './TxnDrawer';

const PAGE = 14;

/**
 * The Merchant statement tab (prototype recStmt; REC-015, OI-REC-03): a merchant and a period, the
 * collections, platform fee, net and payouts, the settlement account, and each movement of the
 * merchant's wallet with the fee and net of its settlement line ("Not settled yet" otherwise); a
 * download of the whole statement. The merchants come from the merchants list (merchants.view).
 */
@Component({
  selector: 'rp-recon-statement',
  imports: [Amount, Dropdown, Empty, Icon, Pager, TxnDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (merchantsError()) {
      <div class="card pad">
        <rp-empty icon="store" title="Couldn't list the merchants" [text]="merchantsError()">
          <button type="button" class="btn btn-sec btn-sm" (click)="loadMerchants()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else {
      <div class="c-filters">
        <div class="fld">
          <rp-dd
            inputId="rs-mer"
            placeholder="Choose a merchant"
            [options]="merchantOptions()"
            [value]="merchantId()"
            (changed)="merchantId.set($event)"
          />
        </div>
        <div class="pills" role="group" aria-label="Period">
          @for (p of periods; track p) {
            <button
              type="button"
              class="pill"
              [class.on]="sdp() === p"
              [attr.aria-pressed]="sdp() === p"
              (click)="sdp.set(p)"
            >
              {{ label(p) }}
            </button>
          }
        </div>
        <span class="fsum">{{ summary() }}</span>
        <button
          type="button"
          class="btn btn-sec btn-sm"
          id="rs-download"
          [class.is-busy]="exporting()"
          [disabled]="exporting() || !data()"
          (click)="download()"
        >
          <rp-icon name="download" [size]="15" /><span>Download statement</span>
        </button>
      </div>

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the statement" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else {
        <div class="c-grid k4" id="rs-tiles">
          <div class="cm-tile">
            <span>Gross (successful)</span><b class="t-num">{{ tile('collections') }}</b>
          </div>
          <div class="cm-tile">
            <span>Platform fee</span><b class="t-num">{{ tile('fees') }}</b>
          </div>
          <div class="cm-tile tone-brand">
            <span>Net to merchant</span><b class="t-num">{{ net() }}</b>
          </div>
          <div class="cm-tile">
            <span>Paid out</span><b class="t-num">{{ tile('paidOut') }}</b>
          </div>
        </div>
        @if (data(); as d) {
          <div class="t-sm t-muted" id="rs-meta">
            {{ d.merchant.name }} · <span class="t-mono">{{ d.merchant.uniqueId }}</span>
            @if (bank(); as b) {
              · settles to <span class="t-mono">{{ b }}</span>
            }
            @if (paise(d.totals.adjustments)) {
              · refunds and chargebacks {{ inr(d.totals.adjustments) }} deducted
            }
          </div>
        }

        <div class="tbl-wrap">
          <table class="tbl dense" id="rs-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Reference</th>
                <th>Type</th>
                <th class="r">Amount</th>
                <th class="r">Fee</th>
                <th class="r">Net</th>
                <th>Status</th>
                <th class="r">Balance</th>
              </tr>
            </thead>
            <tbody>
              @if (loading() && !rows().length) {
                <tr>
                  <td colspan="8"><rp-empty icon="hourglass" title="Loading…" /></td>
                </tr>
              }
              @for (x of shown(); track $index) {
                <tr
                  tabindex="0"
                  [attr.aria-label]="'Movement ' + x.reference"
                  (click)="open.set(x)"
                  (keydown.enter)="open.set(x)"
                >
                  <td>
                    @if (x.at) {
                      <div class="cell-t t-num" style="font-weight: 550">{{ date(x.at) }}</div>
                      <div class="cell-s">{{ time(x.at) }}</div>
                    } @else {
                      —
                    }
                  </td>
                  <td>
                    <span class="t-mono">{{ x.reference }}</span>
                  </td>
                  <td>
                    <span class="tag">{{ x.typeLabel }}</span>
                  </td>
                  <td class="r">
                    <rp-amt
                      [value]="x.amount"
                      [sign]="x.direction === 'DEBIT' ? '−' : null"
                      [cls]="x.direction === 'DEBIT' ? 't-bad' : ''"
                    />
                  </td>
                  <td class="r">
                    @if (x.settlement) {
                      <rp-amt [value]="x.settlement.fee" />
                    } @else {
                      <span class="t-faint">—</span>
                    }
                  </td>
                  <td class="r">
                    @if (x.settlement) {
                      <rp-amt [value]="x.settlement.net" />
                    } @else {
                      <span class="t-faint">—</span>
                    }
                  </td>
                  <td>
                    @if (x.settlement; as s) {
                      <span [class]="'chip dot tone-' + st(s.status).tone">{{
                        st(s.status).l()
                      }}</span>
                      <div class="cell-s t-mono">{{ s.settlementNo }}</div>
                    } @else {
                      <span class="chip dot tone-neutral">Not settled yet</span>
                    }
                  </td>
                  <td class="r">
                    @if (x.balanceAfter) {
                      <rp-amt [value]="x.balanceAfter" />
                    } @else {
                      <span class="t-faint">—</span>
                    }
                  </td>
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr>
                    <td colspan="8">
                      <rp-empty
                        icon="store"
                        [title]="
                          merchantId() ? 'No collections in this period' : 'Choose a merchant'
                        "
                        [text]="merchantId() ? 'Widen the period or choose another merchant.' : ''"
                      />
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        @if (rows().length > pageSize) {
          <rp-pager
            [total]="rows().length"
            [page]="page()"
            [size]="pageSize"
            (go)="page.set($event)"
          />
        } @else if (rows().length) {
          <div class="pager">
            <span>{{ plural(rows().length, 'line') }}</span>
          </div>
        }
        @if (data()?.nextCursor) {
          <div class="row" style="justify-content: center">
            <button
              type="button"
              class="btn btn-sec btn-sm"
              id="rs-more"
              [class.is-busy]="more()"
              [disabled]="more()"
              (click)="loadMore()"
            >
              <span>Load more lines</span>
            </button>
          </div>
        }
      }
    }

    @if (view(); as v) {
      <rp-txn-drawer [view]="v" (closed)="open.set(null)" />
    }
  `,
})
export class ReconStatement {
  private readonly api = inject(ReconApi);
  private readonly merchants = inject(MerchantsApi);
  private readonly overlays = inject(Overlays);

  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly inr = inr;
  protected readonly periods: readonly Period[] = ['today', '7', '30'];

  protected readonly merchantOptions = signal<readonly DropdownOption[]>([]);
  protected readonly merchantsError = signal('');
  protected readonly merchantId = signal('');
  protected readonly sdp = signal<Period>('7');
  protected readonly data = signal<MerchantStatement | null>(null);
  protected readonly rows = signal<readonly StatementLine[]>([]);
  protected readonly bank = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly open = signal<StatementLine | null>(null);
  private seq = 0;

  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(() =>
    this.data() ? `${plural(this.rows().length, 'line')}${this.data()?.nextCursor ? '+' : ''}` : '',
  );
  /** Collections − platform fee − refunds and chargebacks. */
  protected readonly net = computed(() => {
    const t = this.data()?.totals;
    if (!t) return '—';
    return inr(
      toMoney(amountPaise(t.collections) - amountPaise(t.fees) - amountPaise(t.adjustments)),
    );
  });
  protected readonly view = computed((): TxnView | null => {
    const x = this.open();
    const d = this.data();
    if (!x || !d) return null;
    const s = x.settlement;
    return {
      reference: x.reference,
      amount: x.amount,
      sign: x.direction === 'DEBIT' ? '−' : null,
      caption: x.remarks || x.typeLabel,
      status: s
        ? { l: SETTLEMENT_STATUS[s.status].l(), tone: SETTLEMENT_STATUS[s.status].tone }
        : { l: 'Not settled yet', tone: 'neutral' },
      kv: [
        { k: 'When', v: x.at ? dt(x.at) : '' },
        { k: 'Type', v: x.typeLabel },
        {
          k: x.direction === 'DEBIT' ? 'From' : 'To',
          v: d.merchant.name,
        },
        { k: 'Balance after', v: x.balanceAfter ? inr(x.balanceAfter) : '' },
        { k: 'Settlement', v: s?.settlementNo ?? '', mono: true },
        { k: 'Platform fee (settlement)', v: s ? inr(s.fee) : '' },
        { k: 'Net to merchant', v: s ? inr(s.net) : '' },
        { k: 'Paid out', v: s ? (s.paidOut ? 'Yes' : 'Not yet') : '' },
      ],
      ledger: 'Posted as one balanced debit/credit group in the ledger.',
    };
  });

  constructor() {
    void this.loadMerchants();
    effect(() => {
      this.merchantId();
      this.sdp();
      untracked(() => void this.load());
    });
    effect(() => {
      const id = this.merchantId();
      untracked(() => void this.loadBank(id));
    });
  }

  protected async loadMerchants() {
    this.merchantsError.set('');
    try {
      const d = await this.merchants.list({ limit: 200 });
      const opts = d.items.map((m) => ({ v: m.id, l: m.displayName }));
      this.merchantOptions.set(opts);
      if (!this.merchantId() && opts[0]) this.merchantId.set(opts[0].v);
      if (!opts.length) this.loading.set(false);
    } catch (e) {
      // A role without the Merchants task gets the register's refusal (backend gap: no merchant
      // picker under recon.view).
      this.merchantsError.set(this.problem(e));
    }
  }

  /** The settlement account (masked) from the merchant's record, when the role can see it. */
  private async loadBank(id: string) {
    this.bank.set(null);
    if (!id) return;
    try {
      const m = await this.merchants.detail(id);
      if (id === this.merchantId() && m.bank?.accountNumber) {
        this.bank.set(`${maskedAccount(m.bank.accountNumber)} (${m.bank.ifsc})`);
      }
    } catch {
      // The statement doesn't need it.
    }
  }

  private query(cursor?: string) {
    return {
      merchantId: this.merchantId(),
      ...periodRange(this.sdp()),
      ...(cursor ? { cursor } : {}),
    };
  }

  protected async load() {
    const n = ++this.seq;
    if (!this.merchantId()) return;
    this.loading.set(true);
    try {
      const d = await this.api.statement(this.query());
      if (n !== this.seq) return;
      this.data.set(d);
      this.rows.set(d.items);
      this.page.set(1);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(this.problem(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected async loadMore() {
    const c = this.data()?.nextCursor;
    if (!c) return;
    this.more.set(true);
    try {
      const d = await this.api.statement(this.query(c));
      this.data.set({ ...d, totals: this.data()!.totals });
      this.rows.set([...this.rows(), ...d.items]);
    } catch (e) {
      this.overlays.toast("Couldn't load more lines", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.more.set(false);
    }
  }

  /** The whole statement of the period (page by page, at most 10,000 lines) as a CSV file. */
  protected async download() {
    const d = this.data();
    if (!d) return;
    this.exporting.set(true);
    try {
      const all: StatementLine[] = [];
      let cursor: string | undefined;
      do {
        const p = await this.api.statement(this.query(cursor));
        all.push(...p.items);
        cursor = p.nextCursor ?? undefined;
      } while (cursor && all.length < 10_000);
      const name = `statement-${d.merchant.uniqueId}-${d.from}-to-${d.to}.csv`;
      saveCsv(name, [
        ['Merchant', d.merchant.name, d.merchant.uniqueId],
        ['Period', d.from, d.to],
        [],
        [
          'Date',
          'Time',
          'Reference',
          'Type',
          'Credit / debit',
          'Amount',
          'Fee',
          'Net',
          'Settlement',
          'Status',
          'Balance after',
        ],
        ...all.map((x) => [
          x.at ? formatDate(x.at) : '',
          x.at ? formatTime(x.at) : '',
          x.reference,
          x.typeLabel,
          x.direction === 'CREDIT' ? 'Credit' : 'Debit',
          x.amount.amount,
          x.settlement?.fee.amount ?? '',
          x.settlement?.net.amount ?? '',
          x.settlement?.settlementNo ?? '',
          x.settlement ? SETTLEMENT_STATUS[x.settlement.status].l() : 'Not settled yet',
          x.balanceAfter?.amount ?? '',
        ]),
        [],
        ['Gross (successful)', d.totals.collections.amount],
        ['Platform fee', d.totals.fees.amount],
        ['Refunds and chargebacks', d.totals.adjustments.amount],
        ['Paid out', d.totals.paidOut.amount],
      ]);
      this.overlays.toast('Statement downloaded', {
        sub: `${name} · ${plural(all.length, 'line')}`,
      });
    } catch (e) {
      this.overlays.toast("Couldn't download the statement", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.exporting.set(false);
    }
  }

  protected tile(k: 'collections' | 'fees' | 'paidOut') {
    const t = this.data()?.totals;
    return t ? inr(t[k]) : '—';
  }
  protected st(s: keyof typeof SETTLEMENT_STATUS) {
    return SETTLEMENT_STATUS[s];
  }
  protected label(p: Period) {
    return PERIOD_LABEL[p];
  }
  protected paise(m: { amount: string }) {
    return amountPaise(m);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected time(v: string) {
    return formatTime(v);
  }
  private problem(e: unknown) {
    return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
  }
}
