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
import type { LatLng } from '../../../Utils/google-maps';
import { ApiProblem } from '../../../Utils/problem';
import { problemText } from '../Structure/academic-format';
import { TransportApi, type Route, type Stop } from '../Transport/transport.api';

type Field = 'name' | 'lat' | 'lng';
const FIELD: Readonly<Record<string, Field>> = { name: 'name', lat: 'lat', lng: 'lng' };

/**
 * Add or change a stop (prototype cc.sp.edit / cc.sp.save / cc.sp.del; TRN-005…007): name, landmark
 * and coordinates. A stop is never deleted — it is made inactive, which a stop on an active route
 * can't be (TRN.STOP_IN_USE). The place is picked on a Google map (client 2026-10-21) — a click or a
 * dragged pin fills the latitude and longitude — or typed.
 */
@Component({
  selector: 'rp-stop-drawer',
  imports: [Icon, MapView, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="stop()?.name ?? 'Add a stop'"
      [sub]="sub()"
      icon="pin"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="sp-form">
        @if (why()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ why() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="full">
            <div class="fld" [class.invalid]="err('name')">
              <label class="fld-l" for="sp-n">Stop name<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="sp-n"
                  type="text"
                  maxlength="80"
                  autocomplete="off"
                  aria-describedby="sp-n-e"
                  [readOnly]="!!why()"
                  [value]="name()"
                  (input)="name.set(val($event)); clear('name')"
                />
              </div>
              <div class="fld-e" id="sp-n-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
              </div>
            </div>
          </div>
          <div class="full">
            <div class="fld">
              <label class="fld-l" for="sp-l">Landmark<span class="opt">(optional)</span></label>
              <div class="fld-in">
                <input
                  id="sp-l"
                  type="text"
                  maxlength="100"
                  autocomplete="off"
                  [readOnly]="!!why()"
                  [value]="landmark()"
                  (input)="landmark.set(val($event))"
                />
              </div>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('lat')">
            <label class="fld-l" for="sp-la">Latitude<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="sp-la"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                aria-describedby="sp-la-e"
                [readOnly]="!!why()"
                [value]="lat()"
                (input)="lat.set(val($event)); clear('lat')"
              />
            </div>
            <div class="fld-e" id="sp-la-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('lat') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('lng')">
            <label class="fld-l" for="sp-lo">Longitude<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="sp-lo"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                aria-describedby="sp-lo-e"
                [readOnly]="!!why()"
                [value]="lng()"
                (input)="lng.set(val($event)); clear('lng')"
              />
            </div>
            <div class="fld-e" id="sp-lo-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('lng') }}</span>
            </div>
          </div>
        </div>
        <div class="stack g6">
          <rp-map
            [picker]="!why()"
            [points]="pickPoints()"
            [focus]="focusAt()"
            fitKey="open"
            [height]="260"
            label="Place the stop on the map"
            [hint]="
              why()
                ? ''
                : 'Click the map or drag the pin to place the stop; the latitude and longitude fill in. Other stops are shown as small circles.'
            "
            (picked)="pick($event)"
          />
        </div>
        @if (onRoutes().length) {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              This stop is on {{ onRoutes().join(', ') }}, so it can't be made inactive.
            </div>
          </div>
        }
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
          @if (stop(); as s) {
            <span class="cp-why" [attr.title]="toggleWhy() || null"
              ><button
                type="button"
                [class]="s.active ? 'btn btn-danger-o' : 'btn btn-sec'"
                id="sp-toggle"
                [disabled]="!!toggleWhy() || busy()"
                (click)="toggle()"
              >
                <rp-icon [name]="s.active ? 'xc' : 'checkc'" [size]="17" /><span>{{
                  s.active ? 'Make inactive' : 'Make active'
                }}</span>
              </button></span
            >
          }
          <span class="grow"></span>
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="sp-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>{{ stop() ? 'Save stop' : 'Add stop' }}</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class StopDrawer implements OnInit {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);

  readonly stop = input<Stop | null>(null);
  readonly stops = input<readonly Stop[]>([]);
  readonly routes = input<readonly Route[]>([]);
  /** Why the user can't change stops ('' when they can). */
  readonly why = input('');
  readonly closed = output<void>();
  readonly saved = output<Stop>();

  protected readonly name = signal('');
  protected readonly landmark = signal('');
  protected readonly lat = signal('13.930');
  protected readonly lng = signal('75.565');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  /** Active routes the stop is on (codes). */
  protected readonly onRoutes = computed(() => {
    const s = this.stop();
    if (!s) return [];
    return this.routes()
      .filter((r) => r.active && r.stops.some((x) => x.stop.id === s.id))
      .map((r) => r.code);
  });
  protected readonly sub = computed(() => {
    const s = this.stop();
    if (!s) return 'Stops master';
    const on = this.routes()
      .filter((r) => r.stops.some((x) => x.stop.id === s.id))
      .map((r) => r.code);
    return on.length ? `On ${on.join(', ')}` : 'Not on any route';
  });
  /** The place typed or picked, when it reads as a place. */
  private readonly place = computed<LatLng | null>(() => {
    const lat = Number(this.lat());
    const lng = Number(this.lng());
    if (!this.lat().trim() || !this.lng().trim() || !Number.isFinite(lat) || !Number.isFinite(lng))
      return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  });
  /** Where the map opens: the stop's place (fixed at opening, so a click doesn't re-zoom). */
  protected readonly focusAt = signal<LatLng | null>(null);
  protected readonly pickPoints = computed<MapPoint[]>(() => {
    const id = this.stop()?.id;
    const others: MapPoint[] = this.stops()
      .filter((s) => s.id !== id && s.lat !== null && s.lng !== null)
      .map((s) => ({ id: s.id, lat: s.lat!, lng: s.lng!, kind: 'done', title: s.name }));
    const p = this.place();
    return p
      ? [
          ...others,
          { id: 'pick', lat: p.lat, lng: p.lng, kind: 'pick', title: this.name() || 'New stop' },
        ]
      : others;
  });
  protected readonly toggleWhy = computed(() =>
    this.stop()?.active && this.onRoutes().length ? 'On an active route' : '',
  );

  ngOnInit() {
    const s = this.stop();
    if (s) {
      this.name.set(s.name);
      this.landmark.set(s.landmark ?? '');
      this.lat.set(s.lat === null ? '' : String(s.lat));
      this.lng.set(s.lng === null ? '' : String(s.lng));
    }
    this.focusAt.set(this.place());
  }

  /** A click on the map, or the pin dragged. */
  protected pick(p: LatLng) {
    if (this.why()) return;
    this.lat.set(p.lat.toFixed(6));
    this.lng.set(p.lng.toFixed(6));
    this.clear('lat');
    this.clear('lng');
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

  /** cc.sp.save's checks. */
  private validate() {
    const e: Partial<Record<Field, string>> = {};
    const name = this.name().trim();
    const id = this.stop()?.id;
    if (!name) e.name = 'Enter the stop name';
    else if (name.length < 2 || name.length > 80) e.name = 'Use 2–80 characters';
    else if (this.stops().some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase()))
      e.name = `${name} already exists`;
    const lat = this.lat().trim();
    const lng = this.lng().trim();
    if (!lat) e.lat = 'Enter the latitude';
    else if (!/^-?\d+(\.\d+)?$/.test(lat) || +lat < 6 || +lat > 37)
      e.lat = 'Latitude must be between 6 and 37 (India)';
    if (!lng) e.lng = 'Enter the longitude';
    else if (!/^-?\d+(\.\d+)?$/.test(lng) || +lng < 68 || +lng > 98)
      e.lng = 'Longitude must be between 68 and 98 (India)';
    this.errors.set(e);
    return Object.values(e).every((x) => !x);
  }

  protected async save() {
    if (this.why() || !this.validate()) return;
    const body = {
      name: this.name().trim(),
      landmark: this.landmark().trim() || null,
      lat: Number(this.lat()),
      lng: Number(this.lng()),
    };
    const s = this.stop();
    this.busy.set(true);
    this.error.set('');
    try {
      const out = s
        ? await this.api.updateStop(s.id, s.version, body)
        : await this.api.createStop(body);
      this.overlays.toast(s ? 'Stop saved' : 'Stop added', { sub: out.name });
      this.saved.emit(out);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  /** Never deleted: made inactive (or active again). */
  protected async toggle() {
    const s = this.stop();
    if (!s || this.toggleWhy()) return;
    if (s.active) {
      const ok = await this.overlays.confirm({
        title: `Make ${s.name} inactive?`,
        text: 'It stays in the stops master but can no longer be added to a route.',
        ok: 'Make inactive',
        tone: 'bad',
      });
      if (!ok) return;
    }
    this.busy.set(true);
    try {
      const out = await this.api.updateStop(s.id, s.version, { active: !s.active });
      this.overlays.toast(out.active ? 'Stop made active' : 'Stop made inactive', {
        sub: out.name,
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
      this.error.set('Someone else changed this stop. Close it and open it again.');
      return;
    }
    if (e instanceof ApiProblem && e.code === 'TRN.STOP_NAME_TAKEN') {
      this.errors.update((x) => ({ ...x, name: e.detail }));
      return;
    }
    if (e instanceof ApiProblem && e.errors.length) {
      const f: Partial<Record<Field, string>> = {};
      for (const x of e.errors) if (FIELD[x.field]) f[FIELD[x.field]!] = x.message;
      if (Object.keys(f).length) {
        this.errors.update((o) => ({ ...o, ...f }));
        return;
      }
    }
    this.error.set(problemText(e));
  }
}
