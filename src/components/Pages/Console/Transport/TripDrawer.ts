import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { MapView, type MapPoint } from '../../../Shared/MapView';
import { Modal } from '../../../Shared/Overlays';
import type { IconName } from '../../../Utils/icons';
import { formatTime } from '../../../Utils/format';
import { person } from '../Applications/app-format';
import { dlong } from '../Exams/exam-format';
import { plural } from '../Fees/fee-format';
import { problemText, t12 } from '../Structure/academic-format';
import { TransportApi, type Trip, type TripDetail, type TripEvent } from './transport.api';
import { STOP_STATUS, TRIP_STATUS } from './transport-format';

interface Line {
  readonly title: string;
  readonly note?: string;
  readonly sub: string;
  readonly state: 'done' | 'now' | 'bad' | '';
  readonly icon: IconName;
}

const FOLLOW_MS = 15_000;
const dot = (s: Line['state']): IconName => (s === 'done' ? 'check' : s === 'bad' ? 'x' : 'dot');

/**
 * A trip (prototype cc.trip.open; TRN-024): its route, session, vehicle and crew, the event timeline
 * from the crew app and the stops in travel order with their passengers; a scheduled trip can be
 * cancelled from the footer (BR-62). On the map (client 2026-10-21): the stops, the bus's latest
 * position from the crew's phone and its path, refreshed while the trip runs.
 */
