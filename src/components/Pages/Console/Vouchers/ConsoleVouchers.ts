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
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { MappingForm } from './MappingForm';
import { VoucherDrawer } from './VoucherDrawer';
import { EVENT_CATEGORY, VOUCHER_STATUS, plural } from './voucher-format';
import {
  VouchersApi,
  type AccountingEvent,
  type Mappings,
  type Voucher,
  type VoucherList,
  type VoucherStatus,
} from './vouchers.api';

type Tab = 'v' | 'map';
type SortKey = 'ref' | 'date' | 'event' | 'amount' | 'status';
const PAGE = 12;
const COLUMNS: readonly { k: SortKey | 'acc' | 'x'; l: string; r?: boolean; sort: boolean }[] = [
  { k: 'ref', l: 'Voucher', sort: true },
  { k: 'date', l: 'Date', sort: true },
  { k: 'event', l: 'Posting', sort: true },
  { k: 'acc', l: 'Dr → Cr', sort: false },
  { k: 'amount', l: 'Amount', r: true, sort: true },
  { k: 'status', l: 'Status', sort: true },
  { k: 'x', l: '', sort: false },
];

/**
 * c.vouchers — Accounting (SRS 13.13, FR-INT-06; FEE-034…037; prototype c.vouchers): the vouchers
 * written for the institution's accounting package with their transfer status, the reason a
 * transfer failed and a retry (VoucherDrawer), and the event mapping — the company, transfers on or
 * off and each posting's ledgers (MappingForm). The package is an example contract until it is
 * chosen (OQ-04): in test mode a note says it is simulated.
 */
