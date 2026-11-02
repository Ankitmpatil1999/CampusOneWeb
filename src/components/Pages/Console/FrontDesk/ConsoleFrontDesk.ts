import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { taskAccess } from '../Attendance/attendance-format';
import { plural } from '../Fees/fee-format';
import { num, problemText, today } from '../Structure/academic-format';
import { FrontDeskApi, type Visitor, type VisitorLog } from './frontdesk.api';
import { visitMinutes } from './frontdesk-format';
import { FrontDeskReport } from './FrontDeskReport';
import { LocationPanel } from './LocationPanel';
import { StaffAttendancePanel } from './StaffAttendancePanel';
import { VisitorDrawer } from './VisitorDrawer';

type Tab = 'vis' | 'staff' | 'loc' | 'rep';
type Filter = 'on' | 'out' | 'all';
type SortKey = 'name' | 'purpose' | 'host' | 'in' | 'out';
const PAGE = 10;

/**
 * c.frontdesk — Front desk (SRS 21.12, FR-ATT-04, FR-ATT-07, CR-10; ATT-015…018; prototype
 * c.frontdesk): the visitor log of a day — who is on campus, check-in and check-out; recording a
 * member at a place (library, sick room …) after its cooling-off; and today's quick report. Staff
 * attendance (client 2026-10-22): staff check in and out with their card on the desk's reader, or
 * by name (StaffAttendancePanel; attendance.view to see it, attendance.mark to record).
 */
