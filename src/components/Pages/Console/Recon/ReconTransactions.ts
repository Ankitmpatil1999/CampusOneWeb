import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Amount, amountPaise } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  PERIOD_LABEL,
  dt,
  inr,
  periodRange,
  plural,
  sortRows,
  sumPaise,
  toMoney,
  type Period,
} from '../Settlements/settlement-format';
import { ReconApi, type AttemptStatus, type Txn, type TxnPage } from './recon.api';
import { ATTEMPT_TONE, MODE_OPTIONS, STATUS_OPTIONS, channelLabel } from './recon-format';
import { TxnDrawer, type TxnView } from './TxnDrawer';

type SortKey = 'at' | 'reference' | 'payer' | 'payee' | 'channel' | 'amount' | 'status';
const PAGE = 14;
const COLUMNS: readonly { k: SortKey; l: string; r?: boolean }[] = [
  { k: 'at', l: 'When' },
  { k: 'reference', l: 'Reference' },
  { k: 'payer', l: 'From' },
  { k: 'payee', l: 'To' },
  { k: 'channel', l: 'Mode' },
  { k: 'amount', l: 'Amount', r: true },
  { k: 'status', l: 'Status' },
];

/**
 * The Transactions tab (prototype recTx; REC-013): the period pills, the reference search, the mode
 * and status filters and the export, the status tiles and the campus payments and transfers; a row
 * opens the transaction drawer.
 */
