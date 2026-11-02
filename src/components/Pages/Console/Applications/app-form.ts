/**
 * The admission form's sections as the console edits them (the counsellor's form and a section's
 * edit, ADM-015 / ADM-016): the values as typed, their checks (the same rules as the public form,
 * FR-ADM-01) and the API shapes they become.
 */
import { formatDate } from '../../../Utils/format';
import { PATTERNS, isAadhaar, isRealDate } from '../../../Utils/patterns';
import { translate } from '../../../Utils/translate';
import { splitMobile } from '../../Admissions/admissions.store';
import type { CustomField } from '../Institution/institution.api';
import type {
  Address,
  Addresses,
  Application,
  Board,
  Category,
  Gender,
  Parents,
  Person,
  Previous,
  Relation,
  StudentSection,
} from './applications.api';

export type Errors = Readonly<Record<string, string>>;

export interface StudentDraft {
  readonly first: string;
  readonly middle: string;
  readonly last: string;
  readonly gender: Gender | '';
  readonly dob: string;
  /**
   * The Aadhaar number (required) and PAN (optional) as typed (client 2026-10-12). Write-only: an
   * empty one keeps what is stored, which the application shows masked (`keptAadhaar`, `keptPan`).
   */
  readonly aadhaar: string;
  readonly pan: string;
  readonly keptAadhaar: string | null;
  readonly keptPan: string | null;
  readonly category: Category | '';
  readonly medium: string;
  readonly blood: string;
}

export interface AddressDraft {
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly state: string;
  readonly pin: string;
}

export interface AddressesDraft {
  readonly res: AddressDraft;
  readonly same: boolean;
  readonly corr: AddressDraft;
}

export interface PreviousDraft {
  readonly school: string;
  readonly lastClass: string;
  readonly result: string;
  readonly board: Board | '';
  readonly otherBoard: string;
}

export interface PersonDraft {
  readonly name: string;
  readonly mobile: string;
  readonly email: string;
  readonly occupation: string;
  /** The father's and the mother's annual income in rupees, digits only (client 2026-10-14). */
  readonly income: string;
  /** Guardian only. */
  readonly relation: string;
}

/** The people whose Aadhaar and PAN the console edits (the local guardian's are the family's). */
export type Parent = 'father' | 'mother' | 'guardian';
export const PARENTS: readonly Parent[] = ['father', 'mother', 'guardian'];
type Ids<T> = Readonly<Record<Parent, { readonly aadhaar: T; readonly pan: T }>>;

export interface ParentsDraft {
  readonly father: PersonDraft;
  readonly mother: PersonDraft;
  readonly guardian: PersonDraft;
  readonly primary: Relation;
  /** Single child or more (client 2026-10-12). */
  readonly children: '' | 'SINGLE' | 'MORE';
  /**
   * Each parent's Aadhaar and PAN as typed (client 2026-10-13). Write-only: an empty one keeps what
   * is stored, which the application shows masked (`kept`).
   */
  readonly ids: Ids<string>;
  readonly kept: Ids<string | null>;
  /** The family asked for the hostel: the local guardian's are needed too (given on the form). */
  readonly hostel: boolean;
}

export const emptyAddress = (): AddressDraft => ({
  line1: '',
  line2: '',
  city: '',
  state: '',
  pin: '',
});
export const emptyPerson = (): PersonDraft => ({
  name: '',
  mobile: '',
  email: '',
  occupation: '',
  income: '',
  relation: '',
});
export const emptyStudent = (): StudentDraft => ({
  first: '',
  middle: '',
  last: '',
  gender: '',
  dob: '',
  aadhaar: '',
  pan: '',
  keptAadhaar: null,
  keptPan: null,
  category: 'GENERAL',
  medium: 'English',
  blood: '',
});
export const emptyParents = (): ParentsDraft => ({
  father: emptyPerson(),
  mother: emptyPerson(),
  guardian: emptyPerson(),
  primary: 'FATHER',
  children: '',
  ids: perParent(() => ({ aadhaar: '', pan: '' })),
  kept: perParent(() => ({ aadhaar: null, pan: null })),
  hostel: false,
});
function perParent<T>(f: () => T): Readonly<Record<Parent, T>> {
  return { father: f(), mother: f(), guardian: f() };
}

