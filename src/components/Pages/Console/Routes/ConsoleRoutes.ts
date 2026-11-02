import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Pager } from '../../../Shared/Pager';
import { taskAccess } from '../Attendance/attendance-format';
import { plural } from '../Fees/fee-format';
import { num, problemText, today } from '../Structure/academic-format';
import { TransportApi, type Assignment, type Route, type Stop } from '../Transport/transport.api';
import { activeChip, km } from '../Transport/transport-format';
import { RouteDrawer } from './RouteDrawer';
import { StopDrawer } from './StopDrawer';
import { TransportFeePanel } from './TransportFeePanel';

type Tab = 'rt' | 'sp' | 'fee';
const PAGE = 12;

/**
 * c.routes — Routes & stops (SRS 22.2, 22.4, 22.5, FR-TRN-01, BR-60; TRN-001…007; prototype c.routes):
 * the routes with their ordered stops, length, current sessions and passengers, and the stops
 * master; each opens its drawer (the route's ordered stop editor). Masters are made inactive, never
 * deleted (OI-TRN-29). The transport fee by distance has its own tab (client 2026-10-21).
 */
@Component({
  selector: 'rp-console-routes',
  imports: [Empty, Icon, PageHead, Pager, RouteDrawer, StopDrawer, TransportFeePanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Routes & stops"
        sub="Routes with their ordered stops, and the stops master"
      >
        @if (!access.denied() && tab() !== 'fee') {
          <span class="cp-why" [attr.title]="editWhy() || null"
            ><button
              type="button"
              class="btn btn-pri"
              id="rt-new"
              [disabled]="!!editWhy() || !loaded()"
              (click)="tab() === 'rt' ? openRoute.set('new') : openStop.set('new')"
            >
              <rp-icon name="plus" [size]="17" /><span>{{
                tab() === 'rt' ? 'Add route' : 'Add stop'
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
        <div class="tabs" role="tablist" aria-label="Routes and stops">
          <button
            type="button"
            class="tab"
            role="tab"
            id="rt-tab-rt"
            [class.on]="tab() === 'rt'"
            [attr.aria-selected]="tab() === 'rt'"
            (click)="tab.set('rt')"
          >
            Routes<span class="n">{{ num(routes().length) }}</span>
          </button>
          <button
            type="button"
            class="tab"
            role="tab"
            id="rt-tab-sp"
            [class.on]="tab() === 'sp'"
            [attr.aria-selected]="tab() === 'sp'"
            (click)="tab.set('sp')"
          >
            Stops<span class="n">{{ num(stops().length) }}</span>
          </button>
          <button
            type="button"
            class="tab"
            role="tab"
            id="rt-tab-fee"
            [class.on]="tab() === 'fee'"
            [attr.aria-selected]="tab() === 'fee'"
            (click)="tab.set('fee')"
          >
            Transport fee
          </button>
        </div>

        @if (loading() && !loaded()) {
          <div class="stack g12" aria-busy="true" aria-label="Loading">
            <div class="sk" style="height: 44px; border-radius: 12px"></div>
            <div class="sk" style="height: 320px; border-radius: 16px"></div>
          </div>
        } @else if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load routes and stops" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (tab() === 'fee') {
          <rp-transport-fee [routes]="routes()" [why]="feeWhy()" />
        } @else if (tab() === 'sp') {
          <div class="c-filters">
            <label class="search"
              ><rp-icon name="search" [size]="16" /><input
                type="search"
                id="sp-q"
                placeholder="Stop or landmark"
                aria-label="Search stops"
                autocomplete="off"
                [value]="q()"
                (input)="q.set(val($event)); page.set(1)"
            /></label>
            <span class="fsum">A stop on an active route can't be made inactive.</span>
          </div>
          <div class="tbl-wrap">
            <table class="tbl" id="sp-table">
              <thead>
                <tr>
                  <th>Stop</th>
                  <th>Landmark</th>
                  <th>Coordinates</th>
                  <th>Routes</th>
                  <th class="r">Passengers</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (s of stopsShown(); track s.id) {
                  <tr
                    tabindex="0"
                    [attr.aria-label]="s.name"
                    (click)="openStop.set(s.id)"
                    (keydown.enter)="openStop.set(s.id)"
                  >
                    <td>
                      <b class="t-sb">{{ s.name }}</b>
                    </td>
                    <td>{{ s.landmark ?? '' }}</td>
                    <td>
                      @if (s.lat !== null && s.lng !== null) {
                        <span class="t-mono t-sm">{{ coord(s.lat) }}, {{ coord(s.lng) }}</span>
                      } @else {
                        <span class="t-faint">—</span>
                      }
                    </td>
                    <td>
                      @if (routesOf(s).length) {
                        <div class="row g4 wrap">
                          @for (c of routesOf(s); track c) {
                            <span class="tag">{{ c }}</span>
                          }
                        </div>
                      } @else {
                        <span class="t-faint">Not on a route</span>
                      }
                    </td>
                    <td class="r">{{ num(stopPassengers().get(s.name) ?? 0) }}</td>
                    <td>
                      <span [class]="'chip dot tone-' + chip(s.active).tone">{{
                        chip(s.active).l
                      }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6">
                      <rp-empty
                        icon="pin"
                        [title]="stops().length ? 'No stops match' : 'No stops yet'"
                        [text]="
                          stops().length
                            ? 'Try a different search.'
                            : 'Add the stops your buses use.'
                        "
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (stopRows().length > pageSize) {
            <rp-pager
              [total]="stopRows().length"
              [page]="page()"
              [size]="pageSize"
              (go)="page.set($event)"
            />
          } @else if (stopRows().length) {
            <div class="pager">
              <span>{{ plural(stopRows().length, 'stop') }}</span>
            </div>
          }
        } @else {
          <div class="tbl-wrap">
            <table class="tbl" id="rt-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Route</th>
                  <th>Stops</th>
                  <th class="r">Length</th>
                  <th class="r">Sessions</th>
                  <th class="r">Passengers</th>
                  <th>Map</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (r of routes(); track r.id) {
                  <tr
                    tabindex="0"
                    [attr.aria-label]="r.code + ' ' + r.name"
                    (click)="openRoute.set(r.id)"
                    (keydown.enter)="openRoute.set(r.id)"
                  >
                    <td>
                      <span class="cc-rt">{{ r.code }}</span>
                    </td>
                    <td>
                      <b class="t-sb">{{ r.name }}</b>
                      <div class="cell-s">{{ r.description ?? '' }}</div>
                    </td>
                    <td>
                      {{ r.stops.length }}
                      @if (r.stops.length) {
                        <span class="t-xs t-muted"
                          >· {{ r.stops[0]!.stop.name }} →
                          {{ r.stops[r.stops.length - 1]!.stop.name }}</span
                        >
                      }
                    </td>
                    <td class="r">{{ km(r.distanceKm) }}</td>
                    <td class="r">{{ num(sessionsOf(r)) }}</td>
                    <td class="r">{{ num(r.passengers) }}</td>
                    <td>
                      @if (r.mapLink) {
                        <span class="chip tone-ok">Linked</span>
                      } @else {
                        <span class="t-faint">—</span>
                      }
                    </td>
                    <td>
                      <span [class]="'chip dot tone-' + chip(r.active).tone">{{
                        chip(r.active).l
                      }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="8">
                      <rp-empty
                        icon="route"
                        title="No routes yet"
                        text="Add a route with its stops in order."
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (routes().length) {
            <div class="pager">
              <span>{{ plural(routes().length, 'route') }}</span>
            </div>
          }
        }
      }
    </div>

    @if (routeOpen(); as r) {
      <rp-route-drawer
        [route]="r === 'new' ? null : r"
        [routes]="routes()"
        [stops]="stops()"
        [boarding]="openBoarding()"
        [why]="editWhy()"
        (closed)="openRoute.set(null)"
        (saved)="openRoute.set(null); load()"
      />
    }
    @if (stopOpen(); as s) {
      <rp-stop-drawer
        [stop]="s === 'new' ? null : s"
        [stops]="stops()"
        [routes]="routes()"
        [why]="editWhy()"
        (closed)="openStop.set(null)"
        (saved)="openStop.set(null); load()"
      />
    }
  `,
})
export class ConsoleRoutes {
  private readonly api = inject(TransportApi);
  private readonly session = inject(SessionContext).console;

  protected readonly access = taskAccess(this.session, 'transport.view');
  protected readonly pageSize = PAGE;
  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly km = km;

  protected readonly tab = signal<Tab>('rt');
  protected readonly q = signal('');
  protected readonly page = signal(1);
  protected readonly routes = signal<readonly Route[]>([]);
  protected readonly stops = signal<readonly Stop[]>([]);
  private readonly assignments = signal<readonly Assignment[]>([]);
  /** Allocations by route and stop ("R1 · name" → "stop" → count), from the allocation report. */
  private readonly allocation = signal<readonly { route: string; stop: string; n: number }[]>([]);
  protected readonly openRoute = signal<string | null>(null);
  protected readonly openStop = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');

  protected readonly editWhy = computed(() => this.access.why('transport.edit'));
  /** The rate per km is the Institution Administrator's (transport.fees). */
  protected readonly feeWhy = computed(() => {
    const why = this.access.why('transport.fees');
    return why && !this.access.management()
      ? 'Only the Institution Administrator sets the transport fee.'
      : why;
  });
  protected readonly stopRows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.stops().filter(
      (s) => !q || [s.name, s.landmark ?? ''].some((v) => v.toLowerCase().includes(q)),
    );
  });
  protected readonly stopsShown = computed(() =>
    this.stopRows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly stopPassengers = computed(() => {
    const m = new Map<string, number>();
    for (const a of this.allocation()) m.set(a.stop, (m.get(a.stop) ?? 0) + a.n);
    return m;
  });
  protected readonly routeOpen = computed<Route | 'new' | null>(() => {
    const id = this.openRoute();
    if (id === 'new') return 'new';
    return id ? (this.routes().find((r) => r.id === id) ?? null) : null;
  });
  protected readonly openBoarding = computed(() => {
    const r = this.routeOpen();
    return this.boardingOf(r === 'new' ? null : r);
  });
  protected readonly stopOpen = computed<Stop | 'new' | null>(() => {
    const id = this.openStop();
    if (id === 'new') return 'new';
    return id ? (this.stops().find((s) => s.id === id) ?? null) : null;
  });

  constructor() {
    if (!this.access.denied()) void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [r, s, a, al] = await Promise.all([
        this.api.routes(),
        this.api.stops(),
        this.api.assignments().catch(() => ({ items: [] as Assignment[] })),
        this.api.report('allocation', today(), today()).catch(() => null),
      ]);
      this.routes.set(r.items);
      this.stops.set(s.items);
      this.assignments.set(a.items);
      this.allocation.set(
        (al?.items ?? []).map((x) => ({
          route: String(x['route'] ?? ''),
          stop: String(x['stop'] ?? ''),
          n: Number(x['passengers'] ?? 0),
        })),
      );
      this.error.set('');
      this.loaded.set(true);
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected chip(active: boolean) {
    return activeChip(active);
  }
  protected coord(v: number) {
    return v.toFixed(3);
  }
  protected routesOf(s: Stop) {
    return this.routes()
      .filter((r) => r.stops.some((x) => x.stop.id === s.id))
      .map((r) => r.code);
  }
  /** Current assignments of the route (the prototype's Sessions column). */
  protected sessionsOf(r: Route) {
    const t = today();
    return this.assignments().filter((a) => a.route.id === r.id && a.active && a.to >= t).length;
  }
  /** Passengers boarding at each stop of the route. */
  private boardingOf(r: Route | null): ReadonlyMap<string, number> {
    if (!r) return new Map();
    const key = `${r.code} · ${r.name}`;
    return new Map(
      this.allocation()
        .filter((a) => a.route === key)
        .map((a) => [a.stop, a.n]),
    );
  }
}