@Component({
  selector: 'rp-recon-transactions',
  imports: [Amount, Dropdown, Empty, Icon, Pager, TxnDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="c-filters">
      <div class="pills" role="group" aria-label="Period">
        @for (p of periods; track p) {
          <button
            type="button"
            class="pill"
            [class.on]="dp() === p"
            [attr.aria-pressed]="dp() === p"
            (click)="dp.set(p)"
          >
            {{ label(p) }}
          </button>
        }
      </div>
      <label class="search"
        ><rp-icon name="search" [size]="16" /><input
          type="search"
          id="rt-q"
          placeholder="Search reference"
          aria-label="Search by transaction reference"
          autocomplete="off"
          maxlength="35"
          [value]="q()"
          (input)="setQ($event)"
      /></label>
      <div class="fld">
        <rp-dd
          inputId="rt-mode"
          placeholder="All modes"
          [options]="modeOptions"
          [value]="mode()"
          (changed)="mode.set($event)"
        />
      </div>
      <div class="fld">
        <rp-dd
          inputId="rt-st"
          placeholder="Any status"
          [options]="statusOptions"
          [value]="tst()"
          (changed)="setStatus($event)"
        />
      </div>
      <span class="fsum">{{ summary() }}</span>
      <button
        type="button"
        class="btn btn-sec btn-sm"
        id="rt-export"
        [class.is-busy]="exporting()"
        [disabled]="exporting() || !data()"
        (click)="export()"
      >
        <rp-icon name="download" [size]="15" /><span>Export</span>
      </button>
    </div>

    <div class="c-grid k4" id="rt-tiles">
      <div class="cm-tile tone-ok" [attr.title]="value() === '—' ? valueWhy : null">
        <span>Successful value</span><b class="t-num">{{ value() }}</b>
      </div>
      <div class="cm-tile">
        <span>Successful</span><b class="t-num">{{ tile('success') }}</b>
      </div>
      <div class="cm-tile" [class.tone-bad]="count('failure') > 0">
        <span>Failed</span><b class="t-num">{{ tile('failure') }}</b>
      </div>
      <div class="cm-tile" [class.tone-warn]="count('pending') > 0">
        <span>Pending</span><b class="t-num">{{ tile('pending') }}</b>
      </div>
    </div>

    @if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the transactions" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else {
      <div class="tbl-wrap">
        <table class="tbl dense" id="rt-table">
          <thead>
            <tr>
              @for (c of columns; track c.k) {
                <th
                  class="sort"
                  [class.r]="c.r"
                  [class.asc]="sort()?.k === c.k && sort()?.dir === 'asc'"
                  [class.desc]="sort()?.k === c.k && sort()?.dir === 'desc'"
                  [attr.aria-sort]="ariaSort(c.k)"
                  (click)="sortBy(c.k)"
                >
                  <button
                    type="button"
                    class="cp-th"
                    (click)="$event.stopPropagation(); sortBy(c.k)"
                  >
                    {{ c.l
                    }}<span class="sa" aria-hidden="true">{{
                      sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                    }}</span>
                  </button>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @if (loading() && !rows().length) {
              <tr>
                <td [attr.colspan]="columns.length">
                  <rp-empty icon="hourglass" title="Loading…" />
                </td>
              </tr>
            }
            @for (t of shown(); track t.id) {
              <tr
                tabindex="0"
                [attr.aria-label]="'Transaction ' + t.reference"
                (click)="open.set(t)"
                (keydown.enter)="open.set(t)"
              >
                <td>
                  @if (t.at) {
                    <div class="cell-t t-num" style="font-weight: 550">{{ date(t.at) }}</div>
                    <div class="cell-s">{{ time(t.at) }}</div>
                  } @else {
                    —
                  }
                </td>
                <td>
                  <span class="t-mono">{{ t.reference }}</span>
                </td>
                <td>
                  <span class="t-clip" style="display: block; max-width: 190px">{{ t.payer }}</span>
                </td>
                <td>
                  <span class="t-clip" style="display: block; max-width: 190px">{{ t.payee }}</span>
                </td>
                <td>
                  <span class="tag">{{ channel(t.channel) }}</span>
                </td>
                <td class="r"><rp-amt [value]="t.amount" /></td>
                <td>
                  <span [class]="'chip dot tone-' + tone(t.status)">{{ t.statusLabel }}</span>
                </td>
              </tr>
            } @empty {
              @if (!loading()) {
                <tr>
                  <td [attr.colspan]="columns.length">
                    <rp-empty
                      icon="search"
                      title="No transactions match"
                      text="Widen the date range or clear the filters."
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
          <span>{{ plural(rows().length, 'transaction') }}</span>
        </div>
      }
      @if (data()?.nextCursor) {
        <div class="row" style="justify-content: center">
          <button
            type="button"
            class="btn btn-sec btn-sm"
            id="rt-more"
            [class.is-busy]="more()"
            [disabled]="more()"
            (click)="loadMore()"
          >
            <span>Load more transactions</span>
          </button>
        </div>
      }
    }

    @if (view(); as v) {
      <rp-txn-drawer [view]="v" (closed)="open.set(null)" />
    }
  `,
  styles: `
    .cp-th {
      font: inherit;
      color: inherit;
      text-transform: inherit;
      letter-spacing: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    .cp-th:focus-visible {
      outline: 2px solid var(--brand-3);
      outline-offset: 2px;
      border-radius: 4px;
    }
  `,
})
export class ReconTransactions {
  private readonly api = inject(ReconApi);
  private readonly overlays = inject(Overlays);

  protected readonly columns = COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly periods: readonly Period[] = ['7', '30', 'today', 'yday', 'month'];
  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly valueWhy =
    'Shown once every successful transaction of the period is loaded — load more, or filter by status.';

  protected readonly dp = signal<Period>('7');
  protected readonly q = signal('');
  protected readonly mode = signal('');
  protected readonly tst = signal<AttemptStatus | ''>('');
  protected readonly data = signal<TxnPage | null>(null);
  protected readonly rows = signal<readonly Txn[]>([]);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly open = signal<Txn | null>(null);
  private seq = 0;
  private qTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly sorted = computed(() =>
    sortRows(this.rows(), this.sort(), (t, k) => {
      switch (k as SortKey) {
        case 'amount':
          return amountPaise(t.amount);
        case 'at':
          return t.at ? Date.parse(t.at) : 0;
        default:
          return String(t[k as keyof Txn] ?? '');
      }
    }),
  );
  protected readonly shown = computed(() =>
    this.sorted().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  /** The rows of the filters: all statuses, or the chosen one's count. */
  protected readonly matching = computed(() => {
    const d = this.data();
    if (!d) return null;
    const s = this.tst();
    return s === 'SUCCESS'
      ? d.tiles.success.count
      : s === 'FAILURE'
        ? d.tiles.failure.count
        : s === 'PENDING'
          ? d.tiles.pending.count
          : d.tiles.total;
  });
  protected readonly summary = computed(() => {
    const n = this.matching();
    return n === null ? '' : plural(n, 'transaction');
  });
  /** The successful value: exact once every successful row of the period is loaded. */
  protected readonly value = computed(() => {
    const d = this.data();
    if (!d || d.nextCursor || (this.tst() && this.tst() !== 'SUCCESS')) return '—';
    const ok = this.rows().filter((t) => t.status === 'SUCCESS');
    return inr(toMoney(sumPaise(ok, (t) => t.amount)));
  });
  protected readonly view = computed((): TxnView | null => {
    const t = this.open();
    if (!t) return null;
    return {
      reference: t.reference,
      amount: t.amount,
      caption: t.remarks || t.description,
      status: { l: t.statusLabel, tone: ATTEMPT_TONE[t.status] ?? 'neutral' },
      kv: [
        { k: 'When', v: t.at ? dt(t.at) : '' },
        { k: 'Mode', v: channelLabel(t.channel) },
        { k: 'Instrument', v: t.channel === 'ALLOWANCE' ? 'Allowance' : 'Wallet' },
        { k: 'From', v: t.payer },
        { k: 'To', v: t.payee },
        { k: 'Type', v: t.description },
      ],
      ledger:
        t.status === 'SUCCESS'
          ? 'Posted as one balanced debit/credit group in the ledger.'
          : 'No ledger entries — nothing moved.',
    };
  });

  constructor() {
    effect(() => {
      this.dp();
      this.mode();
      this.tst();
      untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.qTimer));
  }

  private query(cursor?: string) {
    const r = periodRange(this.dp());
    return {
      ...r,
      ...(this.tst() ? { status: this.tst() as AttemptStatus } : {}),
      ...(this.mode() ? { channel: this.mode() } : {}),
      ...(this.q().trim() ? { q: this.q().trim() } : {}),
      ...(cursor ? { cursor } : {}),
    };
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.transactions(this.query());
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
      const d = await this.api.transactions(this.query(c));
      this.data.set({ ...d, tiles: this.data()!.tiles });
      this.rows.set([...this.rows(), ...d.items]);
    } catch (e) {
      this.overlays.toast("Couldn't load more transactions", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.more.set(false);
    }
  }

  protected async export() {
    const d = this.data();
    if (!d) return;
    this.exporting.set(true);
    const name = `transactions-${d.from}-to-${d.to}.csv`;
    try {
      await this.api.exportTransactions(this.query(), name);
      const n = this.matching() ?? 0;
      this.overlays.toast('Export ready', {
        sub: `${name} · ${plural(Math.min(n, 10_000), 'row')}`,
      });
    } catch (e) {
      this.overlays.toast("Couldn't export the transactions", {
        sub: this.problem(e),
        tone: 'bad',
      });
    } finally {
      this.exporting.set(false);
    }
  }

  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => void this.load(), 250);
  }
  protected setStatus(v: string) {
    this.tst.set(v as AttemptStatus | '');
  }
  protected sortBy(k: SortKey) {
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: SortKey) {
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  protected label(p: Period) {
    return PERIOD_LABEL[p];
  }
  protected count(k: 'success' | 'failure' | 'pending') {
    return this.data()?.tiles[k].count ?? 0;
  }
  protected tile(k: 'success' | 'failure' | 'pending') {
    const d = this.data();
    return d ? d.tiles[k].count.toLocaleString('en-IN') : '—';
  }
  protected channel(c: string) {
    return channelLabel(c);
  }
  protected tone(s: AttemptStatus) {
    return ATTEMPT_TONE[s] ?? 'neutral';
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
