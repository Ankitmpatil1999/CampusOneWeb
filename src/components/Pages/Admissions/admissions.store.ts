/**
 * Shared state and helpers of the public admission pages (prototype 51_p_public.js helpers):
 * the landing of the link being used, the family's admission tokens, and the age-band, date and
 * wording helpers every page draws with.
 *
 * Tokens stay in memory and in sessionStorage only (never localStorage): they reach the family's
 * applications, so they must not outlive the browser tab.
 */
import { Injectable, inject, signal } from '@angular/core';
import { formatDate, formatTime, istBusinessDate } from '../../Utils/format';
import { parseAmount } from '../../Utils/money';
import { ApiProblem } from '../../Utils/problem';
import { translate } from '../../Utils/translate';
import { AdmissionsApi, type AppStatus, type Landing, type Money } from './admissions.api';

// --- the link's landing ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class AdmissionsContext {
  private readonly api = inject(AdmissionsApi);
  /** The link token the pages were opened with (null on the payment link and bare status page). */
  readonly link = signal<string | null>(null);
  readonly landing = signal<Landing | null>(null);
  readonly error = signal<ApiProblem | null>(null);
  readonly loading = signal(false);
  private pending: Promise<Landing | null> | null = null;

  /** ADM-001 for `link` (cached while the same link is used). */
  load(link: string): Promise<Landing | null> {
    if (this.link() === link && this.landing()) return Promise.resolve(this.landing());
    if (this.link() === link && this.pending) return this.pending;
    this.link.set(link);
    this.landing.set(null);
    this.error.set(null);
    this.loading.set(true);
    this.pending = this.api
      .landing(link)
      .then((l) => {
        if (this.link() === link) this.landing.set(l);
        return l;
      })
      .catch((e: unknown) => {
        if (this.link() === link) this.error.set(asProblem(e));
        return null;
      })
      .finally(() => {
        if (this.link() === link) this.loading.set(false);
        this.pending = null;
      });
    return this.pending;
  }

  /** Pages reached without a link (the admission-fee payment link, the bare status page). */
  clear() {
    this.link.set(null);
    this.landing.set(null);
    this.error.set(null);
    this.loading.set(false);
  }
}

// --- tokens ---------------------------------------------------------------------------------------

const TOKENS_KEY = 'rp.admissions.tokens';
const memory = new Map<string, { token: string; exp: number }>();

const session = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

function readAll(): Record<string, { token: string; exp: number }> {
  try {
    const raw = session()?.getItem(TOKENS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Record<string, { token: string; exp: number }>) : {};
  } catch {
    return {};
  }
}

/** Keeps the resume token for these applications (this tab only). */
export function keepToken(appIds: readonly string[], token: string, expiresAt: string) {
  const exp = Date.parse(expiresAt) || Date.now() + 30 * 60_000;
  const all = readAll();
  for (const id of appIds) {
    const k = id.toLowerCase();
    memory.set(k, { token, exp });
    all[k] = { token, exp };
  }
  try {
    session()?.setItem(TOKENS_KEY, JSON.stringify(all));
  } catch {
    /* memory only */
  }
}

/** The live resume token for an application, if this tab has one. */
export function tokenFor(appId: string | null | undefined): string | null {
  if (!appId) return null;
  const k = appId.toLowerCase();
  const t = memory.get(k) ?? readAll()[k];
  return t && t.exp > Date.now() ? t.token : null;
}

// --- wording and formats ----------------------------------------------------------------------------

/** The register text of a failure, with `<name>` placeholders filled as well as `{name}`. */
export function problemText(e: unknown): string {
  const p = asProblem(e);
  return fill(p.detail, p.params);
}

export function asProblem(e: unknown): ApiProblem {
  return e instanceof ApiProblem
    ? e
    : new ApiProblem(0, 'GEN.INTERNAL', translate('GEN.INTERNAL'), null);
}

/** Some old register texts (class K) write placeholders as `<name>`; fill those too. */
export function fill(text: string, params: Readonly<Record<string, string | number>> = {}) {
  return text.replace(/<(\w+)>/g, (whole, k: string) =>
    Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : whole,
  );
}

/** A register message with its parameters (both placeholder styles). */
export const msg = (key: string, params: Readonly<Record<string, string | number>> = {}) =>
  fill(translate(key, params), params);

/** "2027-28" → "2027–28" (the prototype's year labels). */
export const yearLabel = (label: string | null | undefined) =>
  (label ?? '').replace(/(\d)-(\d)/g, '$1–$2');

export const paise = (m: Money | null | undefined) =>
  m ? parseAmount(m.amount, { allowZero: true }) : 0;

/** "30 Sep 2026" */
export const date = (v: string | null | undefined) => (v ? formatDate(v) : '—');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** fmt.dshort: "2 Jun" (calendar date YYYY-MM-DD, or an instant in IST). */
export function dshort(v: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : istBusinessDate(v);
  const [, m, day] = d.split('-').map(Number) as [number, number, number];
  return `${day} ${MONTHS[m - 1] ?? ''}`;
}

/** "Saved 9:14 PM" today, "Saved 28 Sep, 9:14 PM" on another day. */
export function savedAt(v: string): string {
  const today = istBusinessDate() === istBusinessDate(v);
  return `${today ? '' : dshort(v) + ', '}${formatTime(v)}`;
}

