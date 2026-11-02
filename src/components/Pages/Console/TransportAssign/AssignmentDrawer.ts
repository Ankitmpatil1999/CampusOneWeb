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
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { addDays, problemText, t12, today } from '../Structure/academic-format';
import type { YearRef } from '../Structure/academic-year';
import {
  TransportApi,
  type Assignment,
  type Crew,
  type Route,
  type Session,
  type Vehicle,
} from '../Transport/transport.api';
import { assignmentLabel } from '../Transport/transport-format';

type Field = 'route' | 'session' | 'vehicle' | 'driver' | 'attendant' | 'from' | 'to';

/**
 * A vehicle assignment (prototype cc.va.edit / cc.va.save; TRN-017…019; FR-TRN-03, BR-61): a route
 * and session run by a vehicle with a driver and an attendant over dates inside the year. Once made,
 * the vehicle, crew, end date and whether it is active can change; the server refuses double-booking
 * the vehicle or crew in overlapping sessions, and the route-session pair twice.
 */
@Component({
  selector: 'rp-assignment-drawer',
  imports: [Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="assignment() ? label(assignment()!) : 'New vehicle assignment'"
      [sub]="sub()"
      icon="clipboard"
      [drawer]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="va-form">
        @if (why()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ why() }}</div>
          </div>
        }
        @if (error()) {
          <div class="note tone-bad" role="alert" id="va-err">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow"><b>Not saved.</b> {{ error() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="fld" [class.invalid]="err('route')">
            <label class="fld-l" for="va-r-b">Route<span class="req">*</span></label>
            <rp-dd
              inputId="va-r"
              placeholder="Choose a route"
              [options]="routeOptions()"
              [value]="route()"
              [disabled]="!!assignment() || !!why()"
              (changed)="route.set($event); clear('route')"
            />
            <div class="fld-e" id="va-r-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('route') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('session')">
            <label class="fld-l" for="va-s-b">Session<span class="req">*</span></label>
            <rp-dd
              inputId="va-s"
              placeholder="Choose a session"
              [options]="sessionOptions()"
              [value]="session()"
              [disabled]="!!assignment() || !!why()"
              (changed)="session.set($event); clear('session')"
            />
            <div class="fld-e" id="va-s-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('session') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('vehicle')">
            <label class="fld-l" for="va-v-b">Vehicle<span class="req">*</span></label>
            <rp-dd
              inputId="va-v"
              placeholder="Choose a vehicle"
              [options]="vehicleOptions()"
              [value]="vehicle()"
              [disabled]="!!why()"
              (changed)="vehicle.set($event); clear('vehicle')"
            />
            <div class="fld-e" id="va-v-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('vehicle') }}</span>
            </div>
          </div>
          <div></div>
          <div class="fld" [class.invalid]="err('driver')">
            <label class="fld-l" for="va-d-b">Driver<span class="req">*</span></label>
            <rp-dd
              inputId="va-d"
              placeholder="Choose a driver"
              [options]="driverOptions()"
              [value]="driver()"
              [disabled]="!!why()"
              (changed)="driver.set($event); clear('driver')"
            />
            <div class="fld-e" id="va-d-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('driver') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('attendant')">
            <label class="fld-l" for="va-a-b">Attendant<span class="opt">(optional)</span></label>
            <rp-dd
              inputId="va-a"
              placeholder="Choose an attendant"
              [options]="attendantOptions()"
              [value]="attendant()"
              [disabled]="!!why()"
              (changed)="attendant.set($event); clear('attendant')"
            />
            <div class="fld-e" id="va-a-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('attendant') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('from')">
            <label class="fld-l" for="va-f">Effective from<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="va-f"
                type="date"
                aria-describedby="va-f-e"
                [min]="year()?.startsOn ?? ''"
                [max]="year()?.endsOn ?? ''"
                [readOnly]="!!assignment() || !!why()"
                [value]="from()"
                (change)="from.set(val($event)); clear('from')"
              />
            </div>
            <div class="fld-e" id="va-f-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('from') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('to')">
            <label class="fld-l" for="va-t">Effective to<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="va-t"
                type="date"
                aria-describedby="va-t-e"
                [min]="from()"
                [max]="year()?.endsOn ?? ''"
                [readOnly]="!!why()"
                [value]="to()"
                (change)="to.set(val($event)); clear('to')"
              />
            </div>
            <div class="fld-e" id="va-t-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('to') }}</span>
            </div>
          </div>
          @if (assignment()) {
            <div class="full">
              <label class="chk"
                ><input
                  type="checkbox"
                  id="va-on"
                  [checked]="active()"
                  [disabled]="!!why()"
                  (change)="active.set(checked($event))"
                /><span>Active — trips are generated from this assignment</span></label
              >
            </div>
          }
        </div>
        <p class="t-xs t-muted">
          Rules (FR-TRN-03): the driver and attendant must differ; a vehicle, driver or attendant
          can't be on another session at the same time in an overlapping date range; a route can't
          run the same session twice in an overlapping range.
          @if (assignment()) {
            The route, session and start date stay as they are; end it by changing the 'to' date.
          }
        </p>
      </div>
      <div modal-foot class="cc-foot">
        @if (why()) {
          <button type="button" class="btn btn-sec" (click)="closed.emit()">
            <span>Close</span>
          </button>
        } @else {
          <span class="grow"></span>
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="va-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>{{
              assignment() ? 'Save assignment' : 'Create assignment'
            }}</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class AssignmentDrawer implements OnInit {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);

  readonly assignment = input<Assignment | null>(null);
  readonly routes = input<readonly Route[]>([]);
  readonly sessions = input<readonly Session[]>([]);
  readonly vehicles = input<readonly Vehicle[]>([]);
  readonly crew = input<readonly Crew[]>([]);
  /** The year in context (assignments are inside it). */
  readonly year = input<YearRef | null>(null);
  readonly why = input('');
  readonly closed = output<void>();
  readonly saved = output<Assignment>();

  protected readonly route = signal('');
  protected readonly session = signal('');
  protected readonly vehicle = signal('');
  protected readonly driver = signal('');
  protected readonly attendant = signal('');
  protected readonly from = signal(addDays(today(), 1));
  protected readonly to = signal('');
  protected readonly active = signal(true);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly sub = computed(() => {
    const a = this.assignment();
    return a
      ? `${a.vehicle.name} · ${formatDate(a.from)} – ${formatDate(a.to)}`
      : 'Route + session + vehicle + crew for a date range';
  });
  protected readonly routeOptions = computed<DropdownOption[]>(() =>
    this.routes().map((r) => ({
      v: r.id,
      l: `${r.code} · ${r.name}`,
      ...(r.active ? {} : { sub: 'Inactive' }),
    })),
  );
  protected readonly sessionOptions = computed<DropdownOption[]>(() =>
    this.sessions()
      .filter((s) => s.active || s.id === this.session())
      .map((s) => ({
        v: s.id,
        l: s.name,
        sub: `${s.direction === 'PICKUP' ? 'Pickup' : 'Drop'} · ${t12(s.startTime)}`,
      })),
  );
  protected readonly vehicleOptions = computed<DropdownOption[]>(() =>
    this.vehicles()
      .filter((v) => v.active || v.id === this.assignment()?.vehicle.id)
      .map((v) => ({ v: v.id, l: v.name, sub: `${v.registration} · ${v.capacity} seats` })),
  );
  protected readonly driverOptions = computed<DropdownOption[]>(() =>
    this.crew()
      .filter((c) => c.role === 'DRIVER' && (c.active || c.id === this.assignment()?.driver.id))
      .map((c) => ({ v: c.id, l: person(c.member.name), sub: c.licenceNo ?? '' })),
  );
  protected readonly attendantOptions = computed<DropdownOption[]>(() => [
    { v: '', l: 'No attendant' },
    ...this.crew()
      .filter(
        (c) => c.role === 'ATTENDANT' && (c.active || c.id === this.assignment()?.attendant?.id),
      )
      .map((c) => ({ v: c.id, l: person(c.member.name), sub: c.employeeRef })),
  ]);

  ngOnInit() {
    const a = this.assignment();
    if (!a) {
      const y = this.year();
      if (y?.endsOn) this.to.set(y.endsOn);
      if (y?.startsOn && this.from() < y.startsOn) this.from.set(y.startsOn);
      return;
    }
    this.route.set(a.route.id);
    this.session.set(a.session.id);
    this.vehicle.set(a.vehicle.id);
    this.driver.set(a.driver.id);
    this.attendant.set(a.attendant?.id ?? '');
    this.from.set(a.from);
    this.to.set(a.to);
    this.active.set(a.active);
  }

  protected label(a: Assignment) {
    return assignmentLabel(a);
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

  /** cc.va.save's checks (the conflicts are the server's, BR-61). */
  private validate() {
    const e: Partial<Record<Field, string>> = {};
    if (!this.route()) e.route = 'Choose a route';
    else if (!this.assignment() && !this.routes().find((r) => r.id === this.route())?.active)
      e.route = translate('TRN.ROUTE_INACTIVE');
    if (!this.session()) e.session = 'Choose a session';
    if (!this.vehicle()) e.vehicle = 'Choose a vehicle';
    if (!this.driver()) e.driver = 'Choose a driver';
    if (this.attendant() && this.attendant() === this.driver())
      e.attendant = translate('TRN.SAME_CREW');
    const y = this.year();
    if (!this.from()) e.from = 'Choose the start date';
    else if (y?.startsOn && y.endsOn && (this.from() < y.startsOn || this.from() > y.endsOn))
      e.from = `Choose a date within ${y.label}`;
    if (!this.to()) e.to = 'Choose the end date';
    else if (this.to() < this.from()) e.to = "The end date can't be before the start date";
    else if (y?.endsOn && this.to() > y.endsOn) e.to = `Choose a date within ${y.label}`;
    this.errors.set(e);
    return Object.values(e).every((x) => !x);
  }

  protected async save() {
    if (this.why() || !this.validate()) return;
    const a = this.assignment();
    this.busy.set(true);
    this.error.set('');
    try {
      let out: Assignment;
      if (a) {
        const changed: Record<string, unknown> = {};
        if (this.vehicle() !== a.vehicle.id) changed['vehicleId'] = this.vehicle();
        if (this.driver() !== a.driver.id) changed['driverId'] = this.driver();
        if ((this.attendant() || null) !== (a.attendant?.id ?? null))
          changed['attendantId'] = this.attendant() || null;
        if (this.to() !== a.to) changed['to'] = this.to();
        if (this.active() !== a.active) changed['active'] = this.active();
        if (!Object.keys(changed).length) {
          this.overlays.toast('No changes to save', { tone: 'info' });
          return;
        }
        out = await this.api.updateAssignment(a.id, a.version, changed);
      } else {
        out = await this.api.createAssignment({
          routeId: this.route(),
          sessionId: this.session(),
          vehicleId: this.vehicle(),
          driverId: this.driver(),
          attendantId: this.attendant() || null,
          from: this.from(),
          to: this.to(),
        });
      }
      this.overlays.toast(a ? 'Assignment saved' : 'Assignment created', {
        sub: `${assignmentLabel(out)} · ${out.vehicle.name} · trips from ${formatDate(out.from)}`,
      });
      this.saved.emit(out);
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 412) {
        this.error.set('Someone else changed this assignment. Close it and open it again.');
      } else if (e instanceof ApiProblem && e.errors.length) {
        const f = e.errors[0]!;
        const map: Readonly<Record<string, Field>> = {
          routeId: 'route',
          sessionId: 'session',
          vehicleId: 'vehicle',
          driverId: 'driver',
          attendantId: 'attendant',
          from: 'from',
          to: 'to',
        };
        const k = map[f.field];
        if (k) this.errors.update((x) => ({ ...x, [k]: f.message }));
        else this.error.set(f.message);
      } else {
        this.error.set(problemText(e));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
