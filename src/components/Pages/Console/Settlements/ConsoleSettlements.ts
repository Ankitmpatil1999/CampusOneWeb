import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount, amountPaise } from '../../../Shared/Amount';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { inrWhole } from '../Merchants/merchant-format';
import { SettlementDrawer } from './SettlementDrawer';
import {
  SETTLEMENT_STATUS,
  dshort,
  inr,
  plural,
  plusDays,
  sortRows,
  sumPaise,
  toMoney,
  todayIst,
} from './settlement-format';
import {
  SettlementsApi,
  type Settlement,
  type SettlementList,
  type SettlementStatus,
} from './settlements.api';

type SortKey = 'date' | 'lines' | 'gross' | 'fee' | 'net' | 'status' | 'utr';
type Days = '7' | '30' | 'all';
const PAGE = 12;
const COLUMNS: readonly { k: SortKey; l: string; r?: boolean }[] = [
  { k: 'date', l: 'Date' },
  { k: 'lines', l: 'Transactions', r: true },
  { k: 'gross', l: 'Gross', r: true },
  { k: 'fee', l: 'Platform fee', r: true },
  { k: 'net', l: 'Net', r: true },
  { k: 'status', l: 'Status' },
  { k: 'utr', l: 'Payout UTR' },
];

/**
 * c.settlements — Settlements (SRS 14, FR-SET-01/06; STL-010, STL-011, STL-014; prototype
 * c.settlements): the institution's nightly merchant settlements, read-only — the key figures, the
 * status and period pills, the settlements with their totals, and the settlement drawer
 * (SettlementDrawer: merchants, statements, approval). Approvals and payouts happen in the back
 * office (o.settlements).
 */
