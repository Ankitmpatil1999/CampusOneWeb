import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { MapView, type MapPoint } from '../../../Shared/MapView';
import { Overlays } from '../../../Shared/Overlays';
import { formatTime } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { taskAccess } from '../Attendance/attendance-format';
import { dlong } from '../Exams/exam-format';
import { plural } from '../Fees/fee-format';
import { addDays, num, problemText, t12, today, weekday } from '../Structure/academic-format';
import { TransportApi, type Trip, type TripDetail, type TripList } from './transport.api';
import { STOP_STATUS, TRIP_STATUS } from './transport-format';
import { TransportReports } from './TransportReports';
import { TripDrawer } from './TripDrawer';

type Tab = 'live' | 'day' | 'rep';
const PRI: Readonly<Record<Trip['status'], number>> = {
  STARTED: 0,
  SCHEDULED: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};
const REFRESH_MS = 30_000;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A trip card's line: the stops in travel order with their status, and where the bus is. */
interface Card {
  readonly t: Trip;
  readonly stops: readonly { name: string; status: string; title: string; left: number }[];
  readonly pct: number;
  readonly first: string;
  readonly last: string;
  readonly line: string;
  readonly done: number;
}

/**
 * c.transport — Live trips (SRS 22.17, 22.19, 22.21, FR-TRN-07, BR-62; TRN-023…026; prototype
 * c.transport): today's trips by session with their stop progress from the crew app (refreshed every
 * 30 seconds), a trip's drawer, cancelling a scheduled trip with remarks for the families, the daily
 * summary of the last seven days and the transport reports. Buses on the road are on a map (client
 * 2026-10-21), from the positions the crews' phones share.
 */