/** A calendar date "YYYY-MM-DD" from parts (month 1–12). */
export const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export const today = () => istBusinessDate();

export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** "+91 ••••• •••34" (prototype maskMob). */
/** The country codes offered for a mobile number (client 2026-10-13), India first. */
export const DIAL_CODES: readonly { readonly v: string; readonly l: string }[] = [
  { v: '+91', l: 'India' },
  { v: '+971', l: 'United Arab Emirates' },
  { v: '+966', l: 'Saudi Arabia' },
  { v: '+974', l: 'Qatar' },
  { v: '+968', l: 'Oman' },
  { v: '+965', l: 'Kuwait' },
  { v: '+973', l: 'Bahrain' },
  { v: '+65', l: 'Singapore' },
  { v: '+60', l: 'Malaysia' },
  { v: '+1', l: 'USA and Canada' },
  { v: '+44', l: 'United Kingdom' },
  { v: '+61', l: 'Australia' },
  { v: '+64', l: 'New Zealand' },
  { v: '+977', l: 'Nepal' },
  { v: '+94', l: 'Sri Lanka' },
  { v: '+880', l: 'Bangladesh' },
];
const LONGEST_FIRST = [...DIAL_CODES].sort((a, b) => b.v.length - a.v.length);

/** A stored mobile as its country code and number: "9845012345" is India's, "+971501234567" not. */
export function splitMobile(v: string | null | undefined): { cc: string; n: string } {
  const x = (v ?? '').trim();
  if (!x.startsWith('+')) return { cc: '+91', n: x };
  const c = LONGEST_FIRST.find((d) => x.startsWith(d.v));
  return c ? { cc: c.v, n: x.slice(c.v.length) } : { cc: '+91', n: x.replace(/\D/g, '') };
}

/** The mobile as sent: an Indian number as its 10 digits, another with its country code. */
export const joinMobile = (cc: string, n: string) => {
  const x = n.trim();
  return !x ? '' : cc === '+91' ? x : `${cc}${x}`;
};

export const maskMobile = (m: string | null | undefined) => {
  if (!m) return 'the mobile number on record';
  const { cc, n } = splitMobile(m);
  return cc === '+91' ? `+91 ••••• •••${n.slice(-2)}` : `${cc} ••••• ••${n.slice(-2)}`;
};

/** "+91 98765 01234" */
export const mobileText = (m: string | null | undefined) => {
  if (m && /^\d{10}$/.test(m)) return `+91 ${m.slice(0, 5)} ${m.slice(5)}`;
  if (m?.startsWith('+')) {
    const { cc, n } = splitMobile(m);
    return `${cc} ${n}`;
  }
  return m ?? '';
};

/** RP.fmtSize */
export const fileSize = (b: number) =>
  b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** The crest letters of the page header: the initials of the institution's first two words. */
export const crest = (name: string | null | undefined) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || 'RP';

/** Application statuses (status register; prototype ui.status tones). */
export const STATUS: Readonly<Record<AppStatus, { label: string; tone: string }>> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'ok' },
  REJECTED: { label: 'Rejected', tone: 'bad' },
};

// --- classes and ages (BR-50, OI-ADM-23) --------------------------------------------------------------

/**
 * The class's place from Nursery (0) by its name, as the server reads it: Nursery 0, LKG 1, UKG 2,
 * Grade n → n + 2; null when the name says nothing.
 */
export function classOrder(name: string): number | null {
  const n = name.trim().toLowerCase();
  if (/^(nursery|pre[- ]?kg|pre[- ]?nursery|play ?group)\b/.test(n)) return 0;
  if (/^(lkg|lower kg|jr\.? ?kg|junior kg)\b/.test(n)) return 1;
  if (/^(ukg|upper kg|sr\.? ?kg|senior kg)\b/.test(n)) return 2;
  const m = /^(?:grade|class|std\.?|standard)?\s*(\d{1,2})(?:st|nd|rd|th)?\b/.exec(n);
  if (m) {
    const g = Number(m[1]);
    return g >= 1 && g <= 12 ? g + 2 : null;
  }
  // "Grade IV", "Class XII" (client 2026-10-13): placed like "Grade 4", not by list position.
  const r = /^(?:grade|class|std\.?|standard)?\s*([ivx]{1,4})\b/.exec(n);
  const g = r ? ROMAN.indexOf(r[1]!) : -1;
  return g >= 1 ? g + 2 : null;
}

const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];

/** Whole years and months from a birth date to a reference date (both YYYY-MM-DD). */
export function ageOn(dob: string, ref: string) {
  const [y1, m1, d1] = dob.split('-').map(Number) as [number, number, number];
  const [y2, m2, d2] = ref.split('-').map(Number) as [number, number, number];
  let y = y2 - y1;
  let m = m2 - m1;
  if (d2 < d1) m--;
  if (m < 0) {
    y--;
    m += 12;
  }
  return { y, m };
}

/** 1 June of the year's start, or the joining date for a mid-term admission (OI-ADM-23). */
export const ageRef = (startsOn: string, midTerm: boolean, joining: string | null) =>
  midTerm && joining ? joining : `${startsOn.slice(0, 4)}-06-01`;

/** Born between: 2 June (Y − max − 1) and 1 June (Y − min). */
export const bornRange = (band: { min: number; max: number }, startYear: number) => ({
  from: ymd(startYear - band.max - 1, 6, 2),
  to: ymd(startYear - band.min, 6, 1),
});
