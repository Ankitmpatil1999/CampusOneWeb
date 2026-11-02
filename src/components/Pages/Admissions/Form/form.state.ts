/**
 * The application form's working draft (prototype `blank()` and `collect()`), its mapping to the
 * API's sections (ADM-004/005), the per-step checks (prototype `validateStep`, with the register's
 * wording) and the mapping of the server's field errors back to the form's fields.
 */
import { titleCase } from '../../../Utils/format';
import { isAadhaar, isRealDate, PATTERNS } from '../../../Utils/patterns';
import { translate } from '../../../Utils/translate';
import type {
  AppStatus,
  Application,
  CardOwner,
  DocType,
  Landing,
  LandingClass,
  OpenYear,
  SectionName,
} from '../admissions.api';
import {
  ageOn,
  ageRef,
  classOrder,
  date,
  joinMobile,
  msg,
  splitMobile,
  today,
} from '../admissions.store';
import type { PickedFile } from '../Shared/AdmissionsUi';

export const STEPS = [
  {
    t: 'Class & year',
    icon: 'school',
    hint: 'Choose the academic year, the class and the date your child will join.',
  },
  {
    t: 'Student',
    icon: 'user',
    hint: 'Enter the details exactly as they appear on the birth certificate.',
  },
  {
    t: 'Addresses',
    icon: 'home',
    hint: 'Where the family lives now, and where letters should go.',
  },
  { t: 'Previous schooling', icon: 'book', hint: 'The last school your child attended.' },
  {
    t: 'Parents & guardians',
    icon: 'users',
    hint: "The father's and the mother's details, a guardian if any, and who the school should contact first.",
  },
  {
    t: 'References',
    icon: 'handshake',
    hint: 'People who know your child — a teacher from the previous school is ideal.',
  },
  { t: 'Documents', icon: 'file', hint: 'Clear scans or photos. Each file can be up to 2 MB.' },
  {
    t: 'Review & declaration',
    icon: 'checksq',
    hint: 'Check everything once more before you submit.',
  },
] as const;

export const GENDERS = ['Male', 'Female', 'Other'] as const;
export const CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'Other'] as const;
export const MEDIUMS = ['English', 'Kannada', 'Hindi'] as const;
export const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Not known'] as const;
export const BOARDS = ['CBSE', 'ICSE', 'State board', 'IB', 'Other'] as const;
/** The last result is chosen, not typed (client 2026-10-13). */
export const RESULTS = ['Pass', 'Fail'] as const;
/**
 * A result saved while it was typed ("Passed — A grade"): Pass or Fail when it says which, else
 * none, so the family chooses it again.
 */
export function resultOf(v: string | null | undefined): string {
  const t = (v ?? '').trim();
  return /^pass/i.test(t) ? 'Pass' : /^fail/i.test(t) ? 'Fail' : '';
}
export const STATES = [
  'Karnataka',
  'Andhra Pradesh',
  'Goa',
  'Kerala',
  'Maharashtra',
  'Tamil Nadu',
  'Telangana',
  'Other state',
] as const;

