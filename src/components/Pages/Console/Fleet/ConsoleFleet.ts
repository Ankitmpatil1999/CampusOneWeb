import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Pager } from '../../../Shared/Pager';
import { formatDate } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { taskAccess } from '../Attendance/attendance-format';
import { plural } from '../Fees/fee-format';
import { num, problemText, today } from '../Structure/academic-format';
import {
  TransportApi,
  type Assignment,
  type Crew,
  type Route,
  type Vehicle,
} from '../Transport/transport.api';
import { activeChip, assignmentLabel } from '../Transport/transport-format';
import { CrewDrawer } from './CrewDrawer';
import { VehicleDrawer } from './VehicleDrawer';

type Tab = 'v' | 'c';
const PAGE = 12;

/**
 * c.fleet — Vehicles & crew (SRS 22.7, 22.8, FR-TRN-02, BR-60; TRN-008…013; prototype c.fleet): the
 * buses and vans with their assignments and peak passengers against the seats, and the drivers and
 * attendants with their licences and assignments; each opens its drawer.
 */
@Component({
  selector: 'rp-console-fleet',
  imports: [Avatar, CrewDrawer, Empty, Icon, PageHead, Pager, VehicleDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head title="Vehicles & crew" sub="Buses and vans, drivers and attendants">
        @if (!access.denied()) {
          <span class="cp-why" [attr.title]="editWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="fl-new"
              [disabled]="!!editWhy() || !loaded()"
              (click)="tab() === 'v' ? openVehicle.set('new') : openCrew.set('new')"
            >
              <rp-icon name="plus" [size]="17" /><span>{{
                tab() === 'v' ? 'Add vehicle' : 'Add crew member'
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
        <div class="tabs" role="tablist" aria-label="Vehicles and crew">
          <button
            type="button"
            class="tab"
            role="tab"
            id="fl-tab-v"
            [class.on]="tab() === 'v'"
            [attr.aria-selected]="tab() === 'v'"
            (click)="tab.set('v')"
          >
            Vehicles<span class="n">{{ num(vehicles().length) }}</span>
          </button>
          <button
            type="button"
            class="tab"
            role="tab"
            id="fl-tab-c"
            [class.on]="tab() === 'c'"
            [attr.aria-selected]="tab() === 'c'"
            (click)="tab.set('c'); page.set(1)"
          >
            Crew<span class="n">{{ num(crew().length) }}</span>
          </button>
        </div>

        @if (loading() && !loaded()) {
          <div class="sk" style="height: 320px; border-radius: 16px" aria-busy="true"></div>
        } @else if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load vehicles and crew" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (tab() === 'c') {
          <div class="tbl-wrap">
            <table class="tbl" id="cw-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Licence</th>
                  <th>Employee ref.</th>
                  <th>Assignments</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (c of crewShown(); track c.id) {
                  <tr
                    tabindex="0"
                    [attr.aria-label]="name(c)"
                    (click)="openCrew.set(c.id)"
                    (keydown.enter)="openCrew.set(c.id)"
                  >
                    <td>
                      <div class="cell-main">
                        <rp-av [name]="name(c)" size="sm" />
                        <div style="min-width: 0">
                          <div class="cell-t t-clip">{{ name(c) }}</div>
                          <div class="cell-s t-clip" [class.t-bad]="c.licenceExpired">
                            {{ licenceLine(c) }}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span [class]="'chip tone-' + (c.role === 'DRIVER' ? 'brand' : 'violet')">{{
                        c.role === 'DRIVER' ? 'Driver' : 'Attendant'
                      }}</span>
                    </td>
                    <td>
                      @if (c.licenceNo) {
                        <span class="t-mono t-sm" style="white-space: nowrap">{{
                          c.licenceNo
                        }}</span>
                      } @else {
                        <span class="t-faint">Not needed</span>
                      }
                    </td>
                    <td>
                      <span class="t-mono t-sm">{{ c.employeeRef }}</span>
                    </td>
                    <td>
                      @if (crewAssignments(c).length) {
                        <span class="t-sm">{{ crewAssignments(c).join(', ') }}</span>
                      } @else {
                        <span class="t-faint">None</span>
                      }
                    </td>
                    <td>
                      <span [class]="'chip dot tone-' + chip(c.active).tone">{{
                        chip(c.active).l
                      }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6">
                      <rp-empty
                        icon="idcard"
                        title="No crew yet"
                        text="Add the drivers and attendants who run the buses."
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (crew().length > pageSize) {
            <rp-pager
              [total]="crew().length"
              [page]="page()"
              [size]="pageSize"
              (go)="page.set($event)"
            />
          } @else if (crew().length) {
            <div class="pager">
              <span>{{ plural(crew().length, 'crew member') }}</span>
            </div>
          }
        } @else {
          <div class="tbl-wrap">
            <table class="tbl" id="vh-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Registration</th>
                  <th class="r">Seats</th>
                  <th>Assignments</th>
                  <th class="r">Peak passengers</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (v of vehicles(); track v.id) {
                  <tr
                    tabindex="0"
                    [attr.aria-label]="v.name"
                    (click)="openVehicle.set(v.id)"
                    (keydown.enter)="openVehicle.set(v.id)"
                  >
                    <td>
                      <div class="row g8">
                        <span class="li-ic sm"><rp-icon name="bus" [size]="16" /></span
                        ><b class="t-sb">{{ v.name }}</b>
                      </div>
                    </td>
                    <td>
                      <span class="t-mono">{{ v.registration }}</span>
                    </td>
                    <td class="r">{{ v.capacity }}</td>
                    <td>
                      @if (vehicleAssignments(v).length) {
                        <span class="t-sm">{{ vehicleAssignments(v).join(', ') }}</span>
                      } @else {
                        <span class="t-faint">Not assigned</span>
                      }
                    </td>
                    <td class="r">
                      {{ num(peak(v)) }}
                      @if (peak(v) > v.capacity) {
                        <span class="t-bad t-xs">over capacity</span>
                      }
                    </td>
                    <td>
                      <span [class]="'chip dot tone-' + chip(v.active).tone">{{
                        chip(v.active).l
                      }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6">
                      <rp-empty
                        icon="bus"
                        title="No vehicles yet"
                        text="Add the school's buses and vans."
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (vehicles().length) {
            <div class="pager">
              <span>{{ plural(vehicles().length, 'vehicle') }}</span>
            </div>
          }
        }
      }
    </div>

    @if (vehicleOpen(); as v) {
      <rp-vehicle-drawer
        [vehicle]="v === 'new' ? null : v"
        [vehicles]="vehicles()"
        [assignments]="assignments()"
        [peak]="v === 'new' ? 0 : peak(v)"
        [why]="editWhy()"
        (closed)="openVehicle.set(null)"
        (saved)="openVehicle.set(null); load()"
      />
    }
    @if (crewOpen(); as c) {
      <rp-crew-drawer
        [crew]="c === 'new' ? null : c"
        [all]="crew()"
        [assignments]="assignments()"
        [why]="editWhy()"
        (closed)="openCrew.set(null)"
        (saved)="openCrew.set(null); load()"
      />
    }
  `,
})
export class ConsoleFleet {
  private readonly api = inject(TransportApi);
  private readonly session = inject(SessionContext).console;

  protected readonly access = taskAccess(this.session, 'transport.view');
  protected readonly pageSize = PAGE;
  protected readonly num = num;
  protected readonly plural = plural;

  protected readonly tab = signal<Tab>('v');
  protected readonly page = signal(1);
  protected readonly vehicles = signal<readonly Vehicle[]>([]);
  protected readonly crew = signal<readonly Crew[]>([]);
  protected readonly assignments = signal<readonly Assignment[]>([]);
  private readonly routes = signal<readonly Route[]>([]);
  protected readonly openVehicle = signal<string | null>(null);
  protected readonly openCrew = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');

  protected readonly editWhy = computed(() => this.access.why('transport.edit'));
  protected readonly crewShown = computed(() =>
    this.crew().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly vehicleOpen = computed<Vehicle | 'new' | null>(() => {
    const id = this.openVehicle();
    if (id === 'new') return 'new';
    return id ? (this.vehicles().find((v) => v.id === id) ?? null) : null;
  });
  protected readonly crewOpen = computed<Crew | 'new' | null>(() => {
    const id = this.openCrew();
    if (id === 'new') return 'new';
    return id ? (this.crew().find((c) => c.id === id) ?? null) : null;
  });
  private readonly passengers = computed(
    () => new Map(this.routes().map((r) => [r.id, r.passengers])),
  );

  constructor() {
    if (!this.access.denied()) void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [v, c, a, r] = await Promise.all([
        this.api.vehicles(),
        this.api.crew(),
        this.api.assignments(),
        this.api.routes(),
      ]);
      this.vehicles.set(v.items);
      this.crew.set(c.items);
      this.assignments.set(a.items);
      this.routes.set(r.items);
      this.error.set('');
      this.loaded.set(true);
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected chip(active: boolean) {
    return activeChip(active);
  }
  protected name(c: Crew) {
    return person(c.member.name);
  }
  protected licenceLine(c: Crew) {
    if (c.role !== 'DRIVER' || !c.licenceExpiry)
      return c.role === 'DRIVER' ? 'Driver' : 'Attendant';
    return c.licenceExpired
      ? `Licence expired ${formatDate(c.licenceExpiry)}`
      : `Licence valid till ${formatDate(c.licenceExpiry)}`;
  }
  /** Assignments not yet ended (the prototype's vAssigns / cAssigns). */
  private live(a: Assignment) {
    return a.active && a.to >= today();
  }
  protected vehicleAssignments(v: Vehicle) {
    return this.assignments()
      .filter((a) => a.vehicle.id === v.id && this.live(a))
      .map(assignmentLabel);
  }
  protected crewAssignments(c: Crew) {
    return this.assignments()
      .filter((a) => (a.driver.id === c.id || a.attendant?.id === c.id) && this.live(a))
      .map(assignmentLabel);
  }
  /** vehPax: the most passengers of a route the vehicle runs now. */
  protected peak(v: Vehicle) {
    const t = today();
    return Math.max(
      0,
      ...this.assignments()
        .filter((a) => a.vehicle.id === v.id && a.active && a.from <= t && a.to >= t)
        .map((a) => this.passengers().get(a.route.id) ?? 0),
    );
  }
}