@Component({
  selector: 'rp-console-settlements',
  imports: [Amount, Empty, Icon, Kpi, PageHead, Pager, SettlementDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Settlements"
        sub="Nightly merchant settlements for this institution. Approvals and payouts happen in the CampusOne back office."
      />

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Settlements are followed by the accounts office. Pages your role can open are listed in the menu."
        />
      } @else {
        <div class="note tone-info">
          <rp-icon name="bank" [size]="17" />
          <div class="grow">
            Settlements run at 23:30 each night. A CampusOne settlement maker approves stage one and a
            different checker gives final approval and records the bank payout reference
            (FR-SET-06). This page is read-only for the institution.
          </div>
        </div>

        <div class="c-grid k4" id="stl-kpis">
          <rp-kpi
            label="Awaiting approval"
            icon="hourglass"
            tone="warn"
            [value]="kpi().awaiting"
            [delta]="kpi().awaitingDelta"
          />
          <rp-kpi label="Net approved · 30 days" icon="checkc" tone="ok" [value]="kpi().approved" />
          <rp-kpi
            label="Platform fees · 30 days"
            icon="percent"
            [value]="kpi().fees"
            delta="On successful payments only"
          />
          <rp-kpi
            label="Last payout"
            icon="bank"
            [value]="kpi().payout"
            [delta]="kpi().payoutDelta"
          />
        </div>

        <div class="c-filters">
          <div class="pills" role="group" aria-label="Status">
            @for (p of statusPills; track p.v) {
              <button
                type="button"
                class="pill"
                [class.on]="status() === p.v"
                [attr.aria-pressed]="status() === p.v"
                (click)="status.set(p.v)"
              >
                {{ p.l() }}
              </button>
            }
          </div>
          <div class="pills" role="group" aria-label="Period">
            @for (p of dayPills; track p.v) {
              <button
                type="button"
                class="pill"
                [class.on]="days() === p.v"
                [attr.aria-pressed]="days() === p.v"
                (click)="days.set(p.v)"
              >
                {{ p.l }}
              </button>
            }
          </div>
          <span class="fsum">{{ summary() }}</span>
        </div>

        @if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the settlements" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else {
          <div class="tbl-wrap">
            <table class="tbl" id="stl-table">
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
                @for (r of shown(); track r.id) {
                  <tr
                    tabindex="0"
                    [attr.aria-label]="'Settlement ' + r.settlementNo"
                    (click)="openId.set(r.id)"
                    (keydown.enter)="openId.set(r.id)"
                  >
                    <td>
                      <div class="cell-t">{{ date(r.date) }}</div>
                      <div class="cell-s">
                        <span class="t-mono">{{ r.settlementNo }}</span>
                      </div>
                    </td>
                    <td class="r">{{ num(r.lines) }}</td>
                    <td class="r"><rp-amt [value]="r.gross" /></td>
                    <td class="r"><rp-amt [value]="r.fee" /></td>
                    <td class="r">
                      <b><rp-amt [value]="r.net" /></b>
                      @if (paise(r.adjustments)) {
                        <div class="cell-s">after {{ inr(r.adjustments) }} refunds</div>
                      }
                    </td>
                    <td>
                      <span [class]="'chip dot tone-' + st(r.status).tone">{{
                        st(r.status).l()
                      }}</span>
                    </td>
                    <td>
                      @if (r.payout) {
                        <span class="t-mono">{{ r.payout.utr }}</span>
                      } @else {
                        <span class="t-faint">{{
                          r.status === 'APPROVED' ? 'Awaiting payout' : '—'
                        }}</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  @if (!loading()) {
                    <tr>
                      <td [attr.colspan]="columns.length">
                        <rp-empty
                          icon="bank"
                          title="No settlements in this view"
                          [text]="
                            status() || days() !== 'all'
                              ? 'Change the status or the period.'
                              : 'The first settlement appears after the 23:30 run.'
                          "
                        />
                      </td>
                    </tr>
                  }
                }
              </tbody>
              @if (rows().length) {
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td class="r t-num">{{ num(total().lines) }}</td>
                    <td class="r"><rp-amt [value]="total().gross" /></td>
                    <td class="r"><rp-amt [value]="total().fee" /></td>
                    <td class="r"><rp-amt [value]="total().net" /></td>
                    <td colspan="2"></td>
                  </tr>
                </tfoot>
              }
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
              <span>{{ plural(rows().length, 'settlement') }}</span>
            </div>
          }
          @if (cursor()) {
            <div class="row" style="justify-content: center">
              <button
                type="button"
                class="btn btn-sec btn-sm"
                id="stl-more"
                [class.is-busy]="more()"
                [disabled]="more()"
                (click)="loadMore()"
              >
                <span>Load more settlements</span>
              </button>
            </div>
          }
        }
      }
    </div>

    @if (openId(); as id) {
      <rp-settlement-drawer [settlementId]="id" (closed)="openId.set(null)" />
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
export class ConsoleSettlements {
  private readonly api = inject(SettlementsApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly inr = inr;
  protected readonly statusPills: readonly { v: SettlementStatus | ''; l: () => string }[] = [
    { v: '', l: () => 'All' },
    { v: 'PENDING', l: SETTLEMENT_STATUS.PENDING.l },
    { v: 'APPROVAL_STAGE_1', l: SETTLEMENT_STATUS.APPROVAL_STAGE_1.l },
    { v: 'APPROVED', l: SETTLEMENT_STATUS.APPROVED.l },
    { v: 'FAILED', l: SETTLEMENT_STATUS.FAILED.l },
  ];
  protected readonly dayPills: readonly { v: Days; l: string }[] = [
    { v: '7', l: '7 days' },
    { v: '30', l: '30 days' },
    { v: 'all', l: 'All' },
  ];

  protected readonly status = signal<SettlementStatus | ''>('');
  protected readonly days = signal<Days>('all');
  protected readonly rows = signal<readonly Settlement[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly openId = signal<string | null>(null);
  /** The newest settlements (at least the last 30 days) behind the key figures. */
  private readonly recent = signal<readonly Settlement[] | null>(null);
  private seq = 0;

  protected readonly canView = computed(() => this.can('settlements.view'));
  protected readonly sorted = computed(() =>
    sortRows(this.rows(), this.sort(), (r, k) => {
      switch (k as SortKey) {
        case 'lines':
          return r.lines;
        case 'gross':
          return amountPaise(r.gross);
        case 'fee':
          return amountPaise(r.fee);
        case 'net':
          return amountPaise(r.net);
        case 'status':
          return SETTLEMENT_STATUS[r.status].l();
        case 'utr':
          return r.payout?.utr ?? '';
        default:
          return r.date;
      }
    }),
  );
  protected readonly shown = computed(() =>
    this.sorted().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(
    () => `${plural(this.rows().length, 'settlement')}${this.cursor() ? '+' : ''}`,
  );
  protected readonly total = computed(() => {
    const r = this.rows();
    return {
      lines: r.reduce((a, x) => a + x.lines, 0),
      gross: toMoney(sumPaise(r, (x) => x.gross)),
      fee: toMoney(sumPaise(r, (x) => x.fee)),
      net: toMoney(sumPaise(r, (x) => x.net)),
    };
  });
  protected readonly kpi = computed(() => {
    const list = this.recent();
    if (!list) {
      return {
        awaiting: '—',
        awaitingDelta: '',
        approved: '—',
        fees: '—',
        payout: '—',
        payoutDelta: '',
      };
    }
    const since = plusDays(todayIst(), -29);
    const waiting = list.filter((s) => s.status === 'PENDING' || s.status === 'APPROVAL_STAGE_1');
    const month = list.filter((s) => s.date >= since);
    const paid = list
      .filter((s) => s.payout)
      .sort((a, b) => String(b.payout!.at ?? '').localeCompare(String(a.payout!.at ?? '')))[0];
    return {
      awaiting: waiting.length.toLocaleString('en-IN'),
      awaitingDelta: waiting.length
        ? `${inr(toMoney(sumPaise(waiting, (s) => s.net)))} net`
        : 'Nothing pending',
      approved: inrWhole(
        toMoney(
          sumPaise(
            month.filter((s) => s.status === 'APPROVED'),
            (s) => s.net,
          ),
        ),
      ),
      fees: inrWhole(
        toMoney(
          sumPaise(
            month.filter((s) => s.status !== 'FAILED'),
            (s) => s.fee,
          ),
        ),
      ),
      payout: paid?.payout ? inrWhole(paid.payout.amount) : '—',
      payoutDelta: paid?.payout
        ? `${paid.payout.at ? dshort(paid.payout.at) + ' · ' : ''}${paid.payout.utr}`
        : '',
    };
  });

  constructor() {
    effect(() => {
      // A filter change reloads the first page from the server.
      this.status();
      this.days();
      untracked(() => {
        if (this.canView()) void this.load();
      });
    });
    effect(() => {
      if (this.canView()) untracked(() => void this.loadRecent());
    });
    const open = inject(ActivatedRoute).snapshot.queryParamMap.get('open');
    if (open) this.openId.set(open);
  }

  private query(cursor?: string) {
    const d = this.days();
    return {
      ...(this.status() ? { status: this.status() as SettlementStatus } : {}),
      ...(d !== 'all' ? { from: plusDays(todayIst(), d === '7' ? -6 : -29) } : {}),
      ...(cursor ? { cursor } : {}),
    };
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.list(this.query());
      if (n !== this.seq) return;
      this.rows.set(d.items);
      this.cursor.set(d.nextCursor);
      this.page.set(1);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(this.problem(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected async loadMore() {
    const c = this.cursor();
    if (!c) return;
    this.more.set(true);
    try {
      const d: SettlementList = await this.api.list(this.query(c));
      this.rows.set([...this.rows(), ...d.items]);
      this.cursor.set(d.nextCursor);
    } catch (e) {
      this.overlays.toast("Couldn't load more settlements", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.more.set(false);
    }
  }

  /** The key figures: newest first until the last 30 days are covered (a few pages at most). */
  private async loadRecent() {
    const since = plusDays(todayIst(), -29);
    const all: Settlement[] = [];
    try {
      let cursor: string | undefined;
      for (let i = 0; i < 6; i++) {
        const d = await this.api.list(cursor ? { cursor } : {});
        all.push(...d.items);
        const oldest = d.items.at(-1)?.date;
        if (!d.nextCursor || !oldest || oldest < since) break;
        cursor = d.nextCursor;
      }
      this.recent.set(all);
    } catch {
      // The figures stay "—"; the table shows its own error.
    }
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

  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected st(s: SettlementStatus) {
    return SETTLEMENT_STATUS[s];
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected paise(m: { amount: string }) {
    return amountPaise(m);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  private problem(e: unknown) {
    return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
  }
}
