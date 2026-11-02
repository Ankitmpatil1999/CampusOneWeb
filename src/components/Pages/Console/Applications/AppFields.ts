/**
 * The admission form's fields as the prototype draws them (ui.field / ui.select inside `.c-form`):
 * a text field, a dropdown field, and the student, address, previous-school, person and
 * institution-field groups shared by the counsellor's form and a section's edit. Values and errors
 * are two-way models; typing in a field clears its error.
 */
import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import type { CustomField } from '../Institution/institution.api';
import type { ClassView } from '../Members/members.api';
import { BLOOD_GROUPS, BOARD, CATEGORY, GENDER, MEDIUMS, RESULTS } from './app-format';
import type {
  AddressDraft,
  AddressesDraft,
  Errors,
  PersonDraft,
  PreviousDraft,
  StudentDraft,
} from './app-form';
import type { Board, Category, Gender } from './applications.api';
import { formatDate, formatMobile } from '../../../Utils/format';
import { cleanTyped, onlyDigits, panText, phoneText } from '../../../Utils/typing';

/** ui.field: label, input (or textarea), the error line and the hint. */
@Component({
  selector: 'rp-tf',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="fld" [class.invalid]="!!error()">
    @if (label()) {
      <label class="fld-l" [attr.for]="fid()"
        >{{ label() }}
        @if (req()) {
          <span class="req">*</span>
        }
        @if (opt()) {
          <span class="opt">(optional)</span>
        }
      </label>
    }
    <div class="fld-in">
      @if (prefix()) {
        <span class="pre">{{ prefix() }}</span>
      }
      @if (type() === 'textarea') {
        <textarea
          [id]="fid()"
          rows="3"
          [attr.maxlength]="maxlength()"
          [attr.placeholder]="placeholder() || null"
          [attr.aria-describedby]="fid() + '-e'"
          [value]="value()"
          [disabled]="disabled()"
          (input)="set($event)"
        ></textarea>
      } @else {
        <input
          [id]="fid()"
          [type]="type()"
          autocomplete="off"
          [attr.maxlength]="maxlength()"
          [attr.inputmode]="inputmode()"
          [attr.placeholder]="placeholder() || null"
          [attr.min]="min()"
          [attr.max]="max()"
          [attr.aria-describedby]="fid() + '-e'"
          [value]="value()"
          [disabled]="disabled()"
          (input)="set($event)"
          (change)="set($event)"
        />
      }
    </div>
    <div class="fld-e" [id]="fid() + '-e'" role="alert">
      <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
    </div>
    @if (hint()) {
      <div class="fld-h">{{ hint() }}</div>
    }
  </div>`,
})
export class TextField {
  readonly fid = input.required<string>();
  readonly label = input('');
  readonly req = input(false);
  readonly opt = input(false);
  readonly type = input<'text' | 'date' | 'email' | 'textarea' | 'number'>('text');
  readonly placeholder = input('');
  readonly hint = input('');
  readonly prefix = input('');
  readonly maxlength = input<number | null>(null);
  readonly inputmode = input<string | null>(null);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly disabled = input(false);
  readonly error = input('');
  readonly value = model('');
  /** Which characters the box takes (e.g. digits only): the rest never show (client 2026-10-13). */
  readonly clean = input<((v: string) => string) | null>(null);
  protected set(e: Event) {
    const el = e.target as HTMLInputElement;
    const rule = this.clean();
    this.value.set(rule ? cleanTyped(el, rule) : el.value);
  }
}

/** ui.select: label, the prototype's dropdown, the error line and the hint. */
@Component({
  selector: 'rp-sf',
  imports: [Dropdown, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="fld" [class.invalid]="!!error()">
    @if (label()) {
      <label class="fld-l" [attr.for]="fid() + '-b'"
        >{{ label() }}
        @if (req()) {
          <span class="req">*</span>
        }
        @if (opt()) {
          <span class="opt">(optional)</span>
        }
      </label>
    }
    <rp-dd
      [inputId]="fid()"
      [placeholder]="placeholder()"
      [options]="options()"
      [value]="value()"
      [disabled]="disabled()"
      (changed)="value.set($event)"
    />
    <div class="fld-e" [id]="fid() + '-e'" role="alert">
      <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
    </div>
    @if (hint()) {
      <div class="fld-h">{{ hint() }}</div>
    }
  </div>`,
})
export class SelectField {
  readonly fid = input.required<string>();
  readonly label = input('');
  readonly req = input(false);
  readonly opt = input(false);
  readonly placeholder = input('Choose');
  readonly hint = input('');
  readonly options = input.required<readonly DropdownOption[]>();
  readonly disabled = input(false);
  readonly error = input('');
  readonly value = model('');
}

