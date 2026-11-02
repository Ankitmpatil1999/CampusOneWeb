import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  type OnInit,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { minutesOf, problemText } from '../Structure/academic-format';
import {
  AttendanceApi,
  type StaffTiming,
  type StaffTimingRole,
  type StaffTimingTimes,
} from './attendance.api';

type TimeKey = keyof StaffTimingTimes;

/** The six times in the form's order, with what each does. */
const TIMES: readonly { key: TimeKey; id: string; label: string; hint: string }[] = [
  { key: 'loginTime', id: 'st-login', label: 'Login time', hint: 'When the working day starts' },
  { key: 'logoutTime', id: 'st-logout', label: 'Logout time', hint: 'When the working day ends' },
  {
    key: 'lateLoginTime',
    id: 'st-late',
    label: 'Late login time',
    hint: 'A login after this is Late',
  },
  {
    key: 'earlyLogoutTime',
    id: 'st-early',
    label: 'Early logout time',
    hint: 'A logout before this makes the day a Half day',
  },
  {
    key: 'halfDayTime',
    id: 'st-half',
    label: 'Half-day threshold time',
    hint: 'A login after this is a Half day',
  },
  {
    key: 'absentTime',
    id: 'st-absent',
    label: 'Absent threshold time',
    hint: 'A login after this is Absent; no login by then is marked Absent',
  },
];
const LABEL: Record<TimeKey, string> = {
  loginTime: 'login time',
  logoutTime: 'logout time',
  lateLoginTime: 'late login time',
  earlyLogoutTime: 'early logout time',
  halfDayTime: 'half-day time',
  absentTime: 'absent time',
};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const NEW: StaffTimingTimes = {
  loginTime: '09:00',
  logoutTime: '17:00',
  lateLoginTime: '09:15',
  earlyLogoutTime: '16:45',
  halfDayTime: '11:00',
  absentTime: '13:00',
};

/**
 * Add or change a staff timing (client 2026-10-23; ATT-034/035): a name, the roles it is for (a role
 * in one timing only) and the six times in the day's order.
 */
