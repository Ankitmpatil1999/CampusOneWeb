/**
 * Display helpers of c.exams (prototype exStatus, ui.status tones, academicReport): the schedule
 * and marks chips, the exam's date and time as the prototype prints them, and the report's
 * percentages turned back into marks of the exam's maximum.
 */
import { formatDate } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { MONTHS, t12, today, weekday } from '../Structure/academic-format';
import type { Exam, ExamSchedule } from './exams.api';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The prototype's ui.status tones; a published exam shows Published (neutral). */
const SCHEDULE_TONE: Readonly<Record<ExamSchedule, string>> = {
  Scheduled: 'info',
  Upcoming: 'neutral',
  Today: 'warn',
  Completed: 'ok',
};

export function scheduleChip(e: Exam): { l: string; tone: string } {
  if (e.published) return { l: 'Published', tone: 'neutral' };
  return { l: e.schedule, tone: SCHEDULE_TONE[e.schedule] ?? 'neutral' };
}

/** The exam has been held (dated today or earlier). */
export const held = (e: Exam) => !!e.date && e.date <= today();

/** The prototype's exStatus: Not due, Not uploaded, Awaiting validation, Validated. */
export function marksChip(e: Exam): { l: string; tone: string; n: number; of: number } {
  const of = e.marks.students;
  const n = e.marks.entered;
  if (!n && !held(e)) return { l: 'Not due', tone: 'neutral', n, of };
  if (e.marks.status === 'NOT_UPLOADED') return { l: 'Not uploaded', tone: 'warn', n, of };
  // Saved marks still Created. (The server also says AWAITING_VALIDATION when every saved mark is
  // Valid but a student enrolled later has none; the count below the chip shows that shortfall.)
  if (e.marks.status === 'AWAITING_VALIDATION' && e.marks.valid < n) {
    return { l: 'Awaiting validation', tone: 'info', n, of };
  }
  return { l: 'Validated', tone: 'ok', n, of };
}

/** Saved marks of the exam still Created (what a validation would change). */
export const createdMarks = (e: Exam) => Math.max(0, e.marks.entered - e.marks.valid);

/** "9:30 AM – 12:30 PM" (t12 – t12), or '' without times. */
export function examTimes(e: { startTime: string | null; endTime: string | null }): string {
  if (!e.startTime) return '';
  return e.endTime ? `${t12(e.startTime)} – ${t12(e.endTime)}` : t12(e.startTime);
}

/** fmt.dlong for a calendar date: "Monday, 10 August 2026". */
export function dlong(d: string): string {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  return `${DAY_NAMES[weekday(d) - 1]}, ${dd} ${MONTHS[m - 1]} ${y}`;
}

export const examDate = (e: Exam) => (e.date ? formatDate(e.date) : 'Date to be set');

/** fmt.pct with one decimal: "61.6%". */
export const pct1 = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n.toFixed(1)}%`;

/** A report percentage of `max` as marks: halves for single marks, one decimal for averages. */
export function marksOf(pct: number | null, max: number, average = false): string {
  if (pct === null) return '—';
  const v = (pct * max) / 100;
  if (average) return v.toFixed(1);
  const half = Math.round(v * 2) / 2;
  return Number.isInteger(half) ? String(half) : half.toFixed(1);
}

/** The register's wording for the year-closed refusal. */
export const yearClosed = (label: string) => translate('ACA.YEAR_CLOSED', { label });

/** Marks: whole numbers 1–1,000; pass marks no higher than the maximum (ACA.EXAM_MARKS_RANGE). */
export function marksError(max: string, pass: string): { max?: string; pass?: string } {
  const out: { max?: string; pass?: string } = {};
  const m = Number(max);
  const p = Number(pass);
  if (!max.trim()) out.max = translate('VALIDATION.REQUIRED');
  else if (!/^\d+$/.test(max.trim()) || m < 1 || m > 1000) {
    out.max = translate('ACA.EXAM_MARKS_RANGE');
  }
  if (!pass.trim()) out.pass = translate('VALIDATION.REQUIRED');
  else if (!/^\d+$/.test(pass.trim()) || (!out.max && p > m)) {
    out.pass = translate('ACA.EXAM_MARKS_RANGE');
  }
  return out;
}
