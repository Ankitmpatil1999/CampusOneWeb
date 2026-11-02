import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Pager } from '../../../Shared/Pager';
import { ago } from '../../../Utils/dates';
import { person } from '../Applications/app-format';
import { plural } from '../Fees/fee-format';
import { MembersApi } from '../Members/members.api';
import { MANAGEMENT_WHY, NO_TASK, dRange, num, problemText } from '../Structure/academic-format';
import { TeachersApi } from '../Teachers/teachers.api';
import { LeaveApi, type LeaveList, type StaffLeave } from './leave.api';
import { LeaveDrawer } from './LeaveDrawer';
import {
  LEAVE_TABS,
  coordinatorLabel,
  overlaps,
  stateChip,
  tabOf,
  type LeaveTab,
} from './leave-format';

type SortKey = 'id' | 'teacher' | 'type' | 'from' | 'at' | 'status';
const PAGE = 10;

/**
 * c.leave — Teacher leave (SRS 20.27, 20.28, FR-ACA-10, BR-53; ACA-042, ACA-043, ACA-076;
 * prototype c.leave): the academic coordinator's first review of teachers' leave — what waits for
 * them, what is with the principal, who is away this week and the days requested; the requests by
 * status with a search; the request drawer with the balance, the classes affected and the
 * recommendation or rejection. The principal gives the final decision in the member app.
 */
