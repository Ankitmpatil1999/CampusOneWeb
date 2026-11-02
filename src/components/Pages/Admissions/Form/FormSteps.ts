/**
 * p.form steps 1–4 (prototype stepBody cases 0–3): Class & year, Student, Addresses and Previous
 * schooling. Each step draws the prototype's markup and writes to the shared FormState.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import type { OpenYear } from '../admissions.api';
import { bornRange, date, today, yearLabel } from '../admissions.store';
import { PaChoice, PaField, PaUpload, type PickedFile } from '../Shared/AdmissionsUi';
import { CardUploads } from './CardUploads';
import { type FormState, digits, upper, val } from './form.ctx';
import {
  BLOOD,
  BOARDS,
  CATEGORIES,
  GENDERS,
  MEDIUMS,
  RESULTS,
  STATES,
  STUDENT_CARDS,
  ageCheck,
  type Draft,
  defaultJoin,
  joinWindow,
  orderOf,
  tcDueWindow,
} from './form.state';

const opts = (xs: readonly string[]): DropdownOption[] =>
  xs.map((v) => ({ v, l: v.replace(/^(\w+)-$/, '$1−') }));

// --- step 1: Class & year ------------------------------------------------------------------------------

@Component({
  selector: 'rp-pa-step-class',
  imports: [Dropdown, Icon, PaChoice, PaField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@let d = f().d();
    <div class="stack g20">
      <rp-pa-fld
        fid="pa-year"
        label="Academic year"
        [labelFor]="null"
        [req]="true"
        [bare]="true"
        [error]="f().err('pa-year')"
      >
        <div class="pa-choices" role="radiogroup" aria-label="Academic year">
          @for (y of years(); track y.id) {
            <rp-pa-choice
              group="pa-year"
              [on]="y.id === d.year"
              [icon]="y.kind === 'MID_TERM' ? 'calendar' : 'sparkles'"
              [title]="yl(y.label)"
              [sub]="
                y.kind === 'MID_TERM'
                  ? 'Mid-term · joining during the year'
                  : 'Regular · session starts ' + dt(y.startsOn)
              "
              (pick)="pickYear(y)"
            />
          }
        </div>
      </rp-pa-fld>
      <div class="pa-g2">
        <rp-pa-fld
          fid="pa-class"
          label="Class sought"
          labelFor="pa-class-b"
          [req]="true"
          [bare]="true"
          [error]="f().err('pa-class')"
          [hint]="bandHint()"
        >
          <rp-dd
            inputId="pa-class"
            [options]="classOpts()"
            [value]="d.classId"
            placeholder="Choose a class"
            (changed)="f().put('classId', $event, 'pa-class')"
          />
        </rp-pa-fld>
        <rp-pa-fld
          fid="pa-join"
          label="Joining date"
          [req]="true"
          [error]="f().err('pa-join')"
          [hint]="
            window().min ? 'Between ' + dt(window().min) + ' and ' + dt(window().max) + '.' : ''
          "
        >
          <input
            id="pa-join"
            name="pa-join"
            type="date"
            autocomplete="off"
            aria-describedby="pa-join-e"
            [min]="window().min"
            [max]="window().max"
            [value]="d.joining"
            (input)="f().put('joining', v($event), 'pa-join')"
          />
        </rp-pa-fld>
      </div>
      @if (f().year(); as y) {
        @if (!f().mid()) {
          <div class="note tone-ok">
            <rp-icon name="checkc" [size]="17" />
            <div class="grow">
              <b>Regular admission</b> — joining at the start of the {{ yl(y.label) }} year on
              {{ dt(y.startsOn) }}.
            </div>
          </div>
        } @else if (!d.joining) {
          <div class="note tone-info">
            <rp-icon name="calendar" [size]="17" />
            <div class="grow">
              The {{ yl(y.label) }} year started on {{ dt(y.startsOn) }}, so any joining date now is
              a <b>mid-term admission</b>.
            </div>
          </div>
        } @else {
          <div class="pa-mid">
            <rp-icon name="sparkles" [size]="18" />
            <div>
              <b>Mid-term admission</b>
              <p>
                Joining on {{ dt(d.joining) }}, after the year's first term began on
                {{ dt(y.startsOn) }}. You'll need a transfer certificate (or an undertaking to
                submit it by a date) and at least one reference. The age band is measured on the
                joining date.
              </p>
            </div>
          </div>
        }
      }
      @if (f().mid()) {
        <rp-pa-fld
          fid="pa-reason"
          label="Reason for joining mid-year"
          [opt]="true"
          [error]="f().err('pa-reason')"
        >
          <input
            id="pa-reason"
            name="pa-reason"
            type="text"
            maxlength="120"
            autocomplete="off"
            aria-describedby="pa-reason-e"
            [placeholder]="'e.g. Parent transferred to ' + (city() || 'the city')"
            [value]="d.midReason"
            (input)="f().put('midReason', v($event), 'pa-reason')"
          />
        </rp-pa-fld>
      }
    </div>`,
})
export class StepClass {
  readonly f = input.required<FormState>();
  protected readonly years = computed(() => this.f().landing()?.years ?? []);
  protected readonly city = computed(() => this.f().landing()?.institution.city ?? '');
  protected readonly classOpts = computed<DropdownOption[]>(() =>
    (this.f().landing()?.classes ?? []).map((c) => ({ v: c.id, l: c.name })),
  );
  protected readonly window = computed(() => joinWindow(this.f().year()));
  protected readonly bandHint = computed(() => {
    const c = this.f().cls();
    const y = this.f().year();
    if (!c || !y) return 'Choose a class to see its age band.';
    if (!c.ageBand) return '';
    const Y = Number(y.startsOn.slice(0, 4));
    const r = bornRange(c.ageBand, Y);
    return `${c.name} accepts children aged ${c.ageBand.min}–${c.ageBand.max} on 1 June ${Y} — born ${date(r.from)} to ${date(r.to)}.`;
  });

  protected v(e: Event) {
    return val(e);
  }
  protected yl(l: string) {
    return yearLabel(l);
  }
  protected dt(v: string) {
    return date(v);
  }

  protected pickYear(y: OpenYear) {
    if (this.f().d().year === y.id) return;
    this.f().edit((d) => {
      d.year = y.id;
      d.joining = defaultJoin(y);
    });
    this.f().clear('pa-year', 'pa-join');
  }
}

// --- step 2: Student -------------------------------------------------------------------------------------

@Component({
  selector: 'rp-pa-step-student',
  imports: [CardUploads, Dropdown, Icon, PaField, PaUpload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@let d = f().d();
    <div class="stack g20">
      <div class="pa-g3">
        <rp-pa-fld fid="pa-first" label="First name" [req]="true" [error]="f().err('pa-first')">
          <input
            id="pa-first"
            name="pa-first"
            type="text"
            maxlength="40"
            autocomplete="given-name"
            aria-describedby="pa-first-e"
            [value]="d.first"
            (input)="f().put('first', v($event), 'pa-first')"
          />
        </rp-pa-fld>
        <rp-pa-fld fid="pa-middle" label="Middle name" [opt]="true" [error]="f().err('pa-middle')">
          <input
            id="pa-middle"
            name="pa-middle"
            type="text"
            maxlength="40"
            autocomplete="off"
            aria-describedby="pa-middle-e"
            [value]="d.middle"
            (input)="f().put('middle', v($event), 'pa-middle')"
          />
        </rp-pa-fld>
        <rp-pa-fld fid="pa-last" label="Last name" [req]="true" [error]="f().err('pa-last')">
          <input
            id="pa-last"
            name="pa-last"
            type="text"
            maxlength="40"
            autocomplete="family-name"
            aria-describedby="pa-last-e"
            [value]="d.last"
            (input)="f().put('last', v($event), 'pa-last')"
          />
        </rp-pa-fld>
      </div>
      <div class="pa-g3">
        <rp-pa-fld
          fid="pa-gender"
          label="Gender"
          labelFor="pa-gender-b"
          [req]="true"
          [bare]="true"
          [error]="f().err('pa-gender')"
        >
          <rp-dd
            inputId="pa-gender"
            [options]="genders"
            [value]="d.gender"
            placeholder="Choose"
            (changed)="f().put('gender', $event, 'pa-gender')"
          />
        </rp-pa-fld>
        <rp-pa-fld fid="pa-dob" label="Date of birth" [req]="true" [error]="f().err('pa-dob')">
          <input
            id="pa-dob"
            name="pa-dob"
            type="date"
            autocomplete="off"
            aria-describedby="pa-dob-e"
            [max]="today"
            [value]="d.dob"
            (input)="f().put('dob', v($event), 'pa-dob')"
          />
        </rp-pa-fld>
      </div>
      <div id="pa-agehint" class="pa-agehint">
        @if (age(); as c) {
          <span class="pa-age" [class.ok]="c.ok" [class.bad]="!c.ok"
            ><rp-icon [name]="c.ok ? 'checkc' : 'alertc'" [size]="13" /><span
              >Age on {{ dt(c.ref) }}: <b>{{ c.a.y }} years {{ c.a.m }} months</b>.
              {{ c.cls.name }} accepts {{ c.b.min }}–{{ c.b.max }} years{{
                f().mid() ? ' — measured on the joining date for a mid-term admission' : ''
              }}.{{
                c.ok ? '' : ' Check the date of birth, or go back and choose another class.'
              }}</span
            ></span
          >
        } @else if (f().cls()?.ageBand) {
          Age is checked against {{ f().cls()!.name }}'s band on {{ dt(refDate()) }}.
        }
      </div>
      <div class="pa-g2">
        <rp-pa-fld
          fid="pa-aadhaar"
          label="Aadhaar number"
          [opt]="true"
          [hint]="
            d.kept.aadhaar
              ? 'Saved: ' + d.kept.aadhaar + ' — type the number again to change it'
              : 'The 12 digits on the Aadhaar card, if the student has one'
          "
          [error]="f().err('pa-aadhaar')"
        >
          <input
            id="pa-aadhaar"
            name="pa-aadhaar"
            type="text"
            inputmode="numeric"
            maxlength="12"
            autocomplete="off"
            [placeholder]="d.kept.aadhaar ?? '12 digits'"
            aria-describedby="pa-aadhaar-e"
            [value]="d.aadhaar"
            (input)="f().put('aadhaar', n($event), 'pa-aadhaar')"
          />
        </rp-pa-fld>
        <rp-pa-fld
          fid="pa-pan"
          label="PAN"
          [opt]="true"
          [hint]="
            d.kept.pan
              ? 'Saved: ' + d.kept.pan + ' — type it again to change it'
              : 'Only if the student has one'
          "
          [error]="f().err('pa-pan')"
        >
          <input
            id="pa-pan"
            name="pa-pan"
            type="text"
            maxlength="10"
            autocomplete="off"
            autocapitalize="characters"
            [placeholder]="d.kept.pan ?? 'e.g. ABCDE1234F'"
            aria-describedby="pa-pan-e"
            [value]="d.pan"
            (input)="f().put('pan', up($event), 'pa-pan')"
          />
        </rp-pa-fld>
      </div>
      @if ((d.kept.aadhaar && !d.aadhaar) || (d.kept.pan && !d.pan)) {
        <div class="row g12 pa-unkeep">
          @if (d.kept.aadhaar && !d.aadhaar) {
            <button type="button" class="linkbtn" id="pa-aadhaar-x" (click)="dropAadhaar()">
              <rp-icon name="x" [size]="13" /> Remove the saved Aadhaar
            </button>
          }
          @if (d.kept.pan && !d.pan) {
            <button type="button" class="linkbtn" id="pa-pan-x" (click)="dropPan()">
              <rp-icon name="x" [size]="13" /> Remove the saved PAN
            </button>
          }
        </div>
      }
      <!-- The student's own contact (client 2026-10-23): with a mobile, the student gets a CampusOne account. -->
      <div class="pa-g2">
        <rp-pa-fld
          fid="pa-smob"
          label="Student’s contact number"
          [opt]="true"
          hint="The student’s own mobile, if any: their CampusOne login"
          [error]="f().err('pa-smob')"
        >
          <input
            id="pa-smob"
            name="pa-smob"
            type="text"
            inputmode="numeric"
            maxlength="10"
            autocomplete="off"
            placeholder="10 digits"
            aria-describedby="pa-smob-e"
            [value]="d.smobile"
            (input)="f().put('smobile', n($event), 'pa-smob')"
          />
        </rp-pa-fld>
        <rp-pa-fld
          fid="pa-semail"
          label="Student’s e-mail"
          [opt]="true"
          [error]="f().err('pa-semail')"
        >
          <input
            id="pa-semail"
            name="pa-semail"
            type="email"
            autocomplete="off"
            placeholder="name@example.com"
            aria-describedby="pa-semail-e"
            [value]="d.semail"
            (input)="f().put('semail', v($event), 'pa-semail')"
          />
        </rp-pa-fld>
      </div>
      <div class="pa-g3">
        <rp-pa-fld
          fid="pa-cat"
          label="Category"
          labelFor="pa-cat-b"
          [req]="true"
          [bare]="true"
          [error]="f().err('pa-cat')"
        >
          <rp-dd
            inputId="pa-cat"
            [options]="categories"
            [value]="d.category"
            placeholder="Choose"
            (changed)="f().put('category', $event, 'pa-cat')"
          />
        </rp-pa-fld>
        <rp-pa-fld
          fid="pa-med"
          label="Medium of instruction"
          labelFor="pa-med-b"
          [req]="true"
          [bare]="true"
          [error]="f().err('pa-med')"
        >
          <rp-dd
            inputId="pa-med"
            [options]="mediums"
            [value]="d.medium"
            placeholder="Choose"
            (changed)="f().put('medium', $event, 'pa-med')"
          />
        </rp-pa-fld>
        <rp-pa-fld
          fid="pa-blood"
          label="Blood group"
          labelFor="pa-blood-b"
          [req]="true"
          [bare]="true"
          [error]="f().err('pa-blood')"
        >
          <rp-dd
            inputId="pa-blood"
            [options]="blood"
            [value]="d.blood"
            placeholder="Choose"
            (changed)="f().put('blood', $event, 'pa-blood')"
          />
        </rp-pa-fld>
      </div>
      <div class="pa-g2">
        <rp-pa-fld
          fid="pa-allergy"
          label="Food allergies"
          [opt]="true"
          [error]="f().err('pa-allergy')"
        >
          <input
            id="pa-allergy"
            name="pa-allergy"
            type="text"
            maxlength="80"
            autocomplete="off"
            placeholder="e.g. Peanuts — or leave blank"
            aria-describedby="pa-allergy-e"
            [value]="d.allergies"
            (input)="f().put('allergies', v($event), 'pa-allergy')"
          />
        </rp-pa-fld>
        <rp-pa-fld
          fid="pa-health"
          label="Health conditions the school should know about"
          [opt]="true"
          [error]="f().err('pa-health')"
        >
          <textarea
            id="pa-health"
            name="pa-health"
            rows="2"
            maxlength="300"
            placeholder="e.g. Asthma — carries an inhaler"
            aria-describedby="pa-health-e"
            [value]="d.health"
            (input)="f().put('health', v($event), 'pa-health')"
          ></textarea>
        </rp-pa-fld>
      </div>
      <div class="pa-g2">
        <rp-pa-upl
          fid="pa-photo"
          label="Passport-size photo"
          [req]="true"
          accept=".jpg,.jpeg,.png"
          hint="Plain background"
          formats="JPG or PNG · up to 2 MB"
          icon="camera"
          cta="Choose a photo"
          [file]="d.photo"
          [progress]="f().pct('pa-photo')"
          [error]="f().err('pa-photo')"
          (picked)="f().upload('pa-photo', 'PHOTO', $event, setPhoto)"
          (viewed)="f().open('PHOTO')"
          (removed)="f().remove('pa-photo', 'PHOTO', clearPhoto)"
        />
      </div>
      <!-- The student's cards, optional like the numbers (client 2026-10-13). -->
      <rp-pa-cards
        [f]="f()"
        [slots]="cards"
        fsId="pa-sc"
        title="Student's Aadhaar and PAN cards"
        note="Optional — both sides of each card the student has, as clear scans or photos."
      />
    </div>`,
})
export class StepStudent {
  readonly f = input.required<FormState>();
  protected readonly genders = opts(GENDERS);
  protected readonly categories = opts(CATEGORIES);
  protected readonly mediums = opts(MEDIUMS);
  protected readonly blood = opts(BLOOD);
  protected readonly today = today();
  protected readonly age = computed(() => {
    const facts = this.f().facts();
    return facts ? ageCheck(this.f().d(), facts) : null;
  });
  protected readonly refDate = computed(() => {
    const y = this.f().year();
    const d = this.f().d();
    return y ? (this.f().mid() && d.joining ? d.joining : `${y.startsOn.slice(0, 4)}-06-01`) : '';
  });
  protected readonly setPhoto = (d: Draft, file: PickedFile) => {
    d.photo = file;
  };
  protected readonly clearPhoto = (d: Draft) => {
    d.photo = null;
  };
  protected readonly cards = STUDENT_CARDS;

  /** The saved Aadhaar (optional for the student) is cleared with the step's next save. */
  protected dropAadhaar() {
    this.f().edit((d) => {
      d.kept.aadhaar = null;
    });
    this.f().clear('pa-aadhaar');
  }

  /** The saved PAN is cleared with the step's next save. */
  protected dropPan() {
    this.f().edit((d) => {
      d.kept.pan = null;
    });
    this.f().clear('pa-pan');
  }

  protected v(e: Event) {
    return val(e);
  }
  protected n(e: Event) {
    return digits(e);
  }
  protected up(e: Event) {
    return upper(e);
  }
  protected dt(v: string) {
    return date(v);
  }
}