const GENDER_API: Record<string, 'MALE' | 'FEMALE' | 'OTHER'> = {
  Male: 'MALE',
  Female: 'FEMALE',
  Other: 'OTHER',
};
const CATEGORY_API: Record<string, string> = {
  General: 'GENERAL',
  OBC: 'OBC',
  SC: 'SC',
  ST: 'ST',
  Other: 'OTHER',
};
const BOARD_API: Record<string, string> = {
  CBSE: 'CBSE',
  ICSE: 'ICSE',
  'State board': 'STATE',
  IB: 'IB',
  Other: 'OTHER',
};
const invert = (m: Record<string, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, string>;

export interface Addr {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pin: string;
}
export interface PersonDraft {
  name: string;
  /** The country code of the mobile (client 2026-10-13); +91 unless chosen. */
  cc: string;
  /** The mobile number without its country code. */
  mobile: string;
  email: string;
  occ: string;
  /** The annual income in rupees, digits only (the father's and the mother's, client 2026-10-14). */
  income: string;
}
export interface RefDraft {
  /** The server's id once saved (ADM-007); null for a new one. */
  id: string | null;
  name: string;
  relation: string;
  cc: string;
  phone: string;
  email: string;
}
export type Who = 'father' | 'mother' | 'guardian';

export { DIAL_CODES, joinMobile, splitMobile } from '../admissions.store';

/**
 * The Aadhaar and PAN cards, front and back (client 2026-10-13): the student's, the father's, the
 * mother's, a guardian's and the local guardian's.
 */
export type CardType = Exclude<DocType, 'PHOTO' | 'BIRTH' | 'ADDRESS' | 'REPORT' | 'TC' | 'OTHER'>;
export interface CardSlot {
  readonly t: CardType;
  readonly fid: string;
  readonly l: string;
}
const slots = (who: CardOwner, p: string): CardSlot[] => [
  { t: `${who}_AADHAAR_FRONT`, fid: `pa-${p}-af`, l: 'Aadhaar card — front' },
  { t: `${who}_AADHAAR_BACK`, fid: `pa-${p}-ab`, l: 'Aadhaar card — back' },
  { t: `${who}_PAN_FRONT`, fid: `pa-${p}-pf`, l: 'PAN card — front' },
  { t: `${who}_PAN_BACK`, fid: `pa-${p}-pb`, l: 'PAN card — back' },
];
/** The student's cards: optional, like the student's numbers. */
export const STUDENT_CARDS = slots('STUDENT', 'sc');

/** The people whose Aadhaar, PAN and cards the form asks for (client 2026-10-13). */
export type Holder = 'father' | 'mother' | 'guardian' | 'lg';
export const HOLDERS: readonly Holder[] = ['father', 'mother', 'guardian', 'lg'];
/** Their cards: the field ids start pa-fc-, pa-mc-, pa-gc-, pa-lc-. */
export const PERSON_CARDS: Readonly<Record<Holder, readonly CardSlot[]>> = {
  father: slots('FATHER', 'fc'),
  mother: slots('MOTHER', 'mc'),
  guardian: slots('GUARDIAN', 'gc'),
  lg: slots('LOCAL_GUARDIAN', 'lc'),
};
/** Their number fields: pa-f-aadhaar, pa-m-pan, pa-lg-aadhaar … */
export const ID_PREFIX: Readonly<Record<Holder, string>> = {
  father: 'pa-f',
  mother: 'pa-m',
  guardian: 'pa-g',
  lg: 'pa-lg',
};
/** How the server names them. */
export const API_HOLDER: Readonly<Record<Holder, string>> = {
  father: 'father',
  mother: 'mother',
  guardian: 'guardian',
  lg: 'localGuardian',
};
const ALL_CARDS = [...STUDENT_CARDS, ...HOLDERS.flatMap((h) => PERSON_CARDS[h])];
const noCards = () =>
  Object.fromEntries(ALL_CARDS.map((c) => [c.t, null])) as Record<CardType, PickedFile | null>;

/**
 * Whose Aadhaar, PAN and cards are required (client 2026-10-13): the father's and the mother's
 * always, a guardian's who is the primary contact, the local guardian's of a hostel student. The
 * form asks for no one else's.
 */
export function idHolders(d: Pick<Draft, 'primary' | 'hostel'>): Holder[] {
  return [
    'father',
    'mother',
    ...(d.primary === 'guardian' ? (['guardian'] as const) : []),
    ...(d.hostel ? (['lg'] as const) : []),
  ];
}

export interface Draft {
  appId: string | null;
  appNo: string | null;
  status: AppStatus;
  saved: string | null;
  step: number;
  maxStep: number;
  year: string;
  classId: string;
  joining: string;
  midReason: string;
  first: string;
  middle: string;
  last: string;
  gender: string;
  dob: string;
  /**
   * The Aadhaar numbers and PANs typed in this visit (client 2026-10-12): the student's, and each
   * person's (2026-10-13). They are write-only: an empty one keeps what the server has, which comes
   * back masked in `kept`.
   */
  aadhaar: string;
  pan: string;
  /** The student's own contact (client 2026-10-23), optional: a mobile gives a CampusOne account. */
  smobile: string;
  semail: string;
  ids: Record<Holder, { aadhaar: string; pan: string }>;
  kept: Kept;
  category: string;
  medium: string;
  blood: string;
  allergies: string;
  health: string;
  photo: PickedFile | null;
  res: Addr;
  same: boolean;
  corr: Addr;
  prev: { school: string; last: string; result: string; board: string; other: string };
  /** Mid-term: the certificate uploaded, or an undertaking to hand it in by `due` (client 2026-10-13). */
  tc: { mode: 'tc' | 'und'; file: PickedFile | null; due: string };
  father: PersonDraft;
  mother: PersonDraft;
  guardian: PersonDraft & { relation: string };
  primary: '' | Who;
  /** Single child or more (client 2026-10-12). */
  children: '' | 'SINGLE' | 'MORE';
  /** School transport, and the pick-up stop preferred (a stop id; '' for the school to decide). */
  transport: boolean;
  transportStop: string;
  hostel: boolean;
  lg: { name: string; relation: string; cc: string; mobile: string; address: string };
  refs: RefDraft[];
  /** The references as last saved, to tell what changed. */
  savedRefs: RefDraft[];
  docs: { birth: PickedFile | null; addr: PickedFile | null; report: PickedFile | null };
  /** The Aadhaar and PAN cards uploaded, front and back (client 2026-10-13). */
  cards: Record<CardType, PickedFile | null>;
  cf: Record<string, string | string[]>;
  declare: boolean;
  /** What is collected registers the family's CampusOne account (client 2026-10-12). */
  consent: boolean;
  /**
   * The application fee is paid online to submit (client 2026-10-13): always true now. Kept for the
   * admission fee's choice, which may still be left for later.
   */
  payApplication: boolean;
  /** Pay the admission fee now, with the application fee in one payment (client 2026-10-09). */
  payAdmission: boolean;
  /** What the school recorded about the transfer certificate (ADM-017), if anything. */
  tcRecorded: Application['tc'];
}

/** The first person with a name or mobile (the prototype's preselected primary contact). */
export function primaryDefault(d: Draft): '' | Who {
  return (['father', 'mother', 'guardian'] as const).find((k) => d[k].name || d[k].mobile) ?? '';
}

/** The primary contact and their mobile on the form ("FATHER 9876512340"), '' when none. */
export function contactOf(d: Draft): string {
  const who = d.primary || primaryDefault(d);
  const m = who ? joinMobile(d[who].cc, d[who].mobile) : '';
  return who && m ? `${who.toUpperCase()} ${m}` : '';
}

/** The primary contact and their mobile as the server has them, in the same form. */
export function savedContactOf(a: Application): string {
  const who = a.parents?.primary ?? a.primaryContact.relation;
  const m = splitMobile(a.primaryContact.mobile);
  const mobile = joinMobile(m.cc, m.n);
  return who && mobile ? `${who} ${mobile}` : '';
}

/** The Aadhaar numbers and PANs the server keeps, masked: the student's and each person's. */
export interface Kept {
  aadhaar: string | null;
  pan: string | null;
  people: Record<Holder, { aadhaar: string | null; pan: string | null }>;
}

const addr = (): Addr => ({ line1: '', line2: '', city: '', state: 'Karnataka', pin: '' });
const person = (): PersonDraft => ({
  name: '',
  cc: '+91',
  mobile: '',
  email: '',
  occ: '',
  income: '',
});
const perHolder = <T>(f: () => T) =>
  Object.fromEntries(HOLDERS.map((h) => [h, f()])) as Record<Holder, T>;
const noIds = () => perHolder(() => ({ aadhaar: '', pan: '' }));
const noneKept = (): Kept => ({
  aadhaar: null,
  pan: null,
  people: perHolder(() => ({ aadhaar: null, pan: null })),
});

export function keptOf(a: Application): Kept {
  const n = a.identityNumbers;
  const of = (h: Holder) => {
    const x = n?.[API_HOLDER[h] as keyof NonNullable<typeof n>];
    return { aadhaar: x?.aadhaar ?? null, pan: x?.pan ?? null };
  };
  return {
    aadhaar: a.student.aadhaar ?? null,
    pan: a.student.pan ?? null,
    people: { father: of('father'), mother: of('mother'), guardian: of('guardian'), lg: of('lg') },
  };
}

/** An Aadhaar number as sent: its digits only. */
export const aadhaarDigits = (v: string) => v.replace(/\D/g, '');
/** An Aadhaar number as shown once typed: like the server's mask. */
export const maskAadhaar = (v: string) => `XXXX XXXX ${aadhaarDigits(v).slice(-4)}`;
/** A PAN as shown once typed: like the server's mask. */
export const maskPan = (v: string) => `••••••${v.trim().toUpperCase().slice(-4)}`;
/** A person's Aadhaar and PAN as the review shows them: what was typed, else what is kept. */
export const idsShown = (d: Draft, h: Holder) => ({
  aadhaar: d.ids[h].aadhaar ? maskAadhaar(d.ids[h].aadhaar) : d.kept.people[h].aadhaar,
  pan: d.ids[h].pan ? maskPan(d.ids[h].pan) : d.kept.people[h].pan,
});

export function blank(year: OpenYear | null): Draft {
  return {
    appId: null,
    appNo: null,
    status: 'DRAFT',
    saved: null,
    step: 0,
    maxStep: 0,
    year: year?.id ?? '',
    classId: '',
    joining: defaultJoin(year),
    midReason: '',
    first: '',
    middle: '',
    last: '',
    gender: '',
    dob: '',
    aadhaar: '',
    pan: '',
    smobile: '',
    semail: '',
    ids: noIds(),
    kept: noneKept(),
    category: '',
    medium: '',
    blood: '',
    allergies: '',
    health: '',
    photo: null,
    res: addr(),
    same: true,
    corr: addr(),
    prev: { school: '', last: '', result: '', board: '', other: '' },
    tc: { mode: 'tc', file: null, due: '' },
    father: person(),
    mother: person(),
    guardian: { ...person(), relation: '' },
    primary: '',
    children: '',
    transport: false,
    transportStop: '',
    hostel: false,
    lg: { name: '', relation: '', cc: '+91', mobile: '', address: '' },
    refs: [],
    savedRefs: [],
    docs: { birth: null, addr: null, report: null },
    cards: noCards(),
    cf: {},
    declare: false,
    consent: false,
    payApplication: true,
    payAdmission: false,
    tcRecorded: null,
  };
}

/** A regular year starts on its first day; a year already under way has no default (mid-term). */
export const defaultJoin = (y: OpenYear | null) => (y && y.kind === 'REGULAR' ? y.startsOn : '');

const s = (v: string | null | undefined) => v ?? '';
const titleName = (v: string | null | undefined) => titleCase(s(v));
const file = (a: Application, t: DocType): PickedFile | null => {
  const d = a.documents.find((x) => x.type === t);
  return d ? { name: d.name, size: d.sizeBytes } : null;
};
const personOf = (p: Application['parents'], k: Who) => {
  const x = p?.[k];
  const m = splitMobile(x?.mobile);
  return {
    name: titleName(x?.name),
    cc: m.cc,
    mobile: m.n,
    email: s(x?.email),
    occ: s(x?.occupation),
    income: x?.annualIncome != null ? String(x.annualIncome) : '',
  };
};

/** The draft as the server has it (ADM-025), to continue where the family stopped. */
export function fromApp(a: Application): Draft {
  const st = a.student;
  const p = a.parents;
  const refs = a.references.map((r) => {
    const m = splitMobile(r.mobile);
    return {
      id: r.id,
      name: r.name,
      relation: s(r.relation),
      cc: m.cc,
      phone: m.n,
      email: s(r.email),
    };
  });
  const lgMobile = splitMobile(p?.localGuardian?.mobile);
  const step = Math.min(7, Math.max(0, a.step));
  const genders = invert(GENDER_API);
  return {
    ...blank(null),
    appId: a.id,
    appNo: a.applicationNo,
    status: a.status,
    saved: a.updatedAt,
    step,
    maxStep: step,
    year: a.year.id,
    classId: a.class?.id ?? '',
    joining: s(a.joiningDate),
    midReason: s(a.midTermReason),
    first: titleName(st.firstName),
    middle: titleName(st.middleName),
    last: titleName(st.lastName),
    gender: st.gender ? (genders[st.gender] ?? '') : '',
    dob: s(st.dob),
    smobile: s(st.mobile),
    semail: s(st.email),
    kept: keptOf(a),
    category: st.category ? (invert(CATEGORY_API)[st.category] ?? '') : '',
    medium: s(st.medium),
    blood: st.bloodGroup === 'UNKNOWN' ? 'Not known' : s(st.bloodGroup),
    allergies: s(st.allergies),
    health: s(st.health),
    photo: file(a, 'PHOTO'),
    res: a.addresses ? { ...addr(), ...nn(a.addresses.residential) } : addr(),
    same: a.addresses?.sameAsResidential ?? true,
    corr: a.addresses?.correspondence ? { ...addr(), ...nn(a.addresses.correspondence) } : addr(),
    prev: {
      school: s(a.previous?.school),
      last: s(a.previous?.lastClass),
      result: resultOf(a.previous?.result),
      board: a.previous?.board ? (invert(BOARD_API)[a.previous.board] ?? '') : '',
      other: s(a.previous?.otherBoard),
    },
    tc: {
      mode: a.tc?.mode === 'UNDERTAKING' ? 'und' : 'tc',
      file: file(a, 'TC'),
      due: s(a.tc?.dueDate),
    },
    father: personOf(p, 'father'),
    mother: personOf(p, 'mother'),
    guardian: { ...personOf(p, 'guardian'), relation: s(p?.guardian?.relation) },
    primary: p?.primary ? (p.primary.toLowerCase() as Who) : '',
    children: p?.children === 'SINGLE' || p?.children === 'MORE' ? p.children : '',
    transport: !!p?.transport,
    transportStop: p?.transportStop?.id ?? '',
    hostel: !!p?.hostel,
    lg: {
      name: titleName(p?.localGuardian?.name),
      relation: s(p?.localGuardian?.relation),
      cc: lgMobile.cc,
      mobile: lgMobile.n,
      address: s(p?.localGuardian?.address),
    },
    refs,
    savedRefs: refs.map((r) => ({ ...r })),
    docs: { birth: file(a, 'BIRTH'), addr: file(a, 'ADDRESS'), report: file(a, 'REPORT') },
    cards: cardsOf(a),
    cf: Object.fromEntries(
      Object.entries(a.customFields ?? {})
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [
          k,
          Array.isArray(v)
            ? v.map(String)
            : typeof v === 'boolean'
              ? v
                ? 'Yes'
                : 'No'
              : String(v),
        ]),
    ),
    declare: !!a.declaration,
    consent: !!a.registrationConsentAt,
    payApplication: true,
    payAdmission: false,
    tcRecorded: tcRecordedOf(a.tc),
  };
}

