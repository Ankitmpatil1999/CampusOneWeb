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
import { translate } from '../../../Utils/translate';
import { person } from '../Applications/app-format';
import { problemText, today } from '../Structure/academic-format';
import { SearchSelect } from '../../../Shared/SearchSelect';
import {
  TransportApi,
  type AllocationRow,
  type Assignment,
  type Crew,
  type CrewRole,
} from '../Transport/transport.api';
import { assignmentLabel } from '../Transport/transport-format';

type Field = 'member' | 'licence' | 'expiry' | 'ref';
const LICENCE = /^[A-Z]{2}\d{2}\s?\d{11}$/;

/**
 * Add or change a crew member (prototype cc.cw.edit / cc.cw.save; TRN-011…013; BR-60): a member of
 * the school as a driver (a licence with a future expiry, unique) or an attendant, with a unique
 * employee reference. The role can't change once added; a crew member is made inactive, not removed.
 */
@Component({
  selector: 'rp-crew-drawer',
  imports: [Icon, Modal, SearchSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="crew() ? name(crew()!.member.name) : 'Add a crew member'"
      [sub]="
        crew()
          ? roleLabel(crew()!.role) + ' · ' + crew()!.employeeRef
          : 'Drivers need a unique licence'
      "
      icon="idcard"
      [drawer]="true"
      [slim]="true"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="cw-form">
        @if (why()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ why() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="full">
            @if (crew(); as c) {
              <dl class="kv">
                <dt>Member</dt>
                <dd>{{ name(c.member.name) }}</dd>
                <dt>Role</dt>
                <dd>{{ roleLabel(c.role) }}</dd>
              </dl>
            } @else {
              <div class="fld" [class.invalid]="err('member')">
                <label class="fld-l" for="cw-m-b">Member<span class="req">*</span></label>
                <rp-search-select
                  inputId="cw-m"
                  [placeholder]="
                    loadingPeople()
                      ? 'Loading staff…'
                      : candidates().length
                        ? 'Choose a member'
                        : 'No eligible members'
                  "
                  [options]="candidates()"
                  [value]="member()"
                  [disabled]="!candidates().length"
                  (changed)="member.set($event); clear('member')"
                />
                <div class="fld-e" id="cw-m-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('member') }}</span>
                </div>
              </div>
            }
          </div>
          @if (!crew()) {
            <div class="full">
              <span class="fld-l" id="cw-r-l">Role<span class="req">*</span></span>
              <div class="cc-radios" role="radiogroup" aria-labelledby="cw-r-l">
                @for (r of roles; track r.v) {
                  <label class="chk"
                    ><input
                      type="radio"
                      name="cw-r"
                      [value]="r.v"
                      [checked]="role() === r.v"
                      (change)="role.set(r.v)"
                    /><span>{{ r.l }}</span></label
                  >
                }
              </div>
            </div>
          }
          @if (role() === 'DRIVER') {
            <div class="full">
              <div class="fld" [class.invalid]="err('licence')">
                <label class="fld-l" for="cw-l"
                  >Driving licence number<span class="req">*</span></label
                >
                <div class="fld-in">
                  <input
                    id="cw-l"
                    type="text"
                    maxlength="30"
                    placeholder="KA14 20110004521"
                    autocomplete="off"
                    aria-describedby="cw-l-e"
                    [readOnly]="!!why()"
                    [value]="licence()"
                    (input)="licence.set(val($event)); clear('licence')"
                  />
                </div>
                <div class="fld-e" id="cw-l-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('licence') }}</span>
                </div>
              </div>
            </div>
            <div class="full">
              <div class="fld" [class.invalid]="err('expiry')">
                <label class="fld-l" for="cw-x">Licence valid till<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="cw-x"
                    type="date"
                    aria-describedby="cw-x-e"
                    [min]="tomorrow"
                    [readOnly]="!!why()"
                    [value]="expiry()"
                    (change)="expiry.set(val($event)); clear('expiry')"
                  />
                </div>
                <div class="fld-e" id="cw-x-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('expiry') }}</span>
                </div>
              </div>
            </div>
          }
          <div class="full">
            <div class="fld" [class.invalid]="err('ref')">
              <label class="fld-l" for="cw-e">Employee reference<span class="req">*</span></label>
              <div class="fld-in">
                <input
                  id="cw-e"
                  type="text"
                  maxlength="30"
                  placeholder="TVPS-D-0015"
                  autocomplete="off"
                  aria-describedby="cw-e-e"
                  [readOnly]="!!why()"
                  [value]="ref()"
                  (input)="ref.set(val($event)); clear('ref')"
                />
              </div>
              <div class="fld-e" id="cw-e-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('ref') }}</span>
              </div>
            </div>
          </div>
          @if (crew()) {
            <div class="full">
              <label class="chk"
                ><input
                  type="checkbox"
                  id="cw-a"
                  [checked]="active()"
                  [disabled]="!!why()"
                  (change)="active.set(checked($event))"
                /><span>Active</span></label
              >
            </div>
          }
        </div>
        @if (mine().length) {
          <div class="fs">
            <h4><rp-icon name="clipboard" [size]="16" />Assigned to</h4>
            <div class="fs-b">
              @for (a of mine(); track a.id) {
                <div class="t-sm" style="padding: 4px 0">{{ label(a) }} · {{ a.vehicle.name }}</div>
              }
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
            id="cw-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>{{
              crew() ? 'Save' : 'Add crew member'
            }}</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class CrewDrawer implements OnInit {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);

  readonly crew = input<Crew | null>(null);
  readonly all = input<readonly Crew[]>([]);
  readonly assignments = input<readonly Assignment[]>([]);
  readonly why = input('');
  readonly closed = output<void>();
  readonly saved = output<Crew>();

  protected readonly roles: readonly { v: CrewRole; l: string }[] = [
    { v: 'DRIVER', l: 'Driver' },
    { v: 'ATTENDANT', l: 'Attendant' },
  ];
  protected readonly tomorrow = (() => {
    const d = new Date(`${today()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  protected readonly member = signal('');
  protected readonly role = signal<CrewRole>('DRIVER');
  protected readonly licence = signal('');
  protected readonly expiry = signal('');
  protected readonly ref = signal('');
  protected readonly active = signal(true);
  private readonly staff = signal<readonly AllocationRow[]>([]);
  protected readonly loadingPeople = signal(false);
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  /** Staff who aren't crew yet (members are listed by the transport allocation list). */
  protected readonly candidates = computed(() => {
    const taken = new Set(this.all().map((c) => c.member.id));
    return this.staff()
      .filter((s) => !taken.has(s.member.id))
      .map((s) => ({ v: s.member.id, l: person(s.member.name), sub: s.member.type }));
  });
  protected readonly mine = computed(() => {
    const c = this.crew();
    return c
      ? this.assignments().filter(
          (a) => a.active && (a.driver.id === c.id || a.attendant?.id === c.id),
        )
      : [];
  });

  ngOnInit() {
    const c = this.crew();
    if (c) {
      this.role.set(c.role);
      this.licence.set(c.licenceNo ?? '');
      this.expiry.set(c.licenceExpiry ?? '');
      this.ref.set(c.employeeRef);
      this.active.set(c.active);
      return;
    }
    void this.loadStaff();
  }

  private async loadStaff() {
    this.loadingPeople.set(true);
    try {
      const out: AllocationRow[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 20; i++) {
        const p = await this.api.allocations({ kind: 'STAFF', cursor });
        out.push(...p.items);
        if (!p.nextCursor) break;
        cursor = p.nextCursor;
      }
      this.staff.set(
        out.sort((a, b) => person(a.member.name).localeCompare(person(b.member.name))),
      );
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loadingPeople.set(false);
    }
  }

  protected name(n: string) {
    return person(n);
  }
  protected roleLabel(r: CrewRole) {
    return r === 'DRIVER' ? 'Driver' : 'Attendant';
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

  /** cc.cw.save's checks. */
  private validate() {
    const e: Partial<Record<Field, string>> = {};
    const id = this.crew()?.id;
    if (!this.crew() && !this.member()) e.member = 'Choose a member';
    const ref = this.ref().trim();
    if (!ref) e.ref = 'Enter the employee reference';
    else if (
      this.all().some((c) => c.id !== id && c.employeeRef.toLowerCase() === ref.toLowerCase())
    )
      e.ref = 'This employee reference is already used';
    if (this.role() === 'DRIVER') {
      const l = this.licence().trim().toUpperCase();
      if (!l) e.licence = 'A driver needs a licence number';
      else if (!LICENCE.test(l)) e.licence = 'Use the format KA14 20110004521';
      else if (
        this.all().some(
          (c) =>
            c.id !== id &&
            c.licenceNo &&
            c.licenceNo.replace(/\s/g, '').toUpperCase() === l.replace(/\s/g, ''),
        )
      )
        e.licence = 'This licence belongs to another driver';
      if (!this.expiry() || this.expiry() <= today()) e.expiry = translate('TRN.LICENCE_REQUIRED');
    }
    this.errors.set(e);
    return Object.values(e).every((x) => !x);
  }

  protected async save() {
    if (this.why() || !this.validate()) return;
    const c = this.crew();
    const driver = this.role() === 'DRIVER';
    const licenceNo = driver ? this.licence().trim().toUpperCase() : null;
    const licenceExpiry = driver ? this.expiry() : null;
    if (c && c.active && !this.active() && this.mine().some((a) => a.to >= today())) {
      this.overlays.toast('Still assigned', {
        sub: `${person(c.member.name)} is on a current assignment. End it before making them inactive.`,
        tone: 'bad',
      });
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      let out: Crew;
      if (c) {
        const changed: Record<string, unknown> = {};
        if (driver && licenceNo !== c.licenceNo) changed['licenceNo'] = licenceNo;
        if (driver && licenceExpiry !== c.licenceExpiry) changed['licenceExpiry'] = licenceExpiry;
        if (this.ref().trim() !== c.employeeRef) changed['employeeRef'] = this.ref().trim();
        if (this.active() !== c.active) changed['active'] = this.active();
        if (!Object.keys(changed).length) {
          this.overlays.toast('No changes to save', { tone: 'info' });
          return;
        }
        out = await this.api.updateCrew(c.id, c.version, changed);
      } else {
        out = await this.api.createCrew({
          memberId: this.member(),
          role: this.role(),
          licenceNo,
          licenceExpiry,
          employeeRef: this.ref().trim(),
        });
      }
      this.overlays.toast(c ? 'Crew member saved' : 'Crew member added', {
        sub: `${person(out.member.name)} · ${this.roleLabel(out.role)}`,
      });
      this.saved.emit(out);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown) {
    if (!(e instanceof ApiProblem)) {
      this.error.set(problemText(e));
      return;
    }
    if (e.status === 412) {
      this.error.set('Someone else changed this crew member. Close it and open it again.');
      return;
    }
    const codeField: Readonly<Record<string, Field>> = {
      'TRN.EMPLOYEE_REF_TAKEN': 'ref',
      'TRN.LICENCE_TAKEN': 'licence',
      'TRN.ALREADY_CREW': 'member',
    };
    const k = codeField[e.code];
    if (k) {
      this.errors.update((x) => ({ ...x, [k]: e.detail }));
      return;
    }
    const f = e.errors[0];
    if (f) {
      const map: Readonly<Record<string, Field>> = {
        licenceNo: 'licence',
        licenceExpiry: 'expiry',
        employeeRef: 'ref',
        memberId: 'member',
      };
      const field = map[f.field];
      if (field) {
        this.errors.update((x) => ({ ...x, [field]: f.message }));
        return;
      }
    }
    this.error.set(e.detail);
  }
}