// --- step 3: Addresses -----------------------------------------------------------------------------------

@Component({
  selector: 'rp-pa-addr',
  imports: [Dropdown, PaField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@let a = f().d()[key()];
    <fieldset class="pa-fs">
      <legend>{{ title() }}</legend>
      <div class="pa-g2">
        <rp-pa-fld
          [fid]="id('1')"
          label="House number and street"
          [req]="true"
          [error]="f().err(id('1'))"
        >
          <input
            [id]="id('1')"
            type="text"
            maxlength="80"
            autocomplete="off"
            [attr.aria-describedby]="id('1') + '-e'"
            [value]="a.line1"
            (input)="put('line1', $event, '1')"
          />
        </rp-pa-fld>
        <rp-pa-fld [fid]="id('2')" label="Area or locality" [req]="true" [error]="f().err(id('2'))">
          <input
            [id]="id('2')"
            type="text"
            maxlength="80"
            autocomplete="off"
            [attr.aria-describedby]="id('2') + '-e'"
            [value]="a.line2"
            (input)="put('line2', $event, '2')"
          />
        </rp-pa-fld>
      </div>
      <div class="pa-g3">
        <rp-pa-fld
          [fid]="id('city')"
          label="City or town"
          [req]="true"
          [error]="f().err(id('city'))"
        >
          <input
            [id]="id('city')"
            type="text"
            maxlength="40"
            autocomplete="off"
            [attr.aria-describedby]="id('city') + '-e'"
            [value]="a.city"
            (input)="put('city', $event, 'city')"
          />
        </rp-pa-fld>
        <rp-pa-fld
          [fid]="id('state')"
          label="State"
          [labelFor]="id('state') + '-b'"
          [req]="true"
          [bare]="true"
          [error]="f().err(id('state'))"
        >
          <rp-dd
            [inputId]="id('state')"
            [options]="states"
            [value]="a.state"
            (changed)="f().putIn(key(), 'state', $event, id('state'))"
          />
        </rp-pa-fld>
        <rp-pa-fld [fid]="id('pin')" label="PIN code" [req]="true" [error]="f().err(id('pin'))">
          <input
            [id]="id('pin')"
            type="text"
            inputmode="numeric"
            maxlength="6"
            autocomplete="off"
            placeholder="6 digits"
            [attr.aria-describedby]="id('pin') + '-e'"
            [value]="a.pin"
            (input)="f().putIn(key(), 'pin', n($event), id('pin'))"
          />
        </rp-pa-fld>
      </div>
    </fieldset>`,
})
export class AddressFields {
  readonly f = input.required<FormState>();
  readonly key = input.required<'res' | 'corr'>();
  readonly title = input.required<string>();
  protected readonly states = opts(STATES);
  protected id(s: string) {
    return `pa-${this.key() === 'res' ? 'r' : 'c'}${s}`;
  }
  protected put(k: string, e: Event, s: string) {
    this.f().putIn(this.key(), k, val(e), this.id(s));
  }
  protected n(e: Event) {
    return digits(e);
  }
}

@Component({
  selector: 'rp-pa-step-address',
  imports: [AddressFields],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="stack g20">
    <rp-pa-addr [f]="f()" key="res" title="Residential address" />
    <label class="chk"
      ><input
        type="checkbox"
        id="pa-same"
        [checked]="f().d().same"
        (change)="f().put('same', checked($event), 'pa-same')"
      /><span
        >Send letters to the residential address (correspondence address is the same)</span
      ></label
    >
    @if (!f().d().same) {
      <rp-pa-addr [f]="f()" key="corr" title="Correspondence address" />
    }
  </div>`,
})
export class StepAddress {
  readonly f = input.required<FormState>();
  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }
}

