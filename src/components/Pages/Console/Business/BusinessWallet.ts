/**
 * A merchant's wallet on the web (client 2026-10-13; WAL-001, WAL-002, WAL-005): the balance and what
 * is held, and the statement by date range — every credit and debit with who it was with and the
 * balance after it — each with its receipt.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Amount, inrText } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { addDays, problemText, today } from '../Structure/academic-format';
import {
  BusinessApi,
  saveBlob,
  type Statement,
  type StatementLine,
  type Wallet,
} from './business.api';

@Component({
  selector: 'rp-business-wallet',
  imports: [Amount, Empty, Icon, Kpi, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="c-page">
    <rp-page-head
      title="Wallet"
      sub="Your merchant wallet: payments come in here before settlement."
    />

    @if (error()) {
      <div class="note tone-bad" role="alert" id="bw-error">
        <rp-icon name="alert" [size]="17" />
        <div class="grow">{{ error() }}</div>
        <button type="button" class="btn btn-sec btn-sm" (click)="load()">Try again</button>
      </div>
    } @else if (!wallets()) {
      <div class="card pad"><div class="sk" style="height: 260px; border-radius: 16px"></div></div>
    } @else if (!wallet()) {
      <rp-empty
        icon="wallet"
        title="No wallet yet"
        text="The school opens your wallet when it registers you as a merchant."
      />
    } @else if (wallet(); as w) {
      <div class="c-grid k3" id="bw-kpis">
        <rp-kpi
          label="Balance"
          [value]="inr(w.balance)"
          icon="wallet"
          tone="ok"
          [delta]="'Wallet ' + w.walletNo"
        />
        <rp-kpi label="Held" [value]="inr(w.held)" icon="lock" delta="Not available yet" />
        <rp-kpi
          label="Status"
          [value]="
            w.status === 'ACTIVE' ? 'Active' : w.status.charAt(0) + w.status.slice(1).toLowerCase()
          "
          icon="shieldck"
          [tone]="w.status === 'ACTIVE' ? 'ok' : 'warn'"
        />
      </div>

      <div class="c-filters">
        <div class="fld-in" style="width: 170px">
          <input
            id="bw-from"
            type="date"
            aria-label="From"
            [max]="to()"
            [value]="from()"
            (change)="setFrom($event)"
          />
        </div>
        <div class="fld-in" style="width: 170px">
          <input
            id="bw-to"
            type="date"
            aria-label="To"
            [min]="from()"
            [max]="todayDate"
            [value]="to()"
            (change)="setTo($event)"
          />
        </div>
        @if (statement(); as s) {
          <span class="t-sm t-muted">
            @if (s.openingBalance) {
              Opening <rp-amt [value]="s.openingBalance" />
            }
            @if (s.closingBalance) {
              · closing <rp-amt [value]="s.closingBalance" />
            }
          </span>
        }
      </div>

      @if (lineError()) {
        <div class="note tone-bad" role="alert">
          <rp-icon name="alertc" [size]="17" />
          <div class="grow">{{ lineError() }}</div>
        </div>
      }
      <div class="tbl-wrap">
        <table class="tbl" id="bw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Reference</th>
              <th class="r">Amount</th>
              <th class="r">Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (l of lines(); track l.id) {
              <tr>
                <td>
                  {{ formatDate(l.at) }}
                  <div class="cell-s">{{ formatTime(l.at) }}</div>
                </td>
                <td>
                  <b class="t-sb">{{ l.title }}</b>
                  <div class="cell-s">
                    {{ l.counterparty ? l.counterparty + ' · ' : '' }}{{ l.channelLabel }}
                  </div>
                </td>
                <td class="t-mono t-xs">{{ l.reference }}</td>
                <td class="r">
                  <rp-amt
                    [value]="l.amount"
                    [sign]="l.direction === 'CREDIT' ? '+' : '−'"
                    [cls]="l.direction === 'CREDIT' ? 'cr' : ''"
                  />
                </td>
                <td class="r">
                  @if (l.balanceAfter) {
                    <rp-amt [value]="l.balanceAfter" />
                  } @else {
                    —
                  }
                </td>
                <td class="r">
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    [attr.aria-label]="'Receipt ' + l.reference"
                    title="Receipt"
                    [disabled]="busy() === l.reference"
                    (click)="receipt(l)"
                  >
                    <rp-icon name="download" [size]="15" />
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6">
                  <rp-empty
                    icon="receipt"
                    [title]="loading() ? 'Loading…' : 'Nothing in these dates'"
                    text="Try a wider date range."
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (statement()?.nextCursor) {
        <div class="row" style="justify-content: center">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            id="bw-more"
            [class.is-busy]="loading()"
            [disabled]="loading()"
            (click)="loadLines(true)"
          >
            <span>Show older entries</span>
          </button>
        </div>
      }
    }
  </div>`,
})
export class BusinessWallet implements OnInit {
  private readonly api = inject(BusinessApi);
  private readonly overlays = inject(Overlays);
  protected readonly inr = inrText;
  protected readonly formatDate = formatDate;
  protected readonly formatTime = formatTime;
  protected readonly todayDate = today();
  protected readonly wallets = signal<readonly Wallet[] | null>(null);
  protected readonly from = signal(addDays(today(), -29));
  protected readonly to = signal(today());
  protected readonly statement = signal<Statement | null>(null);
  protected readonly lines = signal<readonly StatementLine[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly lineError = signal('');
  protected readonly busy = signal('');
  private seq = 0;

  /** The merchant's own wallet (the first, if the profile has more than one). */
  protected readonly wallet = computed(
    () => this.wallets()?.find((w) => w.kind === 'MERCHANT') ?? this.wallets()?.[0] ?? null,
  );

  ngOnInit() {
    void this.load();
  }

  async load() {
    try {
      this.wallets.set((await this.api.wallets()).wallets);
      this.error.set('');
      await this.loadLines();
    } catch (e) {
      this.error.set(problemText(e));
    }
  }

  protected setFrom(e: Event) {
    this.from.set((e.target as HTMLInputElement).value);
    void this.loadLines();
  }
  protected setTo(e: Event) {
    this.to.set((e.target as HTMLInputElement).value);
    void this.loadLines();
  }

  async loadLines(more = false) {
    const w = this.wallet();
    if (!w) return;
    const id = ++this.seq;
    this.loading.set(true);
    try {
      const s = await this.api.statement(w.id, {
        from: this.from(),
        to: this.to(),
        cursor: more ? this.statement()?.nextCursor : null,
      });
      if (id !== this.seq) return;
      this.lines.set(more ? [...this.lines(), ...s.items] : s.items);
      this.statement.set(s);
      this.lineError.set('');
    } catch (e) {
      if (id === this.seq) this.lineError.set(problemText(e));
    } finally {
      if (id === this.seq) this.loading.set(false);
    }
  }

  protected async receipt(l: StatementLine) {
    this.busy.set(l.reference);
    try {
      saveBlob(await this.api.receipt(l.reference), `campusone-receipt-${l.reference}.pdf`);
    } catch (e) {
      this.overlays.toast("Couldn't download the receipt", { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set('');
    }
  }
}
