/**
 * Display helpers shared by the transport pages (prototype c.transport, c.routes, c.fleet, c.tassign,
 * c.allocations): trip and stop statuses with the register's labels (27.2) and the prototype's tones,
 * weekdays, the effective-dates status of an assignment or allocation, and the server's answer as
 * text for a field.
 */
import { translate } from '../../../Utils/translate';
import { dshort, today } from '../Structure/academic-format';
import { formatDate } from '../../../Utils/format';
import type { StopStatus, TripStatus, Weekday } from './transport.api';

export const TRIP_STATUS: Readonly<Record<TripStatus, { l: () => string; tone: string }>> = {
  SCHEDULED: { l: () => translate('status.trip.scheduled'), tone: 'info' },
  STARTED: { l: () => translate('status.trip.started'), tone: 'brand' },
  COMPLETED: { l: () => translate('status.trip.completed'), tone: 'ok' },
  CANCELLED: { l: () => translate('status.trip.cancelled'), tone: 'neutral' },
};

export const STOP_STATUS: Readonly<Record<StopStatus, { l: () => string; tone: string }>> = {
  UPCOMING: { l: () => translate('status.tripStop.upcoming'), tone: 'neutral' },
  REACHED: { l: () => translate('status.tripStop.reached'), tone: 'brand' },
  DEPARTED: { l: () => translate('status.tripStop.departed'), tone: 'ok' },
  SKIPPED: { l: () => translate('status.tripStop.skipped'), tone: 'neutral' },
};

export const WEEKDAYS: readonly { v: Weekday; l: string }[] = [
  { v: 'MON', l: 'Monday' },
  { v: 'TUE', l: 'Tuesday' },
  { v: 'WED', l: 'Wednesday' },
  { v: 'THU', l: 'Thursday' },
  { v: 'FRI', l: 'Friday' },
  { v: 'SAT', l: 'Saturday' },
  { v: 'SUN', l: 'Sunday' },
];

/** "Active" / "Inactive" chip of a master. */
export const activeChip = (active: boolean) =>
  active ? { l: 'Active', tone: 'ok' } : { l: 'Inactive', tone: 'neutral' };

/** The prototype's aStatus / alStatus: Upcoming, Current (Active for allocations) or Ended. */
export function periodStatus(
  from: string,
  to: string,
  current = 'Current',
): { l: string; tone: string } {
  const t = today();
  if (from > t) return { l: 'Upcoming', tone: 'info' };
  if (to < t) return { l: 'Ended', tone: 'neutral' };
  return { l: current, tone: 'ok' };
}

/** "1 Oct – 31 Mar 2027" (fmt.dshort – fmt.date). */
export const effective = (from: string, to: string) => `${dshort(from)} – ${formatDate(to)}`;

/** fmt.dec(1): "4.6 km". */
export const km = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)} km`;

/** "R1 · Morning pickup" (the prototype's aLabel). */
export const assignmentLabel = (a: { route: { code: string }; session: { name: string } }) =>
  `${a.route.code} · ${a.session.name}`;