/**
 * A display-only field (CR-06, the member drawer's locked fields): the value with a lock, why it
 * can't change here and, where it applies, the way to change it (a correction request).
 */
@Component({
  selector: 'rp-lf',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="fld locked" [class.invalid]="!!error()">
    <label class="fld-l" [attr.for]="fid()">{{ label() }}</label>
    <div class="fld-in">
      <input
        [id]="fid()"
        type="text"
        readonly
        autocomplete="off"
        placeholder="Not recorded"
        [attr.aria-describedby]="fid() + '-e'"
        [value]="value()"
      /><span class="suf plain" title="Display-only personal information (CR-06)"
        ><rp-icon name="lock" [size]="15"
      /></span>
    </div>
    <div class="fld-e" [id]="fid() + '-e'" role="alert">
      <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
    </div>
    <div class="fld-h">
      <rp-icon name="lock" [size]="11" /> {{ hint() }}
      @if (action()) {
        <button type="button" class="linkbtn" (click)="act.emit()">{{ action() }}</button>
      }
    </div>
  </div>`,
})
export class LockedField {
  readonly fid = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input('');
  readonly error = input('');
  readonly hint = input('Changes go through a correction request.');
  /** A link after the hint (e.g. "Request a correction"); none when ''. */
  readonly action = input('');
  readonly act = output<void>();
}

/** Kept, never shown in full (client 2026-10-12): the hint under a stored Aadhaar number or PAN. */
export const KEPT_ID = 'Stored as given and never shown in full; it can’t be changed here.';

const opts = <K extends string>(m: Readonly<Record<K, string>>): DropdownOption[] =>
  (Object.keys(m) as K[]).map((k) => ({ v: k, l: m[k] }));

/** Drops one error (a field was typed in). */
function cleared(errors: Errors, key: string): Errors {
  if (!errors[key]) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

/** The identity a correction request changes (IDN-057): what a locked field offers to fix. */
export type IdentityFix = 'FULL_NAME' | 'GENDER' | 'DOB';

/**
 * The student's fields (prototype "Student"); `full` adds the middle name, identity and blood group.
 * `locked` (an admitted student's record): the names, gender, date of birth, Aadhaar and PAN are
 * display-only — a correction request changes them (CR-06) — and the rest stays editable.
 */
@Component({
  selector: 'rp-student-fields',
  imports: [LockedField, SelectField, TextField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="c-form">
    @if (shut('first')) {
      <rp-lf
        fid="na-first"
        label="First name"
        [value]="value().first"
        [error]="errors()['first'] ?? ''"
        [action]="fix()"
        (act)="correct.emit('FULL_NAME')"
      />
    } @else {
      <rp-tf
        fid="na-first"
        label="First name"
        [req]="true"
        [maxlength]="50"
        [error]="errors()['first'] ?? ''"
        [value]="value().first"
        (valueChange)="patch('first', $event)"
      />
    }
    @if (locked()) {
      <rp-lf
        fid="na-middle"
        label="Middle name"
        [value]="value().middle"
        [error]="errors()['middle'] ?? ''"
        [action]="fix()"
        (act)="correct.emit('FULL_NAME')"
      />
    } @else if (full()) {
      <rp-tf
        fid="na-middle"
        label="Middle name"
        [opt]="true"
        [maxlength]="50"
        [error]="errors()['middle'] ?? ''"
        [value]="value().middle"
        (valueChange)="patch('middle', $event)"
      />
    }
    @if (shut('last')) {
      <rp-lf
        fid="na-last"
        label="Last name"
        [value]="value().last"
        [error]="errors()['last'] ?? ''"
        [action]="fix()"
        (act)="correct.emit('FULL_NAME')"
      />
    } @else {
      <rp-tf
        fid="na-last"
        label="Last name"
        [req]="true"
        [maxlength]="50"
        [error]="errors()['last'] ?? ''"
        [value]="value().last"
        (valueChange)="patch('last', $event)"
      />
    }
    @if (shut('gender')) {
      <rp-lf
        fid="na-gen"
        label="Gender"
        [value]="genderText()"
        [error]="errors()['gender'] ?? ''"
        [action]="fix()"
        (act)="correct.emit('GENDER')"
      />
    } @else {
      <rp-sf
        fid="na-gen"
        label="Gender"
        [req]="true"
        [options]="genders"
        [error]="errors()['gender'] ?? ''"
        [value]="value().gender"
        (valueChange)="patch('gender', $event)"
      />
    }
    @if (shut('dob')) {
      <rp-lf
        fid="na-dob"
        label="Date of birth"
        [value]="dobText()"
        [error]="errors()['dob'] ?? ''"
        [action]="fix()"
        (act)="correct.emit('DOB')"
      />
    } @else {
      <rp-tf
        fid="na-dob"
        label="Date of birth"
        type="date"
        [req]="true"
        [max]="today()"
        hint="Checked against the age band for the class (BR-50)."
        [error]="errors()['dob'] ?? ''"
        [value]="value().dob"
        (valueChange)="patch('dob', $event)"
      />
    }
    @if (locked()) {
      <rp-lf
        fid="na-aadhaar"
        label="Aadhaar number"
        [value]="value().keptAadhaar ?? ''"
        [hint]="keptId"
        [error]="errors()['aadhaar'] ?? ''"
      />
      <rp-lf
        fid="na-pan"
        label="PAN"
        [value]="value().keptPan ?? ''"
        [hint]="keptId"
        [error]="errors()['pan'] ?? ''"
      />
    } @else {
      <rp-tf
        fid="na-aadhaar"
        label="Aadhaar number"
        [opt]="true"
        inputmode="numeric"
        [maxlength]="12"
        [clean]="onlyDigits"
        [placeholder]="value().keptAadhaar ?? '12 digits'"
        [hint]="
          value().keptAadhaar
            ? 'Saved: ' + value().keptAadhaar + ' — type the number again to change it'
            : ''
        "
        [error]="errors()['aadhaar'] ?? ''"
        [value]="value().aadhaar"
        (valueChange)="patch('aadhaar', digitsOf($event))"
      />
      <rp-tf
        fid="na-pan"
        label="PAN"
        [opt]="true"
        [maxlength]="10"
        [clean]="panText"
        [placeholder]="value().keptPan ?? 'e.g. ABCDE1234F'"
        [hint]="
          value().keptPan ? 'Saved: ' + value().keptPan + ' — type it again to change it' : ''
        "
        [error]="errors()['pan'] ?? ''"
        [value]="value().pan"
        (valueChange)="patch('pan', panOf($event))"
      />
      @if ((value().keptAadhaar && !value().aadhaar) || (value().keptPan && !value().pan)) {
        <div class="full row g12">
          @if (value().keptAadhaar && !value().aadhaar) {
            <button type="button" class="linkbtn t-xs" id="na-aadhaar-x" (click)="dropAadhaar()">
              Remove the saved Aadhaar
            </button>
          }
          @if (value().keptPan && !value().pan) {
            <button type="button" class="linkbtn t-xs" id="na-pan-x" (click)="dropPan()">
              Remove the saved PAN
            </button>
          }
        </div>
      }
    }
    <rp-sf
      fid="na-cat"
      label="Category"
      [req]="true"
      [options]="categories"
      [error]="errors()['cat'] ?? ''"
      [value]="value().category"
      (valueChange)="patch('category', $event)"
    />
    <rp-sf
      fid="na-med"
      label="Medium"
      [req]="true"
      [options]="mediums()"
      [error]="errors()['med'] ?? ''"
      [value]="value().medium"
      (valueChange)="patch('medium', $event)"
    />
    @if (full()) {
      <rp-sf
        fid="na-blood"
        label="Blood group"
        [opt]="true"
        [options]="bloods"
        [error]="errors()['blood'] ?? ''"
        [value]="value().blood"
        (valueChange)="patch('blood', $event)"
      />
    }
  </div>`,
})
export class StudentFields {
  readonly value = model.required<StudentDraft>();
  readonly errors = model<Errors>({});
  readonly full = input(false);
  readonly today = input<string | null>(null);
  /** The identity is display-only (an admitted student's record). */
  readonly locked = input(false);
  /** On a locked record, the identity fields with nothing stored: filled once here (recordOpen). */
  readonly open = input<ReadonlySet<string>>(new Set());
  /** A locked field offers a correction request (the drawer's member is this student). */
  readonly correctable = input(false);
  readonly correct = output<IdentityFix>();
  protected readonly keptId = KEPT_ID;
  protected shut(k: string) {
    return this.locked() && !this.open().has(k);
  }
  protected readonly fix = computed(() => (this.correctable() ? 'Request a correction' : ''));
  protected readonly genderText = computed(() => {
    const g = this.value().gender;
    return g ? GENDER[g] : '';
  });
  protected readonly dobText = computed(() => {
    const d = this.value().dob;
    return d ? formatDate(d) : '';
  });
  protected readonly genders = opts<Gender>(GENDER);
  protected readonly categories = opts<Category>(CATEGORY);
  protected readonly bloods: DropdownOption[] = BLOOD_GROUPS.map((b) => ({
    v: b,
    l: b === 'UNKNOWN' ? 'Not known' : b,
  }));
  protected readonly mediums = computed<DropdownOption[]>(() => {
    const m = this.value().medium;
    const list: string[] = [...MEDIUMS];
    if (m && !list.includes(m)) list.push(m);
    return list.map((x) => ({ v: x, l: x }));
  });
  private readonly keys: Partial<Record<keyof StudentDraft, string>> = {
    category: 'cat',
    medium: 'med',
  };
  protected patch<K extends keyof StudentDraft>(k: K, v: string) {
    this.value.update((s) => ({ ...s, [k]: v }));
    this.errors.update((e) => cleared(e, this.keys[k] ?? k));
  }
  /** The stored Aadhaar (optional for the student) is cleared when the section is saved. */
  protected dropAadhaar() {
    this.value.update((s) => ({ ...s, keptAadhaar: null }));
  }
  /** The stored PAN is cleared when the section is saved. */
  protected dropPan() {
    this.value.update((s) => ({ ...s, keptPan: null }));
  }
  protected digitsOf(v: string) {
    return digitsOnly(v);
  }
  protected panOf(v: string) {
    return panChars(v);
  }
  protected readonly onlyDigits = onlyDigits;
  protected readonly panText = panText;
}