@Component({
  selector: 'rp-console-frontdesk',
  imports: [
    Avatar,
    Empty,
    FrontDeskReport,
    Icon,
    Kpi,
    LocationPanel,
    PageHead,
    Pager,
    StaffAttendancePanel,
    VisitorDrawer,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head title="Front desk" sub="Visitor log, location attendance and today's snapshot">
        @if (!access.denied() && tab() === 'vis') {
          <span class="cp-why" [attr.title]="editWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="vis-new"
              [disabled]="!!editWhy()"
              (click)="checkingIn.set(true)"
            >
              <rp-icon name="userplus" [size]="17" /><span>Check in a visitor</span>
            </button></span
          >
        }
      </rp-page-head>

      @if (access.denied()) {
        <rp-empty
          icon="lock"
          title="You don't have access to this page"
          [text]="access.deniedText()"
        />
      } @else {
        @if (access.management()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              <b>Read-only.</b> Management can view this page but not change it.
            </div>
          </div>
        }
        <div class="tabs" role="tablist" aria-label="Front desk">
          @for (t of shownTabs(); track t.v) {
            <button
              type="button"
              class="tab"
              role="tab"
              [id]="'fd-tab-' + t.v"
              [class.on]="tab() === t.v"
              [attr.aria-selected]="tab() === t.v"
              (click)="tab.set(t.v)"
            >
              <rp-icon [name]="t.icon" [size]="15" />{{ t.l }}
              @if (t.v === 'vis' && log()) {
                <span class="n">{{ num(log()!.counts.inside) }}</span>
              }
            </button>
          }
        </div>

        @switch (tab()) {
          @case ('loc') {
            <rp-location-panel [why]="editWhy()" />
          }
          @case ('staff') {
            <rp-staff-attendance [why]="staffWhy()" />
          }
          @case ('rep') {
            <rp-frontdesk-report [log]="todayLog()" />
          }
          @default {
            @if (loading() && !log()) {
              <div class="stack g16" aria-busy="true" aria-label="Loading">
                <div class="c-grid k4 cc-kp">
                  @for (i of [1, 2, 3, 4]; track i) {
                    <div class="sk" style="height: 104px; border-radius: 16px"></div>
                  }
                </div>
                <div class="sk" style="height: 44px; border-radius: 12px"></div>
                <div class="sk" style="height: 300px; border-radius: 16px"></div>
              </div>
            } @else if (error()) {
              <div class="card pad">
                <rp-empty icon="alertc" title="Couldn't load the visitor log" [text]="error()">
                  <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                    <span>Try again</span>
                  </button>
                </rp-empty>
              </div>
            } @else if (log(); as l) {
              <div class="c-grid k4 cc-kp" id="vis-kpis">
                <rp-kpi
                  label="On campus now"
                  icon="door"
                  tone="brand"
                  [value]="num(l.counts.inside)"
                />
                <rp-kpi
                  [label]="isToday() ? 'Checked in today' : 'Checked in'"
                  icon="userplus"
                  [value]="num(l.counts.total)"
                  [delta]="isToday() ? '' : fmtDay(l.date)"
                />
                <rp-kpi
                  [label]="isToday() ? 'Checked out today' : 'Checked out'"
                  icon="logout"
                  tone="ok"
                  [value]="num(l.counts.total - l.counts.inside)"
                />
                <rp-kpi label="Average visit" icon="clock" [value]="average() + ' min'" />
              </div>
              <div class="c-filters">
                <label class="search"
                  ><rp-icon name="search" [size]="16" /><input
                    type="search"
                    id="vis-q"
                    placeholder="Name, mobile, purpose or host"
                    aria-label="Search visitors"
                    autocomplete="off"
                    [value]="q()"
                    (input)="q.set(val($event)); page.set(1)"
                /></label>
                <div class="pills" role="group" aria-label="Visitors">
                  @for (p of pills(); track p.v) {
                    <button
                      type="button"
                      class="pill"
                      [class.on]="filter() === p.v"
                      [attr.aria-pressed]="filter() === p.v"
                      (click)="filter.set(p.v); page.set(1)"
                    >
                      {{ p.l }}<span class="n">{{ num(p.n) }}</span>
                    </button>
                  }
                </div>
                <div class="fld cc-date">
                  <div class="fld-in">
                    <input
                      id="vis-date"
                      type="date"
                      aria-label="Day"
                      [max]="todayIso"
                      [value]="date()"
                      (change)="pickDate($event)"
                    />
                  </div>
                </div>
                <span class="fsum">Mobile numbers are kept encrypted and shown masked.</span>
              </div>
              <div class="tbl-wrap">
                <table class="tbl" id="vis-table">
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
                          {{ c.l
                          }}<span class="sa" aria-hidden="true">{{
                            sort().k === c.k && sort().dir === 'desc' ? '↓' : '↑'
                          }}</span>
                        </th>
                      }
                      <th>Status</th>
                      <th aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (v of shown(); track v.id) {
                      <tr>
                        <td>
                          <div class="cell-main">
                            <rp-av [name]="person(v.name)" size="sm" />
                            <div style="min-width: 0">
                              <div class="cell-t t-clip">{{ person(v.name) }}</div>
                              <div class="cell-s t-clip">{{ v.mobile }}</div>
                            </div>
                          </div>
                        </td>
                        <td>{{ v.purpose }}</td>
                        <td>
                          @if (v.toMeet) {
                            {{ v.toMeet }}
                          } @else {
                            <span class="t-faint">—</span>
                          }
                        </td>
                        <td>
                          {{ time(v.checkedInAt) }}
                          <div class="cell-s">{{ dayLabel(v.checkedInAt) }}</div>
                        </td>
                        <td>
                          @if (v.checkedOutAt) {
                            {{ time(v.checkedOutAt) }}
                            <div class="cell-s">
                              {{ minutes(v.checkedInAt, v.checkedOutAt) }} min
                            </div>
                          } @else {
                            <span class="t-faint">—</span>
                          }
                        </td>
                        <td>
                          @if (v.inside) {
                            <span class="chip dot tone-brand">On campus</span>
                          } @else {
                            <span class="chip dot tone-neutral">Checked out</span>
                          }
                        </td>
                        <td>
                          @if (v.inside && !editWhy()) {
                            <button
                              type="button"
                              class="btn btn-soft btn-xs"
                              [disabled]="busy() === v.id"
                              [class.is-busy]="busy() === v.id"
                              (click)="checkOut(v)"
                            >
                              <rp-icon name="logout" [size]="14" /><span>Check out</span>
                            </button>
                          }
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td [attr.colspan]="columns.length + 2">
                          <rp-empty
                            icon="door"
                            [title]="
                              filter() === 'on' && !q().trim()
                                ? 'No visitors on campus'
                                : 'No visitors match'
                            "
                            [text]="
                              filter() === 'on' && !q().trim()
                                ? 'Checked-in visitors appear here until they check out.'
                                : 'Try clearing the search.'
                            "
                          />
                        </td>
                      </tr>
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
                  <span>{{ plural(rows().length, 'visitor') }}</span>
                </div>
              }
            }
          }
        }
      }
    </div>

    @if (checkingIn()) {
      <rp-visitor-drawer (closed)="checkingIn.set(false)" (checkedIn)="onCheckedIn()" />
    }
  `,
})
export class ConsoleFrontDesk {
  private readonly api = inject(FrontDeskApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly access = taskAccess(this.session, 'frontdesk.view');
  protected readonly pageSize = PAGE;
  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly person = person;
  protected readonly todayIso = today();
  protected readonly tabs: readonly {
    v: Tab;
    l: string;
    icon: 'door' | 'nfc' | 'chart' | 'users';
  }[] = [
    { v: 'vis', l: 'Visitors', icon: 'door' },
    { v: 'staff', l: 'Staff attendance', icon: 'users' },
    { v: 'loc', l: 'Location attendance', icon: 'nfc' },
    { v: 'rep', l: 'Quick report', icon: 'chart' },
  ];
  protected readonly columns: readonly { k: SortKey; l: string }[] = [
    { k: 'name', l: 'Visitor' },
    { k: 'purpose', l: 'Purpose' },
    { k: 'host', l: 'Meeting' },
    { k: 'in', l: 'In' },
    { k: 'out', l: 'Out' },
  ];

  protected readonly tab = signal<Tab>('vis');
  protected readonly filter = signal<Filter>('on');
  protected readonly q = signal('');
  protected readonly date = signal(today());
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' }>({ k: 'in', dir: 'desc' });
  protected readonly log = signal<VisitorLog | null>(null);
  /** Today's log for the quick report (the shown day may be another). */
  protected readonly todayLog = signal<VisitorLog | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly checkingIn = signal(false);
  private seq = 0;

  protected readonly editWhy = computed(() => this.access.why('frontdesk.edit'));
  /** Staff attendance shows with attendance.view and is recorded with attendance.mark. */
  protected readonly shownTabs = computed(() =>
    this.tabs.filter((t) => t.v !== 'staff' || this.access.can('attendance.view')),
  );
  protected readonly staffWhy = computed(() => this.access.why('attendance.mark'));
  protected readonly isToday = computed(() => this.date() === today());
  protected readonly pills = computed(() => {
    const items = this.log()?.items ?? [];
    return [
      { v: 'on' as Filter, l: 'On campus', n: items.filter((v) => v.inside).length },
      { v: 'out' as Filter, l: 'Checked out', n: items.filter((v) => !v.inside).length },
      { v: 'all' as Filter, l: 'All', n: items.length },
    ];
  });
  protected readonly average = computed(() => {
    const out = (this.log()?.items ?? []).filter((v) => v.checkedOutAt);
    return out.length
      ? Math.round(
          out.reduce((n, v) => n + visitMinutes(v.checkedInAt, v.checkedOutAt!), 0) / out.length,
        )
      : 0;
  });
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const f = this.filter();
    const list = (this.log()?.items ?? []).filter(
      (v) =>
        (f === 'all' || (f === 'on' ? v.inside : !v.inside)) &&
        (!q ||
          [v.name, v.mobile, v.purpose, v.toMeet ?? ''].some((x) => x.toLowerCase().includes(q))),
    );
    const s = this.sort();
    const val = (v: Visitor): string =>
      s.k === 'name'
        ? v.name
        : s.k === 'purpose'
          ? v.purpose
          : s.k === 'host'
            ? (v.toMeet ?? '')
            : s.k === 'in'
              ? v.checkedInAt
              : (v.checkedOutAt ?? '9999');
    return [...list].sort((a, b) => {
      const c = val(a).localeCompare(val(b), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );

  constructor() {
    if (!this.access.denied()) void this.load();
  }

  async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const l = await this.api.visitors(this.date());
      if (n !== this.seq) return;
      this.log.set(l);
      if (l.date === today()) this.todayLog.set(l);
      else if (!this.todayLog()) this.todayLog.set(await this.api.visitors());
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected pickDate(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (!v) return;
    this.date.set(v);
    this.page.set(1);
    void this.load();
  }
  protected time(iso: string) {
    return formatTime(iso);
  }
  protected fmtDay(d: string) {
    return formatDate(d);
  }
  protected dayLabel(iso: string) {
    return formatDate(iso) === formatDate(new Date()) ? 'Today' : formatDate(iso);
  }
  protected minutes(a: string, b: string) {
    return visitMinutes(a, b);
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

  protected onCheckedIn() {
    this.checkingIn.set(false);
    this.filter.set('on');
    this.date.set(today());
    void this.load();
  }

  /** cc.vis.out: confirm, then close the visit. */
  protected async checkOut(v: Visitor) {
    if (this.editWhy()) return;
    const ok = await this.overlays.confirm({
      title: `Check out ${person(v.name)}?`,
      text: `The visit closes at ${formatTime(new Date())}.`,
      ok: 'Check out',
    });
    if (!ok) return;
    this.busy.set(v.id);
    try {
      const out = await this.api.checkOut(v.id);
      this.overlays.toast('Visitor checked out', {
        sub: `${person(out.name)} · ${visitMinutes(out.checkedInAt, out.checkedOutAt ?? new Date().toISOString())} min`,
      });
      await this.load();
    } catch (e) {
      this.overlays.toast('Not checked out', { sub: problemText(e), tone: 'bad' });
      void this.load();
    } finally {
      this.busy.set(null);
    }
  }
}
