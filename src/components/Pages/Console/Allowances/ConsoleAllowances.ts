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
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount, amountPaise } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { InstitutionSetupApi } from '../Institution/institution.api';
import { MembersApi, type ClassView } from '../Members/members.api';
import { inrWhole } from '../Merchants/merchant-format';
import { AllowanceDrawer } from './AllowanceDrawer';
import { AllowanceIssue } from './AllowanceIssue';
import { AllowanceJob } from './AllowanceJob';
import { AllowanceReportsTab } from './AllowanceReports';
import { STATE, limitsText, plural } from './allowance-format';
import {
  AllowancesApi,
  type AllowanceGrant,
  type AllowanceList,
  type AllowanceState,
} from './allowances.api';

type Tab = 'list' | 'rep' | 'job';
type SortKey = 'name' | 'amount' | 'start' | 'expiry' | 'bal' | 'status';
const PAGE = 12;
const COLUMNS: readonly { k: SortKey | 'lim'; l: string; r: boolean; sort: boolean }[] = [
  { k: 'name', l: 'Student', r: false, sort: true },
  { k: 'amount', l: 'Amount', r: true, sort: true },
  { k: 'start', l: 'Start', r: false, sort: true },
  { k: 'expiry', l: 'Expiry', r: false, sort: true },
  { k: 'lim', l: 'Daily limits', r: false, sort: false },
  { k: 'bal', l: 'Balance', r: true, sort: true },
  { k: 'status', l: 'Status', r: false, sort: true },
];

/**
 * c.allowances — Allowances (SRS 10, FR-ALW-01…07, BR-40…42; ALW-002…005; prototype c.allowances):
 * the grants with their key figures, search, class and state filters, the allowance drawer
 * (AllowanceDrawer: daily limits and cancelling a grant not yet credited, ALW-004), the Reports
 * tab (ALW-005), the Daily job tab (the 00:05 job; its runs are kept in the back office) and the
 * "Issue allowance" wizard (AllowanceIssue, ALW-003).
 */