/** Aadhaar and mobile digits as typed. */
export const digitsOnly = onlyDigits;
/** A PAN as typed: capitals and digits. */
export const panChars = panText;

/** One address (residential or correspondence). */
@Component({
  selector: 'rp-address-fields',
  imports: [TextField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="c-form">
    <div class="full">
      <rp-tf
        [fid]="'na-' + prefix() + 'line1'"
        label="House and street"
        [req]="required()"
        [maxlength]="120"
        placeholder="e.g. No. 12, 4th Cross, Gopala"
        [error]="errors()[prefix() + 'line1'] ?? ''"
        [value]="value().line1"
        (valueChange)="patch('line1', $event)"
      />
    </div>
    <div class="full">
      <rp-tf
        [fid]="'na-' + prefix() + 'line2'"
        label="Area or locality"
        [req]="required()"
        [maxlength]="120"
        [error]="errors()[prefix() + 'line2'] ?? ''"
        [value]="value().line2"
        (valueChange)="patch('line2', $event)"
      />
    </div>
    <rp-tf
      [fid]="'na-' + prefix() + 'city'"
      label="City"
      [req]="required()"
      [maxlength]="60"
      [error]="errors()[prefix() + 'city'] ?? ''"
      [value]="value().city"
      (valueChange)="patch('city', $event)"
    />
    <rp-tf
      [fid]="'na-' + prefix() + 'state'"
      label="State"
      [req]="required()"
      [maxlength]="60"
      [error]="errors()[prefix() + 'state'] ?? ''"
      [value]="value().state"
      (valueChange)="patch('state', $event)"
    />
    <rp-tf
      [fid]="'na-' + prefix() + 'pin'"
      label="PIN code"
      [req]="required()"
      inputmode="numeric"
      [maxlength]="6"
      [error]="errors()[prefix() + 'pin'] ?? ''"
      [value]="value().pin"
      (valueChange)="patch('pin', $event)"
    />
  </div>`,
})
export class AddressFields {
  readonly value = model.required<AddressDraft>();
  readonly errors = model<Errors>({});
  /** The error keys' prefix ("r-" residential, "c-" correspondence). */
  readonly prefix = input('r-');
  readonly required = input(true);
  protected patch(k: keyof AddressDraft, v: string) {
    this.value.update((s) => ({ ...s, [k]: v }));
    this.errors.update((e) => cleared(e, this.prefix() + k));
  }
}

/** Residential address, "same as residential" and the correspondence address. */
@Component({
  selector: 'rp-addresses-fields',
  imports: [AddressFields],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="stack g12">
    <rp-address-fields
      prefix="r-"
      [required]="required()"
      [value]="value().res"
      (valueChange)="value.update((v) => ({ ...v, res: $event }))"
      [(errors)]="errors"
    />
    <label class="chk"
      ><input
        type="checkbox"
        id="na-same"
        [checked]="value().same"
        (change)="value.update((v) => ({ ...v, same: checked($event) }))"
      /><span>Correspondence address is the same as the residential address</span></label
    >
    @if (!value().same) {
      <rp-address-fields
        prefix="c-"
        [value]="value().corr"
        (valueChange)="value.update((v) => ({ ...v, corr: $event }))"
        [(errors)]="errors"
      />
    }
  </div>`,
})
export class AddressesFields {
  readonly value = model.required<AddressesDraft>();
  readonly errors = model<Errors>({});
  readonly required = input(true);
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
}

/** The previous school (prototype "Previous school"). */
@Component({
  selector: 'rp-previous-fields',
  imports: [SelectField, TextField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="c-form">
    <rp-tf
      fid="na-ps"
      label="Last school attended"
      placeholder="Required above LKG"
      [maxlength]="120"
      [error]="errors()['ps'] ?? ''"
      [value]="value().school"
      (valueChange)="patch('school', 'ps', $event)"
    />
    <rp-sf
      fid="na-pl"
      label="Last class studied"
      [options]="classOptions()"
      [error]="errors()['pl'] ?? ''"
      [value]="value().lastClass"
      (valueChange)="patch('lastClass', 'pl', $event)"
    />
    <rp-sf
      fid="na-pb"
      label="Board"
      [options]="boards"
      [error]="errors()['pb'] ?? ''"
      [value]="value().board"
      (valueChange)="patch('board', 'pb', $event)"
    />
    @if (full()) {
      <rp-sf
        fid="na-pr"
        label="Result"
        [opt]="true"
        [options]="resultOptions()"
        [error]="errors()['pr'] ?? ''"
        [value]="value().result"
        (valueChange)="patch('result', 'pr', $event)"
      />
    }
    @if (value().board === 'OTHER') {
      <rp-tf
        fid="na-pbo"
        label="Name of the board"
        [req]="true"
        [maxlength]="60"
        [error]="errors()['pbo'] ?? ''"
        [value]="value().otherBoard"
        (valueChange)="patch('otherBoard', 'pbo', $event)"
      />
    }
  </div>`,
})
export class PreviousFields {
  readonly value = model.required<PreviousDraft>();
  readonly errors = model<Errors>({});
  readonly classes = input<readonly ClassView[]>([]);
  readonly full = input(false);
  protected readonly boards = opts<Board>(BOARD);
  protected readonly classOptions = computed<DropdownOption[]>(() => {
    const list = this.classes().map((c) => ({ v: c.name, l: c.name }));
    const cur = this.value().lastClass;
    return cur && !list.some((o) => o.v === cur) ? [{ v: cur, l: cur }, ...list] : list;
  });
  /** Pass or Fail (client 2026-10-13); a result typed before stays shown as it was saved. */
  protected readonly resultOptions = computed<DropdownOption[]>(() => {
    const list = RESULTS.map((v) => ({ v, l: v }));
    const cur = this.value().result;
    return cur && !list.some((o) => o.v === cur) ? [{ v: cur, l: cur }, ...list] : list;
  });
  protected patch(k: keyof PreviousDraft, key: string, v: string) {
    this.value.update((s) => ({ ...s, [k]: v }));
    this.errors.update((e) => cleared(e, key));
  }
}

/**
 * A parent or guardian (name, relation for a guardian, mobile, e-mail, occupation). `locked` (an
 * admitted student's record): the name and mobile are display-only.
 */
@Component({
  selector: 'rp-person-fields',
  imports: [LockedField, TextField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="c-form">
    @if (shut('name')) {
      <rp-lf
        [fid]="'na-' + prefix() + 'name'"
        label="Name"
        [value]="value().name"
        [error]="errors()[prefix() + 'name'] ?? ''"
        [action]="correctable() ? 'Request a correction' : ''"
        (act)="correct.emit('FULL_NAME')"
      />
    } @else {
      <rp-tf
        [fid]="'na-' + prefix() + 'name'"
        label="Name"
        [req]="primary()"
        [maxlength]="100"
        [error]="errors()[prefix() + 'name'] ?? ''"
        [value]="value().name"
        (valueChange)="patch('name', $event)"
      />
    }
    @if (guardian()) {
      <rp-tf
        [fid]="'na-' + prefix() + 'rel'"
        label="Relation to the student"
        [req]="true"
        [maxlength]="40"
        placeholder="e.g. Uncle"
        [error]="errors()[prefix() + 'rel'] ?? ''"
        [value]="value().relation"
        (valueChange)="patch('relation', $event, 'rel')"
      />
    }
    @if (shut('mobile')) {
      <rp-lf
        [fid]="'na-' + prefix() + 'mobile'"
        label="Mobile"
        hint="The mobile identifies the family's CampusOne account; it can't be changed here."
        [value]="mobileText()"
        [error]="errors()[prefix() + 'mobile'] ?? ''"
      />
    } @else {
      <!-- An Indian number of 10 digits, or another with its country code (client 2026-10-13). -->
      <rp-tf
        [fid]="'na-' + prefix() + 'mobile'"
        label="Mobile"
        [req]="primary()"
        [opt]="!primary()"
        inputmode="tel"
        [maxlength]="16"
        [clean]="phoneText"
        placeholder="10 digits, or +971 and the number"
        [error]="errors()[prefix() + 'mobile'] ?? ''"
        [value]="value().mobile"
        (valueChange)="patch('mobile', $event)"
      />
    }
    <rp-tf
      [fid]="'na-' + prefix() + 'email'"
      label="E-mail"
      type="email"
      [req]="emailRequired()"
      [opt]="!emailRequired()"
      [maxlength]="254"
      [error]="errors()[prefix() + 'email'] ?? ''"
      [value]="value().email"
      (valueChange)="patch('email', $event)"
    />
    @if (!guardian()) {
      <rp-tf
        [fid]="'na-' + prefix() + 'occ'"
        label="Occupation"
        [opt]="true"
        [maxlength]="80"
        [error]="errors()[prefix() + 'occ'] ?? ''"
        [value]="value().occupation"
        (valueChange)="patch('occupation', $event, 'occ')"
      />
      <!-- The father's and the mother's annual income, in rupees (client 2026-10-14). -->
      <rp-tf
        [fid]="'na-' + prefix() + 'inc'"
        label="Annual income"
        [opt]="true"
        prefix="₹"
        inputmode="numeric"
        [maxlength]="10"
        [clean]="onlyDigits"
        placeholder="In rupees, e.g. 600000"
        [error]="errors()[prefix() + 'inc'] ?? ''"
        [value]="value().income"
        (valueChange)="patch('income', $event, 'inc')"
      />
    }
  </div>`,
})
export class PersonFields {
  protected readonly onlyDigits = onlyDigits;
  protected readonly phoneText = phoneText;
  readonly value = model.required<PersonDraft>();
  readonly errors = model<Errors>({});
  /** The error keys' prefix ("f-", "m-", "g-"). */
  readonly prefix = input.required<string>();
  /** The name and mobile are required. */
  readonly primary = input(false);
  readonly guardian = input(false);
  /** The primary contact's e-mail is required (client 2026-10-13). */
  readonly emailRequired = input(false);
  /** The name and mobile are display-only (an admitted student's record). */
  readonly locked = input(false);
  /** On a locked record, the error keys left open because nothing is stored ("m-name"). */
  readonly open = input<ReadonlySet<string>>(new Set());
  /** The locked name offers a correction request (the drawer's member is this person). */
  readonly correctable = input(false);
  readonly correct = output<IdentityFix>();
  protected shut(k: 'name' | 'mobile') {
    return this.locked() && !this.open().has(this.prefix() + k);
  }
  protected readonly mobileText = computed(() => {
    const m = this.value().mobile;
    return m ? formatMobile(m) : '';
  });
  protected patch(k: keyof PersonDraft, v: string, key: string = k) {
    this.value.update((s) => ({ ...s, [k]: v }));
    this.errors.update((e) => cleared(e, this.prefix() + key));
  }
}

/** The institution's own fields for applications (CR-12), by type. */
@Component({
  selector: 'rp-custom-inputs',
  imports: [SelectField, TextField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="c-form">
    @for (f of fields(); track f.id) {
      @if (f.type === 'DROPDOWN' || f.type === 'YES_NO') {
        <rp-sf
          [fid]="'na-cf-' + f.id"
          [label]="f.label"
          [req]="f.required"
          [opt]="!f.required"
          [options]="choices(f)"
          [error]="errors()['cf-' + f.id] ?? ''"
          [value]="values()[f.id] ?? ''"
          (valueChange)="patch(f.id, $event)"
        />
      } @else {
        <rp-tf
          [fid]="'na-cf-' + f.id"
          [label]="f.label"
          [req]="f.required"
          [opt]="!f.required"
          [type]="
            f.type === 'DATE'
              ? 'date'
              : f.type === 'EMAIL'
                ? 'email'
                : f.type === 'LONG_TEXT'
                  ? 'textarea'
                  : 'text'
          "
          [inputmode]="f.type === 'NUMBER' || f.type === 'PHONE' ? 'numeric' : null"
          [clean]="f.type === 'PHONE' ? onlyDigits : null"
          [hint]="
            f.type === 'MULTI_SELECT' ? 'Separate choices with commas: ' + f.options.join(', ') : ''
          "
          [error]="errors()['cf-' + f.id] ?? ''"
          [value]="values()[f.id] ?? ''"
          (valueChange)="patch(f.id, $event)"
        />
      }
    }
  </div>`,
})
export class CustomInputs {
  /** A phone number takes digits only (client 2026-10-14). */
  protected readonly onlyDigits = onlyDigits;
  readonly fields = input.required<readonly CustomField[]>();
  readonly values = model<Readonly<Record<string, string>>>({});
  readonly errors = model<Errors>({});
  readonly changedField = output<string>();
  protected choices(f: CustomField): DropdownOption[] {
    return (f.type === 'YES_NO' ? ['Yes', 'No'] : f.options).map((o) => ({ v: o, l: o }));
  }
  protected patch(id: string, v: string) {
    this.values.update((s) => ({ ...s, [id]: v }));
    this.errors.update((e) => cleared(e, `cf-${id}`));
    this.changedField.emit(id);
  }
}
