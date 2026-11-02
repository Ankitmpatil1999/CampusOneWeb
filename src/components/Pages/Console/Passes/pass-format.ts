/** Display helpers of the entry passes screen (prototype passState). */
import type { EntryPass } from './passes.api';

export type PassState =
  'Valid today' | 'Authorised' | 'Valid in future' | 'Used' | 'Expired' | 'Cancelled';

export const PASS_TONE: Readonly<Record<PassState, string>> = {
  'Valid today': 'ok',
  Authorised: 'info',
  'Valid in future': 'info',
  Used: 'neutral',
  Expired: 'neutral',
  Cancelled: 'neutral',
};

/** The pass as the console shows it today; authorised while its window is open. */
export function passState(
  p: Pick<EntryPass, 'visibility' | 'status' | 'authorisedUntil'>,
  now: number = Date.now(),
): PassState {
  switch (p.visibility) {
    case 'CANCELLED':
      return 'Cancelled';
    case 'USED':
      return 'Used';
    case 'EXPIRED':
      return 'Expired';
    case 'VALID_IN_FUTURE':
      return 'Valid in future';
    default:
      return p.status === 'AUTHORIZED' &&
        p.authorisedUntil !== null &&
        new Date(p.authorisedUntil).getTime() > now
        ? 'Authorised'
        : 'Valid today';
  }
}

/** A live pass can still be cancelled (PAY-028). */
export const isLive = (p: Pick<EntryPass, 'status'>) =>
  p.status === 'ACTIVE' || p.status === 'AUTHORIZED';

/** "Saturday, 3 October 2026" for a calendar date (fmt.dlong). */
export function longDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, day));
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = [
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
  return `${DAYS[dt.getUTCDay()]}, ${day} ${MONTHS[m - 1]} ${y}`;
}