/**
 * Whose Aadhaar, PAN and cards a submission needs (client 2026-10-13): the father's and the
 * mother's, a guardian's who is the primary contact, and — given by the family — the local
 * guardian's of a hostel student.
 */
export function idsNeeded(primary: Relation | null, hostel: boolean) {
  return {
    parents: ['father', 'mother', ...(primary === 'GUARDIAN' ? ['guardian'] : [])] as Parent[],
    localGuardian: hostel,
  };
}
export const emptyPrevious = (): PreviousDraft => ({
  school: '',
  lastClass: '',
  result: '',
  board: '',
  otherBoard: '',
});

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');
const filled = (a: AddressDraft) => Object.values(a).some((v) => v.trim());

// --- from the application (a section's edit) ------------------------------------------------------
const titled = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/(^|[\s.'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

export function studentOf(a: Application): StudentDraft {
  const s = a.student;
  return {
    first: titled(s.firstName),
    middle: titled(s.middleName),
    last: titled(s.lastName),
    gender: s.gender ?? '',
    dob: s.dob ?? '',
    aadhaar: '',
    pan: '',
    keptAadhaar: s.aadhaar ?? null,
    keptPan: s.pan ?? null,
    category: s.category ?? '',
    medium: s.medium ?? '',
    blood: s.bloodGroup ?? '',
  };
}

const addressOf = (x: Address | null | undefined): AddressDraft =>
  x
    ? {
        line1: x.line1,
        line2: x.line2 ?? '',
        city: x.city,
        state: x.state,
        pin: x.pin,
      }
    : emptyAddress();

export function addressesOf(a: Application): AddressesDraft {
  const ad = a.addresses;
  return {
    res: addressOf(ad?.residential),
    same: ad ? ad.sameAsResidential : true,
    corr: addressOf(ad?.correspondence),
  };
}

const personOf = (p: (Person & { relation?: string }) | null | undefined): PersonDraft =>
  p
    ? {
        name: titled(p.name),
        mobile: p.mobile ?? '',
        email: p.email ?? '',
        occupation: p.occupation ?? '',
        income: p.annualIncome != null ? String(p.annualIncome) : '',
        relation: p.relation ?? '',
      }
    : emptyPerson();

export function parentsOf(a: Application): ParentsDraft {
  const p = a.parents;
  return {
    father: personOf(p?.father),
    mother: personOf(p?.mother),
    guardian: personOf(p?.guardian),
    primary: p?.primary ?? a.primaryContact.relation ?? 'FATHER',
    children: p?.children ?? '',
    ids: perParent(() => ({ aadhaar: '', pan: '' })),
    kept: {
      father: keptOf(a, 'father'),
      mother: keptOf(a, 'mother'),
      guardian: keptOf(a, 'guardian'),
    },
    hostel: !!p?.hostel,
  };
}
const keptOf = (a: Application, k: Parent) => ({
  aadhaar: a.identityNumbers?.[k].aadhaar ?? null,
  pan: a.identityNumbers?.[k].pan ?? null,
});

export function previousOf(a: Application): PreviousDraft {
  const p = a.previous;
  return {
    school: p?.school ?? '',
    lastClass: p?.lastClass ?? '',
    result: p?.result ?? '',
    board: p?.board ?? '',
    otherBoard: p?.otherBoard ?? '',
  };
}

export function customOf(a: Application, defs: readonly CustomField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of defs) {
    const v = a.customFields[f.id];
    if (v === undefined || v === null) continue;
    out[f.id] = Array.isArray(v)
      ? v.join(', ')
      : typeof v === 'boolean'
        ? v
          ? 'Yes'
          : 'No'
        : String(v);
  }
  return out;
}

// --- checks ---------------------------------------------------------------------------------------
/** An Aadhaar number as sent: its digits only. */
export const aadhaarDigits = (v: string) => v.replace(/\D/g, '');

/** An Aadhaar number, required unless one is stored (client 2026-10-12); '' when fine. */
export function checkAadhaar(v: string, kept: string | null, missing: string): string {
  if (!v.trim()) return kept ? '' : missing;
  return isAadhaar(aadhaarDigits(v)) ? '' : translate('ADM.ID_INVALID');
}

/** A PAN (five letters, four digits, a letter); '' when fine. */
export function checkPan(v: string, required: boolean, missing: string): string {
  if (!v.trim()) return required ? missing : '';
  return PATTERNS.pan.test(v.trim().toUpperCase()) ? '' : translate('VALIDATION.PAN');
}

export function checkStudent(v: StudentDraft, today: string, opts: { lastRequired: boolean }) {
  const e: Record<string, string> = {};
  const name = (k: string, s: string, req: string | null) => {
    const t = tidy(s);
    if (!t) {
      if (req) e[k] = req;
    } else if (!PATTERNS.personName.test(t)) e[k] = 'Use letters only';
  };
  name('first', v.first, "Enter the student's first name");
  name('middle', v.middle, null);
  name('last', v.last, opts.lastRequired ? "Enter the student's last name" : null);
  if (!v.gender) e['gender'] = 'Choose a gender';
  if (!v.dob) e['dob'] = 'Enter the date of birth';
  else if (!isRealDate(v.dob)) e['dob'] = translate('VALIDATION.DATE');
  else if (v.dob > today) e['dob'] = "The date of birth can't be in the future";
  // The student's Aadhaar is optional (client 2026-10-12): checked only when typed.
  const id = checkAadhaar(v.aadhaar, v.keptAadhaar, '');
  if (id) e['aadhaar'] = id;
  const pan = checkPan(v.pan, false, '');
  if (pan) e['pan'] = pan;
  return e;
}

export function checkAddress(v: AddressDraft, prefix: string, required: boolean) {
  const e: Record<string, string> = {};
  if (!required && !filled(v)) return e;
  if (!v.line1.trim()) e[`${prefix}line1`] = 'Enter the house and street';
  // The area or locality is required (client 2026-10-13).
  if (!v.line2.trim()) e[`${prefix}line2`] = 'Enter the area or locality';
  if (!v.city.trim()) e[`${prefix}city`] = 'Enter the city';
  if (!v.state.trim()) e[`${prefix}state`] = 'Enter the state';
  if (!v.pin.trim()) e[`${prefix}pin`] = 'Enter the PIN code';
  else if (!PATTERNS.postalCode.test(v.pin.trim()))
    e[`${prefix}pin`] = translate('VALIDATION.PIN_CODE');
  return e;
}

export function checkAddresses(v: AddressesDraft, required: boolean) {
  return {
    ...checkAddress(v.res, 'r-', required),
    ...(v.same ? {} : checkAddress(v.corr, 'c-', filled(v.res) || required)),
  };
}

/**
 * A mobile as stored (client 2026-10-13): an Indian number as its 10 digits ("+91" and spaces
 * dropped), another with its country code ("+971501234567").
 */
export const mobileBody = (v: string) => v.replace(/[\s-]/g, '').replace(/^\+91(?=\d{10}$)/, '');
const isMobile = (v: string) => {
  if (PATTERNS.mobile.test(v)) return true;
  const { cc, n } = splitMobile(v);
  return v.startsWith(cc) && cc !== '+91' && /^\d{6,12}$/.test(n);
};

/**
 * `required`: the name and mobile must be given; `primary`: the primary contact, whose e-mail is
 * required too (client 2026-10-13).
 */
export function checkPerson(
  v: PersonDraft,
  prefix: string,
  required: boolean,
  guardian = false,
  primary = false,
) {
  const e: Record<string, string> = {};
  const any = required || Object.values(v).some((x) => x.trim());
  if (!any) return e;
  const n = tidy(v.name);
  if (!n)
    e[`${prefix}name`] = required ? "Enter the parent's or guardian's name" : 'Enter the name';
  else if (!PATTERNS.personName.test(n)) e[`${prefix}name`] = 'Use letters only';
  if (guardian && !v.relation.trim()) e[`${prefix}rel`] = 'Say how the guardian is related';
  const m = mobileBody(v.mobile);
  if (!m) {
    if (required) e[`${prefix}mobile`] = 'Enter a mobile number';
  } else if (!isMobile(m)) {
    e[`${prefix}mobile`] = translate(
      m.startsWith('+') ? 'ADM.MOBILE_INTL_INVALID' : 'ADM.MOBILE_INVALID',
    );
  }
  if (!v.email.trim()) {
    if (primary) e[`${prefix}email`] = "Enter the primary contact's e-mail";
  } else if (!PATTERNS.email.test(v.email.trim().toLowerCase())) {
    e[`${prefix}email`] = translate('VALIDATION.EMAIL');
  }
  if (!guardian && v.income && !/^\d{1,10}$/.test(v.income)) {
    e[`${prefix}inc`] = translate('ADM.INCOME_INVALID');
  }
  return e;
}

/**
 * The father, the mother and the guardian each have their own mobile, Aadhaar number and PAN
 * (client 2026-10-14); the local guardian may share one. What is typed here is compared; the server
 * compares the stored numbers too. A repeat is reported on the later person, naming the earlier.
 */
export function checkSame(
  people: readonly { key: string; who: Parent; mobile: string; aadhaar: string; pan: string }[],
) {
  const e: Record<string, string> = {};
  const same = (what: 'mobile' | 'aadhaar' | 'pan', code: string) => {
    const seen = new Map<string, Parent>();
    for (const p of people) {
      const v = p[what];
      if (!v) continue;
      const first = seen.get(v);
      if (!first) seen.set(v, p.who);
      else e[`${p.key}${what}`] ??= translate(code, { person: first });
    }
  };
  same('mobile', 'ADM.SAME_MOBILE');
  same('aadhaar', 'ADM.SAME_AADHAAR');
  same('pan', 'ADM.SAME_PAN');
  return e;
}

const PREFIX: Readonly<Record<Parent, string>> = { father: 'f-', mother: 'm-', guardian: 'g-' };

/**
 * The father's and the mother's name and mobile are always required (client 2026-10-12,
 * 2026-10-13), the children question, the primary contact's e-mail — and the father's and the
 * mother's Aadhaar and PAN, a guardian's when they are the primary contact (2026-10-13), each
 * unless one is stored.
 */
export function checkParents(v: ParentsDraft) {
  const e: Record<string, string> = {
    ...checkPerson(v.father, 'f-', true, false, v.primary === 'FATHER'),
    ...checkPerson(v.mother, 'm-', true, false, v.primary === 'MOTHER'),
    ...checkPerson(v.guardian, 'g-', v.primary === 'GUARDIAN', true, v.primary === 'GUARDIAN'),
    ...(v.children ? {} : { children: 'Choose one' }),
  };
  const asked = idsNeeded(v.primary, v.hostel).parents;
  for (const k of asked) {
    const id = checkAadhaar(v.ids[k].aadhaar, v.kept[k].aadhaar, `Enter the ${k}'s Aadhaar number`);
    const pan = checkPan(v.ids[k].pan, !v.kept[k].pan, `Enter the ${k}'s PAN`);
    if (id) e[`${PREFIX[k]}aadhaar`] = id;
    if (pan) e[`${PREFIX[k]}pan`] = pan;
  }
  const same = checkSame(
    PARENTS.filter((k) => tidy(v[k].name)).map((k) => ({
      key: PREFIX[k],
      who: k,
      mobile: mobileBody(v[k].mobile),
      aadhaar: asked.includes(k) ? aadhaarDigits(v.ids[k].aadhaar) : '',
      pan: asked.includes(k) ? v.ids[k].pan.trim().toUpperCase() : '',
    })),
  );
  for (const [k, m] of Object.entries(same)) e[k] ??= m;
  return e;
}

/** Previous school: needed above LKG (prototype), and the class sought above the last one. */
export function checkPrevious(
  v: PreviousDraft,
  sought: { order: number; name: string } | null,
  classes: readonly { name: string; order: number }[],
) {
  const e: Record<string, string> = {};
  const needed = !!sought && sought.order > 1;
  if (needed && !v.school.trim()) e['ps'] = 'Previous school is required above LKG';
  if (needed && !v.lastClass) e['pl'] = 'Choose the last class studied';
  if (needed && !v.board) e['pb'] = 'Choose the board';
  const last = classes.find((c) => c.name === v.lastClass);
  if (sought && last && last.order >= sought.order) {
    e['pl'] = `The class sought must be above the last class studied (${last.name})`;
  }
  if (v.board === 'OTHER' && !v.otherBoard.trim()) e['pbo'] = 'Name the board';
  return e;
}

export function checkCustom(
  defs: readonly CustomField[],
  values: Readonly<Record<string, string>>,
) {
  const e: Record<string, string> = {};
  for (const f of defs) {
    const v = (values[f.id] ?? '').trim();
    const k = `cf-${f.id}`;
    if (!v) {
      if (f.required) e[k] = `Enter ${f.label.toLowerCase()}`;
      continue;
    }
    if (f.type === 'NUMBER' && !Number.isFinite(Number(v.replace(/,/g, '')))) {
      e[k] = translate('VALIDATION.FORMAT');
    } else if (f.type === 'DATE' && !isRealDate(v)) e[k] = translate('VALIDATION.DATE');
    else if (f.type === 'EMAIL' && !PATTERNS.email.test(v.toLowerCase())) {
      e[k] = translate('VALIDATION.EMAIL');
    } else if (f.type === 'PHONE' && !PATTERNS.mobile.test(v)) {
      e[k] = translate('VALIDATION.MOBILE');
    }
  }
  return e;
}

/** A joining date of a year that has begun: from today to the year's end (ADM.JOINING_DATE). */
export function checkJoining(d: string, today: string, endsOn: string | null): string {
  if (!d) return 'Enter the joining date';
  if (!isRealDate(d)) return translate('VALIDATION.DATE');
  if (d < today || (endsOn && d > endsOn)) {
    return translate('ADM.JOINING_DATE', { to: endsOn ? formatDate(endsOn) : 'the year’s end' });
  }
  return '';
}

// --- to the API -----------------------------------------------------------------------------------
const orNull = (s: string) => tidy(s) || null;

export function studentBody(v: StudentDraft, keep: Application['student'] | null): StudentSection {
  return {
    firstName: tidy(v.first),
    middleName: orNull(v.middle),
    lastName: tidy(v.last),
    gender: v.gender as Gender,
    dob: v.dob,
    ...identity(v),
    category: (v.category || null) as Category | null,
    medium: orNull(v.medium),
    bloodGroup: v.blood || null,
    allergies: keep?.allergies ?? null,
    health: keep?.health ?? null,
  };
}

/**
 * The student's Aadhaar number and PAN, both optional, as sent: only when typed; with nothing
 * stored, an empty one is sent as none (so a stored one dropped with "Remove" is cleared).
 */
function identity(v: StudentDraft): Pick<StudentSection, 'aadhaar' | 'pan'> {
  return {
    ...(v.aadhaar.trim()
      ? { aadhaar: aadhaarDigits(v.aadhaar) }
      : v.keptAadhaar
        ? {}
        : { aadhaar: null }),
    ...(v.pan.trim() ? { pan: v.pan.trim().toUpperCase() } : v.keptPan ? {} : { pan: null }),
  };
}

/** The new form's student: only what was typed (a draft's student section is partial). */
export function studentPartial(v: StudentDraft): Partial<StudentSection> {
  return {
    firstName: tidy(v.first),
    ...(tidy(v.middle) ? { middleName: tidy(v.middle) } : {}),
    ...(tidy(v.last) ? { lastName: tidy(v.last) } : {}),
    ...(v.gender ? { gender: v.gender } : {}),
    ...(v.dob ? { dob: v.dob } : {}),
    ...(v.aadhaar.trim() ? { aadhaar: aadhaarDigits(v.aadhaar) } : {}),
    ...(v.pan.trim() ? { pan: v.pan.trim().toUpperCase() } : {}),
    ...(v.category ? { category: v.category } : {}),
    ...(v.medium ? { medium: v.medium } : {}),
  };
}

const addressBody = (v: AddressDraft): Address => ({
  line1: tidy(v.line1),
  line2: orNull(v.line2),
  city: tidy(v.city),
  state: tidy(v.state),
  pin: v.pin.trim(),
});

export function addressesBody(v: AddressesDraft): Addresses | null {
  if (!filled(v.res)) return null;
  return {
    residential: addressBody(v.res),
    sameAsResidential: v.same,
    correspondence: v.same ? null : addressBody(v.corr),
  };
}

const personBody = (v: PersonDraft, withIncome = false): Person | null => {
  if (!tidy(v.name)) return null;
  return {
    name: tidy(v.name),
    mobile: mobileBody(v.mobile) || null,
    email: v.email.trim().toLowerCase() || null,
    occupation: orNull(v.occupation),
    // The father's and the mother's annual income (client 2026-10-14).
    ...(withIncome ? { annualIncome: v.income.trim() ? Number(v.income) : null } : {}),
  };
};

export function parentsBody(v: ParentsDraft, keep: Parents | null): Parents {
  // Each parent's Aadhaar and PAN when typed, for those asked (client 2026-10-13).
  const asked = idsNeeded(v.primary, v.hostel).parents;
  const withIds = <P extends Person>(p: P | null, k: Parent): P | null => {
    if (!p || !asked.includes(k)) return p;
    const x = v.ids[k];
    return {
      ...p,
      ...(x.aadhaar.trim() ? { aadhaar: aadhaarDigits(x.aadhaar) } : {}),
      ...(x.pan.trim() ? { pan: x.pan.trim().toUpperCase() } : {}),
    };
  };
  const g = personBody(v.guardian);
  return {
    father: withIds(personBody(v.father, true), 'father'),
    mother: withIds(personBody(v.mother, true), 'mother'),
    guardian: withIds(g ? { ...g, relation: tidy(v.guardian.relation) } : null, 'guardian'),
    primary: v.primary,
    ...(v.children ? { children: v.children } : {}),
    // What the family chose about transport stays as it was (nothing is added to older ones).
    ...(keep?.transport !== undefined ? { transport: keep.transport } : {}),
    ...(keep?.transportStop ? { transportStopId: keep.transportStop.id } : {}),
    ...(keep?.hostel !== undefined ? { hostel: keep.hostel } : {}),
    ...(keep?.localGuardian ? { localGuardian: keep.localGuardian } : {}),
  };
}

export function previousBody(v: PreviousDraft): Previous {
  return {
    school: orNull(v.school),
    lastClass: orNull(v.lastClass),
    result: orNull(v.result),
    board: (v.board || null) as Board | null,
    otherBoard: v.board === 'OTHER' ? orNull(v.otherBoard) : null,
  };
}

export function customBody(defs: readonly CustomField[], values: Readonly<Record<string, string>>) {
  const out: Record<string, unknown> = {};
  for (const f of defs) {
    const v = (values[f.id] ?? '').trim();
    if (!v) continue;
    out[f.id] =
      f.type === 'MULTI_SELECT'
        ? v
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : v;
  }
  return out;
}

// --- an admitted student's record (the Members page) ----------------------------------------------
/**
 * What an admitted student's record never changes here (IDN.PII_READ_ONLY): the student's names,
 * gender and date of birth; each person's name and mobile; and the Aadhaar and PAN numbers — a
 * correction request changes the identity, and the numbers are never read back in full.
 */
const RECORD_LOCKED =
  /^(first|middle|last|gender|dob|aadhaar|pan|(f|m|g|lg)-(name|mobile|aadhaar|pan))$/;

/**
 * The identity a record leaves open (client 2026-10-22), by error key: a field with nothing stored —
 * an older bulk upload's missing last name, or a parent it never had — is filled once here; one
 * with a value stays locked. The middle name stays locked even when empty: adding one changes the
 * name. No guardian is added on a record.
 */
export function recordOpen(a: Application): ReadonlySet<string> {
  const s = a.student;
  const open = new Set<string>();
  if (!s.firstName) open.add('first');
  if (!s.lastName) open.add('last');
  if (!s.gender) open.add('gender');
  if (!s.dob) open.add('dob');
  for (const [k, prefix] of [
    ['father', 'f-'],
    ['mother', 'm-'],
  ] as const) {
    const p = a.parents?.[k];
    if (!p?.name) open.add(`${prefix}name`);
    if (!p?.mobile) open.add(`${prefix}mobile`);
  }
  const g = a.parents?.guardian;
  if (g && !g.mobile) open.add('g-mobile');
  return open;
}

/** A record section's checks without the locked fields' (they are sent as stored). */
export const recordChecks = (e: Errors, open: ReadonlySet<string>): Record<string, string> =>
  Object.fromEntries(Object.entries(e).filter(([k]) => open.has(k) || !RECORD_LOCKED.test(k)));

/** What the record keeps of the student besides the form's fields (client: allergies, health). */
export interface CareDraft {
  readonly allergies: string;
  readonly health: string;
}

/** The local guardian's details a record can change: the relation and the address. */
export interface LocalGuardianDraft {
  readonly relation: string;
  readonly address: string;
}

export function checkLocalGuardian(v: LocalGuardianDraft) {
  const e: Record<string, string> = {};
  if (!v.relation.trim()) e['lg-rel'] = 'Say how the local guardian is related';
  if (!v.address.trim()) e['lg-addr'] = "Enter the local guardian's address";
  return e;
}

/**
 * The student section of a record: the names, gender and date of birth exactly as stored (those
 * left open as typed), no Aadhaar or PAN (the stored ones stay), and the rest as edited.
 */
export function recordStudentBody(
  v: StudentDraft,
  a: Application,
  care: CareDraft,
  open: ReadonlySet<string>,
) {
  const s = a.student;
  return {
    firstName: open.has('first') ? tidy(v.first) : s.firstName,
    middleName: s.middleName,
    lastName: open.has('last') ? tidy(v.last) : s.lastName,
    gender: open.has('gender') ? (v.gender as Gender) : s.gender,
    dob: open.has('dob') ? v.dob : s.dob,
    category: (v.category || null) as Category | null,
    medium: orNull(v.medium),
    bloodGroup: v.blood || null,
    allergies: orNull(care.allergies),
    health: orNull(care.health),
  };
}

/**
 * The parents section of a record: each person's name and mobile and the primary contact exactly
 * as stored (those left open as typed: a father or mother the record never had is added whole), no
 * Aadhaar or PAN, and the rest as edited.
 */
export function recordParentsBody(
  v: ParentsDraft,
  a: Application,
  lg: LocalGuardianDraft | null,
  open: ReadonlySet<string>,
): Parents {
  const keep = a.parents;
  const one = (k: Parent, prefix: string, withIncome: boolean): Person | null => {
    const p = keep?.[k];
    const d = v[k];
    if (!p) return k === 'guardian' ? null : personBody(d, withIncome);
    return {
      name: open.has(`${prefix}name`) ? tidy(d.name) : p.name,
      mobile: open.has(`${prefix}mobile`) ? mobileBody(d.mobile) || null : (p.mobile ?? null),
      email: d.email.trim().toLowerCase() || null,
      occupation: orNull(d.occupation),
      ...(withIncome ? { annualIncome: d.income.trim() ? Number(d.income) : null } : {}),
    };
  };
  const g = one('guardian', 'g-', false);
  const local = keep?.localGuardian;
  return {
    father: one('father', 'f-', true),
    mother: one('mother', 'm-', true),
    guardian: g ? { ...g, relation: tidy(v.guardian.relation) } : null,
    primary: keep?.primary ?? a.primaryContact.relation ?? v.primary,
    // Required on a record too: a bulk upload's form has none until it is chosen here.
    children: v.children || null,
    ...(keep?.transport !== undefined ? { transport: keep.transport } : {}),
    // The stop as the section takes it (an id), never the stored view of it.
    ...(keep?.transportStop ? { transportStopId: keep.transportStop.id } : {}),
    ...(keep?.hostel !== undefined ? { hostel: keep.hostel } : {}),
    ...(local
      ? {
          localGuardian: {
            name: local.name,
            mobile: local.mobile,
            relation: lg ? tidy(lg.relation) : local.relation,
            address: lg ? tidy(lg.address) : local.address,
          },
        }
      : {}),
  };
}

/** A server field (`student.firstName`, `firstName`, `parents.father.mobile` …) → the form's key. */
export function formKey(field: string): string | null {
  const f = field.replace(/^(class|student|addresses|previous|parents|data)\./, '');
  const map: Record<string, string> = {
    classId: 'cls',
    yearId: 'yr',
    joiningDate: 'join',
    midTermReason: 'why',
    firstName: 'first',
    middleName: 'middle',
    lastName: 'last',
    gender: 'gender',
    dob: 'dob',
    aadhaar: 'aadhaar',
    pan: 'pan',
    'father.aadhaar': 'f-aadhaar',
    'father.pan': 'f-pan',
    'mother.aadhaar': 'm-aadhaar',
    'mother.pan': 'm-pan',
    'guardian.aadhaar': 'g-aadhaar',
    'guardian.pan': 'g-pan',
    category: 'cat',
    medium: 'med',
    bloodGroup: 'blood',
    'residential.line1': 'r-line1',
    'residential.city': 'r-city',
    'residential.state': 'r-state',
    'residential.pin': 'r-pin',
    'correspondence.line1': 'c-line1',
    'correspondence.city': 'c-city',
    'correspondence.state': 'c-state',
    'correspondence.pin': 'c-pin',
    school: 'ps',
    lastClass: 'pl',
    board: 'pb',
    result: 'pr',
    'father.name': 'f-name',
    'father.mobile': 'f-mobile',
    'father.email': 'f-email',
    'father.annualIncome': 'f-inc',
    'mother.annualIncome': 'm-inc',
    'mother.name': 'm-name',
    'mother.mobile': 'm-mobile',
    'mother.email': 'm-email',
    'guardian.name': 'g-name',
    'guardian.mobile': 'g-mobile',
    'guardian.email': 'g-email',
    'guardian.relation': 'g-rel',
    father: 'f-name',
    mother: 'm-name',
    children: 'children',
    guardian: 'g-name',
    // An admitted student's record (the Members page): the rest of what it can refuse.
    primary: 'primary',
    allergies: 'allergies',
    health: 'health',
    'father.occupation': 'f-occ',
    'mother.occupation': 'm-occ',
    'localGuardian.name': 'lg-name',
    'localGuardian.mobile': 'lg-mobile',
    'localGuardian.relation': 'lg-rel',
    'localGuardian.address': 'lg-addr',
    'localGuardian.aadhaar': 'lg-aadhaar',
    'localGuardian.pan': 'lg-pan',
    localGuardian: 'lg-name',
  };
  if (map[f]) return map[f]!;
  const cf = /^customFields\.(.+)$/.exec(field);
  return cf ? `cf-${cf[1]}` : null;
}