@Component({
  selector: 'rp-console-vouchers',
  imports: [Amount, Dropdown, Empty, Icon, Kpi, MappingForm, PageHead, Pager, VoucherDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Accounting"
        sub="Every mapped posting — fee collections, event payments, allowance funding and refunds — becomes a voucher in the institution's accounting package."
      >
        @if (canView()) {
          @if (retryWhy()) {
            <span class="cp-why" [attr.title]="retryWhy()"
              ><button type="button" class="btn btn-sec" disabled>
                <rp-icon name="refresh" [size]="17" /><span>{{ retryLabel() }}</span>
              </button></span
            >
          } @else {
            <button
              type="button"
              class="btn btn-sec"
              id="vch-retry-all"
              [class.is-busy]="retrying()"
              [disabled]="retrying()"
              (click)="retryAll()"
            >
              <rp-icon name="refresh" [size]="17" /><span>{{ retryLabel() }}</span>
            </button>
          }
        }
      </rp-page-head>

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Accounting vouchers are followed by the accounts office. Pages your role can open are listed in the menu."
        />
      } @else {
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        @if (mode() === 'test') {
          <div class="note tone-warn" id="vch-test">
            <rp-icon name="alert" [size]="17" />
            <div class="grow">
              <b>Test package.</b> The accounting package isn't chosen yet, so vouchers go to a
              simulated package: each one is accepted with a TEST- reference, and a ledger whose
              name starts with “TEST-FAIL” is refused so that a failure and its retry can be tried.
            </div>
          </div>
        } @else if (mode() === 'off') {
          <div class="note tone-info" id="vch-off">
            <rp-icon name="info" [size]="17" />
            <div class="grow">{{ offText }}</div>
          </div>
        }

        <div class="c-grid k4" id="vch-kpis">
          <rp-kpi label="Transferred" icon="checkc" tone="ok" [value]="count('transferred')" />
          <rp-kpi
            label="Failed"
            icon="alert"
            tone="bad"
            [value]="count('failed')"
            delta="Retried automatically; retry now to force"
          />
          <rp-kpi
            label="Pending Transfer"
            icon="hourglass"
            tone="warn"
            [value]="count('pending')"
            delta="Sent by the next transfer run"
          />
          <rp-kpi
            label="Accounting package"
            icon="database"
            [value]="packageLabel()"
            delta="Target package is an open decision (OQ-04)"
          />
        </div>

        <div class="tabs" role="tablist" aria-label="Accounting">
          <button
            type="button"
            class="tab"
            role="tab"
            id="vch-tab-v"
            [class.on]="tab() === 'v'"
            [attr.aria-selected]="tab() === 'v'"
            (click)="tab.set('v')"
          >
            Vouchers<span class="n">{{ totalCount() }}</span>
          </button>
          <button
            type="button"
            class="tab"
            role="tab"
            id="vch-tab-map"
            [class.on]="tab() === 'map'"
            [attr.aria-selected]="tab() === 'map'"
            (click)="tab.set('map')"
          >
            Event mapping<span class="n">{{ mappedCount() }}</span>
          </button>
        </div>

        @if (tab() === 'v') {
          <div class="c-filters">
            <label class="search"
              ><rp-icon name="search" [size]="16" /><input
                type="search"
                id="vc-q"
                placeholder="Reference, ledger or narration"
                aria-label="Search vouchers"
                autocomplete="off"
                [value]="q()"
                (input)="setQ($event)"
            /></label>
            <div class="fld">
              <rp-dd
                inputId="vc-ev"
                placeholder="All postings"
                [options]="eventOptions"
                [value]="event()"
                (changed)="setEvent($event)"
              />
            </div>
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
            <span class="fsum">{{ summary() }}</span>
          </div>

          @if (error()) {
            <div class="card pad">
              <rp-empty icon="alertc" title="Couldn't load the vouchers" [text]="error()">
                <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                  <span>Try again</span>
                </button>
              </rp-empty>
            </div>
          } @else {
            <div class="tbl-wrap">
              <table class="tbl dense" id="vch-table">
                <thead>
                  <tr>
                    @for (c of columns; track c.k) {
                      <th
                        [class.sort]="c.sort"
                        [class.r]="c.r"
                        [class.asc]="c.sort && sort()?.k === c.k && sort()?.dir === 'asc'"
                        [class.desc]="c.sort && sort()?.k === c.k && sort()?.dir === 'desc'"
                        [attr.aria-sort]="c.sort ? ariaSort(c.k) : null"
                        (click)="c.sort && sortBy(c.k)"
                      >
                        @if (c.sort) {
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
                        } @else {
                          {{ c.l }}
                        }
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
                      [attr.aria-label]="'Voucher ' + r.reference"
                      (click)="open.set(r)"
                      (keydown.enter)="open.set(r)"
                    >
                      <td>
                        <span class="t-mono">{{ r.reference }}</span>
                        <div class="cell-s">{{ attempts(r) }}</div>
                      </td>
                      <td>
                        <div class="cell-t t-num" style="font-weight: 550">{{ date(r.date) }}</div>
                        <div class="cell-s">{{ time(r) }}</div>
                      </td>
                      <td>{{ r.eventLabel }}</td>
                      <td>
                        <span class="t-sm">{{ r.debitLedger }} → {{ r.creditLedger }}</span>
                      </td>
                      <td class="r"><rp-amt [value]="r.amount" /></td>
                      <td>
                        <span [class]="'chip dot tone-' + st(r.status).tone">{{
                          st(r.status).l()
                        }}</span>
                        @if (r.status === 'FAILED') {
                          <div class="cell-s t-bad" style="white-space: normal; max-width: 30ch">
                            {{ r.lastError }}
                          </div>
                        } @else if (r.externalRef) {
                          <div class="cell-s">
                            <span class="t-mono">{{ r.externalRef }}</span>
                          </div>
                        }
                      </td>
                      <td>
                        @if (r.status === 'FAILED') {
                          @if (editWhy()) {
                            <span class="cp-why" [attr.title]="editWhy()"
                              ><button type="button" class="btn btn-soft btn-xs" disabled>
                                <rp-icon name="refresh" [size]="15" /><span>Retry</span>
                              </button></span
                            >
                          } @else {
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              [class.is-busy]="busyId() === r.id"
                              [disabled]="busyId() === r.id"
                              (click)="$event.stopPropagation(); retryOne(r)"
                              (keydown.enter)="$event.stopPropagation()"
                            >
                              <rp-icon name="refresh" [size]="15" /><span>Retry</span>
                            </button>
                          }
                        }
                      </td>
                    </tr>
                  } @empty {
                    @if (!loading()) {
                      <tr>
                        <td [attr.colspan]="columns.length">
                          <rp-empty
                            icon="filetext"
                            [title]="filtered() ? 'No vouchers match' : 'No vouchers yet'"
                            [text]="
                              filtered()
                                ? 'Change the search, the posting or the status.'
                                : 'Map the postings and turn transfers on in Event mapping; the next transfer run writes the vouchers.'
                            "
                          />
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            @if (filteredRows().length > pageSize) {
              <rp-pager
                [total]="filteredRows().length"
                [page]="page()"
                [size]="pageSize"
                (go)="page.set($event)"
              />
            } @else if (filteredRows().length) {
              <div class="pager">
                <span>{{ plural(filteredRows().length, 'voucher') }}</span>
              </div>
            }
            @if (cursor()) {
              <div class="row" style="justify-content: center">
                <button
                  type="button"
                  class="btn btn-sec btn-sm"
                  id="vch-more"
                  [class.is-busy]="more()"
                  [disabled]="more()"
                  (click)="loadMore()"
                >
                  <span>Load more vouchers</span>
                </button>
              </div>
            }
          }
        } @else {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              Each posting goes to a debit and a credit ledger in the company's chart of accounts.
              Vouchers are written only for postings made after transfers are turned on, and a
              changed mapping doesn't change vouchers already written.
            </div>
          </div>
          @if (mapError()) {
            <div class="card pad">
              <rp-empty icon="alertc" title="Couldn't load the mapping" [text]="mapError()">
                <button type="button" class="btn btn-sec btn-sm" (click)="loadMappings()">
                  <span>Try again</span>
                </button>
              </rp-empty>
            </div>
          } @else if (maps(); as m) {
            <div class="row between" id="vch-company">
              <span class="t-sm t-muted">
                @if (m.company) {
                  Company <b class="t-ink">{{ m.company }}</b> ·
                  @if (m.enabled) {
                    transfers on{{ m.enabledAt ? ' since ' + date(m.enabledAt) : '' }}
                  } @else {
                    transfers off
                  }
                } @else {
                  No accounting company yet. Name it and turn transfers on to start writing
                  vouchers.
                }
              </span>
              @if (editWhy()) {
                <span class="cp-why" [attr.title]="editWhy()"
                  ><button type="button" class="btn btn-sec btn-sm" disabled>
                    <rp-icon name="building" [size]="15" /><span>Company & transfers</span>
                  </button></span
                >
              } @else {
                <button
                  type="button"
                  class="btn btn-sec btn-sm"
                  id="vch-co"
                  (click)="editing.set('company')"
                >
                  <rp-icon name="building" [size]="15" /><span>Company & transfers</span>
                </button>
              }
            </div>
            <div class="tbl-wrap">
              <table class="tbl" id="vch-map">
                <thead>
                  <tr>
                    <th>Posting</th>
                    <th>Category</th>
                    <th>Debit account</th>
                    <th>Credit account</th>
                    <th>Company</th>
                    <th><span class="sr-only">Edit</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of m.events; track e.event) {
                    <tr
                      [attr.tabindex]="editWhy() ? null : 0"
                      [attr.aria-label]="'Mapping ' + e.label"
                      (click)="editEvent(e.event)"
                      (keydown.enter)="editEvent(e.event)"
                    >
                      <td>
                        <b>{{ e.label }}</b>
                      </td>
                      <td>{{ category(e.event) }}</td>
                      <td>
                        @if (e.debitLedger) {
                          {{ e.debitLedger }}
                        } @else {
                          <span class="t-faint">Not sent</span>
                        }
                      </td>
                      <td>
                        @if (e.creditLedger) {
                          {{ e.creditLedger }}
                        } @else {
                          <span class="t-faint">Not sent</span>
                        }
                      </td>
                      <td>{{ e.debitLedger ? (m.company ?? '—') : '—' }}</td>
                      <td>
                        @if (!editWhy()) {
                          <span class="t-faint"><rp-icon name="edit" [size]="14" /></span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <rp-empty icon="hourglass" title="Loading…" />
          }
        }
      }
    </div>

    @if (open(); as v) {
      <rp-voucher-drawer
        [voucher]="v"
        [editWhy]="editWhy()"
        (closed)="open.set(null)"
        (retried)="retried($event)"
      />
    }
    @if (editing() && maps(); as m) {
      <rp-mapping-form
        [current]="m"
        [event]="editingEvent()"
        (closed)="editing.set(null)"
        (saved)="mapped($event)"
        (stale)="editing.set(null); loadMappings()"
      />
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
    .t-ink {
      color: var(--ink);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `,
})
export class ConsoleVouchers {
  private readonly api = inject(VouchersApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly offText = translate('ACC.PACKAGE_OFF');
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly statusPills: readonly { v: VoucherStatus | ''; l: () => string }[] = [
    { v: '', l: () => 'All' },
    { v: 'PENDING', l: VOUCHER_STATUS.PENDING.l },
    { v: 'TRANSFERRED', l: VOUCHER_STATUS.TRANSFERRED.l },
    { v: 'FAILED', l: VOUCHER_STATUS.FAILED.l },
  ];
  protected readonly eventOptions: DropdownOption[] = [
    { v: '', l: 'All postings' },
    { v: 'TUITION', l: 'Fee collections' },
    { v: 'EVENT', l: 'Event payments' },
    { v: 'ALLOWANCE_CREDIT', l: 'Allowance funding' },
    { v: 'REFUND', l: 'Refunds' },
  ];

  protected readonly tab = signal<Tab>('v');
  protected readonly q = signal('');
  protected readonly event = signal<AccountingEvent | ''>('');
  protected readonly status = signal<VoucherStatus | ''>('');
  protected readonly data = signal<VoucherList | null>(null);
  protected readonly rows = signal<readonly Voucher[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly open = signal<Voucher | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly retrying = signal(false);
  protected readonly maps = signal<Mappings | null>(null);
  protected readonly mapError = signal('');
  /** The mapping form: 'company', a posting, or closed. */
  protected readonly editing = signal<'company' | AccountingEvent | null>(null);
  private seq = 0;

  /** The posting the mapping form edits (null: the company and transfers). */
  protected readonly editingEvent = computed(() => {
    const e = this.editing();
    return e && e !== 'company' ? e : null;
  });
  protected readonly canView = computed(() => this.can('vouchers.view'));
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator or accountant makes changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('vouchers.edit') ? '' : this.noTask),
  );
  protected readonly mode = computed(() => this.data()?.mode ?? this.maps()?.mode ?? null);
  protected readonly counts = computed(() => this.data()?.counts ?? null);
  protected readonly failed = computed(() => this.counts()?.failed ?? 0);
  protected readonly retryLabel = computed(
    () => `Retry ${this.failed().toLocaleString('en-IN')} failed`,
  );
  protected readonly retryWhy = computed(
    () =>
      this.editWhy() ||
      (!this.failed() ? 'No failed vouchers' : this.mode() === 'off' ? this.offText : ''),
  );
  protected readonly packageLabel = computed(() =>
    this.mode() === 'test' ? 'Test package' : this.mode() === 'off' ? 'Not set up' : '—',
  );
  protected readonly totalCount = computed(() => {
    const c = this.counts();
    return c ? (c.pending + c.transferred + c.failed).toLocaleString('en-IN') : '—';
  });
  protected readonly mappedCount = computed(() => {
    const m = this.maps();
    return m ? String(m.events.filter((e) => e.debitLedger).length) : '—';
  });
  protected readonly filtered = computed(() =>
    Boolean(this.q().trim() || this.event() || this.status()),
  );
  protected readonly filteredRows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const ev = this.event();
    return this.rows().filter(
      (v) =>
        (!ev || v.event === ev) &&
        (!q ||
          [v.reference, v.debitLedger, v.creditLedger, v.narration ?? '', v.externalRef ?? '']
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
  });
  protected readonly shown = computed(() => {
    const s = this.sort();
    const list = [...this.filteredRows()];
    if (s) {
      const get = (v: Voucher): string | number =>
        s.k === 'ref'
          ? v.reference
          : s.k === 'event'
            ? v.eventLabel
            : s.k === 'amount'
              ? amountPaise(v.amount)
              : s.k === 'status'
                ? VOUCHER_STATUS[v.status].l()
                : `${v.date} ${v.createdAt ?? ''}`;
      list.sort((a, b) => {
        const x = get(a);
        const y = get(b);
        const c =
          typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y), 'en', { numeric: true });
        return s.dir === 'desc' ? -c : c;
      });
    }
    return list.slice((this.page() - 1) * PAGE, this.page() * PAGE);
  });
  protected readonly summary = computed(
    () => `${plural(this.filteredRows().length, 'voucher')}${this.cursor() ? '+' : ''}`,
  );

  constructor() {
    effect(() => {
      this.status();
      untracked(() => {
        if (this.canView()) void this.load();
      });
    });
    effect(() => {
      if (this.canView()) untracked(() => void this.loadMappings());
    });
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('tab') === 'mapping') this.tab.set('map');
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.list(
        this.status() ? { status: this.status() as VoucherStatus } : {},
      );
      if (n !== this.seq) return;
      this.data.set(d);
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
      const d = await this.api.list({
        ...(this.status() ? { status: this.status() as VoucherStatus } : {}),
        cursor: c,
      });
      this.rows.set([...this.rows(), ...d.items]);
      this.cursor.set(d.nextCursor);
    } catch (e) {
      this.overlays.toast("Couldn't load more vouchers", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.more.set(false);
    }
  }

  protected async loadMappings() {
    this.mapError.set('');
    try {
      this.maps.set(await this.api.mappings());
    } catch (e) {
      this.mapError.set(this.problem(e));
    }
  }

  // --- retries -------------------------------------------------------------------------------------
  protected async retryOne(v: Voucher) {
    if (this.busyId()) return;
    const ok = await this.overlays.confirm({
      title: `Retry ${v.reference}?`,
      text: "The same reference is sent, so a voucher the package already accepted isn't posted twice.",
      ok: 'Retry posting',
    });
    if (!ok) return;
    this.busyId.set(v.id);
    try {
      const out = await this.api.retry(v.id, newIdempotencyKey());
      this.toastRetry([out]);
      this.retried(out);
    } catch (e) {
      this.overlays.toast("Couldn't retry the voucher", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.busyId.set(null);
    }
  }

  /** "Retry N failed": each failed voucher is sent again, one after the other. */
  protected async retryAll() {
    if (this.retrying() || this.retryWhy()) return;
    let failed: readonly Voucher[];
    try {
      failed =
        this.status() === 'FAILED' && !this.cursor()
          ? this.rows()
          : (await this.api.list({ status: 'FAILED' })).items;
    } catch (e) {
      this.overlays.toast("Couldn't load the failed vouchers", {
        sub: this.problem(e),
        tone: 'bad',
      });
      return;
    }
    if (!failed.length) return;
    const ok = await this.overlays.confirm({
      title:
        failed.length === 1
          ? `Retry ${failed[0]!.reference}?`
          : `Retry ${failed.length} failed vouchers?`,
      text: "The same reference is sent, so a voucher the package already accepted isn't posted twice.",
      ok: 'Retry posting',
    });
    if (!ok) return;
    this.retrying.set(true);
    const out: Voucher[] = [];
    try {
      for (const v of failed) {
        try {
          out.push(await this.api.retry(v.id, newIdempotencyKey()));
        } catch {
          out.push({ ...v, status: 'FAILED' });
        }
      }
      this.toastRetry(out);
    } finally {
      this.retrying.set(false);
      void this.load();
    }
  }

  private toastRetry(list: readonly Voucher[]) {
    const done = list.filter((v) => v.status === 'TRANSFERRED');
    const bad = list.filter((v) => v.status !== 'TRANSFERRED');
    if (list.length === 1) {
      const v = list[0]!;
      if (v.status === 'TRANSFERRED') {
        this.overlays.toast('Voucher transferred', {
          sub: `${v.reference}${v.externalRef ? ' · ' + v.externalRef : ''}`,
        });
      } else {
        this.overlays.toast(
          translate('ACC.PACKAGE_REFUSED', { reason: v.lastError ?? '' }).replace(/:\s*$/, '.'),
          { tone: 'bad', sub: v.reference },
        );
      }
      return;
    }
    this.overlays.toast(`${plural(done.length, 'voucher')} transferred`, {
      sub: bad.length
        ? `${plural(bad.length, 'voucher')} still failed`
        : list
            .map((v) => v.reference)
            .slice(0, 3)
            .join(', '),
      tone: bad.length ? 'warn' : 'ok',
    });
  }

  /** A voucher retried from the drawer or the row: the list and the counts reload. */
  protected retried(v: Voucher) {
    this.rows.set(this.rows().map((x) => (x.id === v.id ? v : x)));
    void this.load();
  }

  // --- mapping -------------------------------------------------------------------------------------
  protected editEvent(e: AccountingEvent) {
    if (this.editWhy()) return;
    this.editing.set(e);
  }
  protected mapped(m: Mappings) {
    this.maps.set(m);
    this.editing.set(null);
  }

  // --- filters and formatting ------------------------------------------------------------------------
  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    this.page.set(1);
  }
  protected setEvent(v: string) {
    this.event.set(v as AccountingEvent | '');
    this.page.set(1);
  }
  protected sortBy(key: string) {
    const k = key as SortKey;
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: string) {
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected count(k: 'pending' | 'transferred' | 'failed') {
    const c = this.counts();
    return c ? c[k].toLocaleString('en-IN') : '—';
  }
  protected st(s: VoucherStatus) {
    return VOUCHER_STATUS[s];
  }
  protected category(e: AccountingEvent) {
    return EVENT_CATEGORY[e];
  }
  protected attempts(v: Voucher) {
    return v.attempts ? `${v.attempts} attempt${v.attempts === 1 ? '' : 's'}` : 'Not sent yet';
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected time(v: Voucher) {
    const at = v.transferredAt ?? v.createdAt;
    return at ? formatTime(at) : '';
  }
  private problem(e: unknown) {
    return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
  }
}
