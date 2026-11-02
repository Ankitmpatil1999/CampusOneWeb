/** How the calendar prints its entries (prototype c.calendar helpers). */
import { formatDate } from '../../../Utils/format';
import { dRange, daysBetween, t12 } from '../Structure/academic-format';
import type { CalendarEntry, Recurrence, ReminderCode } from './calendar.api';

/** Chip tones per type (prototype CAL_TONE). */
export const CAL_TONE: Readonly<Record<string, string>> = {
  Holiday: 'bad',
  Exam: 'violet',
  Event: 'accent',
  PTM: 'brand',
  Sports: 'ok',
  Meeting: 'info',
};

/** The reminders offered (the server sends its own labels with the list; these are the same). */
export const REMINDER_LABELS: Readonly<Record<ReminderCode, string>> = {
  DAY_BEFORE: '1 day before',
  HOUR_BEFORE: '1 hour before',
  MORNING_OF: 'On the day at 7:00 AM',
};

export const RECURRENCE: readonly { v: Recurrence; l: string; short: string }[] = [
  { v: 'NONE', l: 'Does not repeat', short: 'None' },
  { v: 'DAILY', l: 'Daily', short: 'Daily' },
  { v: 'WEEKLY', l: 'Weekly', short: 'Weekly' },
  { v: 'MONTHLY', l: 'Monthly', short: 'Monthly' },
];

export const recurrenceLabel = (r: Recurrence) => RECURRENCE.find((x) => x.v === r)?.short ?? r;

/** "Whole institution", or the classes, sections or member it is for. */
export function audienceText(e: CalendarEntry): string {
  if (e.audience.kind === 'ALL' || !e.audience.targets.length) return 'Whole institution';
  return e.audience.targets.map((t) => t.name).join(', ');
}

/** The entry's dates: one day, or a range. */
export const entryDates = (e: CalendarEntry) =>
  dRange(e.startDate, daysBetween(e.startDate, e.endDate) ? e.endDate : null);

/** "All day", or "8:30 AM – 8:45 AM". */
export const entryTimes = (e: CalendarEntry) =>
  e.allDay ? 'All day' : `${t12(e.startTime)} – ${t12(e.endTime)}`;

/** The month grid's short time: "8:30AM", "9AM" (prototype ev label). */
export function shortTime(t: string | null): string {
  return t12(t).replace(':00', '').replace(' ', '');
}

export const deletedOn = (e: CalendarEntry) =>
  e.deleted?.at ? formatDate(e.deleted.at) : 'earlier';
