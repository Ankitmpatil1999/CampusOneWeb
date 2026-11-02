import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { MapView, type MapPoint } from '../../../Shared/MapView';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Fees/fee-format';
import { problemText } from '../Structure/academic-format';
import { SearchSelect } from '../../../Shared/SearchSelect';
import { TransportApi, type Route, type Stop } from '../Transport/transport.api';
import { km } from '../Transport/transport-format';

type Field = 'code' | 'name' | 'map' | 'add';
interface Line {
  readonly stopId: string;
  readonly name: string;
  readonly landmark: string | null;
  readonly dist: string;
}

/**
 * Add or change a route with its ordered stops (prototype cc.rt.edit, redStops, cc.rs.*, cc.rt.save;
 * TRN-001…004; BR-60): code, name, description, active, the map link, and the stops in travel order
 * — each with its distance from the previous stop, moved up or down, removed (not while passengers
 * board there) or added once. The stop list is replaced whole, sequence 0… without gaps (22.16).
 * Maps (client 2026-10-21): the road distances can be calculated from the stops' places (then checked
 * and saved), each stop shows its distance from the school (what the transport fee uses), and the
 * route is drawn on a map.
 */
@Component({
  selector: 'rp-route-drawer',
  imports: [Icon, MapView, Modal, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="route() ? route()!.code + ' · ' + route()!.name : 'Add a route'"
      [sub]="sub()"
      icon="route"
      [drawer]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="rt-form">
        @if (why()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ why() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="fld" [class.invalid]="err('code')">
            <label class="fld-l" for="rt-c">Route code<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="rt-c"
                type="text"
                maxlength="10"
                autocomplete="off"
                aria-describedby="rt-c-e rt-c-h"
                [readOnly]="!!why()"
                [value]="code()"
                (input)="code.set(val($event)); clear('code')"
              />
            </div>
            <div class="fld-e" id="rt-c-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('code') }}</span>
            </div>
            <div class="fld-h" id="rt-c-h">Capital letters and digits, e.g. R5</div>
          </div>
          <div class="fld" [class.invalid]="err('name')">
            <label class="fld-l" for="rt-n">Route name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="rt-n"
                type="text"
                maxlength="80"
                autocomplete="off"
                aria-describedby="rt-n-e"
                [readOnly]="!!why()"
                [value]="name()"
                (input)="name.set(val($event)); clear('name')"
              />
            </div>
            <div class="fld-e" id="rt-n-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
            </div>
          </div>
          <div class="full">
            <div class="fld">
              <label class="fld-l" for="rt-d">Description<span class="opt">(optional)</span></label>
              <div class="fld-in">
                <input
                  id="rt-d"
                  type="text"
                  maxlength="200"
                  autocomplete="off"
                  [readOnly]="!!why()"
                  [value]="desc()"
                  (input)="desc.set(val($event))"
                />
              </div>
            </div>
          </div>
          <div class="full">
            <label class="chk"
              ><input
                type="checkbox"
                id="rt-a"
                [checked]="active()"
                [disabled]="!!why()"
                (change)="active.set(checked($event))"
              /><span>Active — trips are generated for this route</span></label
            >
          </div>
        </div>

        <div class="fs">
          <h4><rp-icon name="pin" [size]="16" />Stops in order</h4>
          <div class="fs-b">
            <div class="stack g8" id="rt-stops">
              @for (s of lines(); track s.stopId; let i = $index; let last = $last) {
                <div class="cc-rs">
                  <span class="sq">{{ i }}</span>
                  <div class="grow" style="min-width: 0">
                    <b class="t-sb t-clip" style="display: block">{{ s.name }}</b>
                    <span class="t-xs t-muted">{{ lineSub(i, s.landmark) }}</span>
                  </div>
                  <span class="cc-km">
                    @if (i === 0) {
                      <span class="t-xs t-muted">Start</span>
                    } @else {
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        [value]="s.dist"
                        [disabled]="!!why()"
                        aria-label="Distance from the previous stop in km"
                        (input)="setDist(i, $event)"
                      /><span>km</span>
                    }
                  </span>
                  @if (!why()) {
                    <div class="row g4">
                      <button
                        type="button"
                        class="iconbtn"
                        title="Move up"
                        aria-label="Move up"
                        [disabled]="i === 0"
                        (click)="move(i, -1)"
                      >
                        <rp-icon name="up" [size]="16" />
                      </button>
                      <button
                        type="button"
                        class="iconbtn"
                        title="Move down"
                        aria-label="Move down"
                        [disabled]="last"
                        (click)="move(i, 1)"
                      >
                        <rp-icon name="down" [size]="16" />
                      </button>
                      <button
                        type="button"
                        class="iconbtn"
                        title="Remove stop"
                        aria-label="Remove stop"
                        (click)="remove(i)"
                      >
                        <rp-icon name="x" [size]="16" />
                      </button>
                    </div>
                  }
                </div>
              }
              @if (!why()) {
                <div class="row g8">
                  <div class="fld grow" [class.invalid]="err('add')">
                    <rp-search-select
                      inputId="rs-add"
                      [placeholder]="
                        available().length ? 'Add a stop' : 'Every stop is on this route'
                      "
                      [options]="available()"
                      [value]="pick()"
                      [disabled]="!available().length"
                      (changed)="pick.set($event); clear('add')"
                    />
                    <div class="fld-e" id="rs-add-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err('add') }}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn btn-sec"
                    id="rs-add-go"
                    [disabled]="!available().length"
                    (click)="add()"
                  >
                    <rp-icon name="plus" [size]="17" /><span>Add</span>
                  </button>
                </div>
              }
              <p class="t-xs t-muted">
                @if (lines().length) {
                  Sequence 0–{{ lines().length - 1 }}, no gaps · {{ total() }} in total.
                }
                Distances are from the previous stop and can't be negative; a stop appears once
                (BR-60). The first stop is the school end: the transport fee is charged on each
                stop's distance from it.
              </p>
              @if (!why()) {
                <div class="row g8">
                  <span class="cp-why" [attr.title]="measureWhy() || null"
                    ><button
                      type="button"
                      class="btn btn-sec btn-sm"
                      id="rt-measure"
                      [class.is-busy]="measuring()"
                      [disabled]="!!measureWhy() || measuring()"
                      (click)="measure()"
                    >
                      <rp-icon name="route" [size]="15" /><span>Calculate road distances</span>
                    </button></span
                  >
                  @if (measureWhy()) {
                    <span class="t-xs t-muted">{{ measureWhy() }}</span>
                  }
                </div>
              }
            </div>
          </div>
        </div>

        <div class="fs">
          <h4><rp-icon name="image" [size]="16" />Route map</h4>
          <div class="fs-b stack g12">
            @if (mapPoints().length) {
              <rp-map
                [points]="mapPoints()"
                [path]="mapPath()"
                fitKey="open"
                [height]="260"
                label="The route on the map"
              />
            }
            <div class="fld" [class.invalid]="err('map')">
              <label class="fld-l" for="rt-m">Map link<span class="opt">(optional)</span></label>
              <div class="fld-in">
                <input
                  id="rt-m"
                  type="url"
                  maxlength="300"
                  placeholder="https://maps.google.com/…"
                  autocomplete="off"
                  aria-describedby="rt-m-e"
                  [readOnly]="!!why()"
                  [value]="map()"
                  (input)="map.set(val($event)); clear('map')"
                />
              </div>
              <div class="fld-e" id="rt-m-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('map') }}</span>
              </div>
            </div>
          </div>
        </div>

        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="cc-foot">
        @if (why()) {
          <button type="button" class="btn btn-sec" (click)="closed.emit()">
            <span>Close</span>
          </button>
        } @else {
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="rt-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>{{
              route() ? 'Save route' : 'Add route'
            }}</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class RouteDrawer implements OnInit {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);

  readonly route = input<Route | null>(null);
  readonly routes = input<readonly Route[]>([]);
  readonly stops = input<readonly Stop[]>([]);
  /** Passengers boarding at each stop of this route ("stop name" → count). */
  readonly boarding = input<ReadonlyMap<string, number>>(new Map());
  /** Why the user can't change routes ('' when they can). */
  readonly why = input('');
  readonly closed = output<void>();
  readonly saved = output<Route>();

  protected readonly code = signal('');
  protected readonly name = signal('');
  protected readonly desc = signal('');
  protected readonly map = signal('');
  protected readonly active = signal(true);
  protected readonly lines = signal<readonly Line[]>([]);
  protected readonly pick = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly sub = computed(() => {
    const r = this.route();
    return r
      ? `${plural(r.stops.length, 'stop')} · ${km(r.distanceKm)} · ${plural(r.passengers, 'passenger')}`
      : 'Code, name and the ordered stops';
  });
  protected readonly available = computed(() => {
    const on = new Set(this.lines().map((l) => l.stopId));
    return this.stops()
      .filter((s) => s.active && !on.has(s.id))
      .map((s) => ({ v: s.id, l: s.name, ...(s.landmark ? { sub: s.landmark } : {}) }));
  });
  protected readonly measuring = signal(false);
  /** The stops in order, on the map (the first is the school end). */
  protected readonly mapPoints = computed<MapPoint[]>(() => {
    const byId = new Map(this.stops().map((s) => [s.id, s]));
    return this.lines().flatMap((l, i) => {
      const s = byId.get(l.stopId);
      if (!s || s.lat === null || s.lng === null) return [];
      return [
        {
          id: l.stopId,
          lat: s.lat,
          lng: s.lng,
          kind: i === 0 ? ('school' as const) : ('stop' as const),
          title: `${i}. ${l.name}`,
        },
      ];
    });
  });
  protected readonly mapPath = computed(() =>
    this.mapPoints().map((p) => ({ lat: p.lat, lng: p.lng })),
  );
  /** Why the road distances can't be calculated now ('' when they can). */
  protected readonly measureWhy = computed(() => {
    const r = this.route();
    if (!r) return 'Save the route first, then calculate its distances.';
    const l = this.lines();
    if (l.length < 2) return 'Add at least two stops.';
    const saved = r.stops.map((s) => s.stop.id).join(',');
    if (saved !== l.map((x) => x.stopId).join(',')) return 'Save the new order of stops first.';
    return '';
  });
  protected readonly total = computed(() =>
    km(this.lines().reduce((n, l, i) => n + (i ? Number(l.dist) || 0 : 0), 0)),
  );

  ngOnInit() {
    const r = this.route();
    if (!r) return;
    this.code.set(r.code);
    this.name.set(r.name);
    this.desc.set(r.description ?? '');
    this.map.set(r.mapLink ?? '');
    this.active.set(r.active);
    this.lines.set(
      r.stops.map((s) => ({
        stopId: s.stop.id,
        name: s.stop.name,
        landmark: s.stop.landmark,
        dist: String(s.distanceKm),
      })),
    );
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }

  /** The landmark and, after the first stop, the distance from the school. */
  protected lineSub(i: number, landmark: string | null) {
    const from = this.lines()
      .slice(1, i + 1)
      .reduce((n, l) => n + (Number(l.dist) || 0), 0);
    return [
      landmark ?? '',
      i ? `${km(Math.round(from * 100) / 100)} from the school` : 'School end',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** TRN-038: road distances from the map service fill the boxes; the user checks and saves. */
  protected async measure() {
    const r = this.route();
    if (!r || this.measureWhy()) return;
    this.measuring.set(true);
    try {
      const out = await this.api.routeDistances(r.id);
      const by = new Map(out.items.map((x) => [x.stopId, x.distanceKm]));
      this.lines.update((l) =>
        l.map((x, i) => (i === 0 ? x : { ...x, dist: String(by.get(x.stopId) ?? x.dist) })),
      );
      this.overlays.toast('Road distances filled in', {
        sub: out.estimate
          ? `Straight-line estimates on this test server · ${km(out.totalKm)} in total. Check them, then save.`
          : `${km(out.totalKm)} in total. Check them, then save the route.`,
      });
    } catch (e) {
      this.overlays.toast("Distances weren't calculated", { sub: problemText(e), tone: 'bad' });
    } finally {
      this.measuring.set(false);
    }
  }

  protected setDist(i: number, e: Event) {
    const v = this.val(e);
    this.lines.update((l) => l.map((x, k) => (k === i ? { ...x, dist: v } : x)));
  }
  /** cc.rs.mv: the first stop always starts at 0 km. */
  protected move(i: number, d: number) {
    const j = i + d;
    const l = [...this.lines()];
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j]!, l[i]!];
    l[0] = { ...l[0]!, dist: '0' };
    this.lines.set(l);
  }
  /** cc.rs.rm: not while passengers board at the stop on this route. */
  protected remove(i: number) {
    const x = this.lines()[i];
    if (!x) return;
    const n = this.route() ? (this.boarding().get(x.name) ?? 0) : 0;
    if (n) {
      this.overlays.toast(`${x.name} can't be removed`, {
        sub: `${plural(n, 'passenger')} board there on this route — move them to another stop first.`,
        tone: 'bad',
      });
      return;
    }
    const l = this.lines().filter((_, k) => k !== i);
    if (l[0]) l[0] = { ...l[0], dist: '0' };
    this.lines.set(l);
  }
  /** cc.rs.add */
  protected add() {
    const id = this.pick();
    if (!id) {
      this.errors.update((e) => ({ ...e, add: 'Choose a stop to add' }));
      return;
    }
    const s = this.stops().find((x) => x.id === id);
    if (!s) return;
    this.lines.update((l) => [
      ...l,
      { stopId: s.id, name: s.name, landmark: s.landmark, dist: l.length ? '1' : '0' },
    ]);
    this.pick.set('');
  }

  /** cc.rt.save's checks. */
  private validate(): boolean {
    const e: Partial<Record<Field, string>> = {};
    const code = this.code().trim().toUpperCase();
    const id = this.route()?.id;
    if (!code) e.code = 'Enter a route code';
    else if (!/^[A-Z0-9-]{1,10}$/.test(code)) e.code = 'Use capital letters and digits only';
    else if (this.routes().some((r) => r.id !== id && r.code.toUpperCase() === code))
      e.code = `${code} is already used`;
    const name = this.name().trim();
    if (!name) e.name = 'Enter a route name';
    else if (name.length < 2 || name.length > 80) e.name = translate('TRN.NAME');
    const map = this.map().trim();
    if (map && !/^https:\/\/\S+$/i.test(map)) e.map = 'Use a link that starts with https://';
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) return false;
    const l = this.lines();
    const problems: string[] = [];
    if (l.length < 2) problems.push('A route needs at least two stops');
    l.forEach((s, i) => {
      const d = s.dist.trim();
      if (i && (d === '' || Number.isNaN(Number(d)) || Number(d) < 0))
        problems.push(`Distance to ${s.name} must be 0 km or more`);
    });
    if (problems.length) {
      this.overlays.toast('Check the stops', { sub: problems[0], tone: 'bad' });
      return false;
    }
    return true;
  }

  private stopsChanged(r: Route) {
    const l = this.lines();
    return (
      l.length !== r.stops.length ||
      l.some(
        (x, i) =>
          x.stopId !== r.stops[i]!.stop.id || (i > 0 && Number(x.dist) !== r.stops[i]!.distanceKm),
      )
    );
  }

  protected async save() {
    if (this.why() || !this.validate()) return;
    const r = this.route();
    const fields = {
      code: this.code().trim().toUpperCase(),
      name: this.name().trim(),
      description: this.desc().trim() || null,
      mapLink: this.map().trim() || null,
      active: this.active(),
    };
    if (r && !fields.active && r.active && r.passengers) {
      const ok = await this.overlays.confirm({
        title: 'Make this route inactive?',
        text: `${plural(r.passengers, 'passenger')} are allocated to it. No trips are generated for an inactive route, so reallocate them.`,
        ok: 'Make inactive',
        tone: 'warn',
      });
      if (!ok) return;
    }
    const stops = this.lines().map((s, i) => ({
      stopId: s.stopId,
      seq: i,
      distanceKm: i ? Math.round(Number(s.dist) * 100) / 100 : 0,
    }));
    this.busy.set(true);
    this.error.set('');
    try {
      let out: Route;
      if (r) {
        const changed: Record<string, unknown> = {};
        if (fields.code !== r.code) changed['code'] = fields.code;
        if (fields.name !== r.name) changed['name'] = fields.name;
        if (fields.description !== (r.description ?? null))
          changed['description'] = fields.description;
        if (fields.mapLink !== (r.mapLink ?? null)) changed['mapLink'] = fields.mapLink;
        if (fields.active !== r.active) changed['active'] = fields.active;
        out = Object.keys(changed).length
          ? await this.api.updateRoute(r.id, r.version, changed)
          : r;
        if (this.stopsChanged(r)) out = await this.api.setRouteStops(r.id, out.version, stops);
        if (out === r) {
          this.overlays.toast('No changes to save', { tone: 'info' });
          this.busy.set(false);
          return;
        }
      } else {
        out = await this.api.createRoute({ ...fields, type: 'MORNING' });
        out = await this.api.setRouteStops(out.id, out.version, stops);
      }
      this.overlays.toast(r ? 'Route saved' : 'Route added', {
        sub: `${out.code} · ${plural(out.stops.length, 'stop')} · ${km(out.distanceKm)}`,
      });
      this.saved.emit(out);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown) {
    if (e instanceof ApiProblem && e.status === 412) {
      this.error.set('Someone else changed this route. Close it and open it again.');
      return;
    }
    if (e instanceof ApiProblem && e.code === 'TRN.ROUTE_CODE_TAKEN') {
      this.errors.update((x) => ({ ...x, code: e.detail }));
      return;
    }
    if (e instanceof ApiProblem && e.errors.length) {
      const f = e.errors[0]!;
      if (f.field === 'code' || f.field === 'name') {
        this.errors.update((x) => ({ ...x, [f.field]: f.message }));
        return;
      }
      if (f.field === 'mapLink') {
        this.errors.update((x) => ({ ...x, map: f.message }));
        return;
      }
      this.error.set(f.message);
      return;
    }
    this.error.set(problemText(e));
  }
}
