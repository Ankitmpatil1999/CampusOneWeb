import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Fees/fee-format';
import { problemText, t12 } from '../Structure/academic-format';
import {
  TransportApi,
  type Direction,
  type Session,
  type Weekday,
} from '../Transport/transport.api';
import { WEEKDAYS } from '../Transport/transport-format';

type Field = 'name' | 'start' | 'end' | 'days';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Add or change a session (prototype cc.ss.edit / cc.ss.save; TRN-014…016; OI-TRN-09): a pickup or
 * drop run with its time and the days it runs. A session is made inactive, never deleted.
 */
@Component({
  selector: 'rp-session-drawer',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="session()?.name ?? 'Add a session'"
      [sub]="
        session()
          ? (session()!.direction === 'PICKUP' ? 'Pickup' : 'Drop') +
            ' · ' +
            t12(session()!.startTime)
          : 'A pickup or drop run at a set time'
      "
      icon="clock"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="ss-form">
        @if (why()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ why() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="full">
            <div class="fld" [class.invalid]="err('name')">
              <label class="fld-l" for="ss-n">Name<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="ss-n"
                  type="text"
                  maxlength="40"
                  placeholder="e.g. Evening drop"
                  autocomplete="off"
                  aria-describedby="ss-n-e"
                  [readOnly]="!!why()"
                  [value]="name()"
                  (input)="name.set(val($event)); clear('name')"
                />
              </div>
              <div class="fld-e" id="ss-n-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
              </div>
            </div>
          </div>
          <div class="full">
            <span class="fld-l" id="ss-d-l">Direction<span class="req">*</span></span>
            <div class="cc-radios" role="radiogroup" aria-labelledby="ss-d-l">
              @for (d of directions; track d.v) {
                <label class="chk"
                  ><input
                    type="radio"
                    name="ss-d"
                    [value]="d.v"
                    [checked]="direction() === d.v"
                    [disabled]="!!why()"
                    (change)="direction.set(d.v)"
                  /><span>{{ d.l }}</span></label
                >
              }
            </div>
          </div>
          <div class="fld" [class.invalid]="err('start')">
            <label class="fld-l" for="ss-t">Scheduled time<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ss-t"
                type="time"
                aria-describedby="ss-t-e"
                [readOnly]="!!why()"
                [value]="start()"
                (input)="start.set(val($event)); clear('start')"
              />
            </div>
            <div class="fld-e" id="ss-t-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('start') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('end')">
            <label class="fld-l" for="ss-e">Ends by<span class="opt">(optional)</span></label>
            <div class="fld-in">
              <input
                id="ss-e"
                type="time"
                aria-describedby="ss-e-e"
                [readOnly]="!!why()"
                [value]="end()"
                (input)="end.set(val($event)); clear('end')"
              />
            </div>
            <div class="fld-e" id="ss-e-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('end') }}</span>
            </div>
          </div>
          <div class="full">
            <div class="fld" [class.invalid]="err('days')">
              <span class="fld-l" id="ss-days-l">Days<span class="req">*</span></span>
              <div class="cc-checks" role="group" aria-labelledby="ss-days-l">
                @for (d of weekdays; track d.v) {
                  <label class="chk"
                    ><input
                      type="checkbox"
                      [id]="'ss-' + d.v"
                      [checked]="days().includes(d.v)"
                      [disabled]="!!why()"
                      (change)="toggleDay(d.v)"
                    /><span>{{ d.l }}</span></label
                  >
                }
              </div>
              <div class="fld-e" id="ss-days-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('days') }}</span>
              </div>
            </div>
          </div>
          @if (session()) {
            <div class="full">
              <label class="chk"
                ><input
                  type="checkbox"
                  id="ss-a"
                  [checked]="active()"
                  [disabled]="!!why()"
                  (change)="active.set(checked($event))"
                /><span>Active — trips are generated for this session</span></label
              >
            </div>
          }
        </div>
        @if (used()) {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              {{ plural(used(), 'assignment') }} {{ used() === 1 ? 'uses' : 'use' }} this session.
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
            id="ss-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>{{
              session() ? 'Save session' : 'Add session'
            }}</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class SessionDrawer implements OnInit {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);

  readonly session = input<Session | null>(null);
  readonly sessions = input<readonly Session[]>([]);
  /** Assignments that use the session. */
  readonly used = input(0);
  readonly why = input('');
  readonly closed = output<void>();
  readonly saved = output<Session>();

  protected readonly plural = plural;
  protected readonly t12 = t12;
  protected readonly weekdays = WEEKDAYS;
  protected readonly directions: readonly { v: Direction; l: string }[] = [
    { v: 'PICKUP', l: 'Pickup (home → school)' },
    { v: 'DROP', l: 'Drop (school → home)' },
  ];
  protected readonly name = signal('');
  protected readonly direction = signal<Direction>('PICKUP');
  protected readonly start = signal('07:15');
  protected readonly end = signal('');
  protected readonly days = signal<readonly Weekday[]>(['MON', 'TUE', 'WED', 'THU', 'FRI']);
  protected readonly active = signal(true);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  ngOnInit() {
    const s = this.session();
    if (!s) return;
    this.name.set(s.name);
    this.direction.set(s.direction);
    this.start.set(s.startTime);
    this.end.set(s.endTime ?? '');
    this.days.set(s.days);
    this.active.set(s.active);
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
  protected toggleDay(d: Weekday) {
    this.days.update((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]));
    this.clear('days');
  }

  /** cc.ss.save's checks. */
  private validate() {
    const e: Partial<Record<Field, string>> = {};
    const id = this.session()?.id;
    const name = this.name().trim();
    if (!name) e.name = 'Enter a session name';
    else if (name.length < 2 || name.length > 40) e.name = 'Use 2–40 characters';
    else if (
      this.sessions().some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase())
    )
      e.name = `${name} already exists`;
    const start = this.start().slice(0, 5);
    const end = this.end().slice(0, 5);
    if (!start) e.start = 'Enter the time';
    else if (!TIME.test(start)) e.start = translate('TRN.SESSION_TIMES');
    if (end && (!TIME.test(end) || end <= start)) e.end = translate('TRN.SESSION_TIMES');
    if (!this.days().length) e.days = translate('TRN.SESSION_DAYS');
    this.errors.set(e);
    return Object.values(e).every((x) => !x);
  }

  protected async save() {
    if (this.why() || !this.validate()) return;
    const s = this.session();
    const order = WEEKDAYS.map((d) => d.v);
    const body = {
      name: this.name().trim(),
      direction: this.direction(),
      startTime: this.start().slice(0, 5),
      endTime: this.end().slice(0, 5) || null,
      days: [...this.days()].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    };
    this.busy.set(true);
    this.error.set('');
    try {
      const out = s
        ? await this.api.updateSession(s.id, s.version, { ...body, active: this.active() })
        : await this.api.createSession(body);
      this.overlays.toast(s ? 'Session saved' : 'Session added', {
        sub: `${out.name} · ${t12(out.startTime)}`,
      });
      this.saved.emit(out);
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 412) {
        this.error.set('Someone else changed this session. Close it and open it again.');
      } else if (e instanceof ApiProblem && e.code === 'TRN.SESSION_NAME_TAKEN') {
        this.errors.update((x) => ({ ...x, name: e.detail }));
      } else if (e instanceof ApiProblem && e.errors.length) {
        const f = e.errors[0]!;
        const k: Field | null =
          f.field === 'name'
            ? 'name'
            : f.field === 'startTime'
              ? 'start'
              : f.field === 'endTime'
                ? 'end'
                : f.field === 'days'
                  ? 'days'
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