@Component({
  selector: 'rp-console-leave',
  imports: [Avatar, Empty, Icon, Kpi, LeaveDrawer, PageHead, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Teacher leave"
        sub="First review by the academic coordinator; the principal gives the final decision"
      />

      @if (denied()) {
        <rp-empty icon="lock" title="You don't have access to this page" [text]="deniedText()" />
      } @else {
        @if (management()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              <b>Read-only.</b> Management can view this page but not change it.
            </div>
          </div>
        }
        @if (loading() && !list()) {
          <div class="stack g16" aria-busy="true" aria-label="Loading">
            <div class="c-grid k4 cc-kp">
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="sk" style="height: 104px; border-radius: 16px"></div>
              }
            </div>
            <div class="sk" style="height: 44px; border-radius: 12px"></div>
            <div class="sk" style="height: 320px; border-radius: 16px"></div>
          </div>
        } @else if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load teacher leave" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (list(); as l) {
          @if (l.scoped) {
            <div class="note tone-info">
              <rp-icon name="info" [size]="17" />
              <div class="grow">
                You see the leave of teachers who teach the classes you coordinate.
              </div>
            </div>
          }
          <div class="c-grid k4 cc-kp" id="lv-kpis">
            <rp-kpi
              label="Waiting for you"
              icon="inbox"
              [tone]="l.counts.pending ? 'warn' : 'ok'"
              [value]="num(l.counts.pending)"
              [delta]="oldest() ? 'Oldest ' + oldest() : 'All reviewed'"
            />
            <rp-kpi
              label="With the principal"
              icon="send"
              tone="info"
              [value]="num(l.counts.withPrincipal)"
            />
            <rp-kpi
              label="Teachers away this week"
              icon="plane"
              tone="violet"
              [value]="num(l.counts.awayThisWeek)"
            />
            <rp-kpi
              label="Days requested this year"
              icon="calendar"
              [value]="num(l.counts.daysRequested)"
              [delta]="l.year.label"
            />
          </div>

          <div class="tabs" role="tablist" aria-label="Status">
            @for (t of tabs; track t.v) {
              <button
                type="button"
                class="tab"
                role="tab"
                [id]="'lv-tab-' + t.v"
                [class.on]="tab() === t.v"
                [attr.aria-selected]="tab() === t.v"
                (click)="tab.set(t.v); page.set(1)"
              >
                {{ t.l }}<span class="n">{{ num(tabCount(t.v)) }}</span>
              </button>
            }
          </div>
          <div class="c-filters">
            <label class="search"
              ><rp-icon name="search" [size]="16" /><input
                type="search"
                id="lv-q"
                placeholder="Teacher, type or reason"
                aria-label="Search leave requests"
                autocomplete="off"
                [value]="q()"
                (input)="q.set(val($event)); page.set(1)"
            /></label>
            <span class="fsum">{{ plural(rows().length, 'request') }}</span>
          </div>

          <div class="tbl-wrap">
            <table class="tbl" id="lv-table">
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
                      {{ c.l }}
                      @if (c.sort) {
                        <span class="sa" aria-hidden="true">{{
                          sort().k === c.k && sort().dir === 'desc' ? '↓' : '↑'
                        }}</span>
                      }
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (x of shown(); track x.id) {
                  <tr
                    tabindex="0"
                    [attr.aria-label]="x.reference + ' ' + person(x.staff.name)"
                    (click)="openId.set(x.id)"
                    (keydown.enter)="openId.set(x.id)"
                  >
                    <td>
                      <span class="t-mono t-sm" style="white-space: nowrap">{{ x.reference }}</span>
                    </td>
                    <td>
                      <div class="cell-main">
                        <rp-av [name]="person(x.staff.name)" size="sm" />
                        <div style="min-width: 0; max-width: 240px">
                          <div class="cell-t t-clip">{{ person(x.staff.name) }}</div>
                          <div class="cell-s t-clip">{{ meta(x) }}</div>
                        </div>
                      </div>
                    </td>
                    <td>{{ x.typeLabel }}</td>
                    <td>
                      {{ range(x) }}
                      <div class="cell-s">{{ plural(x.days, 'day') }}</div>
                    </td>
                    <td>
                      <span class="t-sm t-clip" style="display: block; max-width: 240px">{{
                        x.reason
                      }}</span>
                    </td>
                    <td>{{ applied(x) }}</td>
                    <td>
                      <span [class]="'chip dot tone-' + chip(x).tone">{{ chip(x).l }}</span>
                      @if (x.coordinator; as c) {
                        <div class="cell-s">
                          {{
                            c.status === 'APPROVED'
                              ? 'Coordinator: ' + coordinator(c.status)
                              : coordinator(c.status)
                          }}
                        </div>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td [attr.colspan]="columns.length">
                      <rp-empty
                        icon="plane"
                        [title]="
                          tab() === 'PENDING' && !q().trim()
                            ? 'No leave waiting for review'
                            : 'No requests here'
                        "
                        [text]="
                          q().trim()
                            ? 'Try a different search.'
                            : tab() === 'PENDING'
                              ? 'New teacher leave requests appear here for your first review.'
                              : 'Try another status.'
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
              <span>{{ plural(rows().length, 'request') }}</span>
            </div>
          }
        }
      }
    </div>

    @if (open(); as o) {
      <rp-leave-drawer
        [leave]="o"
        [meta]="meta(o, true)"
        [others]="othersOf(o)"
        [decideWhy]="decideWhy()"
        [timetableReadable]="can('academics.view')"
        (closed)="openId.set(null)"
        (decided)="load()"
      />
    }
  `,
})
export class ConsoleLeave {
  private readonly api = inject(LeaveApi);
  private readonly members = inject(MembersApi);
  private readonly teachers = inject(TeachersApi);
  private readonly session = inject(SessionContext).console;

  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly num = num;
  protected readonly person = person;
  protected readonly tabs = LEAVE_TABS;
  protected readonly columns: readonly { k: SortKey | 'reason'; l: string; sort: boolean }[] = [
    { k: 'id', l: 'Request', sort: true },
    { k: 'teacher', l: 'Teacher', sort: true },
    { k: 'type', l: 'Type', sort: true },
    { k: 'from', l: 'Dates', sort: true },
    { k: 'reason', l: 'Reason', sort: false },
    { k: 'at', l: 'Applied', sort: true },
    { k: 'status', l: 'Status', sort: true },
  ];

  protected readonly list = signal<LeaveList | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly tab = signal<LeaveTab>('PENDING');
  protected readonly q = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' }>({ k: 'at', dir: 'desc' });
  protected readonly openId = signal<string | null>(null);
  /** Department and employee number of each teacher; subjects they teach (best effort). */
  private readonly staffInfo = signal<ReadonlyMap<string, { dept: string; emp: string }>>(
    new Map(),
  );
  private readonly subjectsOf = signal<ReadonlyMap<string, readonly string[]>>(new Map());
  private seq = 0;

  protected can(s: string) {
    return this.session()?.subTasks.includes(s) ?? false;
  }
  protected readonly management = computed(
    () => this.session()?.roles.some((r) => r.readOnly) ?? false,
  );
  protected readonly denied = computed(() => !!this.session() && !this.can('leave.view'));
  protected readonly deniedText = computed(() => {
    const role = (this.session()?.roles ?? []).map((r) => r.name).join(', ');
    return `Your role (${role}) doesn't include this task. Ask the institution administrator if you need it.`;
  });
  protected readonly decideWhy = computed(() =>
    this.management() ? MANAGEMENT_WHY : this.can('leave.decide') ? '' : NO_TASK,
  );

  protected readonly oldest = computed(() => {
    const pending = (this.list()?.items ?? []).filter((x) => x.state === 'PENDING' && x.appliedAt);
    if (!pending.length) return '';
    const first = pending.reduce((a, x) => (x.appliedAt! < a.appliedAt! ? x : a));
    return ago(first.appliedAt!);
  });
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    const tab = this.tab();
    const items = (this.list()?.items ?? []).filter(
      (x) =>
        (tab === 'all' || tabOf(x.state) === tab) &&
        (!q ||
          [x.staff.name, x.typeLabel, x.reason, x.reference].some((v) =>
            v.toLowerCase().includes(q),
          )),
    );
    const s = this.sort();
    const val = (x: StaffLeave): string =>
      s.k === 'id'
        ? x.reference
        : s.k === 'teacher'
          ? person(x.staff.name)
          : s.k === 'type'
            ? x.typeLabel
            : s.k === 'from'
              ? x.from
              : s.k === 'at'
                ? (x.appliedAt ?? '')
                : stateChip(x.state).l;
    return [...items].sort((a, b) => {
      const c = val(a).localeCompare(val(b), 'en', { numeric: true });
      return s.dir === 'desc' ? -c : c;
    });
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly open = computed(() => {
    const id = this.openId();
    return id ? (this.list()?.items.find((x) => x.id === id) ?? null) : null;
  });

  constructor() {
    if (!this.denied()) {
      void this.load();
      void this.loadPeople();
    }
  }

  async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const l = await this.api.list('all');
      if (n !== this.seq) return;
      this.list.set(l);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  /** The teachers' department, employee number and subjects for the Teacher column. */
  private async loadPeople() {
    if (this.can('members.view')) {
      try {
        const m = new Map<string, { dept: string; emp: string }>();
        let cursor: string | undefined;
        for (let i = 0; i < 20; i++) {
          const r = await this.members.list({ kind: 'STAFF', limit: 200, cursor });
          for (const x of r.items) {
            m.set(x.id, { dept: x.department?.name ?? '', emp: x.employeeNo ?? '' });
          }
          if (!r.nextCursor) break;
          cursor = r.nextCursor;
        }
        this.staffInfo.set(m);
      } catch {
        // The Teacher column then shows the user type.
      }
    }
    if (this.can('academics.view')) {
      try {
        const a = await this.teachers.assignments();
        const m = new Map<string, string[]>();
        for (const x of a.subjectTeachers) {
          if (!x.subject) continue;
          const list = m.get(x.teacher.id) ?? [];
          if (!list.includes(x.subject.name)) list.push(x.subject.name);
          m.set(x.teacher.id, list);
        }
        this.subjectsOf.set(m);
      } catch {
        // No subjects in the Teacher column.
      }
    }
  }

  /**
   * tMeta: "TVPS-T-0124 · Hindi" — in the list the first subject (+ how many more); in the drawer the
   * department first and every subject.
   */
  protected meta(x: StaffLeave, full = false): string {
    const info = this.staffInfo().get(x.staff.id);
    const subjects = this.subjectsOf().get(x.staff.id) ?? [];
    const taught = full
      ? subjects.join(', ')
      : subjects.length > 1
        ? `${subjects[0]} +${subjects.length - 1}`
        : (subjects[0] ?? '');
    const parts = [full ? (info?.dept ?? '') : '', info?.emp ?? '', taught].filter(Boolean);
    return parts.length ? parts.join(' · ') : x.staff.type;
  }

  /** Other teachers away on any of these dates, with their request's status. */
  protected othersOf(l: StaffLeave): string[] {
    return (this.list()?.items ?? [])
      .filter(
        (x) =>
          x.staff.id !== l.staff.id &&
          ['APPROVED', 'WITH_PRINCIPAL', 'PENDING'].includes(x.state) &&
          overlaps(x, l),
      )
      .map((x) => `${person(x.staff.name)} (${stateChip(x.state).l.toLowerCase()})`);
  }

  protected tabCount(t: LeaveTab) {
    const items = this.list()?.items ?? [];
    return t === 'all' ? items.length : items.filter((x) => tabOf(x.state) === t).length;
  }
  protected chip(x: StaffLeave) {
    return stateChip(x.state);
  }
  protected coordinator(s: 'APPROVED' | 'REJECTED') {
    return coordinatorLabel(s);
  }
  protected range(x: StaffLeave) {
    return dRange(x.from, x.to);
  }
  protected applied(x: StaffLeave) {
    return x.appliedAt ? ago(x.appliedAt) : '—';
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected sortBy(k: string) {
    const key = k as SortKey;
    const s = this.sort();
    this.sort.set({ k: key, dir: s.k === key && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: string) {
    const s = this.sort();
    return s.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }
}
