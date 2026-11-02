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
import { ActivatedRoute } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { inrText } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { ago } from '../../../Utils/dates';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { CallLogForm, type CallTicket } from './CallLogForm';
import { TicketDrawer } from './TicketDrawer';
import {
  CHANNEL_LABEL,
  DIRECTION_LABEL,
  KIND_LABEL,
  plural,
  priorityTone,
  statusOf,
  txnType,
} from './grievance-format';
import {
  GrievancesApi,
  type CallLog,
  type Ticket,
  type TicketFilter,
  type TicketKind,
  type TicketList,
} from './grievances.api';

type Tab = 't' | 'c';
type SortKey = 'no' | 'name' | 'pri' | 'status' | 'at';
type CallSortKey = 'at' | 'caller' | 'ticket' | 'by';
const PAGE = 12;
const COLUMNS: readonly { k: SortKey | 'txn' | 'issue'; l: string; sort: boolean }[] = [
  { k: 'no', l: 'Ticket', sort: true },
  { k: 'name', l: 'Member', sort: true },
  { k: 'txn', l: 'Transaction', sort: false },
  { k: 'issue', l: 'Issue', sort: false },
  { k: 'pri', l: 'Priority', sort: true },
  { k: 'status', l: 'Status', sort: true },
  { k: 'at', l: 'Raised', sort: true },
];
const CALL_COLUMNS: readonly { k: CallSortKey | 'notes'; l: string; sort: boolean }[] = [
  { k: 'at', l: 'When', sort: true },
  { k: 'caller', l: 'Caller', sort: true },
  { k: 'ticket', l: 'Ticket', sort: true },
  { k: 'notes', l: 'Notes', sort: false },
  { k: 'by', l: 'Logged by', sort: true },
];

/**
 * c.grievances — Grievances (SRS 16, FR-GRV-03/04; GRV-006…010; prototype c.grievances): the queue
 * with its key figures, the status pills and the priority filter, the tickets, the call log, the
 * ticket drawer (TicketDrawer: snapshot, the member's last transactions, history, calls, update) and
 * "Log a call" (CallLogForm). Priority 1 updates and refunds wait for a checker in c.approvals.
 */
