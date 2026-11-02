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
import type { DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatMobile, istBusinessDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { CustomField } from '../Institution/institution.api';
import type { AdmissionRelation, ClassView } from '../Members/members.api';
import {
  AddressesFields,
  CustomInputs,
  KEPT_ID,
  LockedField,
  PersonFields,
  PreviousFields,
  SelectField,
  StudentFields,
  TextField,
  digitsOnly,
  panChars,
  type IdentityFix,
} from './AppFields';
import { RELATION, appName, person as personName } from './app-format';
import {
  addressesBody,
  addressesOf,
  checkAddresses,
  checkCustom,
  checkLocalGuardian,
  checkParents,
  checkPrevious,
  checkStudent,
  customBody,
  customOf,
  emptyAddress,
  emptyParents,
  emptyPrevious,
  emptyStudent,
  formKey,
  idsNeeded,
  parentsBody,
  parentsOf,
  previousBody,
  previousOf,
  recordChecks,
  recordOpen,
  recordParentsBody,
  recordStudentBody,
  studentBody,
  studentOf,
  type AddressesDraft,
  type CareDraft,
  type Errors,
  type LocalGuardianDraft,
  type Parent,
  type ParentsDraft,
  type PersonDraft,
  type PreviousDraft,
  type StudentDraft,
} from './app-form';
import {
  ApplicationsApi,
  type Application,
  type Relation,
  type SectionName,
} from './applications.api';
import { FamilyFound, type FamilyLookup, type LookupPerson } from '../../../Shared/FamilyFound';
import { MembersApi } from '../Members/members.api';

const TITLES: Readonly<Record<SectionName, string>> = {
  class: 'Admission sought',
  student: 'Student',
  parents: 'Parents',
  addresses: 'Addresses',
  previous: 'Previous school',
  customFields: 'Institution fields',
};

/**
 * Edit one section of a draft or submitted application (ADM-016, If-Match): the student, the
 * parents, the addresses, the previous school or the institution's fields — the same rules as the
 * public form. A section replaces its earlier answer; documents and references are kept. With
 * `record`, the section of an admitted student's record (the Members page): the names, gender, date
 * of birth, mobiles and primary contact are shown locked and sent as stored (CR-06: a correction
 * request changes them), the Aadhaar and PAN numbers are left out, and the care notes and the local
 * guardian's relation and address can change too.
 */
@Component({
  selector: 'rp-application-section',
  imports: [
    FamilyFound,
    AddressesFields,
    CustomInputs,
    Icon,
    LockedField,
    Modal,
    PersonFields,
    PreviousFields,
    SelectField,
    StudentFields,
    TextField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Edit ' + title().toLowerCase()"
      [sub]="sub()"
      icon="edit"
      [wide]="true"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16" id="as-form">
        @switch (section()) {
          @case ('student') {
            <rp-student-fields
              [(value)]="student"
              [(errors)]="errors"
              [full]="true"
              [today]="today"
              [locked]="record()"
              [open]="open()"
              [correctable]="self() === 'STUDENT'"
              (correct)="correct.emit($event)"
            />
            @if (record()) {
              <!-- The record's care notes, as the public form takes them. -->
              <div class="c-form">
                <rp-tf
                  fid="as-allergies"
                  label="Food allergies"
                  [opt]="true"
                  [maxlength]="300"
                  placeholder="e.g. Peanuts — or leave blank"
                  [error]="errors()['allergies'] ?? ''"
                  [value]="care().allergies"
                  (valueChange)="setCare('allergies', $event)"
                />
                <div class="full">
                  <rp-tf
                    fid="as-health"
                    label="Health conditions the school should know about"
                    type="textarea"
                    [opt]="true"
                    [maxlength]="300"
                    placeholder="e.g. Asthma — carries an inhaler"
                    [error]="errors()['health'] ?? ''"
                    [value]="care().health"
                    (valueChange)="setCare('health', $event)"
                  />
                </div>
              </div>
            }
          }
          @case ('parents') {
            @if (record()) {
              <rp-lf
                fid="as-primary"
                label="Primary contact"
                hint="The family's CampusOne account is linked by the primary contact's mobile; it can't be changed here."
                [value]="primaryText()"
                [error]="errors()['primary'] ?? ''"
              />
            } @else {
              <!-- A family already at the school (client 2026-10-22): its details fill the form, so
                   the approval joins the child to that family. -->
              <rp-family-found
                [mobiles]="[
                  parents().father.mobile,
                  parents().mother.mobile,
                  parents().guardian.mobile,
                ]"
                [lookup]="lookup"
                (use)="fillFamily($event)"
              />
              <rp-sf
                fid="as-primary"
                label="Primary contact"
                [req]="true"
                hint="The family's account is linked by the primary contact's mobile on approval."
                [options]="relations"
                [value]="parents().primary"
                (valueChange)="setPrimary($event)"
              />
            }
            <rp-sf
              fid="as-children"
              label="Children in the family"
              [req]="true"
              [options]="kids"
              [error]="errors()['children'] ?? ''"
              [value]="parents().children"
              (valueChange)="setChildren($event)"
            />
            @for (p of shown(); track p.k) {
              <div class="fs">
                <h4>
                  <rp-icon [name]="p.k === 'guardian' ? 'user' : 'users'" [size]="16" />{{ p.l }}
                  @if (parents().primary === p.r) {
                    <span class="chip tone-brand" style="margin-left: 6px">Primary contact</span>
                  }
                </h4>
                <div class="fs-b">
                  <rp-person-fields
                    [prefix]="p.prefix"
                    [primary]="parents().primary === p.r || p.k !== 'guardian'"
                    [emailRequired]="parents().primary === p.r"
                    [guardian]="p.k === 'guardian'"
                    [locked]="record()"
                    [open]="open()"
                    [correctable]="self() === p.r"
                    [value]="person(p.k)"
                    (valueChange)="setPerson(p.k, $event)"
                    (correct)="correct.emit($event)"
                    [(errors)]="errors"
                  />
                  <!-- Their Aadhaar and PAN: the father's and the mother's, a guardian's who is
                       the primary contact (client 2026-10-13); on a record, as stored. -->
                  @if (record()) {
                    <div class="c-form mt8">
                      <rp-lf
                        [fid]="'as-' + p.prefix + 'aadhaar'"
                        label="Aadhaar number"
                        [hint]="keptId"
                        [value]="parents().kept[p.k].aadhaar ?? ''"
                        [error]="errors()[p.prefix + 'aadhaar'] ?? ''"
                      />
                      <rp-lf
                        [fid]="'as-' + p.prefix + 'pan'"
                        label="PAN"
                        [hint]="keptId"
                        [value]="parents().kept[p.k].pan ?? ''"
                        [error]="errors()[p.prefix + 'pan'] ?? ''"
                      />
                    </div>
                  } @else if (asked().includes(p.k)) {
                    @let kept = parents().kept[p.k];
                    <div class="c-form mt8">
                      <rp-tf
                        [fid]="'as-' + p.prefix + 'aadhaar'"
                        label="Aadhaar number"
                        [req]="true"
                        inputmode="numeric"
                        [maxlength]="12"
                        [clean]="onlyDigits"
                        [placeholder]="kept.aadhaar ?? '12 digits'"
                        [hint]="
                          kept.aadhaar
                            ? 'Saved: ' + kept.aadhaar + ' — type the number again to change it'
                            : ''
                        "
                        [error]="errors()[p.prefix + 'aadhaar'] ?? ''"
                        [value]="parents().ids[p.k].aadhaar"
                        (valueChange)="setId(p.k, 'aadhaar', $event)"
                      />
                      <rp-tf
                        [fid]="'as-' + p.prefix + 'pan'"
                        label="PAN"
                        [req]="true"
                        [maxlength]="10"
                        [clean]="panText"
                        [placeholder]="kept.pan ?? 'e.g. ABCDE1234F'"
                        [hint]="
                          kept.pan ? 'Saved: ' + kept.pan + ' — type it again to change it' : ''
                        "
                        [error]="errors()[p.prefix + 'pan'] ?? ''"
                        [value]="parents().ids[p.k].pan"
                        (valueChange)="setId(p.k, 'pan', $event)"
                      />
                    </div>
                  }
                </div>
              </div>
            }
            @if (record() && application().parents?.localGuardian; as lg) {
              <!-- A hostel student's local guardian: the relation and the address change here. -->
              <div class="fs" id="as-lg">
                <h4><rp-icon name="bed" [size]="16" />Local guardian</h4>
                <div class="fs-b">
                  <div class="c-form">
                    <rp-lf
                      fid="as-lg-name"
                      label="Name"
                      [value]="named(lg.name)"
                      [error]="errors()['lg-name'] ?? ''"
                    />
                    <rp-lf
                      fid="as-lg-mobile"
                      label="Mobile"
                      hint="As the family gave it; it can't be changed here."
                      [value]="phone(lg.mobile)"
                      [error]="errors()['lg-mobile'] ?? ''"
                    />
                    <rp-tf
                      fid="as-lg-rel"
                      label="Relation to the student"
                      [req]="true"
                      [maxlength]="40"
                      placeholder="e.g. Uncle"
                      [error]="errors()['lg-rel'] ?? ''"
                      [value]="local().relation"
                      (valueChange)="setLocal('relation', $event)"
                    />
                    <div class="full">
                      <rp-tf
                        fid="as-lg-addr"
                        label="Address"
                        type="textarea"
                        [req]="true"
                        [maxlength]="200"
                        [error]="errors()['lg-addr'] ?? ''"
                        [value]="local().address"
                        (valueChange)="setLocal('address', $event)"
                      />
                    </div>
                    <rp-lf
                      fid="as-lg-aadhaar"
                      label="Aadhaar number"
                      [hint]="keptId"
                      [value]="application().identityNumbers?.localGuardian?.aadhaar ?? ''"
                      [error]="errors()['lg-aadhaar'] ?? ''"
                    />
                    <rp-lf
                      fid="as-lg-pan"
                      label="PAN"
                      [hint]="keptId"
                      [value]="application().identityNumbers?.localGuardian?.pan ?? ''"
                      [error]="errors()['lg-pan'] ?? ''"
                    />
                  </div>
                </div>
              </div>
            }
          }
          @case ('addresses') {
            <rp-addresses-fields [(value)]="addresses" [(errors)]="errors" />
          }
          @case ('previous') {
            <rp-previous-fields
              [(value)]="previous"
              [(errors)]="errors"
              [classes]="classes()"
              [full]="true"
            />
          }
          @case ('customFields') {
            <rp-custom-inputs [fields]="fields()" [(values)]="custom" [(errors)]="errors" />
          }
        }
        @if (record()) {
          <div class="note tone-info" id="as-record">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">
              The admitted student's record. Names, the date of birth, gender, mobiles and the
              Aadhaar and PAN numbers are display-only — a mistake is fixed with a correction
              request. Everything else is saved on the record.
            </div>
          </div>
        } @else if (application().status === 'SUBMITTED') {
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              This application is already submitted. The change is recorded on it; the family sees
              the corrected details.
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
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="as-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Save</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class ApplicationSection implements OnInit {
  private readonly api = inject(ApplicationsApi);
  private readonly members = inject(MembersApi);
  private readonly overlays = inject(Overlays);

  readonly application = input.required<Application>();
  readonly section = input.required<SectionName>();
  readonly classes = input<readonly ClassView[]>([]);
  readonly fields = input<readonly CustomField[]>([]);
  /**
   * An admitted student's record (the Members page): the identity is display-only, the Aadhaar and
   * PAN numbers are left out, and the section is saved on the record.
   */
  readonly record = input(false);
  /** Who the drawer's member is on the form: their own locked identity offers a correction. */
  readonly self = input<AdmissionRelation | null>(null);
  readonly closed = output<void>();
  readonly saved = output<Application>();
  /** A correction request for the drawer's member (a record's locked field). */
  readonly correct = output<IdentityFix>();

  protected readonly today = istBusinessDate(new Date());
  protected readonly keptId = KEPT_ID;
  protected readonly relations: readonly DropdownOption[] = (
    ['FATHER', 'MOTHER', 'GUARDIAN'] as const
  ).map((r) => ({ v: r, l: RELATION[r] }));
  protected readonly people = [
    { k: 'father', r: 'FATHER', l: 'Father', prefix: 'f-' },
    { k: 'mother', r: 'MOTHER', l: 'Mother', prefix: 'm-' },
    { k: 'guardian', r: 'GUARDIAN', l: 'Guardian', prefix: 'g-' },
  ] as const;
  protected readonly student = signal<StudentDraft>(emptyStudent());
  protected readonly parents = signal<ParentsDraft>(emptyParents());
  /** Whose Aadhaar and PAN are asked for (client 2026-10-13). */
  protected readonly asked = computed<readonly string[]>(() => {
    const p = this.parents();
    return idsNeeded(p.primary, p.hostel).parents;
  });
  /** Single child or more (client 2026-10-12). */
  protected readonly kids: readonly DropdownOption[] = [
    { v: 'SINGLE', l: 'Single child' },
    { v: 'MORE', l: 'More than one child' },
  ];
  protected readonly addresses = signal<AddressesDraft>({
    res: emptyAddress(),
    same: true,
    corr: emptyAddress(),
  });
  protected readonly previous = signal<PreviousDraft>(emptyPrevious());
  protected readonly custom = signal<Readonly<Record<string, string>>>({});
  /** A record's allergies and health notes, and its local guardian's relation and address. */
  protected readonly care = signal<CareDraft>({ allergies: '', health: '' });
  protected readonly local = signal<LocalGuardianDraft>({ relation: '', address: '' });
  protected readonly errors = signal<Errors>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly title = computed(() => TITLES[this.section()]);
  protected readonly sub = computed(() => {
    const a = this.application();
    return `${appName(a)} · ${a.applicationNo}`;
  });
  /**
   * The people edited: all three on an application; on a record the father and the mother (one an
   * older bulk upload never had is added) and a guardian only if on it, the drawer's member first.
   */
  protected readonly shown = computed(() => {
    if (!this.record()) return this.people;
    const p = this.application().parents;
    return this.people
      .filter((x) => x.k !== 'guardian' || !!p?.guardian)
      .sort((x, y) => Number(y.r === this.self()) - Number(x.r === this.self()));
  });
  /** On a record, the identity with nothing stored, filled once here (recordOpen). */
  protected readonly open = computed(() =>
    this.record() ? recordOpen(this.application()) : new Set<string>(),
  );
  protected readonly primaryText = computed(() => {
    const a = this.application();
    const r = a.parents?.primary ?? a.primaryContact.relation;
    return r ? RELATION[r] : '';
  });

  ngOnInit() {
    const a = this.application();
    this.student.set(studentOf(a));
    this.parents.set(parentsOf(a));
    this.addresses.set(addressesOf(a));
    this.previous.set(previousOf(a));
    this.custom.set(customOf(a, this.fields()));
    this.care.set({ allergies: a.student.allergies ?? '', health: a.student.health ?? '' });
    const lg = a.parents?.localGuardian;
    this.local.set({ relation: lg?.relation ?? '', address: lg?.address ?? '' });
  }

  protected setCare(k: keyof CareDraft, v: string) {
    this.care.update((c) => ({ ...c, [k]: v }));
    this.errors.update((e) => Object.fromEntries(Object.entries(e).filter(([x]) => x !== k)));
  }
  protected setLocal(k: keyof LocalGuardianDraft, v: string) {
    const key = k === 'relation' ? 'lg-rel' : 'lg-addr';
    this.local.update((l) => ({ ...l, [k]: v }));
    this.errors.update((e) => Object.fromEntries(Object.entries(e).filter(([x]) => x !== key)));
  }
  protected named(n: string) {
    return personName(n);
  }
  protected phone(m: string) {
    return m ? formatMobile(m) : '';
  }

  /** IDN-090: who a mobile belongs to at the school. */
  protected readonly lookup = (mobile: string) => this.members.familyLookup(mobile);

  /**
   * Fills in the family found (client 2026-10-22): the father, the mother and a guardian as the
   * family's latest admission had them (a staff member as the father or the mother), the primary
   * contact and "more than one child". Aadhaar numbers and PANs stay as they are.
   */
  protected fillFamily(r: FamilyLookup) {
    const person = (p: LookupPerson | null | undefined, cur: PersonDraft): PersonDraft =>
      p
        ? {
            ...cur,
            name: p.name,
            mobile: p.mobile ?? cur.mobile,
            email: p.email ?? cur.email,
            occupation: p.occupation ?? cur.occupation,
            income: p.annualIncome ?? cur.income,
          }
        : cur;
    this.parents.update((d) => {
      const fam = r.family;
      if (fam) {
        return {
          ...d,
          father: person(fam.father, d.father),
          mother: person(fam.mother, d.mother),
          guardian: fam.guardian
            ? { ...person(fam.guardian, d.guardian), relation: fam.guardian.relation }
            : d.guardian,
          primary: fam.primary ?? d.primary,
          children: fam.children.length ? 'MORE' : d.children,
        };
      }
      if (!r.staff) return d;
      const k = r.staff.relation === 'MOTHER' ? 'mother' : 'father';
      return {
        ...d,
        [k]: person(
          {
            name: r.staff.name,
            mobile: r.mobile,
            email: r.staff.email,
            occupation: r.staff.userType,
            annualIncome: null,
          },
          d[k],
        ),
      };
    });
    this.errors.set({});
  }

  protected person(k: 'father' | 'mother' | 'guardian'): PersonDraft {
    return this.parents()[k];
  }
  protected setPerson(k: 'father' | 'mother' | 'guardian', v: PersonDraft) {
    this.parents.update((p) => ({ ...p, [k]: v }));
  }
  protected setChildren(v: string) {
    this.parents.update((p) => ({ ...p, children: v === 'SINGLE' || v === 'MORE' ? v : '' }));
    this.errors.update((e) =>
      Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'children')),
    );
  }

  /** Another primary contact: each person's numbers stay theirs. */
  protected setPrimary(v: string) {
    this.parents.update((p) => (p.primary === v ? p : { ...p, primary: v as Relation }));
    this.errors.set({});
  }
  protected setId(k: Parent, field: 'aadhaar' | 'pan', v: string) {
    const key = `${k[0]}-${field}`;
    this.parents.update((p) => ({ ...p, ids: { ...p.ids, [k]: { ...p.ids[k], [field]: v } } }));
    this.errors.update((e) => Object.fromEntries(Object.entries(e).filter(([x]) => x !== key)));
  }
  protected readonly onlyDigits = digitsOnly;
  protected readonly panText = panChars;

  private check(): Record<string, string> {
    // A record's locked fields are sent as stored: only what can change here is checked.
    const record = this.record();
    switch (this.section()) {
      case 'student': {
        const e = checkStudent(this.student(), this.today, { lastRequired: true });
        return record ? recordChecks(e, this.open()) : e;
      }
      case 'parents': {
        const e = checkParents(this.parents());
        if (!record) return e;
        const lg = this.application().parents?.localGuardian;
        return {
          ...recordChecks(e, this.open()),
          ...(lg ? checkLocalGuardian(this.local()) : {}),
        };
      }
      case 'addresses':
        return checkAddresses(this.addresses(), true);
      case 'previous': {
        const c = this.classes().find((x) => x.id === this.application().class?.id);
        return checkPrevious(
          this.previous(),
          c ? { order: c.order, name: c.name } : null,
          this.classes(),
        );
      }
      case 'customFields':
        return checkCustom(this.fields(), this.custom());
      default:
        return {};
    }
  }

  private data(): unknown {
    const a = this.application();
    const record = this.record();
    switch (this.section()) {
      case 'student':
        return record
          ? recordStudentBody(this.student(), a, this.care(), this.open())
          : studentBody(this.student(), a.student);
      case 'parents':
        return record
          ? recordParentsBody(
              this.parents(),
              a,
              a.parents?.localGuardian ? this.local() : null,
              this.open(),
            )
          : parentsBody(this.parents(), a.parents);
      case 'addresses':
        return addressesBody(this.addresses());
      case 'previous':
        return previousBody(this.previous());
      case 'customFields':
        return customBody(this.fields(), this.custom());
      default:
        return {};
    }
  }

  protected async save() {
    this.error.set('');
    const e = this.check();
    this.errors.set(e);
    if (Object.keys(e).length) return;
    this.busy.set(true);
    try {
      const section = this.section();
      const out =
        this.record() && section !== 'class'
          ? await this.api.updateRecord(this.application(), section, this.data())
          : await this.api.update(this.application(), section, this.data());
      this.overlays.toast(`${this.title()} saved`, { sub: out.applicationNo });
      this.saved.emit(out);
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.length) {
        const f: Record<string, string> = {};
        for (const y of x.errors) {
          const k = formKey(y.field);
          if (k) f[k] ??= y.message;
        }
        this.errors.set(f);
        if (!Object.keys(f).length) this.error.set(x.errors[0]!.message);
      } else {
        this.error.set(x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