/**
 * Only a certificate the school recorded (its number) is fixed; the family's own undertaking stays
 * theirs to change until they submit (client 2026-10-13).
 */
export const tcRecordedOf = (tc: Application['tc']) => (tc?.mode === 'TC' && tc.number ? tc : null);

/** The Aadhaar and PAN cards the server has. */
export const cardsOf = (a: Application) =>
  Object.fromEntries(ALL_CARDS.map((c) => [c.t, file(a, c.t)])) as Record<
    CardType,
    PickedFile | null
  >;

/** The latest date an undertaking may give: 60 days after joining (or after today, if later). */
export function tcDueWindow(d: Draft) {
  const t = today();
  const from = d.joining && d.joining > t ? d.joining : t;
  const last = new Date(`${from}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + 60);
  return { min: t, max: last.toISOString().slice(0, 10) };
}

/** Address fields without nulls. */
function nn(a: { line1: string; line2?: string | null; city: string; state: string; pin: string }) {
  return { line1: a.line1, line2: s(a.line2), city: a.city, state: a.state, pin: a.pin };
}

// --- the API's sections -------------------------------------------------------------------------------

const orNull = (v: string) => (v.trim() ? v.trim() : null);
const addrApi = (a: Addr) => ({
  line1: a.line1.trim(),
  line2: orNull(a.line2),
  city: a.city.trim(),
  state: a.state,
  pin: a.pin.trim(),
});
const filled = (p: PersonDraft) => !!(p.name || p.mobile || p.email || p.occ);
const personApi = (p: PersonDraft, withIncome = false) => ({
  name: p.name.trim(),
  mobile: orNull(joinMobile(p.cc, p.mobile)),
  email: orNull(p.email.toLowerCase()),
  occupation: orNull(p.occ),
  // The father's and the mother's annual income (client 2026-10-14).
  ...(withIncome ? { annualIncome: p.income.trim() ? Number(p.income) : null } : {}),
});

export function classSection(d: Draft, mid: boolean) {
  return {
    yearId: d.year,
    classId: d.classId,
    joiningDate: d.joining || null,
    midTermReason: mid ? orNull(d.midReason) : null,
  };
}

/** The section a step saves (steps 1–5 and 7); References and Review have none. */
export function sectionOf(
  step: number,
  d: Draft,
  mid: boolean,
): { section: SectionName; data: unknown } | null {
  switch (step) {
    case 0:
      return { section: 'class', data: classSection(d, mid) };
    case 1:
      return {
        section: 'student',
        data: {
          firstName: d.first.trim(),
          middleName: orNull(d.middle),
          lastName: d.last.trim(),
          gender: GENDER_API[d.gender],
          dob: d.dob,
          // Write-only: sent when typed; both are optional, so with nothing kept an empty one
          // clears it (and a removed one is no longer kept).
          ...(d.aadhaar.trim()
            ? { aadhaar: aadhaarDigits(d.aadhaar) }
            : d.kept.aadhaar
              ? {}
              : { aadhaar: null }),
          ...(d.pan.trim() ? { pan: d.pan.trim().toUpperCase() } : d.kept.pan ? {} : { pan: null }),
          mobile: orNull(d.smobile),
          email: d.semail.trim() ? d.semail.trim().toLowerCase() : null,
          category: d.category ? CATEGORY_API[d.category] : null,
          medium: orNull(d.medium),
          bloodGroup: d.blood ? (d.blood === 'Not known' ? 'UNKNOWN' : d.blood) : null,
          allergies: orNull(d.allergies),
          health: orNull(d.health),
        },
      };
    case 2:
      return {
        section: 'addresses',
        data: {
          residential: addrApi(d.res),
          sameAsResidential: d.same,
          correspondence: d.same ? null : addrApi(d.corr),
        },
      };
    case 3:
      return {
        section: 'previous',
        data: {
          school: orNull(d.prev.school),
          lastClass: orNull(d.prev.last),
          result: orNull(d.prev.result),
          board: d.prev.board ? BOARD_API[d.prev.board] : null,
          otherBoard: d.prev.board === 'Other' ? orNull(d.prev.other) : null,
          // Mid-term: the family's answer on the transfer certificate (client 2026-10-13).
          ...(mid && !d.tcRecorded
            ? {
                tc:
                  d.tc.mode === 'und'
                    ? { mode: 'UNDERTAKING', dueDate: d.tc.due || null }
                    : { mode: 'TC' },
              }
            : {}),
        },
      };
    case 4: {
      // Each person's Aadhaar and PAN when typed (write-only; an empty one keeps what is stored),
      // for the people the form asks them of (client 2026-10-13).
      const asked = idHolders(d);
      const ids = (h: Holder) => {
        const x = d.ids[h];
        if (!asked.includes(h)) return {};
        return {
          ...(x.aadhaar.trim() ? { aadhaar: aadhaarDigits(x.aadhaar) } : {}),
          ...(x.pan.trim() ? { pan: x.pan.trim().toUpperCase() } : {}),
        };
      };
      return {
        section: 'parents',
        data: {
          // Always sent: the father's and the mother's details are required (client 2026-10-12,
          // 2026-10-13).
          father: { ...personApi(d.father, true), ...ids('father') },
          mother: { ...personApi(d.mother, true), ...ids('mother') },
          guardian:
            filled(d.guardian) || d.guardian.relation
              ? {
                  ...personApi(d.guardian),
                  relation: d.guardian.relation.trim(),
                  ...ids('guardian'),
                }
              : null,
          primary: d.primary.toUpperCase(),
          ...(d.children ? { children: d.children } : {}),
          transport: d.transport,
          transportStopId: d.transport && d.transportStop ? d.transportStop : null,
          hostel: d.hostel,
          localGuardian: d.hostel
            ? {
                name: d.lg.name.trim(),
                relation: d.lg.relation.trim(),
                mobile: joinMobile(d.lg.cc, d.lg.mobile),
                address: d.lg.address.trim(),
                ...ids('lg'),
              }
            : null,
        },
      };
    }
    case 6:
      return {
        section: 'customFields',
        data: Object.fromEntries(
          Object.entries(d.cf).filter(([, v]) => (Array.isArray(v) ? v.length : String(v).trim())),
        ),
      };
  }
  return null;
}

// --- checks ---------------------------------------------------------------------------------------------

export interface Facts {
  readonly landing: Landing;
  readonly year: OpenYear | null;
  readonly cls: LandingClass | null;
  readonly mid: boolean;
}

export const orderOf = (landing: Landing, c: LandingClass | null | undefined) =>
  c ? (classOrder(c.name) ?? landing.classes.findIndex((x) => x.id === c.id)) : -1;

/** The age check of the student step (BR-50, OI-ADM-23). */
export function ageCheck(d: Draft, f: Facts) {
  if (!d.dob || !isRealDate(d.dob) || !f.cls?.ageBand || !f.year) return null;
  const ref = ageRef(f.year.startsOn, f.mid, d.joining || null);
  const a = ageOn(d.dob, ref);
  const b = f.cls.ageBand;
  return { ok: a.y >= b.min && a.y <= b.max, a, b, ref, cls: f.cls };
}

/** The joining-date window: mid-term from today, regular from the year's start, to its end. */
export function joinWindow(y: OpenYear | null) {
  if (!y) return { min: '', max: '' };
  const t = today();
  return { min: y.kind === 'MID_TERM' || y.startsOn < t ? t : y.startsOn, max: y.endsOn };
}

const req = () => translate('VALIDATION.REQUIRED');
const LETTERS = PATTERNS.personName;
const IDLIKE = /\b\d{4}\s?\d{4}\s?\d{4}\b|[A-Z]{5}\d{4}[A-Z]/i;

/** The step's checks: field id → message (empty when the step can be saved). */
export function validateStep(step: number, d: Draft, f: Facts): Record<string, string> {
  const e: Record<string, string> = {};
  const need = (id: string, v: string | boolean | null | undefined, m = req()) => {
    if (!v || (typeof v === 'string' && !v.trim())) e[id] = m;
  };
  const name = (id: string, v: string, required: boolean) => {
    if (!v.trim()) {
      if (required) e[id] = req();
    } else if (!LETTERS.test(v.trim()) || v.trim().length > 100) {
      e[id] = translate('VALIDATION.FORMAT');
    }
  };
  /** An Indian number of 10 digits, or 6 to 12 digits after another country code (2026-10-13). */
  const mobile = (id: string, cc: string, v: string, required = true) => {
    const n = v.trim();
    if (!n) {
      if (required) e[id] = req();
    } else if (cc === '+91' ? !PATTERNS.mobile.test(n) : !/^\d{6,12}$/.test(n)) {
      e[id] = translate(cc === '+91' ? 'ADM.MOBILE_INVALID' : 'ADM.MOBILE_INTL_INVALID');
    }
  };
  const email = (id: string, v: string) => {
    if (v.trim() && !PATTERNS.email.test(v.trim().toLowerCase()))
      e[id] = translate('VALIDATION.EMAIL');
  };
  // Required unless the server already keeps one (client 2026-10-12).
  // Required unless one is stored (the primary contact's); the student's is optional.
  const aadhaar = (id: string, v: string, kept: string | null, required = true) => {
    if (!v.trim()) {
      if (required && !kept) e[id] = req();
    } else if (!isAadhaar(aadhaarDigits(v))) e[id] = translate('ADM.ID_INVALID');
  };
  const pan = (id: string, v: string, required: boolean) => {
    if (!v.trim()) {
      if (required) e[id] = req();
    } else if (!PATTERNS.pan.test(v.trim().toUpperCase())) e[id] = translate('VALIDATION.PAN');
  };
  const order = orderOf(f.landing, f.cls);
  switch (step) {
    case 0: {
      need('pa-year', d.year);
      if (!d.classId) e['pa-class'] = translate('ADM.CLASS_INVALID');
      const w = joinWindow(f.year);
      if (!d.joining) {
        if (f.mid) e['pa-join'] = req();
      } else if (!isRealDate(d.joining) || d.joining < w.min || d.joining > w.max) {
        e['pa-join'] = msg('ADM.JOINING_DATE', { to: date(w.max) });
      }
      break;
    }
    case 1: {
      name('pa-first', d.first, true);
      name('pa-middle', d.middle, false);
      name('pa-last', d.last, true);
      need('pa-gender', d.gender);
      if (!d.dob) e['pa-dob'] = req();
      else if (!isRealDate(d.dob) || d.dob >= today()) e['pa-dob'] = translate('VALIDATION.DATE');
      else {
        const c = ageCheck(d, f);
        if (c && !c.ok) {
          e['pa-dob'] =
            c.a.y < c.b.min
              ? msg('ADM.AGE_TOO_LOW', { n: c.b.min, standard: c.cls.name, date: date(c.ref) })
              : msg('ADM.AGE_TOO_HIGH', { standard: c.cls.name, n: c.b.max });
        }
      }
      // The student's Aadhaar and PAN are both optional (client 2026-10-12).
      aadhaar('pa-aadhaar', d.aadhaar, d.kept.aadhaar, false);
      pan('pa-pan', d.pan, false);
      // The student's own contact, both optional (client 2026-10-23).
      mobile('pa-smob', '+91', d.smobile, false);
      email('pa-semail', d.semail);
      need('pa-cat', d.category);
      need('pa-med', d.medium);
      need('pa-blood', d.blood);
      need('pa-photo', !!d.photo);
      break;
    }
    case 2: {
      const a = (p: 'r' | 'c', x: Addr) => {
        need(`pa-${p}1`, x.line1);
        // The area or locality is required (client 2026-10-13).
        need(`pa-${p}2`, x.line2);
        if (!x.city.trim()) e[`pa-${p}city`] = req();
        else if (!/^[A-Za-z .'-]+$/.test(x.city.trim()))
          e[`pa-${p}city`] = translate('VALIDATION.FORMAT');
        need(`pa-${p}state`, x.state);
        if (!x.pin.trim()) e[`pa-${p}pin`] = req();
        else if (!/^[1-9]\d{5}$/.test(x.pin.trim()))
          e[`pa-${p}pin`] = translate('VALIDATION.PIN_CODE');
      };
      a('r', d.res);
      if (!d.same) a('c', d.corr);
      break;
    }
    case 3: {
      const needed = order > 1;
      if (needed) {
        need('pa-psch', d.prev.school);
        need('pa-plast', d.prev.last);
        need('pa-pres', d.prev.result);
        need('pa-pboard', d.prev.board);
      }
      if (d.prev.last && f.cls) {
        const l = f.landing.classes.find((c) => c.name === d.prev.last);
        const lo = orderOf(f.landing, l);
        if (l && f.mid && lo > order)
          e['pa-plast'] =
            `A mid-term admission can be to ${l.name} or a higher class, not ${f.cls.name}.`;
        if (l && !f.mid && lo >= order)
          e['pa-plast'] =
            `The class sought (${f.cls.name}) must be above the last class studied (${l.name}).`;
      }
      if (d.prev.board === 'Other') need('pa-pother', d.prev.other);
      if (f.mid && d.tc.mode === 'tc' && !d.tcRecorded) need('pa-tcfile', !!d.tc.file);
      // A regular admission above LKG brings the transfer certificate too (client 2026-10-15).
      if (!f.mid && needed && !d.tcRecorded) need('pa-tcfile', !!d.tc.file);
      if (f.mid && d.tc.mode === 'und' && !d.tcRecorded) {
        const w = tcDueWindow(d);
        if (!d.tc.due) e['pa-tcdue'] = req();
        else if (!isRealDate(d.tc.due) || d.tc.due < w.min || d.tc.due > w.max)
          e['pa-tcdue'] = msg('ADM.TC_DUE_DATE', { latest: date(w.max) });
      }
      break;
    }
    case 4: {
      const ppl: [string, Who][] = [
        ['f', 'father'],
        ['m', 'mother'],
        ['g', 'guardian'],
      ];
      // The father's and the mother's name and mobile always (client 2026-10-12, 2026-10-13); a
      // guardian's when any of their details is given.
      for (const [p, k] of ppl) {
        const x = d[k];
        if (k !== 'guardian' || filled(x) || d.guardian.relation) {
          name(`pa-${p}-name`, x.name, true);
          mobile(`pa-${p}-mob`, x.cc, x.mobile);
          email(`pa-${p}-email`, x.email);
          if (k === 'guardian') {
            if (!d.guardian.relation.trim()) e['pa-g-rel'] = req();
            else if (!/^[A-Za-z .'-]+$/.test(d.guardian.relation.trim()))
              e['pa-g-rel'] = translate('VALIDATION.FORMAT');
          }
        }
      }
      // The annual income, in rupees (client 2026-10-14).
      for (const [p, k] of ppl.slice(0, 2)) {
        if (d[k].income && !/^\d{1,10}$/.test(d[k].income)) {
          e[`pa-${p}-inc`] = translate('ADM.INCOME_INVALID');
        }
      }
      // The father, the mother and the guardian each have their own mobile, Aadhaar number and PAN
      // (client 2026-10-14); the local guardian may share one. Numbers typed in this visit are
      // compared here; the server compares the stored ones too.
      const given = ppl.filter(([, k]) => k !== 'guardian' || filled(d.guardian));
      const asked = idHolders(d);
      const same = (what: string, code: string, valueOf: (k: Who) => string) => {
        const seen = new Map<string, Who>();
        for (const [p, k] of given) {
          const v = valueOf(k);
          if (!v) continue;
          const first = seen.get(v);
          if (!first) seen.set(v, k);
          else if (!e[`pa-${p}-${what}`]) e[`pa-${p}-${what}`] = translate(code, { person: first });
        }
      };
      same('mob', 'ADM.SAME_MOBILE', (k) =>
        d[k].mobile.trim() ? joinMobile(d[k].cc, d[k].mobile.trim()) : '',
      );
      same('aadhaar', 'ADM.SAME_AADHAAR', (k) =>
        asked.includes(k) ? aadhaarDigits(d.ids[k].aadhaar) : '',
      );
      same('pan', 'ADM.SAME_PAN', (k) =>
        asked.includes(k) ? d.ids[k].pan.trim().toUpperCase() : '',
      );
      need('pa-children', d.children);
      if (!d.primary) e['pa-primary'] = req();
      else if (!(d[d.primary].name && d[d.primary].mobile)) {
        e['pa-primary'] =
          `Add the ${d.primary}'s name and mobile, or choose someone else as the primary contact.`;
      }
      // The primary contact's e-mail is required (client 2026-10-13).
      if (d.primary && !d[d.primary].email.trim()) e[`pa-${d.primary[0]}-email`] = req();
      // The Aadhaar number and PAN, with both sides of each card (client 2026-10-12, 2026-10-13):
      // the father's, the mother's, a guardian's who is the primary contact, and the local
      // guardian's of a hostel student — each required unless the server keeps it.
      for (const h of idHolders(d)) {
        const k = d.kept.people[h];
        aadhaar(`${ID_PREFIX[h]}-aadhaar`, d.ids[h].aadhaar, k.aadhaar);
        pan(`${ID_PREFIX[h]}-pan`, d.ids[h].pan, !k.pan);
        for (const c of PERSON_CARDS[h]) need(c.fid, !!d.cards[c.t]);
      }
      // School transport or the hostel, not both (client 2026-10-13).
      if (d.transport && d.hostel) e['pa-hostel'] = translate('ADM.TRANSPORT_OR_HOSTEL');
      if (d.hostel) {
        name('pa-lg-name', d.lg.name, true);
        need('pa-lg-rel', d.lg.relation);
        mobile('pa-lg-mob', d.lg.cc, d.lg.mobile);
        need('pa-lg-addr', d.lg.address);
      }
      break;
    }
    case 5: {
      d.refs.forEach((r, i) => {
        name(`pa-ref${i}-name`, r.name, true);
        need(`pa-ref${i}-rel`, r.relation);
        mobile(`pa-ref${i}-phone`, r.cc, r.phone);
        email(`pa-ref${i}-email`, r.email);
      });
      if (f.mid && !d.refs.length) e['pa-referr'] = translate('ADM.REFERENCES_REQUIRED');
      break;
    }
    case 6: {
      need('pa-dbirth', !!d.docs.birth);
      need('pa-daddr', !!d.docs.addr);
      if (order >= 3) need('pa-dreport', !!d.docs.report);
      for (const c of f.landing.customFields) {
        const id = `pa-cf-${c.id}`;
        const v = d.cf[c.id];
        const empty = Array.isArray(v) ? !v.length : !String(v ?? '').trim();
        if (empty) {
          if (c.required) e[id] = msg('CF.VALUE_REQUIRED', { label: c.label.toLowerCase() });
          continue;
        }
        const t = String(v).trim();
        if (c.type === 'EMAIL' && !PATTERNS.email.test(t.toLowerCase()))
          e[id] = translate('VALIDATION.EMAIL');
        if (c.type === 'PHONE' && !PATTERNS.mobile.test(t)) e[id] = translate('CF.VALUE_PHONE');
        if (c.type === 'NUMBER' && !Number.isFinite(Number(t.replace(/,/g, ''))))
          e[id] = translate('CF.VALUE_NUMBER');
        if (c.type === 'DATE' && !isRealDate(t)) e[id] = translate('VALIDATION.DATE');
        if ((c.type === 'TEXT' || c.type === 'LONG_TEXT') && IDLIKE.test(t))
          e[id] = 'This looks like an identity-document number. Please leave it out.';
      }
      break;
    }
    case 7:
      if (!d.declare) e['pa-declare'] = translate('ADM.DECLARATION');
      if (!d.consent) e['pa-consent'] = translate('ADM.CONSENT_REQUIRED');
      break;
  }
  return e;
}

