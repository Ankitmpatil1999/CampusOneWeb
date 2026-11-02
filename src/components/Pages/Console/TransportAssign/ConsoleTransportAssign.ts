import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Pager } from '../../../Shared/Pager';
import { person } from '../Applications/app-format';
import { taskAccess } from '../Attendance/attendance-format';
import { plural } from '../Fees/fee-format';
import { num, problemText, t12 } from '../Structure/academic-format';
import type { YearRef } from '../Structure/academic-year';
import {
  TransportApi,
  type Assignment,
  type Crew,
  type Route,
  type Session,
  type Vehicle,
} from '../Transport/transport.api';
import { WEEKDAYS, effective, periodStatus } from '../Transport/transport-format';
import { AssignmentDrawer } from './AssignmentDrawer';
import { SessionDrawer } from './SessionDrawer';

type Tab = 'as' | 'ss';
const PAGE = 12;

/**
 * c.tassign — Sessions & assignments (SRS 22.11, 22.13, FR-TRN-03, BR-61; TRN-014…019; prototype
 * c.tassign): which vehicle and crew run each route and session over which dates (upcoming, current
 * or ended), and the pickup and drop sessions with their times and days; each opens its drawer.
 */
@Component({
  selector: 'rp-console-tassign',
  imports: [AssignmentDrawer, Empty, Icon, PageHead, Pager, SessionDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Sessions & assignments"
        sub="Pickup and drop sessions, and which vehicle and crew run each route"
      >
        @if (!access.denied()) {
          <span class="cp-why" [attr.title]="editWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="ta-new"
              [disabled]="!!editWhy() || !loaded()"
              (click)="tab() === 'as' ? openAssignment.set('new') : openSession.set('new')"
            >
              <rp-icon name="plus" [size]="17" /><span>{{
                tab() === 'as' ? 'New assignment' : 'Add session'
              }}</span>
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
        <div class="tabs" role="tablist" aria-label="Sessions and assignments">
          <button
            type="button"
            class="tab"
            role="tab"
            id="ta-tab-as"
            [class.on]="tab() === 'as'"
            [attr.aria-selected]="tab() === 'as'"
            (click)="tab.set('as')"
          >
            Vehicle assignments<span class="n">{{ num(assignments().length) }}</span>
          </button>
          <button
            type="button"
            class="tab"
            role="tab"
            id="ta-tab-ss"
            [class.on]="tab() === 'ss'"
            [attr.aria-selected]="tab() === 'ss'"
            (click)="tab.set('ss')"
          >
            Sessions<span class="n">{{ num(sessions().length) }}</span>
          </button>
        </div>

        @if (loading() && !loaded()) {
          <div class="sk" style="height: 320px; border-radius: 16px" aria-busy="true"></div>
        } @else if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load sessions and assignments" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (tab() === 'ss') {
          <div class="tbl-wrap">
            <table class="tbl" id="ss-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Direction</th>
                  <th>Time</th>
                  <th>Days</th>
                  <th class="r">Assignments</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (s of sessions(); track s.id) {
                  <tr
                    tabindex="0"
                    [attr.aria-label]="s.name"
                    (click)="openSession.set(s.id)"
                    (keydown.enter)="openSession.set(s.id)"
                  >
                    <td>
                      <b class="t-sb">{{ s.name }}</b>
                    </td>
                    <td>
                      <span [class]="'chip tone-' + (s.direction === 'PICKUP' ? 'brand' : 'accent')"
                        ><rp-icon
                          [name]="s.direction === 'PICKUP' ? 'arrowur' : 'arrowdl'"
                          [size]="12"
                        />{{ s.direction === 'PICKUP' ? 'Pickup' : 'Drop' }}</span
                      >
                    </td>
                    <td>
                      {{ t12(s.startTime) }}
                      @if (s.endTime) {
                        <div class="cell-s">until {{ t12(s.endTime) }}</div>
                      }
                    </td>
                    <td>
                      <div class="cc-days" [attr.aria-label]="daysLabel(s)">
                        @for (d of weekdays; track d.v) {
                          <span [class.on]="s.days.includes(d.v)">{{ d.l.slice(0, 2) }}</span>
                        }
                      </div>
                    </td>
                    <td class="r">{{ num(usedBy(s)) }}</td>
                    <td>
                      <span [class]="'chip dot tone-' + (s.active ? 'ok' : 'neutral')">{{
                        s.active ? 'Active' : 'Inactive'
                      }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6">
                      <rp-empty
                        icon="clock"
                        title="No sessions yet"
                        text="Add the pickup and drop runs with their times and days."
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (sessions().length) {
            <div class="pager">
              <span>{{ plural(sessions().length, 'session') }}</span>
            </div>
          }
        } @else {
          <div class="tbl-wrap">
            <table class="tbl" id="va-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Session</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Attendant</th>
                  <th>Effective</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (a of shown(); track a.id) {
                  <tr
                    tabindex="0"
                    [attr.aria-label]="a.route.code + ' ' + a.session.name"
                    (click)="openAssignment.set(a.id)"
                    (keydown.enter)="openAssignment.set(a.id)"
                  >
                    <td>
                      <span class="cc-rt">{{ a.route.code }}</span>
                      <span class="t-sm">{{ a.route.name }}</span>
                    </td>
                    <td>
                      {{ a.session.name }}
                      <div class="cell-s">
                        {{ t12(a.session.startTime) }} ·
                        {{ a.session.direction === 'PICKUP' ? 'Pickup' : 'Drop' }}
                      </div>
                    </td>
                    <td>{{ a.vehicle.name }}</td>
                    <td>{{ name(a.driver.name) }}</td>
                    <td>{{ a.attendant ? name(a.attendant.name) : '—' }}</td>
                    <td>{{ effective(a.from, a.to) }}</td>
                    <td>
                      <span [class]="'chip dot tone-' + status(a).tone">{{ status(a).l }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7">
                      <rp-empty
                        icon="clipboard"
                        title="No vehicle assignments yet"
                        text="Assign a vehicle and crew to each route and session."
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (assignments().length > pageSize) {
            <rp-pager
              [total]="assignments().length"
              [page]="page()"
              [size]="pageSize"
              (go)="page.set($event)"
            />
          } @else if (assignments().length) {
            <div class="pager">
              <span>{{ plural(assignments().length, 'assignment') }}</span>
            </div>
          }
        }
      }
    </div>

    @if (assignmentOpen(); as a) {
      <rp-assignment-drawer
        [assignment]="a === 'new' ? null : a"
        [routes]="routes()"
        [sessions]="sessions()"
        [vehicles]="vehicles()"
        [crew]="crew()"
        [year]="year()"
        [why]="editWhy()"
        (closed)="openAssignment.set(null)"
        (saved)="openAssignment.set(null); load()"
      />
    }
    @if (sessionOpen(); as s) {
      <rp-session-drawer
        [session]="s === 'new' ? null : s"
        [sessions]="sessions()"
        [used]="s === 'new' ? 0 : usedBy(s)"
        [why]="editWhy()"
        (closed)="openSession.set(null)"
        (saved)="openSession.set(null); load()"
      />
    }
  `,
})
export class ConsoleTransportAssign {
  private readonly api = inject(TransportApi);
  private readonly session = inject(SessionContext).console;

  protected readonly access = taskAccess(this.session, 'transport.view');
  protected readonly pageSize = PAGE;
  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly t12 = t12;
  protected readonly effective = effective;
  protected readonly weekdays = WEEKDAYS;

  protected readonly tab = signal<Tab>('as');
  protected readonly page = signal(1);
  protected readonly assignments = signal<readonly Assignment[]>([]);
  protected readonly sessions = signal<readonly Session[]>([]);
  protected readonly routes = signal<readonly Route[]>([]);
  protected readonly vehicles = signal<readonly Vehicle[]>([]);
  protected readonly crew = signal<readonly Crew[]>([]);
  protected readonly year = signal<YearRef | null>(null);
  protected readonly openAssignment = signal<string | null>(null);
  protected readonly openSession = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');

  protected readonly editWhy = computed(() => this.access.why('transport.edit'));
  protected readonly shown = computed(() =>
    this.assignments().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly assignmentOpen = computed<Assignment | 'new' | null>(() => {
    const id = this.openAssignment();
    if (id === 'new') return 'new';
    return id ? (this.assignments().find((a) => a.id === id) ?? null) : null;
  });
  protected readonly sessionOpen = computed<Session | 'new' | null>(() => {
    const id = this.openSession();
    if (id === 'new') return 'new';
    return id ? (this.sessions().find((s) => s.id === id) ?? null) : null;
  });

  constructor() {
    if (!this.access.denied()) void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [a, s, r, v, c, y] = await Promise.all([
        this.api.assignments(),
        this.api.sessions(),
        this.api.routes(),
        this.api.vehicles(),
        this.api.crew(),
        this.api.allocations({ kind: 'STAFF' }).catch(() => null),
      ]);
      this.assignments.set(a.items);
      this.sessions.set(s.items);
      this.routes.set(r.items);
      this.vehicles.set(v.items);
      this.crew.set(c.items);
      this.year.set(y?.year ?? null);
      this.error.set('');
      this.loaded.set(true);
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected name(n: string) {
    return person(n);
  }
  protected status(a: Assignment) {
    return a.active ? periodStatus(a.from, a.to) : { l: 'Inactive', tone: 'neutral' };
  }
  protected usedBy(s: Session) {
    return this.assignments().filter((a) => a.session.id === s.id).length;
  }
  protected daysLabel(s: Session) {
    return WEEKDAYS.filter((d) => s.days.includes(d.v))
      .map((d) => d.l)
      .join(', ');
  }
}