// --- step 4: Previous schooling ----------------------------------------------------------------------

@Component({
  selector: 'rp-pa-step-previous',
  imports: [Dropdown, Icon, PaChoice, PaField, PaUpload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@let d = f().d();
    @let mid = f().mid();
    <div class="stack g20">
      @if (!needed()) {
        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            Previous schooling isn't needed for {{ f().cls()?.name ?? 'Nursery or LKG' }}. Add it if
            your child attended a playschool.
          </div>
        </div>
      }
      <div class="pa-g2">
        <rp-pa-fld
          fid="pa-psch"
          label="Last school attended"
          [req]="needed()"
          [opt]="!needed()"
          [error]="f().err('pa-psch')"
        >
          <input
            id="pa-psch"
            name="pa-psch"
            type="text"
            maxlength="80"
            autocomplete="off"
            aria-describedby="pa-psch-e"
            [value]="d.prev.school"
            (input)="f().putIn('prev', 'school', v($event), 'pa-psch')"
          />
        </rp-pa-fld>
        <rp-pa-fld
          fid="pa-plast"
          [label]="mid ? 'Class studying now' : 'Last class studied'"
          labelFor="pa-plast-b"
          [req]="needed()"
          [opt]="!needed()"
          [bare]="true"
          [error]="f().err('pa-plast')"
          [hint]="
            mid
              ? 'For a mid-term admission, the class sought can be the same class or a higher one.'
              : 'Must be below ' + (f().cls()?.name ?? 'the class sought') + '.'
          "
        >
          <rp-dd
            inputId="pa-plast"
            [options]="lastOpts()"
            [value]="d.prev.last"
            placeholder="Choose"
            (changed)="f().putIn('prev', 'last', $event, 'pa-plast')"
          />
        </rp-pa-fld>
      </div>
      <div class="pa-g3">
        <rp-pa-fld
          fid="pa-pres"
          label="Last result"
          labelFor="pa-pres-b"
          [req]="needed()"
          [opt]="!needed()"
          [bare]="true"
          [error]="f().err('pa-pres')"
        >
          <rp-dd
            inputId="pa-pres"
            [options]="results"
            [value]="d.prev.result"
            placeholder="Choose"
            (changed)="f().putIn('prev', 'result', $event, 'pa-pres')"
          />
        </rp-pa-fld>
        <rp-pa-fld
          fid="pa-pboard"
          label="Board"
          labelFor="pa-pboard-b"
          [req]="needed()"
          [opt]="!needed()"
          [bare]="true"
          [error]="f().err('pa-pboard')"
        >
          <rp-dd
            inputId="pa-pboard"
            [options]="boards"
            [value]="d.prev.board"
            placeholder="Choose"
            (changed)="f().putIn('prev', 'board', $event, 'pa-pboard')"
          />
        </rp-pa-fld>
        @if (d.prev.board === 'Other') {
          <rp-pa-fld
            fid="pa-pother"
            label="Name of the board"
            [req]="true"
            [error]="f().err('pa-pother')"
          >
            <input
              id="pa-pother"
              name="pa-pother"
              type="text"
              maxlength="60"
              autocomplete="off"
              aria-describedby="pa-pother-e"
              [value]="d.prev.other"
              (input)="f().putIn('prev', 'other', v($event), 'pa-pother')"
            />
          </rp-pa-fld>
        } @else {
          <div></div>
        }
      </div>
      @if (mid) {
        <fieldset class="pa-fs">
          <legend>Transfer certificate</legend>
          <p class="pa-muted">
            A mid-term admission needs the previous school's transfer certificate. If it isn't
            ready, you can give an undertaking to submit it by a date.
          </p>
          @if (d.tcRecorded; as t) {
            <div class="note" [class]="t.mode === 'UNDERTAKING' ? 'tone-warn' : 'tone-ok'">
              <rp-icon name="filetext" [size]="17" />
              <div class="grow">
                @if (t.mode === 'UNDERTAKING') {
                  Transfer certificate: undertaking recorded — due by
                  <b>{{ dt(t.dueDate) }}</b
                  >.
                } @else {
                  Transfer certificate received.
                }
              </div>
            </div>
          } @else {
            <div class="pa-choices" role="radiogroup" aria-label="Transfer certificate">
              <rp-pa-choice
                group="pa-tc"
                [on]="d.tc.mode === 'tc'"
                icon="filetext"
                title="I have the transfer certificate"
                sub="Upload it now"
                (pick)="f().putIn('tc', 'mode', 'tc')"
              />
              <rp-pa-choice
                group="pa-tc"
                [on]="d.tc.mode === 'und'"
                icon="pen"
                title="It will follow"
                sub="Record an undertaking with a date"
                (pick)="f().putIn('tc', 'mode', 'und', 'pa-tcfile')"
              />
            </div>
            @if (d.tc.mode === 'tc') {
              <rp-pa-upl
                fid="pa-tcfile"
                label="Transfer certificate"
                [req]="true"
                [file]="d.tc.file"
                [progress]="f().pct('pa-tcfile')"
                [error]="f().err('pa-tcfile')"
                (picked)="f().upload('pa-tcfile', 'TC', $event, setTc)"
                (viewed)="f().open('TC')"
                (removed)="f().remove('pa-tcfile', 'TC', clearTc)"
              />
            } @else {
              <rp-pa-fld
                fid="pa-tcdue"
                label="I'll hand in the transfer certificate by"
                [req]="true"
                [error]="f().err('pa-tcdue')"
                [hint]="'No later than ' + dt(tcWindow().max) + ' (60 days after joining).'"
              >
                <input
                  id="pa-tcdue"
                  name="pa-tcdue"
                  type="date"
                  autocomplete="off"
                  aria-describedby="pa-tcdue-e"
                  [min]="tcWindow().min"
                  [max]="tcWindow().max"
                  [value]="d.tc.due"
                  (input)="f().putIn('tc', 'due', v($event), 'pa-tcdue')"
                />
              </rp-pa-fld>
              <div class="note tone-warn" id="pa-tcfile">
                <rp-icon name="pen" [size]="17" />
                <div class="grow">
                  This is your undertaking to hand the previous school's transfer certificate to the
                  admissions office by this date. The school may cancel the admission if it isn't
                  received in time.
                </div>
              </div>
              @if (f().err('pa-tcfile')) {
                <div class="fld invalid">
                  <div class="fld-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ f().err('pa-tcfile') }}</span>
                  </div>
                </div>
              }
            }
          }
        </fieldset>
      } @else if (needed()) {
        <!-- A regular admission brings the previous school's certificate too (client 2026-10-15). -->
        <fieldset class="pa-fs" id="pa-tc-regular">
          <legend>Transfer certificate</legend>
          <p class="pa-muted">Upload the transfer certificate from the previous school.</p>
          @if (d.tcRecorded; as t) {
            <div class="note tone-ok">
              <rp-icon name="filetext" [size]="17" />
              <div class="grow">Transfer certificate received.</div>
            </div>
          } @else {
            <rp-pa-upl
              fid="pa-tcfile"
              label="Transfer certificate"
              [req]="true"
              [file]="d.tc.file"
              [progress]="f().pct('pa-tcfile')"
              [error]="f().err('pa-tcfile')"
              (picked)="f().upload('pa-tcfile', 'TC', $event, setTc)"
              (viewed)="f().open('TC')"
              (removed)="f().remove('pa-tcfile', 'TC', clearTc)"
            />
          }
        </fieldset>
      }
    </div>`,
})
export class StepPrevious {
  readonly f = input.required<FormState>();
  protected readonly boards = opts(BOARDS);
  protected readonly results = opts(RESULTS);
  /** Previous schooling is needed from UKG upwards (prototype: class order above 1). */
  protected readonly needed = computed(() => this.f().order() > 1);
  protected readonly lastOpts = computed<DropdownOption[]>(() => {
    const l = this.f().landing();
    if (!l) return [];
    const cur = this.f().order();
    const mid = this.f().mid();
    return l.classes
      .filter((c) => !this.f().cls() || (mid ? orderOf(l, c) <= cur : orderOf(l, c) < cur))
      .map((c) => ({ v: c.name, l: c.name }));
  });
  protected readonly setTc = (d: Draft, file: PickedFile) => {
    d.tc.file = file;
  };
  protected readonly clearTc = (d: Draft) => {
    d.tc.file = null;
  };
  /** The undertaking's dates: from today to 60 days after joining (client 2026-10-13). */
  protected readonly tcWindow = computed(() => tcDueWindow(this.f().d()));
  protected v(e: Event) {
    return val(e);
  }
  protected dt(v: string | null) {
    return date(v);
  }
}
