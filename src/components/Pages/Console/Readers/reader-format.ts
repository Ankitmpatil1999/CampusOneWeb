/** Display helpers of the readers screen (prototype 33_c_settings: PURPOSES, LOC_TYPES, rdStatus). */
import type { IconName } from '../../../Utils/icons';
import { translate } from '../../../Utils/translate';
import type { Terminal, TerminalPurpose } from './readers.api';

/**
 * The purposes as the register form offers them (prototype PURPOSES), with the two the API adds:
 * the card-issue reader that writes campus cards, and the merchant's point-of-sale counter.
 */
export const PURPOSES: readonly {
  readonly v: TerminalPurpose;
  readonly l: string;
  readonly icon: IconName;
  readonly s: string;
}[] = [
  { v: 'ATTENDANCE', l: 'Gate attendance', icon: 'door', s: 'Check-in and check-out at a gate' },
  {
    v: 'PERIOD_ATTENDANCE',
    l: 'Period attendance',
    icon: 'grid',
    s: 'Taps against the class timetable slot',
  },
  {
    v: 'LOCATION',
    l: 'Location attendance',
    icon: 'pin',
    s: 'Library, labs, hostel gate and similar',
  },
  { v: 'COUPON', l: 'Coupon counter', icon: 'ticket', s: 'Coupon redemption for one merchant' },
  {
    v: 'BALANCE_CHECK',
    l: 'Balance check',
    icon: 'wallet',
    s: 'Members check their balance with a tap',
  },
  { v: 'CARD_ISSUE', l: 'Card issue', icon: 'card', s: 'Writes new and replacement NFC cards' },
  { v: 'POS', l: 'Point of sale', icon: 'store', s: "A merchant's billing counter" },
];

/** The location types the form offers (prototype LOC_TYPES). */
export const LOCATION_TYPES = [
  'Library',
  'Laboratory',
  'Hostel gate',
  'Front desk',
  'Sports ground',
  'Auditorium',
] as const;

/**
 * The fallback window when the server doesn't say (older API): the server's `online` follows the
 * setting `trm.online.minutes` and a terminal is seen on every call.
 */
export const ONLINE_MINUTES = 20;

export const purposeOf = (p: TerminalPurpose) =>
  PURPOSES.find((x) => x.v === p) ?? { v: p, l: p, icon: 'nfc' as IconName, s: '' };

/** What the terminal is bound to: the class section, the location type or the merchant. */
export function boundTo(t: Terminal): string {
  if (t.purpose === 'PERIOD_ATTENDANCE') return t.section?.name ?? '';
  if (t.purpose === 'LOCATION') return t.locationType ?? '';
  if (t.purpose === 'COUPON' || t.purpose === 'POS') return t.merchant?.name ?? '';
  return '';
}

/** The kv label of the binding (prototype readerDrawer). */
export function boundLabel(p: TerminalPurpose): string {
  return p === 'PERIOD_ATTENDANCE'
    ? 'Class'
    : p === 'LOCATION'
      ? 'Location type'
      : p === 'POS'
        ? 'Merchant'
        : 'Bound merchant';
}

export type Health = 'DISABLED' | 'UNPAIRED' | 'ONLINE' | 'OFFLINE';

/**
 * The status the list shows (prototype rdStatus): the register's Disabled, else derived from the
 * pairing and the last sign-in (docs/01c: terminal Online/Offline are derived labels).
 */
export function healthOf(
  t: Pick<Terminal, 'status' | 'paired' | 'lastSeenAt'> & { readonly online?: boolean },
  now: number = Date.now(),
): Health {
  if (t.status === 'DISABLED') return 'DISABLED';
  if (!t.paired) return 'UNPAIRED';
  if (t.online !== undefined) return t.online ? 'ONLINE' : 'OFFLINE';
  const seen = t.lastSeenAt ? new Date(t.lastSeenAt).getTime() : 0;
  return seen && now - seen <= ONLINE_MINUTES * 60_000 ? 'ONLINE' : 'OFFLINE';
}

export const HEALTH: Readonly<
  Record<Health, { l: () => string; tone: string; icon: IconName | null }>
> = {
  DISABLED: { l: () => translate('status.terminal.disabled'), tone: 'neutral', icon: null },
  UNPAIRED: { l: () => 'Awaiting pairing', tone: 'warn', icon: 'hourglass' },
  ONLINE: { l: () => 'Online', tone: 'ok', icon: null },
  OFFLINE: { l: () => 'Offline', tone: 'bad', icon: null },
};

/** "1 reader", "7 readers" (fmt.plural). */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString('en-IN')} ${noun}${n === 1 ? '' : 's'}`;
}

/** Seconds left until an ISO time (never below zero). */
export function secondsLeft(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
}
