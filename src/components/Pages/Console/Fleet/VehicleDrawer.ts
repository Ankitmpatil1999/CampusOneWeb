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
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { formatDate } from '../../../Utils/format';
import { plural } from '../Fees/fee-format';
import { problemText, today } from '../Structure/academic-format';
import { TransportApi, type Assignment, type Vehicle } from '../Transport/transport.api';
import { assignmentLabel } from '../Transport/transport-format';

type Field = 'name' | 'seats' | 'reg';
const normReg = (x: string) => x.toUpperCase().replace(/[\s-]/g, '');

/**
 * Add or change a vehicle (prototype cc.vh.edit / cc.vh.save; TRN-008…010; BR-60): bus number, seats,
 * a unique registration and whether it is active. A vehicle is never deleted; one on a current
 * assignment can't be made inactive.
 */
@Component({
  selector: 'rp-vehicle-drawer',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="vehicle()?.name ?? 'Add a vehicle'"
      [sub]="vehicle()?.registration ?? 'Registration must be unique'"
      icon="bus"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="vh-form">
        @if (why()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ why() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="fld" [class.invalid]="err('name')">
            <label class="fld-l" for="vh-b">Bus number<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="vh-b"
                type="text"
                maxlength="80"
                placeholder="e.g. Bus 11"
                autocomplete="off"
                aria-describedby="vh-b-e"
                [readOnly]="!!why()"
                [value]="name()"
                (input)="name.set(val($event)); clear('name')"
              />
            </div>
            <div class="fld-e" id="vh-b-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('seats')">
            <label class="fld-l" for="vh-c">Seats<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="vh-c"
                type="number"
                min="1"
                max="200"
                inputmode="numeric"
                aria-describedby="vh-c-e"
                [readOnly]="!!why()"
                [value]="seats()"
                (input)="seats.set(val($event)); clear('seats')"
              />
            </div>
            <div class="fld-e" id="vh-c-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('seats') }}</span>
            </div>
          </div>
          <div class="full">
            <div class="fld" [class.invalid]="err('reg')">
              <label class="fld-l" for="vh-r">Registration number<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="vh-r"
                  type="text"
                  maxlength="15"
                  placeholder="KA-14-F-2231"
                  autocomplete="off"
                  aria-describedby="vh-r-e"
                  [readOnly]="!!why()"
                  [value]="reg()"
                  (input)="reg.set(val($event)); clear('reg')"
                />
              </div>
              <div class="fld-e" id="vh-r-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('reg') }}</span>
              </div>
            </div>
          </div>
          <div class="full">
            <label class="chk"
              ><input
                type="checkbox"
                id="vh-a"
                [checked]="active()"
                [disabled]="!!why()"
                (change)="active.set(checked($event))"
              /><span>Active</span></label
            >
          </div>
        </div>
        @if (mine().length) {
          <div class="fs">
            <h4><rp-icon name="clipboard" [size]="16" />Assigned to</h4>
            <div class="fs-b">
              @for (a of mine(); track a.id) {
                <div class="row between t-sm" style="padding: 5px 0">
                  <b>{{ label(a) }}</b
                  ><span class="t-muted">{{ fmt(a.from) }} – {{ fmt(a.to) }}</span>
                </div>
              }
              <p class="t-xs t-muted mt8">
                A vehicle on a current assignment can't be made inactive.
              </p>
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
          <span class="grow"></span>
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="vh-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>{{
              vehicle() ? 'Save vehicle' : 'Add vehicle'
            }}</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class VehicleDrawer implements OnInit {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);

  readonly vehicle = input<Vehicle | null>(null);
  readonly vehicles = input<readonly Vehicle[]>([]);
  readonly assignments = input<readonly Assignment[]>([]);
  /** Peak passengers of the vehicle's current routes (the over-capacity warning). */
  readonly peak = input(0);
  readonly why = input('');
  readonly closed = output<void>();
  readonly saved = output<Vehicle>();

  protected readonly name = signal('');
  protected readonly seats = signal('40');
  protected readonly reg = signal('');
  protected readonly active = signal(true);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly mine = computed(() => {
    const v = this.vehicle();
    return v ? this.assignments().filter((a) => a.vehicle.id === v.id && a.active) : [];
  });

  ngOnInit() {
    const v = this.vehicle();
    if (!v) return;
    this.name.set(v.name);
    this.seats.set(String(v.capacity));
    this.reg.set(v.registration);
    this.active.set(v.active);
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
  protected label(a: Assignment) {
    return assignmentLabel(a);
  }
  protected fmt(d: string) {
    return formatDate(d);
  }

  /** cc.vh.save's checks. */
  private validate() {
    const e: Partial<Record<Field, string>> = {};
    const id = this.vehicle()?.id;
    const name = this.name().trim();
    if (!name) e.name = 'Enter the bus number';
    else if (name.length < 2 || name.length > 80) e.name = 'Use 2–80 characters';
    else if (
      this.vehicles().some((v) => v.id !== id && v.name.toLowerCase() === name.toLowerCase())
    )
      e.name = `${name} already exists`;
    const seats = Number(this.seats());
    if (!this.seats().trim()) e.seats = 'Enter the seating capacity';
    else if (!Number.isInteger(seats) || seats < 1 || seats > 200) e.seats = 'Seats must be 1–200';
    const reg = this.reg().trim();
    if (!reg) e.reg = 'Enter the registration number';
    else if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(normReg(reg)))
      e.reg = 'Use the format KA-14-F-2231';
    else if (this.vehicles().some((v) => v.id !== id && normReg(v.registration) === normReg(reg)))
      e.reg = 'This registration is already registered to another vehicle';
    this.errors.set(e);
    return Object.values(e).every((x) => !x);
  }

  protected async save() {
    if (this.why() || !this.validate()) return;
    const v = this.vehicle();
    const t = today();
    const current = this.mine().filter((a) => a.to >= t);
    if (v && v.active && !this.active() && current.length) {
      this.overlays.toast('Still assigned', {
        sub: `${v.name} is on ${plural(current.length, 'current assignment')}. End them before making it inactive.`,
        tone: 'bad',
      });
      return;
    }
    const body = {
      name: this.name().trim(),
      registration: this.reg().trim().toUpperCase(),
      capacity: Number(this.seats()),
    };
    this.busy.set(true);
    this.error.set('');
    try {
      let out: Vehicle;
      if (v) {
        const changed: Record<string, unknown> = {};
        if (body.name !== v.name) changed['name'] = body.name;
        if (normReg(body.registration) !== normReg(v.registration))
          changed['registration'] = body.registration;
        if (body.capacity !== v.capacity) changed['capacity'] = body.capacity;
        if (this.active() !== v.active) changed['active'] = this.active();
        if (!Object.keys(changed).length) {
          this.overlays.toast('No changes to save', { tone: 'info' });
          return;
        }
        out = await this.api.updateVehicle(v.id, v.version, changed);
      } else {
        out = await this.api.createVehicle(body);
        if (!this.active())
          out = await this.api.updateVehicle(out.id, out.version, { active: false });
      }
      this.overlays.toast(v ? 'Vehicle saved' : 'Vehicle added', {
        sub: `${out.name} · ${out.registration}`,
      });
      if (this.peak() > out.capacity)
        this.overlays.toast('Over capacity', {
          sub: `${this.peak()} passengers are allocated for ${out.capacity} seats.`,
          tone: 'warn',
        });
      this.saved.emit(out);
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 412) {
        this.error.set('Someone else changed this vehicle. Close it and open it again.');
      } else if (e instanceof ApiProblem && e.code === 'TRN.REGISTRATION_TAKEN') {
        this.errors.update((x) => ({ ...x, reg: e.detail }));
      } else if (e instanceof ApiProblem && e.errors.length) {
        const f = e.errors[0]!;
        const k: Field | null =
          f.field === 'name'
            ? 'name'
            : f.field === 'capacity'
              ? 'seats'
              : f.field === 'registration'
                ? 'reg'
                : null;
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
