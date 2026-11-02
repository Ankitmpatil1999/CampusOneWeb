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
import { formatDate, formatMobile, istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { isRealDate } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { UserType } from '../Institution/institution.api';
import type { ClassView } from '../Members/members.api';
import { appName, longDay, suggestedDepartment } from './app-format';
import { ApplicationsApi, type Application } from './applications.api';

type Field = 'no' | 'type' | 'dept' | 'sec' | 'tcno' | 'tcdt' | 'tcdue';
type TcKind = 'TC' | 'UNDERTAKING' | 'NONE';

/**
 * Approve an application (prototype cc.app.approve / cc.app.approve.go; ADM-018, and ADM-017 for a
 * mid-term certificate recorded here): the admission number, the user type and department, a
 * section of the class applied for, and — mid-term — the transfer certificate or an undertaking.
 * The server creates the student member, the wallets, the verified primary contact's parent link
 * (client 2026-10-27) and the enrolment in one transaction; a refusal leaves nothing behind and is
 * shown on the application ("rolled back").
 */
@Component({
  selector: 'rp-application-approve',
  imports: [Dropdown, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Approve ' + name()"
      [sub]="sub()"
      icon="usercheck"
      [wide]="true"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="aa-form">
        @if (noRef()) {
          <div class="note tone-bad">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">
              <b>A reference is missing.</b> A mid-term application needs at least one reference
              before approval (CR-14). Add it on the application, then approve.
            </div>
          </div>
        }
        <div class="c-form">
          <div class="fld" [class.invalid]="err('no')">
            <label class="fld-l" for="aa-no">Admission number<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="aa-no"
                maxlength="40"
                autocomplete="off"
                aria-describedby="aa-no-e"
                [value]="no()"
                (input)="no.set(val($event)); clear('no')"
              />
            </div>
            <div class="fld-e" id="aa-no-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('no') }}</span>
            </div>
            <div class="fld-h">Must be unique in the institution.</div>
          </div>
          <div class="fld" [class.invalid]="err('type')">
            <label class="fld-l" for="aa-type-b">User type<span class="req">*</span></label>
            <rp-dd
              inputId="aa-type"
              placeholder="Choose a user type"
              [options]="typeOptions()"
              [value]="typeId()"
              (changed)="typeId.set($event); deptId.set(''); clear('type')"
            />
            <div class="fld-e" id="aa-type-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('type') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('dept')">
            <label class="fld-l" for="aa-dept-b"
              >Department
              @if (deptOptions().length) {
                <span class="req">*</span>
              }
            </label>
            <rp-dd
              inputId="aa-dept"
              placeholder="Choose a department"
              [options]="deptOptions()"
              [value]="dept()"
              [disabled]="!deptOptions().length"
              (changed)="deptId.set($event); clear('dept')"
            />
            <div class="fld-e" id="aa-dept-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('dept') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('sec')">
            <label class="fld-l" for="aa-sec-b">Section<span class="req">*</span></label>
            <rp-dd
              inputId="aa-sec"
              placeholder="Choose a section"
              [options]="sectionOptions()"
              [value]="secId()"
              (changed)="secId.set($event); clear('sec')"
            />
            <div class="fld-e" id="aa-sec-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('sec') }}</span>
            </div>
          </div>
        </div>
        @if (!typeOptions().length || !sectionOptions().length) {
          <div class="note tone-warn">
            <rp-icon name="alert" [size]="17" />
            <div class="grow">
              {{
                !typeOptions().length
                  ? 'The student user types can’t be read with your role, so this application can’t be approved here.'
                  : 'The sections of ' +
                    (application().class?.name ?? 'the class') +
                    ' can’t be read with your role.'
              }}
            </div>
          </div>
        }

        @if (application().midTerm) {
          <div class="fs" id="aa-mid">
            <h4><rp-icon name="calendar" [size]="16" />Mid-term joining</h4>
            <div class="fs-b">
              <div class="stack g12">
                <dl class="kv">
                  <dt>Joining date</dt>
                  <dd>{{ application().joiningDate ? long(application().joiningDate!) : '—' }}</dd>
                  <dt>Attendance counted from</dt>
                  <dd>
                    {{ application().joiningDate ? date(application().joiningDate!) : '—' }}
                  </dd>
                  <dt>Fee structure</dt>
                  <dd>{{ structureName() ?? 'Not assigned' }}</dd>
                </dl>
                <div class="cc-radios" role="radiogroup" aria-label="Transfer certificate">
                  @for (o of tcOptions; track o.v) {
                    <label class="chk"
                      ><input
                        type="radio"
                        name="aa-tc"
                        [value]="o.v"
                        [checked]="tcKind() === o.v"
                        (change)="tcKind.set(o.v)"
                      /><span>{{ o.l }}</span></label
                    >
                  }
                </div>
                @if (tcKind() === 'TC') {
                  <div class="c-form">
                    <div class="fld" [class.invalid]="err('tcno')">
                      <label class="fld-l" for="aa-tcno"
                        >Certificate number<span class="req">*</span></label
                      >
                      <div class="fld-in">
                        <input
                          id="aa-tcno"
                          maxlength="40"
                          autocomplete="off"
                          aria-describedby="aa-tcno-e"
                          [value]="tcNo()"
                          (input)="tcNo.set(val($event)); clear('tcno')"
                        />
                      </div>
                      <div class="fld-e" id="aa-tcno-e" role="alert">
                        <rp-icon name="alertc" [size]="14" /><span>{{ err('tcno') }}</span>
                      </div>
                    </div>
                    <div class="fld" [class.invalid]="err('tcdt')">
                      <label class="fld-l" for="aa-tcdt"
                        >Date of issue<span class="req">*</span></label
                      >
                      <div class="fld-in">
                        <input
                          id="aa-tcdt"
                          type="date"
                          aria-describedby="aa-tcdt-e"
                          [attr.max]="today"
                          [value]="tcDate()"
                          (input)="tcDate.set(val($event)); clear('tcdt')"
                          (change)="tcDate.set(val($event)); clear('tcdt')"
                        />
                      </div>
                      <div class="fld-e" id="aa-tcdt-e" role="alert">
                        <rp-icon name="alertc" [size]="14" /><span>{{ err('tcdt') }}</span>
                      </div>
                    </div>
                  </div>
                } @else if (tcKind() === 'UNDERTAKING') {
                  <div class="fld" [class.invalid]="err('tcdue')">
                    <label class="fld-l" for="aa-tcdue"
                      >Certificate to be produced by<span class="req">*</span></label
                    >
                    <div class="fld-in">
                      <input
                        id="aa-tcdue"
                        type="date"
                        aria-describedby="aa-tcdue-e"
                        [attr.min]="today"
                        [value]="tcDue()"
                        (input)="tcDue.set(val($event)); clear('tcdue')"
                        (change)="tcDue.set(val($event)); clear('tcdue')"
                      />
                    </div>
                    <div class="fld-e" id="aa-tcdue-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err('tcdue') }}</span>
                    </div>
                  </div>
                } @else {
                  <div class="note tone-warn" id="aa-tc-none">
                    <rp-icon name="alert" [size]="17" />
                    <div class="grow">
                      Approval isn't possible without the certificate or a recorded undertaking with
                      a due date.
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        }

        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            <!-- Only the verified primary contact becomes the student's parent; the other parents
                 keep a CampusOne account only (client 2026-10-27). -->
            <b>All or nothing.</b> Approval creates the student profile with campus and allowance
            wallets, links the primary contact's account{{
              application().primaryContact.mobile
                ? ' (' + mobile(application().primaryContact.mobile!) + ')'
                : ''
            }}
            to the student as their parent, and enrols the student. If any step fails, nothing is
            saved.
          </div>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <span class="cp-why" [attr.title]="noRef() ? 'Add a reference first' : null"
          ><button
            type="button"
            class="btn btn-pri"
            id="aa-go"
            [class.is-busy]="busy()"
            [disabled]="busy() || noRef() || !typeOptions().length || !sectionOptions().length"
            (click)="approve()"
          >
            <rp-icon name="check" [size]="17" /><span>Approve and enrol</span>
          </button></span
        >
      </div>
    </rp-modal>
  `,
})
export class ApplicationApprove implements OnInit {
  private readonly api = inject(ApplicationsApi);
  private readonly overlays = inject(Overlays);

  readonly application = input.required<Application>();
  readonly userTypes = input<readonly UserType[]>([]);
  readonly classes = input<readonly ClassView[]>([]);
  /** The class's fee structure, when the fee structures can be read. */
  readonly structureName = input<string | null>(null);
  readonly closed = output<void>();
  readonly approved = output<Application>();
  /** The server refused for a reason not tied to a field: the application shows "rolled back". */
  readonly failed = output<string>();
  /** The certificate recorded here before the approval (ADM-017). */
  readonly tcSaved = output<Application>();

  protected readonly today = istBusinessDate(new Date());
  protected readonly tcOptions: readonly { v: TcKind; l: string }[] = [
    { v: 'TC', l: 'Transfer certificate received' },
    { v: 'UNDERTAKING', l: 'Undertaking recorded' },
    { v: 'NONE', l: 'Neither yet' },
  ];
  protected readonly no = signal('');
  protected readonly typeId = signal('');
  protected readonly deptId = signal('');
  protected readonly secId = signal('');
  protected readonly tcKind = signal<TcKind>('NONE');
  protected readonly tcNo = signal('');
  protected readonly tcDate = signal('');
  protected readonly tcDue = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly key = newIdempotencyKey();

  protected readonly name = computed(() => appName(this.application()));
  protected readonly sub = computed(() => {
    const a = this.application();
    return [a.applicationNo, a.class?.name, a.year.label].filter(Boolean).join(' · ');
  });
  protected readonly noRef = computed(
    () => this.application().midTerm && !this.application().references.length,
  );
  private readonly cls = computed(() =>
    this.classes().find((c) => c.id === this.application().class?.id),
  );
  protected readonly typeOptions = computed<DropdownOption[]>(() =>
    this.userTypes()
      .filter((t) => t.category === 'STUDENT' && t.status === 'ACTIVE')
      .map((t) => ({ v: t.id, l: t.name })),
  );
  protected readonly deptOptions = computed<DropdownOption[]>(() => {
    const t = this.userTypes().find((x) => x.id === this.typeId());
    return t ? t.departments.map((d) => ({ v: d.id, l: d.name })) : [];
  });
  /** The department chosen, else the one the class usually belongs to (prototype defDept). */
  protected readonly dept = computed(() => {
    if (this.deptId()) return this.deptId();
    const o = this.deptOptions();
    const c = this.cls();
    const want = c ? suggestedDepartment(c.order) : '';
    return o.find((d) => d.l === want)?.v ?? '';
  });
  protected readonly sectionOptions = computed<DropdownOption[]>(() => {
    const c = this.cls();
    return c
      ? c.sections.map((s) => ({
          v: s.id,
          l: `${c.name} ${s.name}`,
          sub: `${s.students.toLocaleString('en-IN')} ${s.students === 1 ? 'student' : 'students'}`,
        }))
      : [];
  });

  ngOnInit() {
    const t = this.typeOptions();
    if (t.length) this.typeId.set(t[0]!.v);
    const s = this.application().section?.id ?? this.sectionOptions()[0]?.v;
    if (s) this.secId.set(s);
    const tc = this.application().tc;
    if (tc) {
      this.tcKind.set(tc.mode);
      this.tcNo.set(tc.number ?? '');
      this.tcDate.set(tc.date ?? '');
      this.tcDue.set(tc.dueDate ?? '');
    }
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
  protected long(d: string) {
    return longDay(d);
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected mobile(m: string) {
    return formatMobile(m);
  }

  protected async approve() {
    if (this.noRef()) return;
    this.error.set('');
    const a0 = this.application();
    const no = this.no().trim();
    const e: Partial<Record<Field, string>> = {};
    if (!no) e.no = 'Enter an admission number';
    else if (!/^[A-Za-z0-9/-]+$/.test(no)) e.no = 'Use letters, digits, / and - only';
    if (!this.typeId()) e.type = 'Choose a user type';
    if (this.deptOptions().length && !this.dept()) e.dept = 'Choose a department';
    if (!this.secId()) e.sec = 'Choose a section';
    if (a0.midTerm) {
      if (this.tcKind() === 'TC') {
        if (!this.tcNo().trim()) e.tcno = 'Enter the certificate number';
        if (!this.tcDate()) e.tcdt = 'Enter the date of issue';
        else if (!isRealDate(this.tcDate())) e.tcdt = translate('VALIDATION.DATE');
        else if (this.tcDate() > this.today) e.tcdt = "The date of issue can't be in the future";
      } else if (this.tcKind() === 'UNDERTAKING') {
        if (!this.tcDue()) e.tcdue = 'Enter the date the certificate will be produced';
        else if (!isRealDate(this.tcDue())) e.tcdue = translate('VALIDATION.DATE');
        else if (this.tcDue() <= this.today) e.tcdue = 'The due date must be after today';
      }
    }
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) return;
    if (a0.midTerm && this.tcKind() === 'NONE') {
      this.overlays.toast('Transfer certificate needed', {
        tone: 'bad',
        sub: 'Record the certificate or an undertaking with a due date (CR-14).',
      });
      return;
    }
    this.busy.set(true);
    let a = a0;
    try {
      // Mid-term: the certificate (or undertaking) chosen here is recorded first (ADM-017).
      if (a.midTerm && this.tcChanged()) {
        a = await this.api.transferCertificate(
          a.id,
          this.tcKind() === 'TC'
            ? { mode: 'TC', number: this.tcNo().trim(), date: this.tcDate() }
            : { mode: 'UNDERTAKING', dueDate: this.tcDue() },
        );
        this.tcSaved.emit(a);
      }
      const out = await this.api.approve(
        a,
        {
          userTypeId: this.typeId(),
          departmentId: this.dept() || null,
          sectionId: this.secId(),
          admissionNo: no,
        },
        this.key,
      );
      this.overlays.toast('Admission approved', {
        sub: `${this.name()} · ${out.application.admissionNo ?? no}`,
      });
      this.approved.emit(out.application);
    } catch (x) {
      this.refused(x);
    } finally {
      this.busy.set(false);
    }
  }

  private tcChanged() {
    const tc = this.application().tc;
    const k = this.tcKind();
    if (!tc) return k !== 'NONE';
    if (tc.mode !== k) return true;
    return k === 'TC'
      ? (tc.number ?? '') !== this.tcNo().trim() || (tc.date ?? '') !== this.tcDate()
      : (tc.dueDate ?? '') !== this.tcDue();
  }

  private refused(x: unknown) {
    if (!(x instanceof ApiProblem)) {
      this.error.set(translate('GEN.UNAVAILABLE'));
      return;
    }
    const map: Record<string, Field> = {
      admissionNo: 'no',
      userTypeId: 'type',
      departmentId: 'dept',
      sectionId: 'sec',
      number: 'tcno',
      date: 'tcdt',
      dueDate: 'tcdue',
    };
    const f: Partial<Record<Field, string>> = {};
    for (const y of x.errors) if (map[y.field]) f[map[y.field]!] = y.message;
    if (x.code === 'ADM.SECTION_NOT_IN_CLASS') f.sec = x.detail;
    if (x.code.startsWith('IDN.ADMISSION_NO')) f.no = x.detail;
    if (Object.keys(f).length) {
      this.errors.set(f);
      return;
    }
    if (x.status === 412 || x.status === 428) {
      this.error.set(x.detail);
      return;
    }
    this.failed.emit(x.detail);
  }
}
