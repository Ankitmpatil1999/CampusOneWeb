import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { exportCsv, pct, taskAccess } from '../Attendance/attendance-format';
import { plural } from '../Fees/fee-format';
import { num, problemText, today } from '../Structure/academic-format';
import type { YearRef } from '../Structure/academic-year';
import {
  TransportApi,
  type AllocationPage,
  type AllocationRow,
  type Assignment,
  type Route,
  type Vehicle,
} from '../Transport/transport.api';
import { effective, periodStatus } from '../Transport/transport-format';
import { AllocateDrawer, transportChoice } from './AllocateDrawer';

type Kind = 'STUDENT' | 'STAFF';
type Assigned = 'yes' | 'no' | 'all';

/**
 * c.allocations — Passenger allocations (SRS 22.15, FR-TRN-04, BR-61, CR-09, CR-13; TRN-020…022;
 * prototype c.allocations): students — or teachers and staff — with their route and stop for the year,
 * allocated or not, with the CR-09 columns (name, identifier, grade and section), a search, a route
 * filter and the server's paging (100 a page); allocating several passengers at once and ending an
 * allocation with a reason.
 */
@Component({
  selector: 'rp-console-allocations',
  imports: [AllocateDrawer, Avatar, Dropdown, Empty, Icon, Kpi, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head title="Passenger allocations" [sub]="sub()">
        @if (!access.denied()) {
          <button
            type="button"
            class="btn btn-sec"
            id="al-export"
            [disabled]="!assignedAll().length"
            (click)="export()"
          >
            <rp-icon name="download" [size]="17" /><span>Export</span>
          </button>
          <span class="cp-why" [attr.title]="editWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="al-new"
              [disabled]="!!editWhy() || !routes().length"
              (click)="allocating.set({ preset: null })"
            >
              <rp-icon name="plus" [size]="17" /><span>Allocate passenger</span>
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
        @if (year()?.closed) {
          <div class="c-yr-banner" role="status">
            <rp-icon name="lock" [size]="15" />
            <span
              >You're viewing <b>{{ year()?.label }}</b
              >, which is closed. Records are read-only.</span
            >
          </div>
        }
        <div class="c-grid k4 cc-kp" id="al-kpis">
          <rp-kpi
            label="Active passengers"
            icon="users"
            [value]="num(activeCount().students + activeCount().staff)"
            [delta]="year()?.label ?? ''"
          />
          <rp-kpi label="Students" icon="grad" tone="brand" [value]="num(activeCount().students)" />
          <rp-kpi
            label="Teachers and staff"
            icon="briefcase"
            tone="violet"
            [value]="num(activeCount().staff)"
          />
          <rp-kpi
            label="Busiest route"
            icon="bus"
            [tone]="
              busiest() ? (busiest()!.u > 100 ? 'bad' : busiest()!.u > 85 ? 'warn' : 'ok') : null
            "
            [value]="busiest() ? busiest()!.u + '%' : '—'"
            [delta]="
              busiest()
                ? busiest()!.code + ' · ' + busiest()!.n + ' of ' + busiest()!.cap + ' seats'
                : ''
            "
          />
        </div>
        <div class="c-filters" id="al-filters">
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              id="al-search"
              placeholder="Passenger or admission no."
              aria-label="Search passengers"
              autocomplete="off"
              [value]="q()"
              (input)="setQ($event)"
          /></label>
          <div class="pills" role="group" aria-label="Allocation">
            @for (p of pills(); track p.v) {
              <button
                type="button"
                class="pill"
                [class.on]="assigned() === p.v"
                [attr.aria-pressed]="assigned() === p.v"
                (click)="setAssigned(p.v)"
              >
                {{ p.l }}
                @if (p.n !== null) {
                  <span class="n">{{ num(p.n) }}</span>
                }
              </button>
            }
          </div>
          <div class="fld">
            <rp-dd
              inputId="f-kind"
              [options]="kindOptions"
              [value]="kind()"
              (changed)="setKind($any($event))"
            />
          </div>
          <div class="fld">
            <rp-dd
              inputId="f-rt"
              placeholder="All routes"
              [options]="routeOptions()"
              [value]="routeId()"
              (changed)="setRoute($event)"
            />
          </div>
          <span class="fsum">{{ summary() }}</span>
        </div>

        @if (loading() && !page()) {
          <div class="sk" style="height: 380px; border-radius: 16px" aria-busy="true"></div>
        } @else if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the allocations" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else {
          <div class="tbl-wrap">
            <table class="tbl" id="al-table">
              <thead>
                <tr>
                  <th>Passenger</th>
                  <th>Type</th>
                  <th>Route</th>
                  <th>Stop</th>
                  <th>From – to</th>
                  <th>Year</th>
                  <th>Status</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                @for (r of items(); track r.member.id) {
                  <tr>
                    <td>
                      <div class="cell-main">
                        <rp-av [name]="name(r)" size="sm" />
                        <div style="min-width: 0">
                          <div class="cell-t t-clip">{{ name(r) }}</div>
                          <div class="cell-s t-clip">{{ detail(r) }}</div>
                          @if (choice(r); as c) {
                            <span [class]="'chip al-opt tone-' + c.tone">{{ c.l }}</span>
                          }
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        [class]="
                          'chip tone-' +
                          (r.member.class || kind() === 'STUDENT' ? 'brand' : 'violet')
                        "
                        >{{ kind() === 'STUDENT' ? 'Student' : r.member.type }}</span
                      >
                    </td>
                    @if (r.allocation; as a) {
                      <td>
                        <span class="cc-rt">{{ a.route.code }}</span>
                      </td>
                      <td>{{ a.stop.name }}</td>
                      <td>{{ effective(a.from, a.to) }}</td>
                    } @else {
                      <td><span class="t-faint">—</span></td>
                      <td><span class="t-faint">—</span></td>
                      <td><span class="t-faint">—</span></td>
                    }
                    <td>
                      <span class="tag" title="Academic year (CR-13)"
                        ><rp-icon name="calendar" [size]="12" />{{ year()?.label ?? '' }}</span
                      >
                    </td>
                    <td>
                      @if (r.allocation; as a) {
                        <span [class]="'chip dot tone-' + status(a.from, a.to).tone">{{
                          status(a.from, a.to).l
                        }}</span>
                      } @else {
                        <span class="chip dot tone-neutral">Not allocated</span>
                      }
                    </td>
                    <td>
                      @if (!editWhy() && !year()?.closed) {
                        <span class="row g4" style="justify-content: flex-end">
                          @if (r.transport; as t) {
                            <span
                              class="cp-why"
                              [attr.title]="
                                t.opted && r.allocation
                                  ? 'End the allocation before marking not opted'
                                  : null
                              "
                              ><button
                                type="button"
                                class="btn btn-ghost btn-xs al-choice"
                                [disabled]="busy() === r.member.id || (t.opted && !!r.allocation)"
                                (click)="changeChoice(r)"
                              >
                                <span>{{ t.opted ? 'Mark not opted' : 'Mark opted' }}</span>
                              </button></span
                            >
                          }
                          @if (r.allocation) {
                            <button
                              type="button"
                              class="btn btn-ghost btn-xs"
                              [disabled]="busy() === r.member.id"
                              (click)="end(r)"
                            >
                              <span>End</span>
                            </button>
                          } @else {
                            <span
                              class="cp-why"
                              [attr.title]="
                                r.transport?.opted === false
                                  ? 'Didn’t opt for school transport on the admission form'
                                  : null
                              "
                              ><button
                                type="button"
                                class="btn btn-ghost btn-xs"
                                [disabled]="r.transport?.opted === false"
                                (click)="allocating.set({ preset: r })"
                              >
                                <span>Allocate</span>
                              </button></span
                            >
                          }
                        </span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="8">
                      <rp-empty
                        icon="users"
                        [title]="
                          filtered()
                            ? 'No passengers match'
                            : 'No allocations for ' + (year()?.label ?? 'this year')
                        "
                        [text]="
                          filtered()
                            ? 'Try clearing the filters.'
                            : 'Allocate students and teachers to a route and stop.'
                        "
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (cursors().length > 1 || page()?.nextCursor) {
            <div class="pager">
              <span
                >Showing <b class="t-num">{{ rangeText() }}</b></span
              >
              <div class="pg">
                <button
                  type="button"
                  aria-label="Previous"
                  [disabled]="cursors().length <= 1 || loading()"
                  (click)="prev()"
                >
                  <rp-icon name="left" [size]="14" />
                </button>
                <button type="button" class="on" aria-current="page">{{ cursors().length }}</button>
                <button
                  type="button"
                  aria-label="Next"
                  [disabled]="!page()?.nextCursor || loading()"
                  (click)="next()"
                >
                  <rp-icon name="right" [size]="14" />
                </button>
              </div>
            </div>
          } @else if (items().length) {
            <div class="pager">
              <span>{{ plural(items().length, 'passenger') }}</span>
            </div>
          }
        }
      }
    </div>

    @if (allocating(); as a) {
      <rp-allocate-drawer
        [preset]="a.preset"
        [startKind]="kind()"
        [routes]="routes()"
        [year]="year()"
        (closed)="allocating.set(null)"
        (saved)="allocating.set(null); refresh()"
      />
    }
  `,
})
export class ConsoleAllocations {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly access = taskAccess(this.session, 'transport.view');
  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly effective = effective;
  protected readonly kindOptions: DropdownOption[] = [
    { v: 'STUDENT', l: 'Students' },
    { v: 'STAFF', l: 'Teachers and staff' },
  ];

  protected readonly kind = signal<Kind>('STUDENT');
  protected readonly assigned = signal<Assigned>('yes');
  protected readonly routeId = signal('');
  protected readonly q = signal('');
  protected readonly page = signal<AllocationPage | null>(null);
  /** The cursor of each page so far ('' for the first). */
  protected readonly cursors = signal<readonly string[]>(['']);
  protected readonly routes = signal<readonly Route[]>([]);
  private readonly vehicles = signal<readonly Vehicle[]>([]);
  private readonly assignments = signal<readonly Assignment[]>([]);
  /** Every current allocation of both kinds (the figures and the export). */
  protected readonly assignedAll = signal<readonly (AllocationRow & { kind: Kind })[]>([]);
  protected readonly year = signal<YearRef | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly allocating = signal<{ preset: AllocationRow | null } | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  protected readonly items = computed(() => this.page()?.items ?? []);
  protected readonly editWhy = computed(() => this.access.why('transport.edit'));
  protected readonly sub = computed(
    () =>
      `Which route and stop each student and teacher uses${this.year() ? ' · ' + this.year()!.label : ''}`,
  );
  protected readonly routeOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'All routes' },
    ...this.routes().map((r) => ({ v: r.id, l: `${r.code} · ${r.name}` })),
  ]);
  protected readonly activeCount = computed(() => {
    const t = today();
    const live = this.assignedAll().filter((x) => x.allocation && x.allocation.from <= t);
    return {
      students: live.filter((x) => x.kind === 'STUDENT').length,
      staff: live.filter((x) => x.kind === 'STAFF').length,
    };
  });
  protected readonly pills = computed(() => {
    const k = this.kind();
    const n = this.assignedAll().filter((x) => x.kind === k).length;
    return [
      { v: 'yes' as Assigned, l: 'Allocated', n: this.routeId() ? null : n },
      { v: 'no' as Assigned, l: 'Not allocated', n: null as number | null },
      { v: 'all' as Assigned, l: 'All', n: null as number | null },
    ];
  });
  /** The route most full against the largest vehicle on it now (the prototype's busy). */
  protected readonly busiest = computed(() => {
    const t = today();
    const cap = new Map(this.vehicles().map((v) => [v.id, v.capacity]));
    let best: { code: string; n: number; cap: number; u: number } | null = null;
    for (const r of this.routes()) {
      const seats = Math.max(
        0,
        ...this.assignments()
          .filter((a) => a.route.id === r.id && a.active && a.from <= t && a.to >= t)
          .map((a) => cap.get(a.vehicle.id) ?? 0),
      );
      if (!seats) continue;
      const u = pct(r.passengers, seats);
      if (!best || u > best.u) best = { code: r.code, n: r.passengers, cap: seats, u };
    }
    return best;
  });
  protected readonly filtered = computed(
    () => !!this.q().trim() || !!this.routeId() || this.assigned() !== 'yes',
  );
  protected readonly summary = computed(() => {
    const n = this.page()?.items.length ?? 0;
    return `${plural(n, 'passenger')}${this.page()?.nextCursor ? ' on this page' : ''}`;
  });
  protected readonly rangeText = computed(() => {
    const start = (this.cursors().length - 1) * 100 + 1;
    return `${num(start)}–${num(start + (this.page()?.items.length ?? 1) - 1)}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
    if (this.access.denied()) return;
    void this.load();
    void this.loadReference();
  }

  async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const a = this.assigned();
      const p = await this.api.allocations({
        kind: this.kind(),
        routeId: this.routeId(),
        assigned: a === 'yes' ? true : a === 'no' ? false : null,
        q: this.q(),
        cursor: this.cursors().at(-1) || null,
      });
      if (n !== this.seq) return;
      this.page.set(p);
      this.year.set(p.year);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  /** Routes, vehicles, assignments and every current allocation (the figures). */
  private async loadReference() {
    try {
      const [r, v, a] = await Promise.all([
        this.api.routes(),
        this.api.vehicles(),
        this.api.assignments(),
      ]);
      this.routes.set(r.items);
      this.vehicles.set(v.items);
      this.assignments.set(a.items);
    } catch {
      // The figures stay empty; the list shows its own error.
    }
    try {
      const all: (AllocationRow & { kind: Kind })[] = [];
      for (const kind of ['STUDENT', 'STAFF'] as const) {
        let cursor: string | null = null;
        for (let i = 0; i < 30; i++) {
          const p: AllocationPage = await this.api.allocations({ kind, assigned: true, cursor });
          all.push(...p.items.map((x) => ({ ...x, kind })));
          if (!p.nextCursor) break;
          cursor = p.nextCursor;
        }
      }
      this.assignedAll.set(all);
    } catch {
      // No figures.
    }
  }

  protected refresh() {
    this.cursors.set(['']);
    void this.load();
    void this.loadReference();
  }

  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.cursors.set(['']);
      void this.load();
    }, 300);
  }
  protected setAssigned(a: Assigned) {
    this.assigned.set(a);
    if (a === 'no') this.routeId.set('');
    this.cursors.set(['']);
    void this.load();
  }
  protected setKind(k: Kind) {
    this.kind.set(k);
    this.cursors.set(['']);
    void this.load();
  }
  protected setRoute(id: string) {
    this.routeId.set(id);
    if (id && this.assigned() === 'no') this.assigned.set('yes');
    this.cursors.set(['']);
    void this.load();
  }
  protected next() {
    const c = this.page()?.nextCursor;
    if (!c) return;
    this.cursors.update((l) => [...l, c]);
    void this.load();
  }
  protected prev() {
    if (this.cursors().length <= 1) return;
    this.cursors.update((l) => l.slice(0, -1));
    void this.load();
  }

  /** The student's transport choice on the admission form, when there is one (client 2026-10-12). */
  protected choice(r: AllocationRow) {
    return transportChoice(r);
  }
  protected name(r: AllocationRow) {
    return person(r.member.name);
  }
  /** CR-09: identifier and grade-section for students; the user type for staff. */
  protected detail(r: AllocationRow) {
    const m = r.member;
    if (!m.class) return m.admissionNo ?? m.type;
    return [m.admissionNo, `${m.class}${m.section ? ' ' + m.section : ''}`]
      .filter(Boolean)
      .join(' · ');
  }
  protected status(from: string, to: string) {
    return periodStatus(from, to, 'Active');
  }

  /** cc.al.end: the allocation ends today, with a reason kept on record (TRN-022). */
  protected async end(r: AllocationRow) {
    const a = r.allocation;
    if (!a || this.editWhy()) return;
    const res = await this.overlays.confirm({
      title: `End ${this.name(r)}'s allocation?`,
      text: `${a.route.code} from ${a.stop.name} ends today, ${formatDate(today())}. The reason is kept on record.`,
      ok: 'End allocation',
      tone: 'warn',
      reason: {
        label: 'Reason',
        placeholder: 'e.g. Family moving to Bhadravathi',
        min: 3,
        max: 200,
      },
    });
    if (!res || !res.reason) return;
    this.busy.set(r.member.id);
    try {
      await this.api.endAllocation(a.id, { endDate: today(), reason: res.reason });
      this.overlays.toast('Allocation ended', { sub: this.name(r) });
      this.refresh();
    } catch (e) {
      this.overlays.toast('Allocation not ended', { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set(null);
    }
  }

  /**
   * TRN-035: the family changed its mind after admission (client 2026-10-12) — the transport desk
   * marks the student opted for school transport, or not, with a reason kept on record.
   */
  protected async changeChoice(r: AllocationRow) {
    const t = r.transport;
    if (!t || this.editWhy()) return;
    const opted = !t.opted;
    const res = await this.overlays.confirm({
      title: opted
        ? `Mark ${this.name(r)} as opted for transport?`
        : `Mark ${this.name(r)} as not opted for transport?`,
      text: opted
        ? 'The family has asked for school transport after admission, so the student can be allocated a bus. The reason is kept on record.'
        : 'The family no longer wants school transport, so the student can’t be allocated a bus until marked opted again. The reason is kept on record.',
      ok: opted ? 'Mark opted' : 'Mark not opted',
      tone: opted ? undefined : 'warn',
      reason: {
        label: 'Reason',
        placeholder: 'e.g. Parent asked at the transport desk',
        min: 3,
        max: 200,
      },
    });
    if (!res || !res.reason) return;
    this.busy.set(r.member.id);
    try {
      await this.api.setTransportChoice(r.member.id, { opted, reason: res.reason });
      this.overlays.toast(opted ? 'Marked as opted for transport' : 'Marked as not opted', {
        sub: this.name(r),
      });
      this.refresh();
    } catch (e) {
      this.overlays.toast('Transport choice not changed', { sub: problemText(e), tone: 'bad' });
    } finally {
      this.busy.set(null);
    }
  }

  /** cc.al.export: every current allocation of the year. */
  protected export() {
    const rows = this.assignedAll();
    exportCsv(
      'passenger_allocations.csv',
      [
        'Passenger',
        'Type',
        'Admission no.',
        'Grade and section',
        'Route',
        'Stop',
        'From',
        'To',
        'Year',
      ],
      rows.map((r) => [
        this.name(r),
        r.kind === 'STUDENT' ? 'Student' : r.member.type,
        r.member.admissionNo ?? '',
        r.member.class ? `${r.member.class} ${r.member.section ?? ''}`.trim() : '',
        r.allocation?.route.code ?? '',
        r.allocation?.stop.name ?? '',
        r.allocation ? formatDate(r.allocation.from) : '',
        r.allocation ? formatDate(r.allocation.to) : '',
        this.year()?.label ?? '',
      ]),
    );
    this.overlays.toast('Allocations exported', { sub: `${plural(rows.length, 'row')} · CSV` });
  }
}
