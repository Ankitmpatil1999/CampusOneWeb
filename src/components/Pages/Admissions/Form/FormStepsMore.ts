/**
 * p.form steps 5–8 (prototype stepBody cases 4–7): Parents & guardians, References, Documents (with
 * the institution's own fields, CR-12) and Review & declaration.
 */
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { SearchSelect } from '../../../Shared/SearchSelect';
import { formatInr } from '../../../Utils/format';
import type { DocType, LandingField } from '../admissions.api';
import { date, fileSize, mobileText, paise, yearLabel } from '../admissions.store';
import {
  PaChoice,
  PaField,
  PaSeg,
  PaUpload,
  type PickedFile,
  type SegOption,
} from '../Shared/AdmissionsUi';
import { CardUploads, CountryCode, IdNumbers } from './CardUploads';
import { type FormState, digits, val } from './form.ctx';
import {
  PERSON_CARDS,
  STUDENT_CARDS,
  type Draft,
  type Holder,
  type PersonDraft,
  type Who,
  idHolders,
  idsShown,
  joinMobile,
  maskAadhaar,
  maskPan,
  primaryDefault,
  splitMobile,
} from './form.state';
import { FamilyFound, type FamilyLookup, type LookupPerson } from '../../../Shared/FamilyFound';
import { ContactVerify } from '../Shared/ContactVerify';

const words = (n: number) => ['none', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n);

// --- step 5: Parents & guardians ---------------------------------------------------------------------

