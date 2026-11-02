import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime, istBusinessDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Allowances/allowance-format';
import { InstitutionSetupApi } from '../Institution/institution.api';
import { MembersApi, type ClassView } from '../Members/members.api';
import { MerchantsApi, type Merchant } from '../Merchants/merchants.api';
import { CouponCancel } from './CouponCancel';
import { CouponIssue } from './CouponIssue';
import { CouponLogTab } from './CouponLog';
import { CouponReportsTab } from './CouponReports';
import { CouponTypesTab } from './CouponTypes';
import { COUPON_STATE, addDays, monthEnd, monthStart, shortId, windowLabel } from './coupon-format';
import {
  CouponsApi,
  type Coupon,
  type CouponIssuance,
  type CouponIssueResult,
  type CouponReports,
  type CouponSlot,
  type CouponState,
  type CouponType,
} from './coupons.api';

type Tab = 'issued' | 'issue' | 'types' | 'rep' | 'log';
type Preset = 'today' | 'week' | 'month' | 'all';
type SortKey = 'id' | 'name' | 'type' | 'date' | 'status' | 'used';
const PAGE = 12;
const COLUMNS: readonly { k: SortKey; l: string }[] = [
  { k: 'id', l: 'Coupon' },
  { k: 'name', l: 'Student' },
  { k: 'type', l: 'Type' },
  { k: 'date', l: 'Date' },
  { k: 'status', l: 'Status' },
  { k: 'used', l: 'Used' },
];

/** The date range of a preset (prototype cpnIssued): today, this week ±7 days, this month or all. */
export function presetRange(p: Preset, today: string): { from?: string; to?: string } {
  if (p === 'today') return { from: today, to: today };
  if (p === 'week') return { from: addDays(today, -6), to: addDays(today, 7) };
  if (p === 'month') return { from: monthStart(today), to: monthEnd(today) };
  return {};
}

/**
 * c.coupons — Coupons (SRS 11, FR-CPN-01…05, BR-43, CR-15; CPN-003…012; prototype c.coupons): the
 * issued coupons with today's and this month's figures, filters by type, dates and status; issuing
 * (CouponIssue); the type and slot masters (CouponTypesTab); the reports (CouponReportsTab); the
 * issuance log (CouponLogTab); and cancelling students' future coupons (CouponCancel).
 */