@Component({
  selector: 'rp-trip-drawer',
  imports: [Empty, Icon, MapView, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @let t = view();
    <rp-modal
      [title]="t.route.code + ' · ' + t.session"
      [sub]="dlong(t.date) + ' · ' + t.vehicle.name + ' (' + t.vehicle.registration + ')'"
      icon="bus"
      [drawer]="true"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="trip-body">
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
        <div class="c-grid k2">
          <div class="fs">
            <h4><rp-icon name="bus" [size]="16" />Trip</h4>
            <div class="fs-b">
              <dl class="kv" id="trip-kv">
                <dt>Status</dt>
                <dd>
                  <span [class]="'chip dot tone-' + chip().tone">{{ chip().l }}</span>
                </dd>
                <dt>Route</dt>
                <dd>{{ t.route.name }}</dd>
                <dt>Session</dt>
                <dd>
                  {{ t.session }} · {{ t.direction === 'PICKUP' ? 'Pickup' : 'Drop' }} ·
                  {{ t12(t.plannedStart) }}
                </dd>
                <dt>Vehicle</dt>
                <dd>
                  {{ t.vehicle.name }} · {{ t.vehicle.registration }} ·
                  {{ t.vehicle.capacity }} seats
                </dd>
                <dt>Driver</dt>
                <dd>{{ t.driver }}</dd>
                <dt>Attendant</dt>
                <dd>{{ t.attendant ?? '—' }}</dd>
                @if (detail(); as d) {
                  <dt>Passengers</dt>
                  <dd>{{ d.boarded }} of {{ plural(d.passengers, 'passenger') }} boarded</dd>
                }
                <dt>Started</dt>
                <dd>{{ t.startedAt ? time(t.startedAt) : '—' }}</dd>
                <dt>Completed</dt>
                <dd>{{ t.completedAt ? time(t.completedAt) : '—' }}</dd>
                @if (t.cancelRemarks) {
                  <dt>Cancellation remarks</dt>
                  <dd>{{ t.cancelRemarks }}</dd>
                }
              </dl>
            </div>
          </div>
          <div class="fs">
            <h4><rp-icon name="activity" [size]="16" />Trip events</h4>
            <div class="fs-b">
              @if (loading()) {
                <div class="sk" style="height: 120px; border-radius: 10px" aria-busy="true"></div>
              } @else if (events().length) {
                <div class="tl" id="trip-events">
                  @for (e of events(); track $index) {
                    <div
                      class="tl-i"
                      [class.done]="e.state === 'done'"
                      [class.bad]="e.state === 'bad'"
                    >
                      <span class="tl-dot"
                        ><rp-icon [name]="e.icon" [size]="13" [stroke]="2.6"
                      /></span>
                      <div class="tl-c">
                        <div class="tl-t">{{ e.title }}</div>
                        <div class="tl-s">{{ e.sub }}</div>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <p class="t-sm t-muted">
                  No events yet. The crew starts the trip from the driver app.
                </p>
              }
            </div>
          </div>
        </div>
        @if (detail(); as d) {
          @if (mapPoints().length) {
            <div class="fs">
              <h4><rp-icon name="pin" [size]="16" />On the map</h4>
              <div class="fs-b stack g8">
                <rp-map
                  [points]="mapPoints()"
                  [path]="pathPoints()"
                  [trail]="trailPoints()"
                  [fitKey]="d.id"
                  [height]="300"
                  label="The trip on the map"
                />
                <p class="t-sm t-muted" id="trip-bus">{{ busLine() }}</p>
              </div>
            </div>
          }
        }
        <div class="fs">
          <h4><rp-icon name="route" [size]="16" />Stops</h4>
          <div class="fs-b">
            @if (loading()) {
              <div class="sk" style="height: 160px; border-radius: 10px" aria-busy="true"></div>
            } @else if (stops().length) {
              <div class="tl" id="trip-stops">
                @for (s of stops(); track $index) {
                  <div
                    class="tl-i"
                    [class.done]="s.state === 'done'"
                    [class.now]="s.state === 'now'"
                    [class.bad]="s.state === 'bad'"
                  >
                    <span class="tl-dot"
                      ><rp-icon [name]="s.icon" [size]="13" [stroke]="2.6"
                    /></span>
                    <div class="tl-c">
                      <div class="tl-t">
                        {{ s.title }}
                        @if (s.note) {
                          <span class="t-xs t-muted t-m">· {{ s.note }}</span>
                        }
                      </div>
                      <div class="tl-s">{{ s.sub }}</div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <rp-empty icon="route" title="No stops on this trip" />
            }
          </div>
        </div>
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-ghost" (click)="closed.emit()">
          <span>Close</span>
        </button>
        @if (t.status === 'SCHEDULED') {
          <span class="cp-why" [attr.title]="why() || null"
            ><button
              type="button"
              class="btn btn-danger-o"
              id="trip-cancel"
              [disabled]="!!why()"
              (click)="cancelTrip.emit(t)"
            >
              <rp-icon name="xc" [size]="17" /><span>Cancel trip</span>
            </button></span
          >
        }
      </div>
    </rp-modal>
  `,
})
export class TripDrawer implements OnInit {
  private readonly api = inject(TransportApi);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.timer) clearInterval(this.timer);
    });
  }

  readonly trip = input.required<Trip>();
  /** Why the trip can't be cancelled by this user ('' when it can). */
  readonly why = input('');
  readonly closed = output<void>();
  readonly cancelTrip = output<Trip>();

  protected readonly plural = plural;
  protected readonly t12 = t12;
  protected readonly dlong = dlong;
  protected readonly detail = signal<TripDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly view = computed<Trip>(() => this.detail() ?? this.trip());
  protected readonly chip = computed(() => {
    const s = TRIP_STATUS[this.view().status];
    return { l: s.l(), tone: s.tone };
  });
  /** The events, newest first (prototype: t.events reversed). */
  protected readonly events = computed<Line[]>(() => {
    const d = this.detail();
    if (!d) return [];
    return [...d.events]
      .filter((e) => e.event !== 'SCHEDULED')
      .reverse()
      .map((e) => {
        const state: Line['state'] =
          e.event === 'CANCELLED' || e.event === 'SKIPPED' ? 'bad' : 'done';
        return {
          title: this.eventText(d, e),
          sub: [e.at ? formatTime(e.at) : '', e.by ? person(e.by) : ''].filter(Boolean).join(' · '),
          state,
          icon: dot(state),
        };
      });
  });
  protected readonly stops = computed<Line[]>(() => {
    const d = this.detail();
    if (!d) return [];
    const next = d.status === 'STARTED' ? d.stops.find((s) => s.status === 'UPCOMING') : undefined;
    return d.stops.map((s) => {
      const state: Line['state'] =
        s.status === 'SKIPPED'
          ? 'bad'
          : s.status === 'REACHED' || s.status === 'DEPARTED'
            ? 'done'
            : s === next
              ? 'now'
              : '';
      const at = s.departedAt ?? s.reachedAt;
      return {
        title: s.stop.name,
        ...(s.stop.landmark ? { note: s.stop.landmark } : {}),
        sub: [
          STOP_STATUS[s.status].l(),
          at ? formatTime(at) : s.plannedTime ? `planned ${t12(s.plannedTime)}` : '',
          plural(s.passengers.length, 'passenger'),
          s.skipRemarks ?? '',
        ]
          .filter(Boolean)
          .join(' · '),
        state,
        icon: dot(state),
      };
    });
  });

  /** The stops placed on the map (passed ones greyed), the school end, and the bus. */
  protected readonly mapPoints = computed<MapPoint[]>(() => {
    const d = this.detail();
    if (!d) return [];
    const school = d.direction === 'PICKUP' ? d.stops.at(-1) : d.stops[0];
    const out: MapPoint[] = [];
    for (const s of d.stops) {
      if (s.stop.lat === null || s.stop.lat === undefined) continue;
      if (s.stop.lng === null || s.stop.lng === undefined) continue;
      const passed = s.status !== 'UPCOMING';
      out.push({
        id: 'stop:' + s.stop.id,
        lat: s.stop.lat,
        lng: s.stop.lng,
        kind: s === school ? 'school' : passed ? 'done' : 'stop',
        title: `${s.seq + 1}. ${s.stop.name}`,
      });
    }
    if (d.bus) {
      out.push({
        id: 'bus',
        lat: d.bus.lat,
        lng: d.bus.lng,
        kind: 'bus',
        title: d.vehicle.name,
        heading: d.bus.heading,
      });
    }
    return out;
  });
  protected readonly pathPoints = computed(() =>
    (this.detail()?.stops ?? [])
      .filter((s) => typeof s.stop.lat === 'number' && typeof s.stop.lng === 'number')
      .map((s) => ({ lat: s.stop.lat!, lng: s.stop.lng! })),
  );
  protected readonly trailPoints = computed(() =>
    (this.detail()?.trail ?? []).map(([lat, lng]) => ({ lat, lng })),
  );
  /** Where the bus was last seen, in words (the map is an aid). */
  protected readonly busLine = computed(() => {
    const d = this.detail();
    if (!d) return '';
    const km = d.kmRun ? `${d.kmRun.toFixed(1)} km run` : '';
    if (!d.bus) {
      if (d.status === 'STARTED') return "No position from the crew's phone yet.";
      return km ? `${km} on this trip.` : 'No positions were shared on this trip.';
    }
    return [
      d.bus.at ? `Bus last seen at ${formatTime(d.bus.at)}` : 'Bus position',
      d.bus.speedKmph !== null ? `${Math.round(d.bus.speedKmph)} km/h` : '',
      km,
    ]
      .filter(Boolean)
      .join(' · ');
  });

  ngOnInit() {
    void this.load();
  }

  async load(quiet = false) {
    if (!quiet) this.loading.set(true);
    try {
      const d = await this.api.trip(this.trip().id);
      this.detail.set(d);
      this.error.set('');
      if (d.status === 'STARTED' && !this.timer) {
        // Follow the bus while the trip runs (the phone shares every 15 seconds).
        this.timer = setInterval(() => void this.load(true), FOLLOW_MS);
      } else if (d.status !== 'STARTED' && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    } catch (e) {
      if (!quiet) this.error.set(problemText(e));
    } finally {
      if (!quiet) this.loading.set(false);
    }
  }

  protected time(iso: string) {
    return formatTime(iso);
  }

  private eventText(d: TripDetail, e: TripEvent) {
    const stop = e.seq !== null ? d.stops.find((s) => s.seq === e.seq)?.stop.name : undefined;
    const r = e.remarks ? ` — ${e.remarks}` : '';
    switch (e.event) {
      case 'STARTED':
        return 'Trip started';
      case 'REACHED':
        return `Reached ${stop ?? 'a stop'}`;
      case 'DEPARTED':
        return `Departed ${stop ?? 'a stop'}`;
      case 'SKIPPED':
        return `Skipped ${stop ?? 'a stop'}${r}`;
      case 'COMPLETED':
        return 'Trip completed';
      case 'CANCELLED':
        return `Trip cancelled${r}`;
      default:
        return 'Trip scheduled';
    }
  }
}