// --- the server's errors → the form's fields --------------------------------------------------------

const FIELD: Readonly<Record<string, string>> = {
  'class.yearId': 'pa-year',
  'class.classId': 'pa-class',
  'class.joiningDate': 'pa-join',
  'class.midTermReason': 'pa-reason',
  'student.firstName': 'pa-first',
  'student.middleName': 'pa-middle',
  'student.lastName': 'pa-last',
  'student.gender': 'pa-gender',
  'student.dob': 'pa-dob',
  'student.aadhaar': 'pa-aadhaar',
  'student.pan': 'pa-pan',
  'student.mobile': 'pa-smob',
  'student.email': 'pa-semail',
  'student.category': 'pa-cat',
  'student.medium': 'pa-med',
  'student.bloodGroup': 'pa-blood',
  'student.allergies': 'pa-allergy',
  'student.health': 'pa-health',
  'addresses.residential': 'pa-r1',
  'addresses.correspondence': 'pa-c1',
  'addresses.sameAsResidential': 'pa-same',
  'previous.school': 'pa-psch',
  'previous.lastClass': 'pa-plast',
  'previous.result': 'pa-pres',
  'previous.board': 'pa-pboard',
  'previous.otherBoard': 'pa-pother',
  'previous.tc': 'pa-tcdue',
  'previous.tc.dueDate': 'pa-tcdue',
  'parents.primary': 'pa-primary',
  'parents.primaryMobile': 'pa-primary',
  'parents.father': 'pa-primary',
  'parents.mother': 'pa-m-name',
  'parents.children': 'pa-children',
  'parents.guardian': 'pa-primary',
  'parents.transport': 'pa-transport',
  'parents.transportStopId': 'pa-transport-stop',
  'parents.hostel': 'pa-hostel',
  'parents.localGuardian': 'pa-lg-name',
  'parents.localGuardian.name': 'pa-lg-name',
  'parents.localGuardian.relation': 'pa-lg-rel',
  'parents.localGuardian.mobile': 'pa-lg-mob',
  'parents.localGuardian.address': 'pa-lg-addr',
  'parents.localGuardian.aadhaar': 'pa-lg-aadhaar',
  'parents.localGuardian.pan': 'pa-lg-pan',
  'documents.PHOTO': 'pa-photo',
  'documents.BIRTH': 'pa-dbirth',
  'documents.ADDRESS': 'pa-daddr',
  'documents.REPORT': 'pa-dreport',
  'documents.TC': 'pa-tcfile',
  ...Object.fromEntries(ALL_CARDS.map((c) => [`documents.${c.t}`, c.fid])),
  declarationAccepted: 'pa-declare',
  registrationConsent: 'pa-consent',
};
const ADDR: Readonly<Record<string, string>> = {
  line1: '1',
  line2: '2',
  city: 'city',
  state: 'state',
  pin: 'pin',
};
const PERSON: Readonly<Record<string, string>> = {
  name: 'name',
  mobile: 'mob',
  email: 'email',
  occupation: 'occ',
  annualIncome: 'inc',
  relation: 'rel',
  aadhaar: 'aadhaar',
  pan: 'pan',
};
const ROOTS = [
  'class',
  'student',
  'addresses',
  'previous',
  'parents',
  'customFields',
  'documents',
  'declarationAccepted',
  'registrationConsent',
];

