/**
 * Helpers shared by the academics pages (c.calendar, c.structure, c.teachers, c.timetable, c.enrol):
 * who may change what, times and dates as the prototype prints them, the colour swatches and the
 * server's answer as text.
 */
import { computed, type Signal } from '@angular/core';
import type { ConsoleSession } from '../../../../Context/SessionContext';
import { formatDate, istBusinessDate, istParts } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { AcademicYears } from './academic-year';

export const MANAGEMENT_WHY =
  'Management has read-only access. Ask the institution administrator to make changes.';
export const NO_TASK = "Your role doesn't include this task.";

/** The prototype's lockReason / denied for the academics pages (task academics). */
export function academicsAccess(session: Signal<ConsoleSession | null>, years: AcademicYears) {
  const can = (s: string) => session()?.subTasks.includes(s) ?? false;
  const management = computed(() => session()?.roles.some((r) => r.readOnly) ?? false);
  const denied = computed(() => !!session() && !can('academics.view'));
  const deniedText = computed(() => {
    const role = (session()?.roles ?? []).map((r) => r.name).join(', ');
    return `Your role (${role}) doesn't include this task. Ask the institution administrator if you need it.`;
  });
  /** Why the role can't change academics at all ('' when it can). */
  const editWhy = computed(() =>
    management() ? MANAGEMENT_WHY : can('academics.edit') ? '' : NO_TASK,
  );
  /** Why the year in context can't change: the role, or a closed year (ACA.YEAR_CLOSED). */
  const yearWhy = computed(() => {
    const e = editWhy();
    if (e) return e;
    const y = years.selected();
    return y && y.status === 'CLOSED' ? translate('ACA.YEAR_CLOSED', { label: y.label }) : '';
  });
  /** The roll-over needs the year task (academics.year). */
  const rollWhy = computed(() =>
    management() ? MANAGEMENT_WHY : can('academics.year') ? '' : NO_TASK,
  );
  return { can, management, denied, deniedText, editWhy, yearWhy, rollWhy };
}

/** The server's answer as register text. */
export function problemText(e: unknown): string {
  return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
}

/** The first field error's message for `field` (prefix match), else ''. */
export function fieldMessage(e: unknown, ...fields: string[]): string {
  if (!(e instanceof ApiProblem)) return '';
  const f = e.errors.find((x) => fields.some((k) => x.field === k || x.field.startsWith(`${k}.`)));
  return f?.message ?? '';
}

// --- times ------------------------------------------------------------------------------------------
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** "08:45" → "8:45 AM" (the prototype's t12). */
export function t12(t: string | null | undefined): string {
  if (!t) return '—';
  const m = minutesOf(t);
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The prototype's tRange: "8:45–9:25 am", or "11:40 am–12:20 pm" across noon. */
export function tRange(a: string, b: string): string {
  const f = (x: string): [string, string] => {
    const m = minutesOf(x);
    const h = Math.floor(m / 60);
    return [`${h % 12 || 12}:${String(m % 60).padStart(2, '0')}`, h >= 12 ? 'pm' : 'am'];
  };
  const [x1, a1] = f(a);
  const [x2, a2] = f(b);
  return a1 === a2 ? `${x1}–${x2} ${a2}` : `${x1} ${a1}–${x2} ${a2}`;
}

// --- dates ------------------------------------------------------------------------------------------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Today in India (YYYY-MM-DD). */
export const today = () => istBusinessDate(new Date());

/** The minutes past midnight now, in India. */
export function nowMinutes(): number {
  const p = istParts(new Date());
  return p.hour * 60 + p.minute;
}

/** Monday 1 … Saturday 6, Sunday 7 for a calendar date. */
export function weekday(d: string): number {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** "9 Mar" (the prototype's fmt.dshort). */
export function dshort(d: string): string {
  const [, m, dd] = d.split('-').map(Number) as [number, number, number];
  return `${dd} ${MON[m - 1] ?? ''}`;
}

/** The prototype's dRange: one day, or "9 Mar – 20 Mar 2026" (years spelled when they differ). */
export function dRange(a: string, b?: string | null): string {
  if (!b || a === b) return formatDate(a);
  return a.slice(0, 4) === b.slice(0, 4)
    ? `${dshort(a)} – ${formatDate(b)}`
    : `${formatDate(a)} – ${formatDate(b)}`;
}

export function addDays(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** A date inside the year: today when it is, else the year's first day. */
export function dayInYear(y: { startsOn: string; endsOn: string } | null): string {
  const t = today();
  if (!y) return t;
  return t >= y.startsOn && t <= y.endsOn ? t : y.startsOn;
}

// --- colours ----------------------------------------------------------------------------------------
/** The prototype's colour swatches (cc swatches). */
export const SWATCHES = [
  '#0C6F7D',
  '#2D5DA8',
  '#5E4BB0',
  '#1F7A4D',
  '#B4582B',
  '#8C3B3B',
  '#A23E6A',
  '#8A6A12',
  '#3C6E71',
  '#4F6D2E',
] as const;

export const num = (n: number) => n.toLocaleString('en-IN');

/** Natural order for class-section labels ("Grade 2 A" before "Grade 10 A"). */
export const byLabel = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
