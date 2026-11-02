import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Amount, amountPaise } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { formatDate, formatInr, formatTime } from '../../../Utils/format';
import { formatAmount } from '../../../Utils/money';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plusDays, todayIst } from '../Settlements/settlement-format';
import { ReconApi, type PoolBalance, type SignedMoney } from './recon.api';
import { ACCOUNT_LABEL } from './recon-format';

/** Signed paise of a pool figure. */
const signed = (m: SignedMoney) => (m.negative ? -1 : 1) * amountPaise(m);
/** Signed paise → API money ("-1250.00" when negative) for <rp-amt>. */
const asMoney = (p: number) => ({ amount: formatAmount(p), currency: 'INR' as const });

/**
 * The Pool balance tab (prototype recPool; REC-016, FR-REC-04, OI-REC-05): the sum of the wallet
 * balances, what the pool account holds per the ledger (the bank's own balance needs its feed),
 * the difference and the reconciling items that explain it (the ledger accounts that hold the rest,
 * then anything unexplained), and the daily closing snapshots of the last six days.
 */
@Component({
  selector: 'rp-recon-pool',
  imports: [Amount, Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="note tone-info">
      <rp-icon name="scale" [size]="17" />
      <div class="grow">
        The pool account at the sponsor bank holds the money behind every wallet of the institution
        — campus and allowance wallets, and merchants' collections not yet paid out. The difference
        should be fully explained (FR-REC-04).
      </div>
    </div>

    @if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the pool balance" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else if (p(); as p) {
      <div class="c-grid k3" id="rp-kpis">
        <div class="kpi">
          <span class="k-ic"><rp-icon name="wallet" [size]="17" /></span>
          <span class="k-l">Sum of wallet balances</span>
          <span class="k-v">{{ money(wallets()) }}</span>
          <span class="k-d">Per the ledger {{ money(signed(p.walletsPerLedger)) }}</span>
        </div>
        <div class="kpi">
          <span class="k-ic"><rp-icon name="bank" [size]="17" /></span>
          <span class="k-l">Pool account balance</span>
          <span class="k-v">{{ money(pool()) }}</span>
          <span class="k-d">{{ poolNote() }}</span>
        </div>
        <div
          class="kpi cm-diffk"
          [class.bad]="unexplained() !== 0"
          [class.ok]="unexplained() === 0"
        >
          <span class="k-l">Difference (pool − wallets)</span>
          <span class="k-v">{{ money(diff()) }}</span>
          <span class="k-d">
            @if (unexplained() !== 0) {
              <rp-icon name="alert" [size]="13" /> {{ money(unexplained()) }} not explained
            } @else {
              <rp-icon name="checkc" [size]="13" /> Fully explained
            }
          </span>
        </div>
      </div>

      <div class="tbl-wrap">
        <table class="tbl" id="rp-items">
          <thead>
            <tr>
              <th>Reconciling item</th>
              <th>Basis</th>
              <th class="r">Amount</th>
            </tr>
          </thead>
          <tbody>
            @for (o of others(); track o.kind) {
              <tr>
                <td>
                  <b>{{ o.l }}</b>
                </td>
                <td class="muted">{{ o.basis }}</td>
                <td class="r"><rp-amt [value]="o.amount" /></td>
              </tr>
            }
            <tr [class.cm-rej]="unexplained() !== 0">
              <td>
                <b>Unexplained</b>
                @if (unexplained() !== 0) {
                  <div class="cell-s">
                    Stored balances differ from the ledger — the ledger check lists the wallets.
                  </div>
                }
              </td>
              <td class="muted">
                @if (unexplained() !== 0) {
                  <button type="button" class="linkbtn" (click)="openLedger.emit()">
                    Open the ledger check
                  </button>
                } @else {
                  —
                }
              </td>
              <td class="r">
                @if (unexplained() !== 0) {
                  <b class="t-bad"><rp-amt [value]="asMoney(unexplained())" /></b>
                } @else {
                  <rp-amt [value]="asMoney(0)" />
                }
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">Difference</td>
              <td class="r"><rp-amt [value]="asMoney(diff())" /></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="sec-h">
        <h3>Daily balance snapshots</h3>
        <span class="t-xs t-muted">From the nightly opening/closing roll-over</span>
      </div>
      <div class="tbl-wrap">
        <table class="tbl dense" id="rp-days">
          <thead>
            <tr>
              <th>Date</th>
              <th class="r">Wallets (closing)</th>
              <th class="r">Pool (closing)</th>
              <th class="r">Difference</th>
            </tr>
          </thead>
          <tbody>
            @for (d of days(); track d.date) {
              <tr>
                <td>{{ date(d.date) }}</td>
                @if (d.wallets === null) {
                  <td class="r"><span class="t-faint">No roll-over</span></td>
                  <td class="r">
                    @if (d.pool !== null) {
                      <rp-amt [value]="asMoney(d.pool)" />
                    } @else {
                      <span class="t-faint">—</span>
                    }
                  </td>
                  <td class="r"><span class="t-faint">—</span></td>
                } @else {
                  <td class="r"><rp-amt [value]="asMoney(d.wallets)" /></td>
                  <td class="r"><rp-amt [value]="asMoney(d.pool!)" /></td>
                  <td class="r"><rp-amt [value]="asMoney(d.pool! - d.wallets)" /></td>
                }
              </tr>
            } @empty {
              <tr>
                <td colspan="4"><rp-empty icon="hourglass" title="Loading…" /></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
    }
  `,
})
export class ReconPool {
  private readonly api = inject(ReconApi);
  readonly openLedger = output<void>();

  protected readonly signed = signed;
  protected readonly asMoney = asMoney;
  protected readonly p = signal<PoolBalance | null>(null);
  protected readonly error = signal('');
  protected readonly days = signal<
    readonly { date: string; wallets: number | null; pool: number | null }[]
  >([]);

  protected readonly wallets = computed(() => {
    const p = this.p();
    return p ? signed(p.wallets ?? p.walletsPerLedger) : 0;
  });
  protected readonly pool = computed(() => {
    const p = this.p();
    return p ? signed(p.bankReported ?? p.poolExpected) : 0;
  });
  protected readonly diff = computed(() => this.pool() - this.wallets());
  protected readonly others = computed(() =>
    (this.p()?.otherAccounts ?? []).map((o) => ({
      kind: o.kind,
      l: ACCOUNT_LABEL[o.kind]?.l ?? o.kind,
      basis: ACCOUNT_LABEL[o.kind]?.basis ?? 'Ledger account',
      amount: asMoney(signed(o.balance)),
    })),
  );
  /** What the ledger accounts don't explain (REC-016 difference). */
  protected readonly unexplained = computed(() =>
    this.p()
      ? this.diff() - (this.p()!.otherAccounts ?? []).reduce((a, o) => a + signed(o.balance), 0)
      : 0,
  );
  protected readonly poolNote = computed(() => {
    const p = this.p();
    if (!p) return '';
    return p.bankReported
      ? `Bank statement · ${formatDate(p.asOf)}`
      : `Per the ledger as of ${formatTime(new Date())} · the bank's balance feed isn't connected yet`;
  });

  constructor() {
    void this.load();
  }

  protected async load() {
    this.error.set('');
    try {
      this.p.set(await this.api.pool());
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      return;
    }
    // The last six days' closing balances (8.15 roll-over); a day without one shows so.
    const today = todayIst();
    const dates = Array.from({ length: 6 }, (_, i) => plusDays(today, -(i + 1)));
    const out = await Promise.all(
      dates.map(async (date) => {
        try {
          const d = await this.api.pool(date);
          return {
            date,
            wallets: d.wallets ? signed(d.wallets) : null,
            pool: signed(d.bankReported ?? d.poolExpected),
          };
        } catch {
          return { date, wallets: null, pool: null };
        }
      }),
    );
    this.days.set(out);
  }

  /** "₹1,13,500.00"; a negative figure with the minus sign (−₹…), as <rp-amt> shows it. */
  protected money(p: number) {
    return formatInr(p).replace(/^-/, '−');
  }
  protected date(d: string) {
    return formatDate(d);
  }
}