@Component({
  selector: 'rp-staff-timing-drawer',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="timing() ? 'Change staff timing' : 'Add staff timing'"
      sub="Staff only: the working day for the roles chosen"
      icon="clock"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="st-form">
        <div class="c-form">
          <div class="full">
            <div class="fld" [class.invalid]="err('name')">
              <label class="fld-l" for="st-name">Name<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="st-name"
                  type="text"
                  maxlength="60"
                  placeholder="e.g. Teaching staff"
                  autocomplete="off"
                  aria-describedby="st-name-e"
                  [value]="name()"
                  (input)="name.set(val($event)); clear('name')"
                />
              </div>
              <div class="fld-e" id="st-name-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
              </div>
            </div>
          </div>
          <div class="full">
            <fieldset class="fld" id="st-roles" [class.invalid]="err('roleIds')">
              <legend class="fld-l">Roles<span class="req">*</span></legend>
              <div class="row wrap g12">
                @for (r of roles(); track r.id) {
                  <label class="chk" [attr.title]="elsewhere(r) || null"
                    ><input
                      type="checkbox"
                      [attr.data-role]="r.id"
                      [checked]="chosen().has(r.id)"
                      [disabled]="!!elsewhere(r)"
                      (change)="toggle(r.id)"
                    /><span
                      >{{ r.name }}
                      @if (elsewhere(r)) {
                        <span class="t-xs t-faint">· {{ elsewhere(r) }}</span>
                      }
                    </span></label
                  >
                }
              </div>
              <div class="fld-e" id="st-roles-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('roleIds') }}</span>
              </div>
            </fieldset>
          </div>
          @for (f of times; track f.key) {
            <div class="fld" [class.invalid]="err(f.key)">
              <label class="fld-l" [attr.for]="f.id">{{ f.label }}<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  type="time"
                  [id]="f.id"
                  [attr.aria-describedby]="f.id + '-e ' + f.id + '-h'"
                  [value]="value()[f.key]"
                  (input)="put(f.key, val($event))"
                />
              </div>
              <div class="fld-e" [id]="f.id + '-e'" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err(f.key) }}</span>
              </div>
              <div class="fld-h" [id]="f.id + '-h'">{{ f.hint }}</div>
            </div>
          }
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="cc-foot">
        <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="st-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>{{
            timing() ? 'Save changes' : 'Add timing'
          }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class StaffTimingDrawer implements OnInit {
  private readonly api = inject(AttendanceApi);
  private readonly overlays = inject(Overlays);

  /** The timing to change; null: a new one. */
  readonly timing = input<StaffTiming | null>(null);
  readonly timings = input<readonly StaffTiming[]>([]);
  readonly roles = input<readonly StaffTimingRole[]>([]);
  readonly closed = output<void>();
  readonly saved = output<StaffTiming>();

  protected readonly times = TIMES;
  protected readonly name = signal('');
  protected readonly chosen = signal<ReadonlySet<string>>(new Set());
  protected readonly value = signal<StaffTimingTimes>(NEW);
  protected readonly errors = signal<Readonly<Record<string, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly nameOf = computed(
    () => new Map(this.timings().map((t) => [t.id, t.name] as const)),
  );

  /** Fills the form from the timing being changed, once the inputs have arrived. */
  ngOnInit() {
    const t = this.timing();
    if (!t) return;
    this.name.set(t.name);
    this.chosen.set(new Set(t.roles.map((r) => r.id)));
    this.value.set({
      loginTime: t.loginTime,
      logoutTime: t.logoutTime,
      lateLoginTime: t.lateLoginTime,
      earlyLogoutTime: t.earlyLogoutTime,
      halfDayTime: t.halfDayTime,
      absentTime: t.absentTime,
    });
  }

  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected clear(k: string) {
    if (this.errors()[k]) this.errors.update((e) => ({ ...e, [k]: '' }));
  }
  protected put(k: TimeKey, v: string) {
    this.value.update((x) => ({ ...x, [k]: v.slice(0, 5) }));
    this.clear(k);
  }
  /** The other timing a role is in ('' when free, or in this one). */
  protected elsewhere(r: StaffTimingRole) {
    if (!r.timingId || r.timingId === this.timing()?.id) return '';
    return `In ${this.nameOf().get(r.timingId) ?? 'another timing'}`;
  }
  protected toggle(id: string) {
    this.chosen.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    this.clear('roleIds');
  }

  /** The server's checks, in the day's order: each error on the later time. */
  private check(name: string): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'Enter a name';
    else if (name.length < 2 || name.length > 60) e['name'] = translate('ATT.TIMING_NAME');
    else if (
      this.timings().some(
        (t) => t.id !== this.timing()?.id && t.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      e['name'] = translate('ATT.TIMING_TAKEN', { name });
    }
    if (!this.chosen().size) e['roleIds'] = translate('ATT.TIMING_ROLES');
    const v = this.value();
    for (const f of TIMES) {
      if (!v[f.key]) e[f.key] = 'Enter a time';
      else if (!TIME.test(v[f.key])) e[f.key] = translate('VALIDATION.FORMAT');
    }
    if (Object.keys(e).some((k) => k in LABEL)) return e;
    const m = (k: TimeKey) => minutesOf(v[k]);
    const after = (k: TimeKey, than: TimeKey) => {
      if (m(k) <= m(than)) e[k] ??= translate('ATT.TIMING_AFTER', { after: LABEL[than] });
    };
    after('lateLoginTime', 'loginTime');
    after('halfDayTime', 'lateLoginTime');
    after('absentTime', 'halfDayTime');
    after('logoutTime', 'absentTime');
    after('earlyLogoutTime', 'loginTime');
    if (m('earlyLogoutTime') >= m('logoutTime')) {
      e['earlyLogoutTime'] ??= translate('ATT.TIMING_BEFORE', { before: LABEL.logoutTime });
    }
    return e;
  }

  protected async save() {
    const name = this.name().trim();
    const e = this.check(name);
    this.errors.set(e);
    if (Object.keys(e).length) return;
    const body = { name, roleIds: [...this.chosen()], ...this.value() };
    const t = this.timing();
    this.busy.set(true);
    this.error.set('');
    try {
      const out = t
        ? await this.api.updateStaffTiming(t.id, t.version, body)
        : await this.api.createStaffTiming(body);
      this.overlays.toast(t ? 'Staff timing saved' : 'Staff timing added', { sub: out.name });
      this.saved.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.length) {
        this.errors.set(Object.fromEntries(x.errors.map((f) => [f.field, f.message])));
      } else {
        this.error.set(problemText(x));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