@Component({
  selector: 'rp-console-transport',
  imports: [Empty, Icon, Kpi, MapView, PageHead, TransportReports, TripDrawer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Live trips"
        sub="Today's trips by route and session, with stop progress from the crew app"
      />

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
        @if (loading() && !list()) {
          <div class="stack g16" aria-busy="true" aria-label="Loading">
            <div class="c-grid k4 cc-kp">
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="sk" style="height: 104px; border-radius: 16px"></div>
              }
            </div>
            <div class="sk" style="height: 44px; border-radius: 12px"></div>
            <div class="cc-trips">
              @for (i of [1, 2, 3]; track i) {
                <div class="sk" style="height: 210px; border-radius: 16px"></div>
              }
            </div>
          </div>
        } @else if (error() && !list()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load today's trips" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (list(); as l) {
          <div class="c-grid k4 cc-kp" id="trn-kpis">
            <rp-kpi
              label="Trips today"
              icon="bus"
              [value]="num(l.items.length)"
              [delta]="dlong(l.date)"
            />
            <rp-kpi
              label="On the road"
              icon="activity"
              tone="brand"
              [value]="num(l.counts.started)"
              [delta]="l.counts.started ? 'Live from the crew app' : 'None right now'"
            />
            <rp-kpi label="Completed" icon="checkc" tone="ok" [value]="num(l.counts.completed)" />
            <rp-kpi
              [label]="statusLabel('SCHEDULED')"
              icon="clock"
              tone="info"
              [value]="num(l.counts.scheduled)"
              [delta]="l.counts.cancelled ? l.counts.cancelled + ' cancelled' : 'None cancelled'"
            />
          </div>
          <div class="tabs" role="tablist" aria-label="Trips">
            @for (t of tabs; track t.v) {
              <button
                type="button"
                class="tab"
                role="tab"
                [id]="'trn-tab-' + t.v"
                [class.on]="tab() === t.v"
                [attr.aria-selected]="tab() === t.v"
                (click)="setTab(t.v)"
              >
                {{ t.l }}
                @if (t.v === 'live') {
                  <span class="n">{{ num(l.items.length) }}</span>
                }
              </button>
            }
          </div>

          @switch (tab()) {
            @case ('day') {
              <div class="c-filters">
                <div class="pills" role="group" aria-label="Day">
                  @for (d of days; track d.v) {
                    <button
                      type="button"
                      class="pill"
                      [class.on]="dayPick() === d.v"
                      [attr.aria-pressed]="dayPick() === d.v"
                      (click)="pickDay(d.v)"
                    >
                      {{ d.l }}
                    </button>
                  }
                </div>
                @if (dayList(); as dl) {
                  <span class="fsum"
                    >{{ plural(dl.items.length, 'trip') }} · {{ dl.counts.completed }} completed ·
                    {{ dl.counts.cancelled }} cancelled</span
                  >
                }
              </div>
              @if (dayLoading() && !dayList()) {
                <div class="sk" style="height: 260px; border-radius: 16px" aria-busy="true"></div>
              } @else if (dayError()) {
                <div class="card pad">
                  <rp-empty icon="alertc" title="Couldn't load the trips" [text]="dayError()">
                    <button type="button" class="btn btn-sec btn-sm" (click)="loadDay()">
                      <span>Try again</span>
                    </button>
                  </rp-empty>
                </div>
              } @else {
                <div class="tbl-wrap">
                  <table class="tbl" id="trn-day">
                    <thead>
                      <tr>
                        <th>Route</th>
                        <th>Session</th>
                        <th>Vehicle</th>
                        <th>Driver</th>
                        <th>Status</th>
                        <th class="r">Stops</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (t of dayRows(); track t.id) {
                        <tr
                          tabindex="0"
                          [attr.aria-label]="t.route.code + ' ' + t.session"
                          (click)="openTrip.set(t)"
                          (keydown.enter)="openTrip.set(t)"
                        >
                          <td>
                            <b class="t-sb">{{ t.route.code }}</b> {{ t.route.name }}
                          </td>
                          <td>
                            {{ t.session }}
                            <div class="cell-s">{{ t12(t.plannedStart) }}</div>
                          </td>
                          <td>{{ t.vehicle.name }}</td>
                          <td>{{ t.driver }}</td>
                          <td>
                            <span [class]="'chip dot tone-' + tone(t)">{{ label(t) }}</span>
                          </td>
                          <td class="r">{{ t.progress.passed }}/{{ t.progress.stops }}</td>
                          <td>
                            @if (t.cancelRemarks) {
                              <span class="t-sm">{{ t.cancelRemarks }}</span>
                            } @else {
                              <span class="t-faint">—</span>
                            }
                          </td>
                        </tr>
                      } @empty {
                        <tr>
                          <td colspan="7">
                            <rp-empty icon="bus" title="No trips on this day" />
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
            @case ('rep') {
              <rp-transport-reports />
            }
            @default {
              <div class="c-filters">
                <div class="pills" role="group" aria-label="Session">
                  @for (p of sessionPills(); track p.v) {
                    <button
                      type="button"
                      class="pill"
                      [class.on]="ses() === p.v"
                      [attr.aria-pressed]="ses() === p.v"
                      (click)="ses.set(p.v)"
                    >
                      {{ p.l }}
                      @if (p.n !== null) {
                        <span class="n">{{ num(p.n) }}</span>
                      }
                    </button>
                  }
                </div>
                <span class="fsum row g6"
                  ><rp-icon name="refresh" [size]="13" /> Updates as crews start trips and mark
                  stops
                  <button type="button" class="linkbtn" id="trn-refresh" (click)="load()">
                    Refresh
                  </button></span
                >
              </div>
              @if (onRoad().length) {
                <div class="card pad stack g8" id="trn-map">
                  <div class="row between g8">
                    <b class="t-h4">Buses on the road</b>
                    <span class="t-xs t-muted">{{ sharing() }}</span>
                  </div>
                  <rp-map
                    [points]="mapPoints()"
                    [fitKey]="mapKey()"
                    [height]="340"
                    label="Buses on the road"
                  />
                </div>
              }
              @if (cards().length) {
                <div class="cc-trips" id="trn-cards">
                  @for (c of cards(); track c.t.id) {
                    <div
                      class="card pad cc-trip"
                      [class.live]="c.t.status === 'STARTED'"
                      [class.cx]="c.t.status === 'CANCELLED'"
                    >
                      <div class="stack g4">
                        <div class="row between g8">
                          <div class="row g8" style="min-width: 0">
                            <span class="cc-rt">{{ c.t.route.code }}</span
                            ><b class="t-h4 t-clip">{{ c.t.route.name }}</b>
                          </div>
                          <span [class]="'chip dot tone-' + tone(c.t)">{{ label(c.t) }}</span>
                        </div>
                        <span class="t-xs t-muted t-clip"
                          >{{ c.t.session }} · {{ t12(c.t.plannedStart) }} ·
                          {{ c.t.vehicle.name }} · {{ c.t.driver }}</span
                        >
                      </div>
                      <div
                        class="cc-line"
                        role="img"
                        [attr.aria-label]="c.done + ' of ' + c.t.progress.stops + ' stops done'"
                      >
                        <i class="trk"></i><i class="fill" [style.width.%]="c.pct"></i>
                        @for (s of c.stops; track $index) {
                          <span
                            [class]="'st ' + s.status"
                            [style.left.%]="s.left"
                            [attr.title]="s.title"
                          ></span>
                        }
                        @if (c.t.status !== 'CANCELLED') {
                          <span class="bus" [style.left.%]="c.pct"
                            ><rp-icon name="bus" [size]="14"
                          /></span>
                        }
                      </div>
                      <div class="row between t-xs t-muted">
                        <span class="t-clip">{{ c.first }}</span
                        ><span class="t-clip" style="text-align: right">{{ c.last }}</span>
                      </div>
                      <div class="row between g8 t-sm">
                        <span class="t-muted t-clip">
                          @if (c.t.status === 'CANCELLED') {
                            <rp-icon name="xc" [size]="13" />
                          }
                          {{ c.line }}
                        </span>
                        <span class="t-num t-muted"
                          >{{ c.done }}/{{ c.t.progress.stops }} stops</span
                        >
                      </div>
                      <div class="t-xs t-muted">
                        @if (c.t.status === 'STARTED') {
                          {{ seen(c.t) }}
                        }
                      </div>
                      <div class="row g8">
                        <button
                          type="button"
                          class="btn btn-sec btn-sm"
                          (click)="openTrip.set(c.t)"
                        >
                          <span>Details</span>
                        </button>
                        @if (c.t.status !== 'CANCELLED') {
                          <span class="cp-why" [attr.title]="cancelWhy(c.t) || null"
                            ><button
                              type="button"
                              class="btn btn-ghost btn-sm"
                              [disabled]="!!cancelWhy(c.t)"
                              (click)="cancel(c.t)"
                            >
                              <rp-icon name="xc" [size]="15" /><span>Cancel trip</span>
                            </button></span
                          >
                        }
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <rp-empty
                  icon="bus"
                  title="No trips today"
                  text="Trips are generated at 00:10 for every active vehicle assignment effective today (FR-TRN-05)."
                />
              }
            }
          }
        }
      }
    </div>

    @if (openTrip(); as t) {
      <rp-trip-drawer
        [trip]="t"
        [why]="editWhy()"
        (closed)="openTrip.set(null)"
        (cancelTrip)="cancel($event)"
      />
    }
  `,
})
export class ConsoleTransport {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly access = taskAccess(this.session, 'transport.view');
  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly t12 = t12;
  protected readonly dlong = dlong;
  protected readonly tabs: readonly { v: Tab; l: string }[] = [
    { v: 'live', l: 'Live today' },
    { v: 'day', l: 'Daily summary' },
    { v: 'rep', l: 'Reports' },
  ];
  /** The last seven days, today first. */
  protected readonly days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today(), -i);
    return {
      v: d,
      l: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${DOW[weekday(d) - 1]} ${Number(d.slice(8))}`,
    };
  });

  protected readonly tab = signal<Tab>('live');
  protected readonly ses = signal('all');
  protected readonly list = signal<TripList | null>(null);
  private readonly details = signal<ReadonlyMap<string, TripDetail>>(new Map());
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly openTrip = signal<Trip | null>(null);
  protected readonly dayPick = signal(today());
  protected readonly dayList = signal<TripList | null>(null);
  protected readonly dayLoading = signal(false);
  protected readonly dayError = signal('');
  private seq = 0;

  protected readonly editWhy = computed(() => this.access.why('transport.edit'));
  protected readonly sessionPills = computed(() => {
    const items = this.list()?.items ?? [];
    const seen = new Map<string, { n: number; at: string }>();
    for (const t of items) {
      const s = seen.get(t.session) ?? { n: 0, at: t.plannedStart };
      seen.set(t.session, { n: s.n + 1, at: s.at });
    }
    return [
      { v: 'all', l: 'All sessions', n: null as number | null },
      ...[...seen.entries()]
        .sort((a, b) => a[1].at.localeCompare(b[1].at))
        .map(([name, s]) => ({ v: name, l: `${name} · ${t12(s.at)}`, n: s.n as number | null })),
    ];
  });
  protected readonly cards = computed<Card[]>(() => {
    const f = this.ses();
    return [...(this.list()?.items ?? [])]
      .filter((t) => f === 'all' || t.session === f)
      .sort(
        (a, b) =>
          PRI[a.status] - PRI[b.status] ||
          a.plannedStart.localeCompare(b.plannedStart) ||
          a.route.code.localeCompare(b.route.code, 'en', { numeric: true }),
      )
      .map((t) => this.card(t));
  });
  /** Trips on the road now. */
  protected readonly onRoad = computed(() =>
    (this.list()?.items ?? []).filter((t) => t.status === 'STARTED'),
  );
  protected readonly sharing = computed(() => {
    const n = this.onRoad().filter((t) => t.bus).length;
    const all = this.onRoad().length;
    return `${n} of ${all} ${all === 1 ? 'bus' : 'buses'} sharing a position`;
  });
  /** The buses, and the stops of their routes, for the map. */
  protected readonly mapPoints = computed<MapPoint[]>(() => {
    const out = new Map<string, MapPoint>();
    for (const t of this.onRoad()) {
      const d = this.details().get(t.id);
      for (const st of d?.stops ?? []) {
        if (typeof st.stop.lat !== 'number' || typeof st.stop.lng !== 'number') continue;
        out.set('stop:' + st.stop.id, {
          id: 'stop:' + st.stop.id,
          lat: st.stop.lat,
          lng: st.stop.lng,
          kind: 'stop',
          title: st.stop.name,
        });
      }
      if (t.bus) {
        out.set('bus:' + t.id, {
          id: 'bus:' + t.id,
          lat: t.bus.lat,
          lng: t.bus.lng,
          kind: 'bus',
          title: `${t.vehicle.name} · ${t.route.code} · ${t.session}`,
          heading: t.bus.heading,
        });
      }
    }
    return [...out.values()];
  });
  /** The map fits again only when the trips on the road change. */
  protected readonly mapKey = computed(() =>
    this.onRoad()
      .map((t) => t.id + (t.bus ? '+' : ''))
      .join(','),
  );
  protected readonly dayRows = computed(() =>
    [...(this.dayList()?.items ?? [])].sort(
      (a, b) =>
        a.plannedStart.localeCompare(b.plannedStart) ||
        a.route.code.localeCompare(b.route.code, 'en', { numeric: true }),
    ),
  );

  constructor() {
    if (this.access.denied()) return;
    void this.load();
    const timer = setInterval(() => {
      if (this.tab() === 'live' && document.visibilityState === 'visible') void this.load();
    }, REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Today's trips, and the stops of each (re-read for trips on the road). */
  async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const l = await this.api.trips();
      const have = this.details();
      const need = l.items.filter((t) => {
        const d = have.get(t.id);
        return !d || d.version !== t.version || t.status === 'STARTED';
      });
      const fresh = new Map(have);
      for (let i = 0; i < need.length; i += 4) {
        const got = await Promise.all(
          need.slice(i, i + 4).map((t) => this.api.trip(t.id).catch(() => null)),
        );
        for (const d of got) if (d) fresh.set(d.id, d);
      }
      if (n !== this.seq) return;
      this.details.set(fresh);
      this.list.set(l);
      if (this.dayPick() === l.date) this.dayList.set(l);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  async loadDay() {
    this.dayLoading.set(true);
    try {
      this.dayList.set(await this.api.trips({ date: this.dayPick() }));
      this.dayError.set('');
    } catch (e) {
      this.dayError.set(problemText(e));
    } finally {
      this.dayLoading.set(false);
    }
  }

  protected setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'day' && !this.dayList()) void this.loadDay();
    if (t === 'live') void this.load();
  }
  protected pickDay(d: string) {
    this.dayPick.set(d);
    this.dayList.set(null);
    void this.loadDay();
  }

  /** Where the bus was last seen, from the crew's phone. */
  protected seen(t: Trip) {
    if (!t.bus?.at) return "No position from the crew's phone yet";
    const km = t.kmRun ? ` · ${t.kmRun.toFixed(1)} km run` : '';
    return `Last seen ${formatTime(t.bus.at)}${km}`;
  }

  protected label(t: Trip) {
    return TRIP_STATUS[t.status].l();
  }
  protected tone(t: Trip) {
    return TRIP_STATUS[t.status].tone;
  }
  protected statusLabel(s: Trip['status']) {
    return TRIP_STATUS[s].l();
  }

  /** Why the trip can't be cancelled (BR-62: only a scheduled trip), '' when it can. */
  protected cancelWhy(t: Trip) {
    if (t.status === 'STARTED') return translate('TRN.TRIP_STARTED_CANCEL');
    if (t.status === 'COMPLETED') return translate('TRN.TRIP_COMPLETED_CANCEL');
    if (t.status === 'CANCELLED') return translate('TRN.TRIP_ALREADY_CANCELLED');
    return this.editWhy();
  }

  /** tripCard: the stop line, its ends and the status line. */
  private card(t: Trip): Card {
    const d = this.details().get(t.id);
    const stops = d?.stops ?? [];
    const n = stops.length;
    let at = -1;
    stops.forEach((s, k) => {
      if (s.status !== 'UPCOMING') at = k;
    });
    const pct = t.status === 'COMPLETED' ? 100 : n > 1 ? Math.max(0, (100 * at) / (n - 1)) : 0;
    const done = stops.filter((s) => s.status === 'REACHED' || s.status === 'DEPARTED').length;
    const skipped = stops.filter((s) => s.status === 'SKIPPED').length;
    const next = stops.find((s) => s.status === 'UPCOMING');
    const line =
      t.status === 'CANCELLED'
        ? (t.cancelRemarks ?? '')
        : t.status === 'STARTED' && next
          ? `Next: ${next.stop.name}`
          : t.status === 'COMPLETED'
            ? `Completed ${t.completedAt ? formatTime(t.completedAt) : ''}${skipped ? ` · ${skipped} skipped` : ''}`
            : `${plural(d?.passengers ?? 0, 'passenger')} · starts ${t12(t.plannedStart)}`;
    return {
      t,
      stops: stops.map((s, k) => ({
        name: s.stop.name,
        status: s.status.toLowerCase(),
        title: `${s.stop.name} · ${STOP_STATUS[s.status].l()}${s.reachedAt ? ' · ' + formatTime(s.reachedAt) : ''}`,
        left: n > 1 ? (100 * k) / (n - 1) : 0,
      })),
      pct,
      first: stops[0]?.stop.name ?? '',
      last: stops[n - 1]?.stop.name ?? '',
      line,
      done: d ? done : t.progress.passed,
    };
  }

  /** cc.trip.cancel: remarks for the families, then TRN-025. */
  protected async cancel(t: Trip) {
    const why = this.cancelWhy(t);
    if (why) {
      this.overlays.toast("This trip can't be cancelled", { sub: why, tone: 'bad' });
      return;
    }
    const d = this.details().get(t.id);
    const res = await this.overlays.confirm({
      title: `Cancel ${t.route.code} · ${t.session}?`,
      text: `${dlong(t.date)}, ${t12(t.plannedStart)}. ${plural(d?.passengers ?? 0, 'passenger')}' families get a transport alert with your remarks.`,
      ok: 'Cancel trip',
      cancel: 'Keep trip',
      tone: 'bad',
      reason: {
        label: 'Remarks (shared with families)',
        placeholder: 'e.g. Road closed for a procession — please arrange pick-up',
        min: 5,
        max: 300,
      },
    });
    if (!res || !res.reason) return;
    try {
      const out = await this.api.cancelTrip(t.id, res.reason);
      this.overlays.toast('Trip cancelled', {
        sub: `${out.route.code} · ${out.session} · families told`,
      });
      if (this.openTrip()?.id === t.id) this.openTrip.set(null);
      await this.load();
      if (this.tab() === 'day') void this.loadDay();
    } catch (e) {
      this.overlays.toast('Trip not cancelled', { sub: problemText(e), tone: 'bad' });
      void this.load();
    }
  }
}