@Component({
  selector: 'rp-console-coupons',
  imports: [
    Avatar,
    CouponCancel,
    CouponIssue,
    CouponLogTab,
    CouponReportsTab,
    CouponTypesTab,
    Dropdown,
    Empty,
    Icon,
    Kpi,
    PageHead,
    Pager,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Coupons"
        sub="Meal and other coupon types — issue to students, watch redemptions, manage the type master."
      >
        @if (tab() !== 'issue') {
          @if (tab() === 'issued' && !issueWhy()) {
            <button
              type="button"
              class="btn btn-sec"
              id="cpn-cancel"
              (click)="cancelling.set(true)"
            >
              <rp-icon name="x" [size]="17" /><span>Cancel coupons</span>
            </button>
          }
          @if (issueWhy()) {
            <span class="cp-why" [attr.title]="issueWhy()"
              ><button type="button" class="btn btn-pri" disabled>
                <rp-icon name="plus" [size]="17" /><span>Issue coupons</span>
              </button></span
            >
          } @else {
            <button type="button" class="btn btn-pri" id="cpn-new" (click)="tab.set('issue')">
              <rp-icon name="plus" [size]="17" /><span>Issue coupons</span>
            </button>
          }
        }
      </rp-page-head>

      @if (readOnly()) {
        <div class="note tone-info">
          <rp-icon name="lock" [size]="17" />
          <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
        </div>
      }

      <div class="tabs" role="tablist" aria-label="Coupons">
        @for (t of tabs; track t.v) {
          <button
            type="button"
            class="tab"
            role="tab"
            [id]="'cpn-tab-' + t.v"
            [class.on]="tab() === t.v"
            [attr.aria-selected]="tab() === t.v"
            (click)="tab.set(t.v)"
          >
            {{ t.l }}
            @if (tabCount(t.v); as n) {
              <span class="n">{{ n }}</span>
            }
          </button>
        }
      </div>

      @if (issueOpened()) {
        <!-- Kept while other tabs show, so the form keeps its students, types and dates. -->
        <div [hidden]="tab() !== 'issue'">
          <rp-coupon-issue
            [classes]="classes()"
            [types]="types()"
            [why]="issueWhy()"
            (issued)="issued($event)"
          />
        </div>
      }
      @switch (tab()) {
        @case ('issue') {}
        @case ('types') {
          <rp-coupon-types
            [types]="types()"
            [slots]="slots()"
            [merchants]="merchants()"
            [loading]="typesLoading()"
            [error]="typesError()"
            [editWhy]="editWhy()"
            (typeChanged)="typeChanged($event)"
            (slotsChanged)="slotsChanged($event)"
            (reload)="loadTypes()"
          />
        }
        @case ('rep') {
          <rp-coupon-reports />
        }
        @case ('log') {
          <rp-coupon-log
            [items]="issuances()"
            [loading]="logLoading()"
            [error]="logError()"
            [results]="results()"
            (reload)="loadLog()"
          />
        }
        @default {
          <div class="c-grid k4">
            <rp-kpi
              label="Active today"
              icon="ticket"
              [value]="today() ? num(today()!.active) : '—'"
            />
            <rp-kpi
              label="Used today"
              icon="checkc"
              tone="ok"
              [value]="today() ? num(today()!.used) : '—'"
            />
            <rp-kpi
              label="Issued this month"
              icon="layers"
              [value]="month() ? num(month()!.kpis.issued) : '—'"
            />
            <rp-kpi
              label="Expired this month"
              icon="hourglass"
              [value]="month() ? num(month()!.kpis.expired) : '—'"
              delta="Nightly job at 00:00 expires unused coupons"
            />
          </div>

          <div class="c-filters">
            <label class="search"
              ><rp-icon name="search" [size]="16" /><input
                type="search"
                id="cpn-q"
                placeholder="Search student or coupon"
                aria-label="Search coupons"
                autocomplete="off"
                [value]="q()"
                (input)="setQ($event)"
            /></label>
            <div class="fld">
              <rp-dd
                inputId="cpn-type"
                placeholder="All types"
                [options]="typeOptions()"
                [value]="typeId()"
                (changed)="typeId.set($event)"
              />
            </div>
            <div class="pills" role="group" aria-label="Dates">
              @for (p of presets; track p.v) {
                <button
                  type="button"
                  class="pill"
                  [class.on]="preset() === p.v"
                  [attr.aria-pressed]="preset() === p.v"
                  (click)="preset.set(p.v)"
                >
                  {{ p.l }}
                </button>
              }
            </div>
            <div class="pills" role="group" aria-label="Status">
              @for (p of statePills; track p.v) {
                <button
                  type="button"
                  class="pill"
                  [class.on]="state() === p.v"
                  [attr.aria-pressed]="state() === p.v"
                  (click)="state.set(p.v)"
                >
                  {{ p.l }}
                </button>
              }
            </div>
            <span class="fsum">{{ summary() }}</span>
          </div>

          @if (error()) {
            <div class="card pad">
              <rp-empty icon="alertc" title="Couldn't load the coupons" [text]="error()">
                <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                  <span>Try again</span>
                </button>
              </rp-empty>
            </div>
          } @else {
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    @for (c of columns; track c.k) {
                      <th
                        class="sort"
                        [class.asc]="sort().k === c.k && sort().dir === 'asc'"
                        [class.desc]="sort().k === c.k && sort().dir === 'desc'"
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
                            sort().k === c.k && sort().dir === 'desc' ? '↓' : '↑'
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
                    <tr>
                      <td>
                        <span class="t-mono" [title]="r.id">{{ short(r.id) }}</span>
                      </td>
                      <td>
                        <div class="cell-main">
                          <rp-av [name]="r.student.name" size="sm" />
                          <div style="min-width: 0">
                            <div class="cell-t t-clip">{{ r.student.name }}</div>
                            @if (r.cancelReason) {
                              <div class="cell-s t-clip" [title]="r.cancelReason">
                                Cancelled: {{ r.cancelReason }}
                              </div>
                            }
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="cm-tchip"
                          ><rp-icon name="ticket" [size]="12" />{{ r.type.name }}</span
                        >
                        <div class="cell-s">{{ win(r) }}</div>
                      </td>
                      <td>{{ date(r.validOn) }}</td>
                      <td>
                        <span [class]="'chip dot tone-' + stateOf(r).tone">{{ stateOf(r).l }}</span>
                      </td>
                      <td>
                        @if (r.usedAt) {
                          <div class="cell-t" style="font-weight: 550">{{ time(r.usedAt) }}</div>
                          <div class="cell-s">{{ r.merchant ?? '' }}</div>
                        } @else {
                          <span class="t-faint">—</span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    @if (!loading()) {
                      <tr>
                        <td [attr.colspan]="columns.length">
                          <rp-empty
                            icon="ticket"
                            title="No coupons in this view"
                            text="Change the type, dates or status, or issue coupons."
                          />
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            @if (filtered().length > pageSize) {
              <rp-pager
                [total]="filtered().length"
                [page]="page()"
                [size]="pageSize"
                (go)="page.set($event)"
              />
            } @else if (filtered().length) {
              <div class="pager">
                <span>{{ count(filtered().length, 'coupon') }}</span>
              </div>
            }
            @if (cursor()) {
              <div class="row" style="justify-content: center">
                <button
                  type="button"
                  class="btn btn-sec btn-sm"
                  id="cpn-more"
                  [class.is-busy]="more()"
                  [disabled]="more()"
                  (click)="loadMore()"
                >
                  <span>Load more coupons</span>
                </button>
              </div>
            }
          }
        }
      }
    </div>

    @if (cancelling()) {
      <rp-coupon-cancel
        [classes]="classes()"
        [types]="types()"
        (closed)="cancelling.set(false)"
        (cancelled)="cancelled($event)"
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
  `,
})
export class ConsoleCoupons {
  private readonly api = inject(CouponsApi);
  private readonly members = inject(MembersApi);
  private readonly merchantsApi = inject(MerchantsApi);
  private readonly setup = inject(InstitutionSetupApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly tabs: readonly { v: Tab; l: string }[] = [
    { v: 'issued', l: 'Issued' },
    { v: 'issue', l: 'Issue coupons' },
    { v: 'types', l: 'Coupon types' },
    { v: 'rep', l: 'Reports' },
    { v: 'log', l: 'Issuance log' },
  ];
  protected readonly presets: readonly { v: Preset; l: string }[] = [
    { v: 'today', l: 'Today' },
    { v: 'week', l: 'This week ±7 days' },
    { v: 'month', l: 'This month' },
    { v: 'all', l: 'All dates' },
  ];
  protected readonly statePills: readonly { v: CouponState | ''; l: string }[] = [
    { v: '', l: 'Any status' },
    { v: 'ACTIVE', l: 'Active' },
    { v: 'USED', l: 'Used' },
    { v: 'EXPIRED', l: 'Expired' },
    { v: 'CANCELLED', l: 'Cancelled' },
  ];

  readonly tab = signal<Tab>('issued');
  /** The issue form, once opened, stays (hidden) behind the other tabs. */
  protected readonly issueOpened = signal(false);
  protected readonly q = signal('');
  protected readonly typeId = signal('');
  protected readonly preset = signal<Preset>('week');
  protected readonly state = signal<CouponState | ''>('');
  protected readonly rows = signal<readonly Coupon[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' }>({ k: 'date', dir: 'desc' });
  protected readonly month = signal<CouponReports | null>(null);
  protected readonly types = signal<readonly CouponType[]>([]);
  protected readonly slots = signal<readonly CouponSlot[]>([]);
  protected readonly typesLoading = signal(true);
  protected readonly typesError = signal('');
  protected readonly issuances = signal<readonly CouponIssuance[]>([]);
  protected readonly logLoading = signal(true);
  protected readonly logError = signal('');
  protected readonly results = signal<ReadonlyMap<string, CouponIssueResult>>(new Map());
  protected readonly classes = signal<readonly ClassView[]>([]);
  /** Regular and vendor merchants for the type modal; null when the role can't list them. */
  protected readonly merchants = signal<readonly Merchant[] | null>(null);
  protected readonly cancelling = signal(false);
  /** The institution's coupons feature (INS-012); null when it can't be read (no config.view). */
  private readonly featureOn = signal<boolean | null>(null);
  private seq = 0;

  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly issueWhy = computed(
    () =>
      this.readOnly() ||
      (this.can('coupons.issue') ? '' : this.noTask) ||
      (this.featureOn() === false ? translate('CPN.FEATURE_OFF') : ''),
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('coupons.edit') ? '' : this.noTask),
  );
  protected readonly today = computed(() => {
    const t = istBusinessDate(new Date());
    return this.month()?.byDay.find((d) => d.date === t) ?? null;
  });
  protected readonly typeOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All types' },
    ...this.types().map((t) => ({ v: t.id, l: t.name })),
  ]);
  /** The search runs on the loaded coupons (student name or coupon id). */
  protected readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    const list = q
      ? this.rows().filter(
          (r) =>
            r.student.name.toLowerCase().includes(q) ||
            r.id.replace(/-/g, '').toLowerCase().includes(q.replace(/-/g, '')),
        )
      : [...this.rows()];
    const s = this.sort();
    const get = (r: Coupon): string =>
      s.k === 'id'
        ? r.id
        : s.k === 'name'
          ? r.student.name
          : s.k === 'type'
            ? r.type.name
            : s.k === 'date'
              ? r.validOn + r.window.start
              : s.k === 'status'
                ? COUPON_STATE[r.state].l
                : (r.usedAt ?? '');
    list.sort((a, b) => {
      const c = get(a).localeCompare(get(b), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
    return list;
  });
  protected readonly shown = computed(() =>
    this.filtered().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(
    () => `${plural(this.filtered().length, 'coupon')}${this.cursor() ? ' loaded' : ''}`,
  );

  constructor() {
    effect(() => {
      if (this.tab() === 'issue') this.issueOpened.set(true);
    });
    effect(() => {
      // A type, date or status change reloads from the server.
      this.typeId();
      this.preset();
      this.state();
      untracked(() => void this.load());
    });
    void this.loadMonth();
    void this.loadTypes();
    void this.loadLog();
    void this.lookups();
  }

  private async lookups() {
    try {
      this.classes.set((await this.members.classes()).items);
    } catch {
      // The pickers then offer "All classes" only.
    }
    if (this.can('merchants.view')) {
      try {
        this.merchants.set((await this.merchantsApi.list({ limit: 200 })).items);
      } catch {
        // The type modal keeps each type's merchants unchanged.
      }
    }
    if (!this.can('config.view')) return;
    try {
      const inst = await this.setup.institution();
      const f = inst.features.find((x) => x.key === 'coupons');
      if (f) this.featureOn.set(f.enabled);
    } catch {
      // Unknown: the server still refuses issuing when the feature is off (CPN.FEATURE_OFF).
    }
  }

  // --- loading -------------------------------------------------------------------------------------
  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.coupons({
        ...presetRange(this.preset(), istBusinessDate(new Date())),
        ...(this.typeId() ? { typeId: this.typeId() } : {}),
        ...(this.state() ? { state: this.state() as CouponState } : {}),
      });
      if (n !== this.seq) return;
      this.rows.set(d.items);
      this.cursor.set(d.nextCursor);
      this.page.set(1);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }
  protected async loadMore() {
    const cursor = this.cursor();
    if (!cursor || this.more()) return;
    const n = this.seq;
    this.more.set(true);
    try {
      const d = await this.api.coupons({
        ...presetRange(this.preset(), istBusinessDate(new Date())),
        ...(this.typeId() ? { typeId: this.typeId() } : {}),
        ...(this.state() ? { state: this.state() as CouponState } : {}),
        cursor,
      });
      if (n !== this.seq) return;
      this.rows.update((l) => [...l, ...d.items]);
      this.cursor.set(d.nextCursor);
    } catch (e) {
      this.overlays.toast(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'), {
        tone: 'bad',
      });
    } finally {
      this.more.set(false);
    }
  }
  /** This month's figures: the KPIs (today's from the day row). */
  private async loadMonth() {
    const t = istBusinessDate(new Date());
    try {
      this.month.set(await this.api.reports({ from: monthStart(t), to: monthEnd(t) }));
    } catch {
      // The figures stay "—"; the list still loads.
    }
  }
  protected async loadTypes() {
    this.typesLoading.set(true);
    this.typesError.set('');
    try {
      const [t, s] = await Promise.all([this.api.types(), this.api.slots()]);
      this.types.set(t.items);
      this.slots.set(s.items);
    } catch (e) {
      this.typesError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.typesLoading.set(false);
    }
  }
  protected async loadLog() {
    this.logLoading.set(true);
    this.logError.set('');
    try {
      this.issuances.set((await this.api.issuances()).items);
    } catch (e) {
      this.logError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.logLoading.set(false);
    }
  }

  // --- filters ---------------------------------------------------------------------------------------
  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    this.page.set(1);
  }
  protected sortBy(k: SortKey) {
    const s = this.sort();
    this.sort.set({ k, dir: s.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: SortKey) {
    const s = this.sort();
    return s.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // --- changes -------------------------------------------------------------------------------------
  /** Issued: the log shows the new issuance (as the prototype does) with its per-student counts. */
  protected issued(e: { result: CouponIssueResult; types: string[] }) {
    const r = e.result;
    const students = r.perStudent.filter((s) => !s.refused).length;
    this.results.update((m) => new Map(m).set(r.issuanceId, r));
    this.overlays.toast(`${plural(r.created, 'coupon')} issued`, {
      sub: `${shortId(r.issuanceId)} · ${plural(students, 'student')}${r.skipped ? ` · ${r.skipped} skipped` : ''}`,
    });
    const refused = r.perStudent.filter((s) => s.refused).length;
    if (refused) {
      this.overlays.toast(`${plural(refused, 'student')} not issued`, {
        tone: 'warn',
        sub: 'Over a holding maximum, or not an active student — see the issuance.',
      });
    }
    this.tab.set('log');
    void this.loadLog();
    void this.load();
    void this.loadMonth();
  }
  protected cancelled(n: number) {
    this.cancelling.set(false);
    this.overlays.toast(n ? `${plural(n, 'coupon')} cancelled` : 'No coupons to cancel', {
      tone: n ? 'ok' : 'info',
      ...(n ? {} : { sub: 'No active future coupons matched the students, dates and types.' }),
    });
    void this.load();
    void this.loadMonth();
  }
  protected typeChanged(t: CouponType) {
    const list = this.types();
    this.types.set(
      list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t],
    );
    void this.loadTypes();
  }
  protected slotsChanged(s: readonly CouponSlot[]) {
    this.slots.set(s);
    void this.loadTypes();
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected tabCount(t: Tab): string {
    if (t === 'issued') {
      return this.loading() ? '' : `${this.num(this.rows().length)}${this.cursor() ? '+' : ''}`;
    }
    if (t === 'types') return this.types().length ? this.num(this.types().length) : '';
    if (t === 'log') return this.issuances().length ? this.num(this.issuances().length) : '';
    return '';
  }
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected stateOf(r: Coupon) {
    return COUPON_STATE[r.state] ?? { l: r.state, tone: 'neutral' };
  }
  /** The coupon's own window (its type's terms as issued), named by the type's slot. */
  protected win(r: Coupon) {
    const t = this.types().find((x) => x.id === r.type.id);
    return t
      ? windowLabel({ slot: t.slot, window: r.window })
      : `${r.window.start}–${r.window.end}`;
  }
  protected short(id: string) {
    return shortId(id);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected time(v: string) {
    return formatTime(v);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected count(n: number, noun: string) {
    return plural(n, noun);
  }
}
