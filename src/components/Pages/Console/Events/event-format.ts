/** Display helpers of the events screen (prototype evState). */
import { istBusinessDate } from '../../../Utils/format';
import type { PaidEvent } from './events.api';

export type EventState = 'Active' | 'Inactive' | 'Upcoming' | 'Ended';

/** Inactive; not open yet; past its closing day (until the 23:50 job); or open for payment. */
export function eventState(
  e: Pick<PaidEvent, 'status' | 'startDate' | 'endDate'>,
  today: string = istBusinessDate(new Date()),
): EventState {
  if (e.status !== 'ACTIVE') return 'Inactive';
  if (today < e.startDate) return 'Upcoming';
  if (today > e.endDate) return 'Ended';
  return 'Active';
}

/** The audience classes, or the whole institution. */
export function audienceText(e: Pick<PaidEvent, 'audience'>): string {
  return e.audience?.length ? e.audience.map((a) => a.name).join(', ') : 'Whole institution';
}