@Component({
  selector: 'rp-console-allowances',
  imports: [
    AllowanceDrawer,
    AllowanceIssue,
    AllowanceJob,
    AllowanceReportsTab,
    Amount,
    Avatar,
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
        title="Allowances"
        sub="Restricted pocket money credited by the school and spent only at regular merchants that accept it."
      >
        @if (issueWhy()) {
          <span class="cp-why" [attr.title]="issueWhy()"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="plus" [size]="17" /><span>Issue allowance</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-pri" id="alw-new" (click)="openIssue()">
            <rp-icon name="plus" [size]="17" /><span>Issue allowance</span>
          </button>
        }
      </rp-page-head>

      @if (readOnly()) {
        <div class="note tone-info">
          <rp-icon name="lock" [size]="17" />
          <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
        </div>
      }

      <div class="tabs" role="tablist" aria-label="Allowances">
        @for (t of tabs; track t.v) {
          <button
            type="button"
            class="tab"
            role="tab"
            [id]="'alw-tab-' + t.v"
            [class.on]="tab() === t.v"
            [attr.aria-selected]="tab() === t.v"
            (click)="tab.set(t.v)"
          >
            {{ t.l }}
            @if (t.v === 'list' && total() !== null) {
              <span class="n">{{ num(total()!) }}</span>
            }
          </button>
        }
      </div>

      @switch (tab()) {
        @case ('rep') {
          <rp-allowance-reports />
        }
        @case ('job') {
          <rp-allowance-job [grants]="all()" [loading]="loading() && !all().length" />
        }
        @default {
          <div class="c-grid k4">
            <rp-kpi
              label="Active allowances"
              icon="gift"
              [value]="kpis() ? num(kpis()!.active) : '—'"
            />
            <rp-kpi
              label="Scheduled"
              icon="calendar"
              tone="info"
              [value]="kpis() ? num(kpis()!.scheduled) : '—'"
              delta="Credited by the 00:05 job on their start date"
            />
            <rp-kpi
              label="Issued this year"
              icon="rupee"
              [value]="kpis() ? whole(kpis()!.issuedThisYear) : '—'"
            />
            <rp-kpi
              label="Allowance balance held"
              icon="wallet"
              [value]="kpis() ? whole(kpis()!.balanceHeld) : '—'"
              delta="Lapses on the expiry date"
            />
          </div>

          <div class="c-filters">
            <label class="search"
              ><rp-icon name="search" [size]="16" /><input
                type="search"
                id="alw-q"
                placeholder="Search student or admission no."
                aria-label="Search allowances"
                autocomplete="off"
                [value]="q()"
                (input)="setQ($event)"
            /></label>
            <div class="fld">
              <rp-dd
                inputId="alw-cls"
                placeholder="All classes"
                [options]="classOptions()"
                [value]="cls()"
                (changed)="cls.set($event)"
              />
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
              <rp-empty icon="alertc" title="Couldn't load the allowances" [text]="error()">
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
                        [class.sort]="c.sort"
                        [class.r]="c.r"
                        [class.asc]="c.sort && sort()?.k === c.k && sort()?.dir === 'asc'"
                        [class.desc]="c.sort && sort()?.k === c.k && sort()?.dir === 'desc'"
                        [attr.aria-sort]="ariaSort(c.k)"
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
                    <tr tabindex="0" (click)="openId.set(r.id)" (keydown.enter)="openId.set(r.id)">
                      <td>
                        <div class="cell-main">
                          <rp-av [name]="r.student.name" size="sm" />
                          <div style="min-width: 0">
                            <div class="cell-t t-clip">{{ r.student.name }}</div>
                            <div class="cell-s">{{ who(r) }}</div>
                          </div>
                        </div>
                      </td>
                      <td class="r"><rp-amt [value]="r.amount" /></td>
                      <td>{{ date(r.startDate) }}</td>
                      <td>{{ date(r.expiryDate) }}</td>
                      <td>
                        @if (limits(r)) {
                          <span class="t-sm">{{ limits(r) }}</span>
                        } @else {
                          <span class="t-sm"><span class="t-faint">No daily limit</span></span>
                        }
                      </td>
                      <td class="r">
                        @if (r.state === 'SCHEDULED' || r.state === 'CANCELLED') {
                          <span class="t-faint">Not credited</span>
                        } @else if (r.balance) {
                          <rp-amt [value]="r.balance" />
                        } @else {
                          <span class="t-faint">—</span>
                        }
                      </td>
                      <td>
                        <span [class]="'chip dot tone-' + stateOf(r).tone">{{ stateOf(r).l }}</span>
                      </td>
                    </tr>
                  } @empty {
                    @if (!loading()) {
                      <tr>
                        <td [attr.colspan]="columns.length">
                          <rp-empty
                            icon="gift"
                            [title]="filtered() ? 'No allowances match' : 'No allowances yet'"
                            [text]="
                              filtered()
                                ? 'Change the filters, or issue an allowance to students.'
                                : 'Issue an allowance to students: it is credited by the 00:05 job on its start date.'
                            "
                          />
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            <rp-pager
              [total]="rows().length"
              [page]="page()"
              [size]="pageSize"
              (go)="page.set($event)"
            />
          }
        }
      }
    </div>

    @if (openGrant(); as g) {
      <rp-allowance-drawer
        [grant]="g"
        [defaults]="data()?.defaults ?? null"
        (closed)="openId.set(null)"
        (changed)="changed($event)"
      />
    }
    @if (issuing()) {
      <rp-allowance-issue
        [classes]="classes()"
        [grants]="all()"
        [defaults]="data()?.defaults ?? null"
        (closed)="issuing.set(false)"
        (issued)="issued($event)"
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
export class ConsoleAllowances {
  private readonly api = inject(AllowancesApi);
  private readonly members = inject(MembersApi);
  private readonly setup = inject(InstitutionSetupApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly tabs: readonly { v: Tab; l: string }[] = [
    { v: 'list', l: 'Allowances' },
    { v: 'rep', l: 'Reports' },
    { v: 'job', l: 'Daily job' },
  ];
  protected readonly statePills: readonly { v: AllowanceState | ''; l: string }[] = [
    { v: '', l: 'All' },
    { v: 'ACTIVE', l: 'Active' },
    { v: 'SCHEDULED', l: 'Scheduled' },
    { v: 'EXPIRED', l: 'Expired' },
    { v: 'CANCELLED', l: 'Cancelled' },
  ];

  protected readonly tab = signal<Tab>('list');
  protected readonly q = signal('');
  protected readonly cls = signal('');
  protected readonly state = signal<AllowanceState | ''>('');
  protected readonly data = signal<AllowanceList | null>(null);
  protected readonly rows = signal<readonly AllowanceGrant[]>([]);
  /** Every grant of the institution (unfiltered): the job tab and the wizard's BR-40 check. */
  protected readonly all = signal<readonly AllowanceGrant[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly openId = signal<string | null>(null);
  protected readonly issuing = signal(false);
  protected readonly classes = signal<readonly ClassView[]>([]);
  /** The institution's allowances feature (INS-012); null when it can't be read (no config.view). */
  private readonly featureOn = signal<boolean | null>(null);
  private seq = 0;
  private qTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly issueWhy = computed(
    () =>
      this.readOnly() ||
      (this.can('allowances.issue') ? '' : this.noTask) ||
      (this.featureOn() === false ? translate('ALW.FEATURE_OFF') : ''),
  );
  protected readonly kpis = computed(() => this.data()?.kpis ?? null);
  protected readonly filtered = computed(() => Boolean(this.q() || this.cls() || this.state()));
  protected readonly classOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All classes' },
    ...this.classes().map((c) => ({ v: c.id, l: c.name })),
  ]);
  protected readonly openGrant = computed(() => {
    const id = this.openId();
    if (!id) return null;
    return this.rows().find((g) => g.id === id) ?? this.all().find((g) => g.id === id) ?? null;
  });
  protected readonly sorted = computed(() => {
    const list = [...this.rows()];
    const s = this.sort();
    if (!s) return list;
    const get = (r: AllowanceGrant): string | number =>
      s.k === 'name'
        ? r.student.name
        : s.k === 'amount'
          ? amountPaise(r.amount)
          : s.k === 'start'
            ? r.startDate
            : s.k === 'expiry'
              ? r.expiryDate
              : s.k === 'bal'
                ? r.balance
                  ? amountPaise(r.balance)
                  : -1
                : STATE[r.state].l;
    list.sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -r : r;
    });
    return list;
  });
  protected readonly shown = computed(() =>
    this.sorted().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(() => plural(this.rows().length, 'allowance'));

  constructor() {
    effect(() => {
      // A class or state change reloads from the server.
      this.cls();
      this.state();
      untracked(() => void this.load());
    });
    void this.lookups();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.qTimer));
  }

  private async lookups() {
    try {
      this.classes.set((await this.members.classes()).items);
    } catch {
      // The class filter then offers "All classes" only.
    }
    if (!this.can('config.view')) return;
    try {
      const inst = await this.setup.institution();
      const f = inst.features.find((x) => x.key === 'allowances');
      if (f) this.featureOn.set(f.enabled);
    } catch {
      // Unknown: the server still refuses issuing when the feature is off (ALW.FEATURE_OFF).
    }
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.list({
        q: this.q().trim() || undefined,
        classId: this.cls() || undefined,
        state: this.state() || undefined,
      });
      if (n !== this.seq) return;
      this.data.set(d);
      this.rows.set(d.items);
      this.page.set(1);
      this.error.set('');
      if (!this.filtered()) {
        this.all.set(d.items);
        this.total.set(d.items.length);
      } else if (this.total() === null) {
        void this.loadAll();
      }
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  /** The unfiltered grants (the tab count, the job tab and the wizard). */
  private async loadAll() {
    try {
      const d = await this.api.list();
      this.all.set(d.items);
      this.total.set(d.items.length);
    } catch {
      // The count stays hidden; the server still checks BR-40.
    }
  }

  // --- filters ---------------------------------------------------------------------------------------
  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => void this.load(), 250);
  }
  protected sortBy(k: SortKey | 'lim') {
    if (k === 'lim') return;
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: SortKey | 'lim') {
    if (k === 'lim') return null;
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // --- drawer and wizard -----------------------------------------------------------------------------
  protected openIssue() {
    if (this.issueWhy()) return;
    this.issuing.set(true);
  }
  /** Issued: the list shows the new (scheduled) grants, as the prototype does. */
  protected issued(r: { created: number; startDate: string }) {
    this.issuing.set(false);
    this.overlays.toast(`${plural(r.created, 'allowance')} scheduled`, {
      sub: `Credited on ${formatDate(r.startDate)} at 00:05`,
    });
    this.tab.set('list');
    if (this.state() === 'SCHEDULED') void this.load();
    else this.state.set('SCHEDULED');
    void this.loadAll();
  }
  /** A grant changed in the drawer: replace it in place, then refresh the figures. */
  protected changed(g: AllowanceGrant) {
    const swap = (list: readonly AllowanceGrant[]) => list.map((x) => (x.id === g.id ? g : x));
    this.rows.set(swap(this.rows()));
    this.all.set(swap(this.all()));
    void this.load();
    if (this.filtered()) void this.loadAll();
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected stateOf(r: AllowanceGrant) {
    return STATE[r.state] ?? { l: r.state, tone: 'neutral' };
  }
  /** "TVPS/2019/0412 · Grade 7 B" (stuCell). */
  protected who(r: AllowanceGrant) {
    return [r.student.admissionNo, r.student.grade ?? 'Not enrolled'].filter(Boolean).join(' · ');
  }
  protected limits(r: AllowanceGrant) {
    return limitsText(r.dailyLimits);
  }
  protected whole(m: { amount: string }) {
    return inrWhole(m);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
}