/** A server field path (relative to `section` for a section save) → the form's field id. */
export function fieldOf(path: string, section?: SectionName | null): string | null {
  const p = section && !ROOTS.includes(path.split('.')[0]!) ? `${section}.${path}` : path;
  if (FIELD[p]) return FIELD[p]!;
  let m = /^addresses\.(residential|correspondence)\.(\w+)$/.exec(p);
  if (m) return `pa-${m[1] === 'residential' ? 'r' : 'c'}${ADDR[m[2]!] ?? '1'}`;
  m = /^parents\.(father|mother|guardian)\.(\w+)$/.exec(p);
  if (m) return `pa-${m[1]![0]}-${PERSON[m[2]!] ?? 'name'}`;
  m = /^customFields\.(.+)$/.exec(p);
  if (m) return `pa-cf-${m[1]}`;
  return null;
}

/** Failures the server names by code only, and the field they belong to. */
export const CODE_FIELD: Readonly<Record<string, string>> = {
  'ADM.AGE_TOO_LOW': 'pa-dob',
  'ADM.AGE_TOO_HIGH': 'pa-dob',
  'ADM.DUPLICATE': 'pa-first',
  'ADM.JOINING_DATE': 'pa-join',
  'ADM.YEAR_NOT_OPEN': 'pa-year',
  'ADM.CLASS_INVALID': 'pa-class',
  'ADM.REFERENCES_REQUIRED': 'pa-referr',
  'ADM.REFERENCE_LIMIT': 'pa-referr',
  'ADM.TC_OR_UNDERTAKING_REQUIRED': 'pa-tcfile',
  'ADM.TC_DUE_DATE': 'pa-tcdue',
  'ADM.TRANSPORT_OR_HOSTEL': 'pa-hostel',
  'ADM.DECLARATION': 'pa-declare',
  'ADM.TRANSPORT_STOP_INVALID': 'pa-transport-stop',
  'ADM.CONSENT_REQUIRED': 'pa-consent',
  // The primary contact's mobile, verified on the review step (client 2026-10-27).
  'ADM.CONTACT_NOT_VERIFIED': 'pa-cv',
};

/** The step a field belongs to. */
export function stepOf(id: string): number {
  if (/^pa-(year|class|join|reason)$/.test(id)) return 0;
  if (/^pa-(first|middle|last|gender|dob|aadhaar|pan|cat|med|blood|allergy|health|photo)$/.test(id))
    return 1;
  if (/^pa-sc-/.test(id)) return 1;
  if (/^pa-(fc|mc|gc|lc)-/.test(id)) return 4;
  if (/^pa-(r|c)(1|2|city|state|pin)$/.test(id) || id === 'pa-same') return 2;
  if (/^pa-(psch|plast|pres|pboard|pother|tc)/.test(id)) return 3;
  if (/^pa-(f-|m-|g-|p-|primary|children|transport|hostel|lg-)/.test(id)) return 4;
  if (/^pa-ref/.test(id)) return 5;
  if (/^pa-(dbirth|daddr|dreport|cf-)/.test(id)) return 6;
  return 7;
}