@Component({
  selector: 'rp-console-grievances',
  imports: [Avatar, CallLogForm, Dropdown, Empty, Icon, Kpi, PageHead, Pager, TicketDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Grievances"
        sub="Tickets raised against transactions. Priority 1 updates need a checker before they take effect."
      >
        @if (canView()) {
          @if (editWhy()) {
            <span class="cp-why" [attr.title]="editWhy()"
              ><button type="button" class="btn btn-sec" disabled>
                <rp-icon name="phone" [size]="17" /><span>Log a call</span>
              </button></span
            >
          } @else {
            <button type="button" class="btn btn-sec" id="grv-call" (click)="callFor.set('')">
              <rp-icon name="phone" [size]="17" /><span>Log a call</span>
            </button>
          }
        }
      </rp-page-head>

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Grievances are worked by the grievance officer. Pages your role can open are listed in the menu."
        />
      } @else {
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }

        <div class="c-grid k4" id="grv-kpis">
          <rp-kpi label="Open" icon="inbox" tone="warn" [value]="tile('open')" [delta]="kpiOld()" />
          <rp-kpi label="Escalated" icon="alert" tone="bad" [value]="tile('escalated')" />
          <rp-kpi
            label="Awaiting approval"
            icon="hourglass"
            tone="violet"
            [value]="tile('awaitingApproval')"
            [link]="can('approvals.view') ? '/console/approvals' : null"
          />
          <rp-kpi
            label="Priority 1 not closed"
            icon="flag"
            [value]="tile('priority1Open')"
            [delta]="kpiDone()"
          />
        </div>

        <div class="tabs" role="tablist" aria-label="Grievances">
          <button
            type="button"
            class="tab"
            role="tab"
            id="grv-tab-t"
            [class.on]="tab() === 't'"
            [attr.aria-selected]="tab() === 't'"
            (click)="tab.set('t')"
          >
            Tickets<span class="n">{{ tiles()?.total ?? '—' }}</span>
          </button>
          <button
            type="button"
            class="tab"
            role="tab"
            id="grv-tab-c"
            [class.on]="tab() === 'c'"
            [attr.aria-selected]="tab() === 'c'"
            (click)="openCalls()"
          >
            Call log<span class="n">{{ callCount() }}</span>
          </button>
        </div>

        @if (tab() === 't') {
          <div class="c-filters">
            <label class="search"
              ><rp-icon name="search" [size]="16" /><input
                type="search"
                id="gr-q"
                placeholder="Ticket, transaction reference or member"
                aria-label="Search tickets"
                autocomplete="off"
                [value]="q()"
                (input)="setQ($event)"
            /></label>
            <div class="pills" role="group" aria-label="Status">
              @for (p of statusPills(); track p.v) {
                <button
                  type="button"
                  class="pill"
                  [class.on]="status() === p.v"
                  [attr.aria-pressed]="status() === p.v"
                  (click)="status.set(p.v)"
                >
                  {{ p.l }}<span class="n">{{ p.n }}</span>
                </button>
              }
            </div>
            <div class="fld">
              <rp-dd
                inputId="gr-pri"
                placeholder="Any priority"
                [options]="priorityOptions"
                [value]="priority()"
                (changed)="priority.set($event)"
              />
            </div>
            <span class="fsum">{{ summary() }}</span>
          </div>

          @if (error()) {
            <div class="card pad">
              <rp-empty icon="alertc" title="Couldn't load the tickets" [text]="error()">
                <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                  <span>Try again</span>
                </button>
              </rp-empty>
            </div>
          } @else {
            <div class="tbl-wrap">
              <table class="tbl" id="grv-table">
                <thead>
                  <tr>
                    @for (c of columns; track c.k) {
                      <th
                        [class.sort]="c.sort"
                        [class.asc]="c.sort && sort().k === c.k && sort().dir === 'asc'"
                        [class.desc]="c.sort && sort().k === c.k && sort().dir === 'desc'"
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
                              sort().k === c.k && sort().dir === 'desc' ? '↓' : '↑'
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
                      [attr.aria-label]="'Ticket ' + r.ticketNo"
                      (click)="openId.set(r.id)"
                      (keydown.enter)="openId.set(r.id)"
                    >
                      <td>
                        <span class="t-mono">{{ r.ticketNo }}</span>
                        <div class="cell-s">{{ channel(r) }} · {{ raisedAgo(r) }}</div>
                      </td>
                      <td>
                        <div class="cell-main">
                          <rp-av [name]="r.member.name" size="sm" />
                          <div style="min-width: 0">
                            <div class="cell-t t-clip">{{ r.member.name }}</div>
                            <div class="cell-s">{{ r.member.mobile ?? kindLabel(r.kind) }}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        @if (r.transaction; as x) {
                          <span class="t-mono">{{ x.reference }}</span>
                          <div class="cell-s">
                            {{ x.amount ? inr(x.amount) : '—' }} · {{ type(x.type) }}
                          </div>
                        } @else {
                          <span class="t-faint">—</span>
                          <div class="cell-s">{{ kindLabel(r.kind) }}</div>
                        }
                      </td>
                      <td>
                        <div
                          class="t-clip"
                          style="max-width: 220px"
                          [attr.title]="r.categoryLabel ?? null"
                        >
                          {{ r.issue }}
                        </div>
                      </td>
                      <td>
                        <span [class]="'chip tone-' + tone(r.priority)"
                          >Priority {{ r.priority }}</span
                        >
                      </td>
                      <td>
                        <span [class]="'chip dot tone-' + st(r).tone">{{ r.statusLabel }}</span>
                        @if (r.awaitingApproval) {
                          <div class="cell-s" style="color: var(--violet)">Awaiting approval</div>
                        }
                      </td>
                      <td>
                        {{ r.createdAt ? date(r.createdAt) : '—' }}
                        @if (r.old) {
                          <div class="cell-s t-warn">{{ plural(r.ageDays, 'day') }} old</div>
                        }
                      </td>
                    </tr>
                  } @empty {
                    @if (!loading()) {
                      <tr>
                        <td [attr.colspan]="columns.length">
                          <rp-empty
                            icon="help"
                            [title]="filtered() ? 'No tickets match' : 'No tickets yet'"
                            [text]="
                              filtered()
                                ? 'Change the status or priority filters.'
                                : 'Tickets raised by members from their receipts, feedback and fraud reports appear here.'
                            "
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
                <span>{{ plural(rows().length, 'ticket') }}</span>
              </div>
            }
            @if (cursor()) {
              <div class="row" style="justify-content: center">
                <button
                  type="button"
                  class="btn btn-sec btn-sm"
                  id="grv-more"
                  [class.is-busy]="more()"
                  [disabled]="more()"
                  (click)="loadMore()"
                >
                  <span>Load more tickets</span>
                </button>
              </div>
            }
          }
        } @else {
          @if (callError()) {
            <div class="card pad">
              <rp-empty icon="alertc" title="Couldn't load the call log" [text]="callError()">
                <button type="button" class="btn btn-sec btn-sm" (click)="loadCalls()">
                  <span>Try again</span>
                </button>
              </rp-empty>
            </div>
          } @else {
            <div class="tbl-wrap">
              <table class="tbl" id="grv-calls-table">
                <thead>
                  <tr>
                    @for (c of callColumns; track c.k) {
                      <th
                        [class.sort]="c.sort"
                        [class.asc]="c.sort && callSort().k === c.k && callSort().dir === 'asc'"
                        [class.desc]="c.sort && callSort().k === c.k && callSort().dir === 'desc'"
                        [attr.aria-sort]="c.sort ? callAriaSort(c.k) : null"
                        (click)="c.sort && callSortBy(c.k)"
                      >
                        @if (c.sort) {
                          <button
                            type="button"
                            class="cp-th"
                            (click)="$event.stopPropagation(); callSortBy(c.k)"
                          >
                            {{ c.l
                            }}<span class="sa" aria-hidden="true">{{
                              callSort().k === c.k && callSort().dir === 'desc' ? '↓' : '↑'
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
                  @if (callsLoading() && !calls().length) {
                    <tr>
                      <td [attr.colspan]="callColumns.length">
                        <rp-empty icon="hourglass" title="Loading…" />
                      </td>
                    </tr>
                  }
                  @for (c of callsShown(); track c.id) {
                    <tr>
                      <td>
                        <div class="cell-t t-num" style="font-weight: 550">{{ day(c.at) }}</div>
                        <div class="cell-s">{{ time(c.at) }}</div>
                      </td>
                      <td>
                        <b>{{ c.caller }}</b>
                        <div class="cell-s">{{ dir(c) }} · {{ c.minutes }} min</div>
                      </td>
                      <td>
                        @if (c.ticket; as tk) {
                          <button type="button" class="linkbtn t-mono" (click)="openId.set(tk.id)">
                            {{ tk.ticketNo }}
                          </button>
                        } @else {
                          <span class="t-faint">No ticket</span>
                        }
                      </td>
                      <td>
                        <div class="t-sm" style="max-width: 420px; white-space: normal">
                          {{ c.summary }}
                        </div>
                      </td>
                      <td>{{ loggedBy(c) }}</td>
                    </tr>
                  } @empty {
                    @if (!callsLoading()) {
                      <tr>
                        <td [attr.colspan]="callColumns.length">
                          <rp-empty
                            icon="phone"
                            title="No calls logged"
                            text="Log every call so the next person picking up the ticket has the full story."
                          />
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            @if (calls().length > pageSize) {
              <rp-pager
                [total]="calls().length"
                [page]="callPage()"
                [size]="pageSize"
                (go)="callPage.set($event)"
              />
            } @else if (calls().length) {
              <div class="pager">
                <span>{{ plural(calls().length, 'call') }}</span>
              </div>
            }
            @if (callCursor()) {
              <div class="row" style="justify-content: center">
                <button
                  type="button"
                  class="btn btn-sec btn-sm"
                  [class.is-busy]="more()"
                  [disabled]="more()"
                  (click)="loadMoreCalls()"
                >
                  <span>Load more calls</span>
                </button>
              </div>
            }
          }
        }
      }
    </div>

    @if (openId(); as id) {
      <rp-ticket-drawer
        [ticketId]="id"
        [editWhy]="editWhy()"
        [canApprovals]="can('approvals.view')"
        (closed)="openId.set(null)"
        (changed)="changed()"
      />
    }
    @if (callFor() !== null) {
      <rp-call-log-form
        [tickets]="openTickets()"
        [ticketId]="callFor() ?? ''"
        (closed)="callFor.set(null)"
        (logged)="logged($event)"
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
export class ConsoleGrievances {
  private readonly api = inject(GrievancesApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly callColumns = CALL_COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly inr = inrText;
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly priorityOptions: DropdownOption[] = [
    { v: '', l: 'Any priority' },
    { v: '1', l: 'Priority 1' },
    { v: '2', l: 'Priority 2' },
    { v: '3', l: 'Priority 3' },
  ];

  protected readonly tab = signal<Tab>('t');
  protected readonly q = signal('');
  protected readonly status = signal<TicketFilter | ''>('');
  protected readonly priority = signal('');
  protected readonly data = signal<TicketList | null>(null);
  protected readonly rows = signal<readonly Ticket[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' }>({ k: 'at', dir: 'desc' });
  protected readonly openId = signal<string | null>(null);
  /** The call form: null closed, '' a general enquiry, else the ticket's id. */
  protected readonly callFor = signal<string | null>(null);

  protected readonly calls = signal<readonly CallLog[]>([]);
  protected readonly callCursor = signal<string | null>(null);
  protected readonly callsLoading = signal(false);
  protected readonly callsLoaded = signal(false);
  protected readonly callError = signal('');
  protected readonly callPage = signal(1);
  protected readonly callSort = signal<{ k: CallSortKey; dir: 'asc' | 'desc' }>({
    k: 'at',
    dir: 'desc',
  });
  private seq = 0;
  private qTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly canView = computed(() => this.can('grievances.view'));
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The grievance officer or administrator makes changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('grievances.edit') ? '' : this.noTask),
  );
  protected readonly tiles = computed(() => this.data()?.tiles ?? null);
  protected readonly kpiOld = computed(() => {
    const t = this.tiles();
    if (!t) return '';
    const n = t.olderThanAgeing.count;
    return n
      ? `${plural(n, 'ticket')} older than ${t.ageingDays} days`
      : `None older than ${t.ageingDays} days`;
  });
  protected readonly kpiDone = computed(() => {
    const t = this.tiles();
    return t
      ? `${(t.resolved.count + t.closed.count).toLocaleString('en-IN')} resolved or closed`
      : '';
  });
  protected readonly statusPills = computed(() => {
    const t = this.tiles();
    const n = (x: number | undefined) => (x === undefined ? '—' : x.toLocaleString('en-IN'));
    return [
      { v: '' as const, l: 'All', n: n(t?.total) },
      { v: 'OPEN' as const, l: statusOf('OPEN').l(), n: n(t?.open.count) },
      { v: 'ESCALATED' as const, l: 'Escalated', n: n(t?.escalated.count) },
      { v: 'AWAITING_APPROVAL' as const, l: 'Awaiting approval', n: n(t?.awaitingApproval.count) },
      { v: 'RESOLVED' as const, l: statusOf('RESOLVED').l(), n: n(t?.resolved.count) },
      { v: 'CLOSED' as const, l: statusOf('CLOSED').l(), n: n(t?.closed.count) },
    ];
  });
  protected readonly filtered = computed(() =>
    Boolean(this.q().trim() || this.status() || this.priority()),
  );
  protected readonly sorted = computed(() => {
    const s = this.sort();
    const get = (r: Ticket): string | number => {
      switch (s.k) {
        case 'no':
          return r.ticketNo;
        case 'name':
          return r.member.name;
        case 'pri':
          return r.priority;
        case 'status':
          return r.statusLabel;
        default:
          return r.createdAt ?? '';
      }
    };
    return [...this.rows()].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.sorted().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(
    () => `${plural(this.rows().length, 'ticket')}${this.cursor() ? '+' : ''}`,
  );
  protected readonly callCount = computed(() =>
    this.callsLoaded()
      ? `${this.calls().length.toLocaleString('en-IN')}${this.callCursor() ? '+' : ''}`
      : '—',
  );
  protected readonly callsShown = computed(() => {
    const s = this.callSort();
    const get = (c: CallLog): string =>
      s.k === 'caller'
        ? c.caller
        : s.k === 'ticket'
          ? (c.ticket?.ticketNo ?? '')
          : s.k === 'by'
            ? this.loggedBy(c)
            : (c.at ?? '');
    const list = [...this.calls()].sort((a, b) => {
      const c = get(a).localeCompare(get(b), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
    return list.slice((this.callPage() - 1) * PAGE, this.callPage() * PAGE);
  });
  /** The tickets a call can be kept against: those of the queue that are not Closed. */
  protected readonly openTickets = computed((): CallTicket[] =>
    this.rows()
      .filter((t) => t.status !== 'CLOSED')
      .map((t) => ({ id: t.id, ticketNo: t.ticketNo, name: t.member.name })),
  );

  constructor() {
    effect(() => {
      // A filter change reloads the first page from the server.
      this.status();
      this.priority();
      untracked(() => {
        if (this.canView()) void this.load();
      });
    });
    const route = inject(ActivatedRoute).snapshot.queryParamMap;
    const open = route.get('open');
    if (open) this.openId.set(open);
    if (route.get('tab') === 'calls') this.tab.set('c');
    // The call log loads with the page, so its tab shows the count (prototype).
    if (this.canView()) void this.loadCalls();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.qTimer));
  }

  private query(cursor?: string) {
    return {
      ...(this.status() ? { status: this.status() as TicketFilter } : {}),
      ...(this.priority() ? { priority: Number(this.priority()) } : {}),
      ...(this.q().trim() ? { q: this.q().trim() } : {}),
      ...(cursor ? { cursor } : {}),
    };
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.list(this.query());
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
      const d = await this.api.list(this.query(c));
      this.rows.set([...this.rows(), ...d.items]);
      this.cursor.set(d.nextCursor);
    } catch (e) {
      this.overlays.toast("Couldn't load more tickets", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.more.set(false);
    }
  }

  protected openCalls() {
    this.tab.set('c');
    if (!this.callsLoaded() && !this.callsLoading()) void this.loadCalls();
  }

  protected async loadCalls() {
    this.callsLoading.set(true);
    try {
      const d = await this.api.calls();
      this.calls.set(d.items);
      this.callCursor.set(d.nextCursor);
      this.callPage.set(1);
      this.callsLoaded.set(true);
      this.callError.set('');
    } catch (e) {
      this.callError.set(this.problem(e));
    } finally {
      this.callsLoading.set(false);
    }
  }

  protected async loadMoreCalls() {
    const c = this.callCursor();
    if (!c) return;
    this.more.set(true);
    try {
      const d = await this.api.calls({ cursor: c });
      this.calls.set([...this.calls(), ...d.items]);
      this.callCursor.set(d.nextCursor);
    } catch (e) {
      this.overlays.toast("Couldn't load more calls", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.more.set(false);
    }
  }

  /** The drawer changed the ticket or logged a call: the figures, the queue and the calls reload. */
  protected changed() {
    void this.load();
    if (this.callsLoaded()) void this.loadCalls();
  }

  protected logged(c: CallLog) {
    this.callFor.set(null);
    this.calls.set([c, ...this.calls().filter((x) => x.id !== c.id)]);
    if (this.callsLoaded()) void this.loadCalls();
  }

  // --- filters and sorting -------------------------------------------------------------------------
  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => void this.load(), 250);
  }
  protected sortBy(key: string) {
    const k = key as SortKey;
    const s = this.sort();
    this.sort.set({ k, dir: s.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: string) {
    const s = this.sort();
    return s.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  protected callSortBy(key: string) {
    const k = key as CallSortKey;
    const s = this.callSort();
    this.callSort.set({ k, dir: s.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.callPage.set(1);
  }
  protected callAriaSort(k: string) {
    const s = this.callSort();
    return s.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // --- formatting ----------------------------------------------------------------------------------
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected tile(k: 'open' | 'escalated' | 'awaitingApproval' | 'priority1Open') {
    const t = this.tiles();
    return t ? t[k].count.toLocaleString('en-IN') : '—';
  }
  protected st(r: Ticket) {
    return statusOf(r.status);
  }
  protected tone(p: number) {
    return priorityTone(p);
  }
  protected kindLabel(k: TicketKind) {
    return KIND_LABEL[k];
  }
  protected type(t: string | null) {
    return txnType(t);
  }
  protected channel(r: Ticket) {
    return CHANNEL_LABEL[r.channel] ?? r.channel;
  }
  protected raisedAgo(r: Ticket) {
    return r.createdAt ? ago(r.createdAt) : '';
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected day(v: string | null) {
    return v ? formatDate(v) : '—';
  }
  protected time(v: string | null) {
    return v ? formatTime(v) : '';
  }
  protected dir(c: CallLog) {
    return DIRECTION_LABEL[c.direction];
  }
  protected loggedBy(c: CallLog) {
    const who = c.loggedBy ?? '—';
    return c.source === 'SUPPORT' ? `${who} (CampusOne support)` : who;
  }
  private problem(e: unknown) {
    return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
  }
}