@Component({
  selector: 'rp-pa-person',
  imports: [CardUploads, CountryCode, IdNumbers, PaField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@let x = f().d()[k()];
    <fieldset class="pa-fs">
      <legend>{{ title() }}</legend>
      <div class="pa-g2">
        <rp-pa-fld
          [fid]="id('name')"
          label="Full name"
          [req]="required()"
          [error]="f().err(id('name'))"
        >
          <input
            [id]="id('name')"
            type="text"
            maxlength="60"
            autocomplete="off"
            placeholder="As on official documents"
            [attr.aria-describedby]="id('name') + '-e'"
            [value]="x.name"
            (input)="put('name', v($event), 'name')"
          />
        </rp-pa-fld>
        @if (k() === 'guardian') {
          <rp-pa-fld
            fid="pa-g-rel"
            label="Relationship to the student"
            [error]="f().err('pa-g-rel')"
          >
            <input
              id="pa-g-rel"
              type="text"
              maxlength="30"
              autocomplete="off"
              placeholder="e.g. Uncle"
              aria-describedby="pa-g-rel-e"
              [value]="f().d().guardian.relation"
              (input)="f().putIn('guardian', 'relation', v($event), 'pa-g-rel')"
            />
          </rp-pa-fld>
        }
        <rp-pa-fld [fid]="id('mob')" label="Mobile" [req]="required()" [error]="f().err(id('mob'))">
          <rp-pa-cc
            [fid]="id('cc')"
            [value]="x.cc"
            [what]="title() + '’s mobile'"
            (picked)="put('cc', $event, 'mob')"
          /><input
            [id]="id('mob')"
            type="text"
            inputmode="numeric"
            [attr.maxlength]="x.cc === '+91' ? 10 : 12"
            autocomplete="off"
            [placeholder]="x.cc === '+91' ? '10 digits' : 'Number without the country code'"
            [attr.aria-describedby]="id('mob') + '-e'"
            [value]="x.mobile"
            (input)="put('mobile', n($event), 'mob')"
          />
        </rp-pa-fld>
        <!-- The primary contact's e-mail is required (client 2026-10-13). -->
        <rp-pa-fld
          [fid]="id('email')"
          label="E-mail"
          [req]="emailRequired()"
          [opt]="!emailRequired()"
          [hint]="
            emailRequired() ? 'The primary contact’s e-mail: the school writes here too.' : ''
          "
          [error]="f().err(id('email'))"
        >
          <input
            [id]="id('email')"
            type="email"
            autocomplete="off"
            placeholder="name@example.com"
            [attr.aria-describedby]="id('email') + '-e'"
            [value]="x.email"
            (input)="put('email', v($event), 'email')"
          />
        </rp-pa-fld>
        <rp-pa-fld [fid]="id('occ')" label="Occupation" [opt]="true" [error]="f().err(id('occ'))">
          <input
            [id]="id('occ')"
            type="text"
            maxlength="80"
            autocomplete="off"
            placeholder="e.g. Engineer, homemaker"
            [attr.aria-describedby]="id('occ') + '-e'"
            [value]="x.occ"
            (input)="put('occ', v($event), 'occ')"
          />
        </rp-pa-fld>
        <!-- The father's and the mother's annual income, in rupees (client 2026-10-14). -->
        @if (k() !== 'guardian') {
          <rp-pa-fld
            [fid]="id('inc')"
            label="Annual income"
            [opt]="true"
            [hint]="incomeText(x.income)"
            [error]="f().err(id('inc'))"
          >
            <span class="pre">₹</span
            ><input
              [id]="id('inc')"
              type="text"
              inputmode="numeric"
              maxlength="10"
              autocomplete="off"
              placeholder="In rupees, e.g. 600000"
              [attr.aria-describedby]="id('inc') + '-e'"
              [value]="x.income"
              (input)="put('income', n($event), 'inc')"
            />
          </rp-pa-fld>
        }
      </div>
      @if (ids()) {
        <rp-pa-ids [f]="f()" [h]="k()" />
      }
    </fieldset>
    @if (ids()) {
      <rp-pa-cards
        [f]="f()"
        [slots]="cards()"
        [required]="true"
        [fsId]="'pa-' + k()[0] + 'c'"
        [title]="title() + '’s Aadhaar and PAN cards'"
        note="Both sides of each card, as clear scans or photos."
      />
    }`,
})
export class PersonFields {
  readonly f = input.required<FormState>();
  readonly k = input.required<Who>();
  readonly title = input.required<string>();
  /** The name and mobile are mandatory (the mother's and the father's, client 2026-10-12, -13). */
  readonly required = input(false);
  /** This person is the primary contact: the e-mail is mandatory (client 2026-10-13). */
  readonly emailRequired = input(false);
  /** Their Aadhaar number, PAN and both sides of each card are asked for (client 2026-10-13). */
  readonly ids = input(false);
  protected readonly cards = computed(() => PERSON_CARDS[this.k()]);
  protected id(s: string) {
    return `pa-${this.k()[0]}-${s}`;
  }
  protected put(field: string, v: string, s: string) {
    this.f().putIn(this.k(), field, v, this.id(s));
    this.f().clear('pa-primary');
  }
  protected v(e: Event) {
    return val(e);
  }
  protected n(e: Event) {
    return digits(e);
  }
  /** "₹6,00,000 a year" under the box, as typed. */
  protected incomeText(v: string) {
    return v ? `${formatInr(Number(v) * 100).replace(/\.00$/, '')} a year` : '';
  }
}

@Component({
  selector: 'rp-pa-step-parents',
  imports: [
    CardUploads,
    CountryCode,
    Dropdown,
    Icon,
    IdNumbers,
    PaChoice,
    PaField,
    FamilyFound,
    PersonFields,
    SearchSelect,
    ContactVerify,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@let d = f().d();
    <div class="stack g20">
      @if (f().lookup; as lookup) {
        <!-- The counsellor's form: a family already at the school (client 2026-10-22). -->
        <rp-family-found
          [mobiles]="[d.father.mobile, d.mother.mobile, d.guardian.mobile]"
          [lookup]="lookup"
          (use)="fill($event)"
        />
      }
      <div class="note tone-info">
        <rp-icon name="users" [size]="17" />
        <div class="grow">
          The father's and the mother's names, mobile numbers, Aadhaar numbers and PANs are
          required, with both sides of each card, and the primary contact's e-mail. Add a guardian
          too if there is one.
        </div>
      </div>
      <rp-pa-person
        [f]="f()"
        k="father"
        title="Father"
        [required]="true"
        [ids]="true"
        [emailRequired]="primary() === 'father'"
      />
      <rp-pa-person
        [f]="f()"
        k="mother"
        title="Mother"
        [required]="true"
        [ids]="true"
        [emailRequired]="primary() === 'mother'"
      />
      <!-- A guardian's Aadhaar, PAN and cards when they are the primary contact (2026-10-13). -->
      <rp-pa-person
        [f]="f()"
        k="guardian"
        title="Guardian"
        [ids]="primary() === 'guardian'"
        [emailRequired]="primary() === 'guardian'"
      />
      <div class="pa-g2">
        <rp-pa-fld
          fid="pa-primary"
          label="Primary contact"
          labelFor="pa-primary-b"
          [req]="true"
          [bare]="true"
          [error]="f().err('pa-primary')"
          hint="Messages about the application go to this person's mobile."
        >
          <rp-dd
            inputId="pa-primary"
            [options]="who"
            [value]="primary()"
            placeholder="Who should the school call first?"
            (changed)="pick($event)"
          />
        </rp-pa-fld>
        <!-- Their mobile, verified with a one-time code before submitting (client 2026-10-27). -->
        @if (f().contact && primaryMobile()) {
          <rp-contact-verify
            [mobile]="primaryMobile()"
            [verified]="f().contactVerified()"
            [sendCode]="f().contact!.send"
            [confirmCode]="f().contact!.confirm"
            [counsellor]="f().counsellor"
            [error]="f().err('pa-cv')"
          />
        } @else {
          <div></div>
        }
      </div>
      <rp-pa-fld
        fid="pa-children"
        label="Children in the family"
        [labelFor]="null"
        [req]="true"
        [bare]="true"
        [error]="f().err('pa-children')"
      >
        <div
          class="pa-choices"
          id="pa-children"
          role="radiogroup"
          aria-label="Children in the family"
        >
          <rp-pa-choice
            group="pa-children"
            [on]="d.children === 'SINGLE'"
            icon="user"
            title="Single child"
            sub="This is the parents' only child"
            (pick)="f().put('children', 'SINGLE', 'pa-children')"
          />
          <rp-pa-choice
            group="pa-children"
            [on]="d.children === 'MORE'"
            icon="users"
            title="More than one child"
            sub="The child has brothers or sisters"
            (pick)="f().put('children', 'MORE', 'pa-children')"
          />
        </div>
      </rp-pa-fld>
      <!-- School transport (client 2026-10-12) or the hostel, not both — each a Yes / No choice
           (2026-10-13). -->
      <rp-pa-fld
        fid="pa-transport"
        label="Opt for school transport"
        [labelFor]="null"
        [bare]="true"
        [error]="f().err('pa-transport')"
      >
        <div class="row g20 wrap" role="radiogroup" aria-label="Opt for school transport">
          <label class="chk" [class.is-disabled]="d.hostel && !d.transport"
            ><input
              type="radio"
              name="pa-transport"
              id="pa-transport-yes"
              [checked]="d.transport"
              [disabled]="d.hostel && !d.transport"
              (change)="f().put('transport', true, 'pa-hostel')"
            /><span>Yes</span></label
          >
          <label class="chk"
            ><input
              type="radio"
              name="pa-transport"
              id="pa-transport-no"
              [checked]="!d.transport"
              (change)="f().put('transport', false, 'pa-hostel')"
            /><span>No</span></label
          >
        </div>
      </rp-pa-fld>
      @if (d.hostel && !d.transport) {
        <p class="pa-muted" id="pa-transport-off">
          A hostel student doesn't need school transport. Choose No for the hostel to choose school
          transport.
        </p>
      }
      @if (d.transport) {
        @if (stops().length) {
          <div class="pa-g2">
            <rp-pa-fld
              fid="pa-transport-stop"
              label="Preferred pick-up point"
              labelFor="pa-transport-stop-b"
              [opt]="true"
              [bare]="true"
              [error]="f().err('pa-transport-stop')"
              hint="The transport office confirms the route and the stop."
            >
              <!-- Searchable by stop or landmark: a school can have many stops (client 2026-10-14). -->
              <rp-search-select
                inputId="pa-transport-stop"
                [options]="stops()"
                [value]="d.transportStop"
                placeholder="Choose the nearest stop"
                (changed)="f().put('transportStop', $event, 'pa-transport-stop')"
              />
            </rp-pa-fld>
            <div></div>
          </div>
        } @else {
          <p class="pa-muted" id="pa-transport-note">
            The transport office will contact you about the route and the pick-up point.
          </p>
        }
      }
      <rp-pa-fld
        fid="pa-hostel"
        label="Hostel accommodation for our child"
        [labelFor]="null"
        [bare]="true"
        [error]="f().err('pa-hostel')"
      >
        <div class="row g20 wrap" role="radiogroup" aria-label="Hostel accommodation">
          <label class="chk" [class.is-disabled]="d.transport && !d.hostel"
            ><input
              type="radio"
              name="pa-hostel"
              id="pa-hostel-yes"
              [checked]="d.hostel"
              [disabled]="d.transport && !d.hostel"
              (change)="f().put('hostel', true, 'pa-hostel')"
            /><span>Yes</span></label
          >
          <label class="chk"
            ><input
              type="radio"
              name="pa-hostel"
              id="pa-hostel-no"
              [checked]="!d.hostel"
              (change)="f().put('hostel', false, 'pa-hostel')"
            /><span>No</span></label
          >
        </div>
      </rp-pa-fld>
      @if (d.transport && !d.hostel) {
        <p class="pa-muted" id="pa-hostel-off">
          A student who comes by school transport doesn't stay in the hostel. Choose No for school
          transport to choose the hostel.
        </p>
      }
      @if (d.hostel) {
        <fieldset class="pa-fs">
          <legend>Primary local guardian</legend>
          <p class="pa-muted">
            Required for hostel students — someone near {{ city() || 'the school' }} the school can
            reach quickly.
          </p>
          <div class="pa-g3">
            <rp-pa-fld
              fid="pa-lg-name"
              label="Full name"
              [req]="true"
              [error]="f().err('pa-lg-name')"
            >
              <input
                id="pa-lg-name"
                type="text"
                maxlength="60"
                autocomplete="off"
                aria-describedby="pa-lg-name-e"
                [value]="d.lg.name"
                (input)="f().putIn('lg', 'name', v($event), 'pa-lg-name')"
              />
            </rp-pa-fld>
            <rp-pa-fld
              fid="pa-lg-rel"
              label="Relationship"
              [req]="true"
              [error]="f().err('pa-lg-rel')"
            >
              <input
                id="pa-lg-rel"
                type="text"
                maxlength="30"
                autocomplete="off"
                placeholder="e.g. Aunt"
                aria-describedby="pa-lg-rel-e"
                [value]="d.lg.relation"
                (input)="f().putIn('lg', 'relation', v($event), 'pa-lg-rel')"
              />
            </rp-pa-fld>
            <rp-pa-fld fid="pa-lg-mob" label="Mobile" [req]="true" [error]="f().err('pa-lg-mob')">
              <rp-pa-cc
                fid="pa-lg-cc"
                [value]="d.lg.cc"
                what="the local guardian’s mobile"
                (picked)="f().putIn('lg', 'cc', $event, 'pa-lg-mob')"
              /><input
                id="pa-lg-mob"
                type="text"
                inputmode="numeric"
                [attr.maxlength]="d.lg.cc === '+91' ? 10 : 12"
                autocomplete="off"
                aria-describedby="pa-lg-mob-e"
                [value]="d.lg.mobile"
                (input)="f().putIn('lg', 'mobile', n($event), 'pa-lg-mob')"
              />
            </rp-pa-fld>
          </div>
          <rp-pa-fld fid="pa-lg-addr" label="Address" [req]="true" [error]="f().err('pa-lg-addr')">
            <textarea
              id="pa-lg-addr"
              rows="2"
              maxlength="200"
              aria-describedby="pa-lg-addr-e"
              [value]="d.lg.address"
              (input)="f().putIn('lg', 'address', v($event), 'pa-lg-addr')"
            ></textarea>
          </rp-pa-fld>
          <!-- The local guardian's Aadhaar, PAN and cards (client 2026-10-13). -->
          <rp-pa-ids [f]="f()" h="lg" />
        </fieldset>
        <rp-pa-cards
          [f]="f()"
          [slots]="lgCards"
          [required]="true"
          fsId="pa-lc"
          title="Local guardian’s Aadhaar and PAN cards"
          note="Both sides of each card, as clear scans or photos."
        />
      }
    </div>`,
})
export class StepParents {
  readonly f = input.required<FormState>();
  protected readonly who: DropdownOption[] = [
    { v: 'father', l: 'Father' },
    { v: 'mother', l: 'Mother' },
    { v: 'guardian', l: 'Guardian' },
  ];
  protected readonly city = computed(() => this.f().landing()?.institution.city ?? '');
  /** The school's pick-up stops (client 2026-10-12). */
  protected readonly stops = computed<DropdownOption[]>(() =>
    (this.f().landing()?.transportStops ?? []).map((s) => ({
      v: s.id,
      l: s.name,
      ...(s.landmark ? { sub: s.landmark } : {}),
    })),
  );
  /** The chosen contact, else the first person filled in (prototype). */
  protected readonly primary = computed(() => {
    const d = this.f().d();
    return d.primary || primaryDefault(d);
  });
  /** The primary contact's mobile as typed, to verify (client 2026-10-27). */
  protected readonly primaryMobile = computed(() => primaryMobileText(this.f().d()));
  /** Each person's numbers and cards are their own: another contact changes none of them. */
  protected pick(v: string) {
    this.f().put('primary', v as Who, 'pa-primary');
  }
  protected v(e: Event) {
    return val(e);
  }
  protected n(e: Event) {
    return digits(e);
  }
  /** The local guardian's cards (client 2026-10-13). */
  protected readonly lgCards = PERSON_CARDS.lg;

  /**
   * Fills in the family found (client 2026-10-22): the father, the mother and a guardian as the
   * family's latest admission had them (a staff member as the father or the mother), the primary
   * contact, "more than one child" and the home address when it is still empty. What is already
   * typed for a person is replaced by the family's; Aadhaar numbers and PANs stay to be entered.
   */
  protected fill(r: FamilyLookup) {
    const f = this.f();
    const person = (p: LookupPerson | null | undefined, cur: PersonDraft): PersonDraft =>
      p
        ? {
            ...cur,
            name: p.name,
            ...(p.mobile ? splitPersonMobile(p.mobile) : {}),
            email: p.email ?? cur.email,
            occ: p.occupation ?? cur.occ,
            income: p.annualIncome ?? cur.income,
          }
        : cur;
    f.edit((d) => {
      const fam = r.family;
      if (fam) {
        d.father = person(fam.father, d.father);
        d.mother = person(fam.mother, d.mother);
        if (fam.guardian) {
          d.guardian = { ...person(fam.guardian, d.guardian), relation: fam.guardian.relation };
        }
        if (fam.primary) d.primary = fam.primary.toLowerCase() as Who;
        if (fam.children.length) d.children = 'MORE';
        const a = fam.address;
        if (a && !d.res.line1) d.res = { ...a };
      } else if (r.staff) {
        const k = r.staff.relation === 'MOTHER' ? 'mother' : 'father';
        d[k] = person(
          {
            name: r.staff.name,
            mobile: r.mobile,
            email: r.staff.email,
            occupation: r.staff.userType,
            annualIncome: null,
          },
          d[k],
        );
      }
    });
    f.errors.set({});
  }
}

/** A mobile on the form: its country code and number (+91 for a 10-digit one). */
function splitPersonMobile(mobile: string): Pick<PersonDraft, 'cc' | 'mobile'> {
  const { cc, n } = splitMobile(mobile);
  return { cc, mobile: n };
}

export { primaryDefault };

/** The primary contact's mobile as shown ("+91 98765 12340"), '' when none is typed. */
function primaryMobileText(d: Draft): string {
  const who = d.primary || primaryDefault(d);
  return who && d[who].mobile.trim() ? mobileText(joinMobile(d[who].cc, d[who].mobile)) : '';
}

// --- step 6: References ---------------------------------------------------------------------------

@Component({
  selector: 'rp-pa-step-refs',
  imports: [CountryCode, Icon, PaField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@let d = f().d();
    <div class="stack g20">
      @if (f().mid()) {
        <div class="pa-mid sm">
          <rp-icon name="sparkles" [size]="16" />
          <div>
            <b>At least one reference is needed for a mid-term admission</b> — you can add up to
            {{ maxWord() }}.
          </div>
        </div>
      } @else {
        <div class="note tone-info">
          <rp-icon name="handshake" [size]="17" />
          <div class="grow">
            References are optional for a regular admission. You can add up to {{ maxWord() }}.
          </div>
        </div>
      }
      @for (r of d.refs; track $index; let i = $index) {
        <fieldset class="pa-fs pa-ref">
          <legend>
            Reference {{ i + 1 }}
            <button
              type="button"
              class="linkbtn pa-ref-x"
              [attr.aria-label]="'Remove reference ' + (i + 1)"
              (click)="remove(i)"
            >
              <rp-icon name="x" [size]="13" /> Remove
            </button>
          </legend>
          <div class="pa-g2">
            <rp-pa-fld
              [fid]="rid(i, 'name')"
              label="Full name"
              [req]="true"
              [error]="f().err(rid(i, 'name'))"
            >
              <input
                [id]="rid(i, 'name')"
                type="text"
                maxlength="60"
                autocomplete="off"
                [attr.aria-describedby]="rid(i, 'name') + '-e'"
                [value]="r.name"
                (input)="put(i, 'name', v($event))"
              />
            </rp-pa-fld>
            <rp-pa-fld
              [fid]="rid(i, 'rel')"
              label="How they know the student"
              [req]="true"
              [error]="f().err(rid(i, 'rel'))"
            >
              <input
                [id]="rid(i, 'rel')"
                type="text"
                maxlength="60"
                autocomplete="off"
                placeholder="e.g. Class teacher at the previous school"
                [attr.aria-describedby]="rid(i, 'rel') + '-e'"
                [value]="r.relation"
                (input)="put(i, 'relation', v($event))"
              />
            </rp-pa-fld>
            <rp-pa-fld
              [fid]="rid(i, 'phone')"
              label="Phone"
              [req]="true"
              [error]="f().err(rid(i, 'phone'))"
            >
              <rp-pa-cc
                [fid]="rid(i, 'cc')"
                [value]="r.cc"
                [what]="'reference ' + (i + 1) + '’s phone'"
                (picked)="put(i, 'cc', $event)"
              /><input
                [id]="rid(i, 'phone')"
                type="text"
                inputmode="numeric"
                [attr.maxlength]="r.cc === '+91' ? 10 : 12"
                autocomplete="off"
                [attr.aria-describedby]="rid(i, 'phone') + '-e'"
                [value]="r.phone"
                (input)="put(i, 'phone', n($event))"
              />
            </rp-pa-fld>
            <rp-pa-fld
              [fid]="rid(i, 'email')"
              label="E-mail"
              [opt]="true"
              [error]="f().err(rid(i, 'email'))"
            >
              <input
                [id]="rid(i, 'email')"
                type="email"
                autocomplete="off"
                [attr.aria-describedby]="rid(i, 'email') + '-e'"
                [value]="r.email"
                (input)="put(i, 'email', v($event))"
              />
            </rp-pa-fld>
          </div>
        </fieldset>
      } @empty {
        <div class="pa-empty">
          <rp-icon name="handshake" [size]="22" />
          <b>No references yet</b>
          <span>{{
            f().mid()
              ? 'Add one person who knows your child — a teacher from the previous school is ideal.'
              : "Skip this step if you don't have one."
          }}</span>
        </div>
      }
      <div class="row g12 wrap">
        <button
          type="button"
          class="btn btn-sec"
          [disabled]="d.refs.length >= max()"
          [attr.title]="
            d.refs.length >= max() ? 'You can add up to ' + max() + ' references' : null
          "
          (click)="add()"
        >
          <rp-icon name="plus" [size]="17" /><span>{{
            d.refs.length ? 'Add another reference' : 'Add a reference'
          }}</span>
        </button>
        <span class="pa-muted t-sm"
          >{{ d.refs.length }} of {{ max() }} added{{ f().mid() ? ' · 1 needed' : '' }}</span
        >
      </div>
      <div id="pa-referr" class="pa-referr" [class.on]="!!f().err('pa-referr')" role="alert">
        <rp-icon name="alertc" [size]="14" /> {{ f().err('pa-referr') }}
      </div>
      <p class="pa-fine">
        <rp-icon name="info" [size]="13" /> The school doesn't contact referees through this form.
      </p>
    </div>`,
})
export class StepRefs {
  private readonly overlays = inject(Overlays);
  readonly f = input.required<FormState>();
  protected readonly max = computed(() => this.f().landing()?.rules.references.max ?? 3);
  protected readonly maxWord = computed(() => words(this.max()));

  protected rid(i: number, s: string) {
    return `pa-ref${i}-${s}`;
  }
  protected put(i: number, k: 'name' | 'relation' | 'cc' | 'phone' | 'email', v: string) {
    this.f().edit((d) => {
      d.refs[i]![k] = v;
    });
    this.f().clear(this.rid(i, k === 'relation' ? 'rel' : k === 'cc' ? 'phone' : k));
  }
  protected add() {
    if (this.f().d().refs.length >= this.max()) return;
    this.f().edit((d) => {
      d.refs.push({ id: null, name: '', relation: '', cc: '+91', phone: '', email: '' });
    });
    this.f().clear('pa-referr');
    const i = this.f().d().refs.length - 1;
    setTimeout(() => {
      const el = document.getElementById(this.rid(i, 'name'));
      el?.focus({ preventScroll: true });
      el?.closest('.pa-fs')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, 60);
  }
  protected remove(i: number) {
    const r = this.f().d().refs[i];
    this.f().edit((d) => {
      d.refs.splice(i, 1);
    });
    // field errors follow their reference's position: start them afresh
    this.f().errors.update((e) =>
      Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('pa-ref'))),
    );
    this.overlays.toast(`Reference ${i + 1} removed`, {
      tone: 'info',
      ...(r?.name ? { sub: r.name } : {}),
    });
  }
  protected v(e: Event) {
    return val(e);
  }
  protected n(e: Event) {
    return digits(e);
  }
}

// --- step 7: Documents ------------------------------------------------------------------------------

@Component({
  selector: 'rp-pa-step-docs',
  imports: [Dropdown, Icon, PaField, PaUpload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@let d = f().d();
    <div class="stack g20">
      <div class="pa-g2">
        <rp-pa-upl
          fid="pa-dbirth"
          label="Birth certificate"
          [req]="true"
          [file]="d.docs.birth"
          [progress]="f().pct('pa-dbirth')"
          [error]="f().err('pa-dbirth')"
          [formats]="formats()"
          (picked)="f().upload('pa-dbirth', 'BIRTH', $event, setBirth)"
          (viewed)="f().open('BIRTH')"
          (removed)="f().remove('pa-dbirth', 'BIRTH', clearBirth)"
        />
        <rp-pa-upl
          fid="pa-daddr"
          label="Address proof"
          [req]="true"
          hint="Utility bill, rent agreement or passport"
          [file]="d.docs.addr"
          [progress]="f().pct('pa-daddr')"
          [error]="f().err('pa-daddr')"
          [formats]="formats()"
          (picked)="f().upload('pa-daddr', 'ADDRESS', $event, setAddr)"
          (viewed)="f().open('ADDRESS')"
          (removed)="f().remove('pa-daddr', 'ADDRESS', clearAddr)"
        />
        @if (f().order() >= 3) {
          <rp-pa-upl
            fid="pa-dreport"
            label="Last report card"
            [req]="true"
            [file]="d.docs.report"
            [progress]="f().pct('pa-dreport')"
            [error]="f().err('pa-dreport')"
            [formats]="formats()"
            (picked)="f().upload('pa-dreport', 'REPORT', $event, setReport)"
            (viewed)="f().open('REPORT')"
            (removed)="f().remove('pa-dreport', 'REPORT', clearReport)"
          />
        }
      </div>
      <div class="note tone-info">
        <rp-icon name="upload" [size]="17" />
        <div class="grow">
          <b>Each file can be up to {{ max() }}.</b> Larger files are refused — reduce the size or
          scan at a lower resolution.
        </div>
      </div>
      @if (fields().length) {
        <fieldset class="pa-fs">
          <legend>Institution fields</legend>
          <p class="pa-muted">
            Added by {{ short() }}. Please don't enter identity-document numbers here.
          </p>
          <div class="pa-g2">
            @for (c of fields(); track c.id) {
              @let id = 'pa-cf-' + c.id;
              @switch (kind(c)) {
                @case ('dd') {
                  <rp-pa-fld
                    [fid]="id"
                    [label]="c.label"
                    [labelFor]="id + '-b'"
                    [req]="c.required"
                    [opt]="!c.required"
                    [bare]="true"
                    [error]="f().err(id)"
                  >
                    <rp-dd
                      [inputId]="id"
                      [options]="optionsOf(c)"
                      [value]="text(c.id)"
                      placeholder="Choose"
                      (changed)="put(c.id, $event)"
                    />
                  </rp-pa-fld>
                }
                @case ('multi') {
                  <rp-pa-fld
                    [fid]="id"
                    [label]="c.label"
                    [labelFor]="null"
                    [req]="c.required"
                    [opt]="!c.required"
                    [bare]="true"
                    [error]="f().err(id)"
                  >
                    <div class="pa-ms">
                      @for (o of c.options; track o.id) {
                        <label class="chk"
                          ><input
                            type="checkbox"
                            [value]="o.label"
                            [checked]="picked(c.id, o.label)"
                            (change)="toggle(c.id, o.label)"
                          /><span>{{ o.label }}</span></label
                        >
                      }
                    </div>
                  </rp-pa-fld>
                }
                @case ('long') {
                  <rp-pa-fld
                    [fid]="id"
                    [label]="c.label"
                    [req]="c.required"
                    [opt]="!c.required"
                    [error]="f().err(id)"
                  >
                    <textarea
                      [id]="id"
                      rows="3"
                      maxlength="2000"
                      [attr.aria-describedby]="id + '-e'"
                      [value]="text(c.id)"
                      (input)="put(c.id, v($event))"
                    ></textarea>
                  </rp-pa-fld>
                }
                @default {
                  <rp-pa-fld
                    [fid]="id"
                    [label]="c.label"
                    [req]="c.required"
                    [opt]="!c.required"
                    [error]="f().err(id)"
                  >
                    @if (c.type === 'PHONE') {
                      <span class="pre">+91</span>
                    }
                    <input
                      [id]="id"
                      [type]="c.type === 'DATE' ? 'date' : c.type === 'EMAIL' ? 'email' : 'text'"
                      [attr.inputmode]="
                        c.type === 'NUMBER' || c.type === 'PHONE' ? 'numeric' : null
                      "
                      [attr.maxlength]="c.type === 'PHONE' ? 10 : c.type === 'DATE' ? null : 80"
                      autocomplete="off"
                      [attr.aria-describedby]="id + '-e'"
                      [value]="text(c.id)"
                      (input)="put(c.id, c.type === 'PHONE' ? n($event) : v($event))"
                    />
                  </rp-pa-fld>
                }
              }
            }
          </div>
        </fieldset>
      }
    </div>`,
})
export class StepDocs {
  readonly f = input.required<FormState>();
  protected readonly fields = computed(() => this.f().landing()?.customFields ?? []);
  protected readonly short = computed(() => {
    const i = this.f().landing()?.institution;
    return i?.shortName || i?.name || 'the school';
  });
  protected readonly max = computed(() =>
    fileSize(this.f().landing()?.rules.documents.maxBytes ?? 2 * 1024 * 1024).replace('.0 ', ' '),
  );
  protected readonly setBirth = (d: Draft, file: PickedFile) => {
    d.docs.birth = file;
  };
  protected readonly setAddr = (d: Draft, file: PickedFile) => {
    d.docs.addr = file;
  };
  protected readonly setReport = (d: Draft, file: PickedFile) => {
    d.docs.report = file;
  };
  protected readonly clearBirth = (d: Draft) => {
    d.docs.birth = null;
  };
  protected readonly clearAddr = (d: Draft) => {
    d.docs.addr = null;
  };
  protected readonly clearReport = (d: Draft) => {
    d.docs.report = null;
  };
  /** The formats and size every document takes (client 2026-10-13). */
  protected readonly formats = computed(() => `PDF, JPG or PNG · up to ${this.max()}`);

  protected kind(c: LandingField) {
    if (c.type === 'DROPDOWN' || c.type === 'YES_NO') return 'dd';
    if (c.type === 'MULTI_SELECT') return 'multi';
    if (c.type === 'LONG_TEXT') return 'long';
    return 'text';
  }
  protected optionsOf(c: LandingField): DropdownOption[] {
    return c.type === 'YES_NO'
      ? [
          { v: 'Yes', l: 'Yes' },
          { v: 'No', l: 'No' },
        ]
      : c.options.map((o) => ({ v: o.label, l: o.label }));
  }
  protected text(id: string) {
    const v = this.f().d().cf[id];
    return Array.isArray(v) ? v.join(', ') : (v ?? '');
  }
  protected picked(id: string, label: string) {
    const v = this.f().d().cf[id];
    return Array.isArray(v) && v.includes(label);
  }
  protected put(id: string, v: string) {
    this.f().edit((d) => {
      d.cf[id] = v;
    });
    this.f().clear(`pa-cf-${id}`);
  }
  protected toggle(id: string, label: string) {
    this.f().edit((d) => {
      const cur = Array.isArray(d.cf[id]) ? (d.cf[id] as string[]) : [];
      d.cf[id] = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
    });
    this.f().clear(`pa-cf-${id}`);
  }
  protected v(e: Event) {
    return val(e);
  }
  /** A phone number: digits only, in the box too (client 2026-10-14). */
  protected n(e: Event) {
    return digits(e);
  }
}

// --- step 8: Review & declaration -------------------------------------------------------------------

interface Row {
  readonly k: string;
  readonly v?: string;
  readonly chip?: 'accent' | 'ok';
  readonly file?: PickedFile | null;
  /** An attachment: opened with "View" (client 2026-10-13). */
  readonly doc?: DocType;
}

@Component({
  selector: 'rp-pa-step-review',
  imports: [ContactVerify, Icon, PaSeg],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@let d = f().d();
    <div class="stack g16">
      @for (s of sections(); track s.title; let i = $index) {
        <div class="pa-rev">
          <div class="pa-rev-h">
            <h3>{{ s.title }}</h3>
            <button type="button" class="btn btn-ghost btn-sm" (click)="edit.emit(s.step)">
              <rp-icon name="edit" [size]="15" /><span>Edit</span>
            </button>
          </div>
          <dl class="kv">
            @for (r of s.rows; track $index) {
              <dt>{{ r.k }}</dt>
              <dd>
                @if (r.chip) {
                  <span class="chip dot" [class]="'tone-' + r.chip">{{ r.v }}</span>
                } @else if (r.file !== undefined) {
                  @if (r.file) {
                    <rp-icon name="checkc" [size]="13" /> {{ r.file.name }} ·
                    {{ size(r.file.size) }}
                    @if (r.doc) {
                      ·
                      <button
                        type="button"
                        class="linkbtn"
                        [attr.data-doc]="r.doc"
                        [attr.aria-label]="'View ' + r.k"
                        (click)="f().open(r.doc)"
                      >
                        View
                      </button>
                    }
                  } @else {
                    <span class="t-faint">Not attached</span>
                  }
                } @else if (r.v) {
                  {{ r.v }}
                } @else {
                  <span class="t-faint">—</span>
                }
              </dd>
            }
          </dl>
        </div>
      }
      <!-- The primary contact's mobile, verified before submitting (client 2026-10-27). -->
      @if (f().contact && primaryMobile()) {
        <div class="stack g8" id="pa-rev-cv">
          @if (!f().contactVerified()) {
            <div class="note tone-warn">
              <rp-icon name="alert" [size]="17" />
              <div class="grow">Verify the primary contact’s mobile to submit the application.</div>
            </div>
          }
          <rp-contact-verify
            [mobile]="primaryMobile()"
            [verified]="f().contactVerified()"
            [sendCode]="f().contact!.send"
            [confirmCode]="f().contact!.confirm"
            [counsellor]="f().counsellor"
            [error]="f().err('pa-cv')"
          />
        </div>
      }
      <div class="pa-feebox">
        <rp-icon name="receipt" [size]="20" />
        @if (f().counsellor && !f().collects()) {
          <!-- The counsellor's form: the fees are collected at the accounts desk (client 2026-10-15). -->
          <div class="grow stack g8" id="pa-fee-desk">
            @if (applicationOn()) {
              <b>Application fee · {{ appFee() }}</b>
            } @else {
              <b>No application fee is needed for this year.</b>
            }
            @if (admissionOn()) {
              <b>Admission fee · {{ admFee() }}</b>
            }
            <span>{{ deskNote() }}</span>
          </div>
        } @else {
          <div class="grow stack g8">
            @if (applicationOn()) {
              <!-- The application fee is paid online to submit (client 2026-10-13). -->
              <div class="row g12 wrap" id="pa-fee-app">
                <b class="grow">Application fee · {{ appFee() }}</b>
                <span class="chip tone-accent dot">{{
                  f().counsellor ? 'Collected when you submit' : 'Paid online when you submit'
                }}</span>
              </div>
            } @else {
              <b>No application fee is needed for this year.</b>
            }
            @if (admissionOn()) {
              <div class="row g12 wrap" id="pa-fee-adm">
                <b class="grow">Admission fee · {{ admFee() }}</b>
                <rp-pa-seg
                  cls="pa-seg sm"
                  aria="When to pay the admission fee"
                  [options]="when"
                  [value]="d.payAdmission ? 'now' : 'later'"
                  (changed)="pay('payAdmission', $event)"
                />
              </div>
            }
            <span id="pa-fee-note">{{ feeNote() }}</span>
          </div>
        }
      </div>
      <div class="fld pa-chk" [class.invalid]="!!f().err('pa-declare')">
        <label class="chk"
          ><input
            type="checkbox"
            id="pa-declare"
            aria-describedby="pa-declare-e"
            [checked]="d.declare"
            (change)="declare($event)"
          /><span>
            @if (f().counsellor) {
              The family has read and accepted the declaration: the information in this application
              is true and complete to the best of their knowledge, and the school may cancel the
              admission if any of it is found to be false.
            } @else {
              I declare that the information in this application is true and complete to the best of
              my knowledge. I understand that the school may cancel the admission if any of it is
              found to be false.
            }
          </span></label
        >
        <div class="fld-e" id="pa-declare-e" role="alert">
          <rp-icon name="alertc" [size]="14" /><span>{{ f().err('pa-declare') }}</span>
        </div>
      </div>
      <div class="fld pa-chk" [class.invalid]="!!f().err('pa-consent')">
        <label class="chk"
          ><input
            type="checkbox"
            id="pa-consent"
            aria-describedby="pa-consent-e"
            [checked]="d.consent"
            (change)="consent($event)"
          /><span>
            @if (f().counsellor) {
              The family agrees that the information collected in this application, including the
              Aadhaar and PAN details, will be used to register their account in CampusOne.
            } @else {
              I agree that the information collected in this application, including the Aadhaar and
              PAN details, will be used to register our account in CampusOne.
            }
          </span></label
        >
        <div class="fld-e" id="pa-consent-e" role="alert">
          <rp-icon name="alertc" [size]="14" /><span>{{ f().err('pa-consent') }}</span>
        </div>
      </div>
    </div>`,
})
export class StepReview {
  readonly f = input.required<FormState>();
  readonly edit = output<number>();
  /**
   * The admission fee is paid now online, or later at the accounts desk (client 2026-10-12); the
   * application fee is always paid online to submit (2026-10-13).
   */
  protected readonly when: readonly SegOption[] = [
    { v: 'now', l: 'Pay now' },
    { v: 'later', l: 'Pay later' },
  ];
  /** The primary contact's mobile, to verify (client 2026-10-27). */
  protected readonly primaryMobile = computed(() => primaryMobileText(this.f().d()));
  protected readonly applicationOn = computed(
    () => paise(this.f().year()?.fees?.applicationFee) > 0,
  );
  protected readonly appFee = computed(() =>
    formatInr(paise(this.f().year()?.fees?.applicationFee)),
  );
  protected readonly admFee = computed(() => formatInr(paise(this.f().year()?.fees?.admissionFee)));
  /** The year has an admission fee the family may choose to pay with the form. */
  protected readonly admissionOn = computed(() => paise(this.f().year()?.fees?.admissionFee) > 0);
  protected readonly feeNote = computed(() => {
    const d = this.f().d();
    const app = this.applicationOn();
    const adm = this.admissionOn() && d.payAdmission;
    // The counsellor collects them at the desk on submitting (client 2026-10-23).
    if (this.f().counsellor) {
      return (
        (app && adm
          ? 'Both fees are collected together when you submit — Pay now (UPI, card or net banking) in one payment, or cash — with a receipt for each. '
          : app || adm
            ? 'Collected when you submit — Pay now (UPI, card or net banking) or cash — with a receipt. '
            : 'Nothing to pay now: the application is submitted at once. ') +
        (this.admissionOn() && !d.payAdmission
          ? 'The admission fee left for later is collected on Admission fees, or paid online by the family from a payment link. '
          : '') +
        'The admission number is assigned once the fees are paid and confirmed.'
      );
    }
    return (
      (app && adm
        ? 'Both fees are paid together in one online payment (UPI, card or net banking), with a receipt for each. '
        : app || adm
          ? 'Paid online (UPI, card or net banking) when you submit. '
          : 'Nothing to pay now: the application is submitted at once. ') +
      (this.admissionOn() && !d.payAdmission
        ? 'The admission fee left for later is paid online from the confirmation page or at the school’s accounts desk. '
        : '') +
      'The admission number is assigned once the fees are paid and confirmed.'
    );
  });

  /** The counsellor's form: what the family pays, and where (client 2026-10-15). */
  protected readonly deskNote = computed(() =>
    this.applicationOn() || this.admissionOn()
      ? 'The family pays at the accounts desk (Admission fees) or online from the payment link; the admission number is assigned once the fees are paid and confirmed.'
      : 'Nothing to pay: the application is submitted at once.',
  );

  protected readonly sections = computed(() => {
    const f = this.f();
    const d = f.d();
    const mid = f.mid();
    const cls = f.cls()?.name ?? '';
    const addr = (a: Draft['res']) =>
      [a.line1, a.line2, a.city, a.state, a.pin].filter(Boolean).join(', ');
    const who = (k: Who) => {
      const p = d[k];
      if (!p.name) return null;
      const rel = k === 'guardian' && d.guardian.relation ? ` (${d.guardian.relation})` : '';
      // With the occupation, and the parents' annual income (client 2026-10-14).
      const income =
        k !== 'guardian' && p.income
          ? `${formatInr(Number(p.income) * 100).replace(/\.00$/, '')} a year`
          : '';
      return [
        `${p.name}${rel}`,
        mobileText(joinMobile(p.cc, p.mobile)),
        p.email.trim(),
        p.occ.trim(),
        income,
      ]
        .filter(Boolean)
        .join(' · ');
    };
    const primary = d.primary || primaryDefault(d);
    // Whose Aadhaar, PAN and cards were asked for, and how the review names them (2026-10-13).
    const holders = idHolders({ primary, hostel: d.hostel });
    const whose: Record<Holder, string> = {
      father: 'Father',
      mother: 'Mother',
      guardian: 'Guardian',
      lg: 'Local guardian',
    };
    const ids = (h: Holder) => {
      const x = idsShown(d, h);
      return [x.aadhaar, x.pan].filter(Boolean).join(' · ');
    };
    const stopName = f.landing()?.transportStops?.find((s) => s.id === d.transportStop)?.name;
    const relName = primary
      ? primary === 'guardian'
        ? d.guardian.relation || 'Guardian'
        : primary === 'father'
          ? 'Father'
          : 'Mother'
      : '';
    const rows = (xs: (Row | null)[]) => xs.filter((x): x is Row => !!x);
    return [
      {
        title: 'Class & year',
        step: 0,
        rows: rows([
          { k: 'Academic year', v: yearLabel(f.year()?.label) },
          { k: 'Class sought', v: cls },
          { k: 'Joining date', v: d.joining ? date(d.joining) : '' },
          { k: 'Admission type', v: mid ? 'Mid-term' : 'Regular', chip: mid ? 'accent' : 'ok' },
          mid && d.midReason ? { k: 'Reason', v: d.midReason } : null,
        ]),
      },
      {
        title: 'Student',
        step: 1,
        rows: rows([
          { k: 'Name', v: [d.first, d.middle, d.last].filter(Boolean).join(' ') },
          { k: 'Gender', v: d.gender },
          { k: 'Date of birth', v: d.dob ? date(d.dob) : '' },
          d.aadhaar || d.kept.aadhaar
            ? { k: 'Aadhaar number', v: d.aadhaar ? maskAadhaar(d.aadhaar) : d.kept.aadhaar! }
            : null,
          d.pan || d.kept.pan ? { k: 'PAN', v: d.pan ? maskPan(d.pan) : d.kept.pan! } : null,
          { k: 'Category · medium', v: [d.category, d.medium].filter(Boolean).join(' · ') },
          { k: 'Blood group', v: d.blood.replace('-', '−') },
          d.allergies ? { k: 'Food allergies', v: d.allergies } : null,
          d.health ? { k: 'Health', v: d.health } : null,
        ]),
      },
      {
        title: 'Addresses',
        step: 2,
        rows: [
          { k: 'Residential', v: addr(d.res) },
          { k: 'Correspondence', v: d.same ? 'Same as residential' : addr(d.corr) },
        ],
      },
      {
        title: 'Previous schooling',
        step: 3,
        rows: rows([
          { k: 'School', v: d.prev.school },
          { k: 'Last class', v: d.prev.last },
          { k: 'Result', v: d.prev.result },
          { k: 'Board', v: d.prev.board === 'Other' ? d.prev.other : d.prev.board },
          mid
            ? d.tcRecorded
              ? {
                  k: 'Transfer certificate',
                  v:
                    d.tcRecorded.mode === 'UNDERTAKING'
                      ? `Undertaking — by ${date(d.tcRecorded.dueDate)}`
                      : 'Received',
                }
              : d.tc.mode === 'tc'
                ? {
                    k: 'Transfer certificate',
                    v: d.tc.file ? 'Attached — see Attachments below' : '',
                  }
                : {
                    k: 'Transfer certificate',
                    v: d.tc.due
                      ? `Undertaking — by ${date(d.tc.due)}`
                      : 'Undertaking — date missing',
                  }
            : // A regular admission above LKG brings it too (client 2026-10-15).
              f.order() > 1
              ? {
                  k: 'Transfer certificate',
                  v: d.tcRecorded
                    ? 'Received'
                    : d.tc.file
                      ? 'Attached — see Attachments below'
                      : '',
                }
              : null,
        ]),
      },
      {
        title: 'Parents & guardians',
        step: 4,
        rows: rows([
          who('father') ? { k: 'Father', v: who('father')! } : null,
          who('mother') ? { k: 'Mother', v: who('mother')! } : null,
          who('guardian') ? { k: 'Guardian', v: who('guardian')! } : null,
          {
            k: 'Primary contact',
            v: primary ? `${d[primary].name || '—'}${relName ? ' · ' + relName : ''}` : '',
          },
          ...holders
            .filter((h) => h !== 'lg')
            .map((h) => ({ k: `${whose[h]}’s Aadhaar · PAN`, v: ids(h) })),
          {
            k: 'Children in the family',
            v:
              d.children === 'SINGLE'
                ? 'Single child'
                : d.children === 'MORE'
                  ? 'More than one child'
                  : '',
          },
          {
            k: 'School transport',
            v: d.transport
              ? stopName
                ? `Yes — pick-up at ${stopName}`
                : 'Yes — pick-up point to be decided by the school'
              : 'No',
          },
          {
            k: 'Hostel',
            v: d.hostel ? `Yes — local guardian ${d.lg.name} (${d.lg.relation})` : 'No',
          },
          d.hostel ? { k: 'Local guardian’s Aadhaar · PAN', v: ids('lg') } : null,
        ]),
      },
      {
        title: 'References',
        step: 5,
        rows: d.refs.length
          ? d.refs.map((r, i) => ({
              k: `Reference ${i + 1}`,
              v: [r.name, r.relation, mobileText(joinMobile(r.cc, r.phone))]
                .filter(Boolean)
                .join(' · '),
            }))
          : [{ k: 'References', v: 'None added' }],
      },
      // Every attachment, to open and check before submitting (client 2026-10-13).
      {
        title: 'Attachments',
        step: 6,
        rows: rows([
          { k: 'Passport-size photo', file: d.photo, doc: 'PHOTO' },
          ...STUDENT_CARDS.filter((c) => d.cards[c.t]).map((c) => ({
            k: `Student’s ${c.l.replace(' — ', ' (')})`,
            file: d.cards[c.t],
            doc: c.t,
          })),
          ...holders.flatMap((h) =>
            PERSON_CARDS[h].map((c) => ({
              k: `${whose[h]}’s ${c.l.replace(' — ', ' (')})`,
              file: d.cards[c.t],
              doc: c.t,
            })),
          ),
          { k: 'Birth certificate', file: d.docs.birth, doc: 'BIRTH' },
          { k: 'Address proof', file: d.docs.addr, doc: 'ADDRESS' },
          d.docs.report || f.order() >= 3
            ? { k: 'Report card', file: d.docs.report, doc: 'REPORT' }
            : null,
          !d.tcRecorded && (mid ? d.tc.mode === 'tc' : f.order() > 1)
            ? { k: 'Transfer certificate', file: d.tc.file, doc: 'TC' }
            : null,
        ]),
      },
      ...(f.landing()?.customFields.length
        ? [
            {
              title: 'Institution fields',
              step: 6,
              rows: (f.landing()?.customFields ?? []).map((c) => {
                const v = d.cf[c.id];
                return { k: c.label, v: Array.isArray(v) ? v.join(', ') : (v ?? '') };
              }),
            },
          ]
        : []),
    ];
  });

  protected size(b: number) {
    return fileSize(b);
  }
  protected declare(e: Event) {
    this.f().put('declare', (e.target as HTMLInputElement).checked, 'pa-declare');
  }
  protected consent(e: Event) {
    this.f().put('consent', (e.target as HTMLInputElement).checked, 'pa-consent');
  }
  /** Only the admission fee is a choice now (client 2026-10-13). */
  protected pay(k: 'payAdmission', v: string) {
    this.f().edit((d) => {
      d[k] = v === 'now';
    });
  }
}
